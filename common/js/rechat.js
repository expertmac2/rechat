// A LOT OF CODE IS UNUSED. Start with the code executed
// in $(document).ready() to see what is used and unused!

var ReChat = {
  // Settings:
  searchBaseUrl: 'http://search.rechat.org/videos/',
  cacheExhaustionLimit: 100,
  chatDisplayLimit: 1000,
  loadingDelay: 5000,
  nicknameColors: Please.make_color({ colors_returned: 50, saturation: 0.7 }),
  defaultStreamDelay: 17,

  Browser: {
    Safari: 0,
    Chrome: 1,
    Firefox: 2
  },

  currentBrowser: function() {
    if(typeof(safari) !== 'undefined') {
      return ReChat.Browser.Safari;
    } else if(typeof(chrome) !== 'undefined') {
      return ReChat.Browser.Chrome;
    } else if(typeof(self.on) === 'function') {
      return ReChat.Browser.Firefox;
    } else {
      throw 'ReChat is not compatible with this browser';
    }
  },

  getExtensionResourcePath: function (path) {
    switch(ReChat.currentBrowser()) {
      case ReChat.Browser.Safari:
        return safari.extension.baseURI + path;
      case ReChat.Browser.Chrome:
        return chrome.extension.getURL(path);
      case ReChat.Browser.Firefox:
        return self.options[path];
    }
    return null;
  },

  randomUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0,
          v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  get: function(path, params, success, failure) {
    switch(ReChat.currentBrowser()) {
      case ReChat.Browser.Safari:
        var uuid = ReChat.randomUUID(),
            handler = function(event) {
              if(event.name == uuid) {
                safari.self.removeEventListener('message', handler);
                if(!event.message || event.message.error) {
                  failure && failure(event.message);
                } else {
                  success(event.message);
                }
              }
            };
        safari.self.addEventListener('message', handler);
        safari.self.tab.dispatchMessage(uuid, {
          type: 'GETRequest',
          url: path,
          params: params
        });
        break;
      case ReChat.Browser.Chrome:
      case ReChat.Browser.Firefox:
        var jqxhr = $.get(path, params, success);
        if(failure) {
          jqxhr.fail(failure);
        }
        break;
    }
    return null;
  },

};

ReChat.Playback = function() {
  //this.videoId = videoId;
  //this.recordedAt = recordedAt;
  this.streamDelay = ReChat.defaultStreamDelay;
};

ReChat.Playback.prototype._prepareInterface = function() {
  var container = $('<div>').css({
    'position': 'absolute',
    'right': 0,
    'top': 0,
    'bottom': 0,
    'width': '339px',
    'z-index': 4,
    'background-color': '#f2f2f2',
    'margin-top': '50px'
  }).addClass('rightcol-content');

  var statusMessage = $('<div>').css({
    'position': 'relative',
    'top': '50px',
    'text-align': 'center',
    'background-repeat': 'no-repeat',
    'background-position': 'center top',
    'background-size': '40px 40px',
    'padding': '60px 20px'
  });
  container.append(statusMessage);
  this._statusMessageContainer = statusMessage;

  var chatMessages = $('<div>').css({
    'position': 'absolute',
    'right': 0,
    'top': 0,
    'bottom': 0,
    'left': 0,
    'width': 'auto',
    'height': 'auto',
    'overflow-x': 'hidden',
    'overflow-y': 'auto'
  });
  container.append(chatMessages);
  this._chatMessageContainer = chatMessages;

  this._container = container;
  $('#page').append(container);

  $('#watch-header').after('<div id="rechat-information" class="yt-card yt-card-has-padding">Video not playing...</div>');
};

ReChat.Playback.prototype._loadEmoticons = function() {
  var that = this;
  this._emoticons = {};
  ReChat.get('https://api.twitch.tv/kraken/chat/emoticons', {}, function(result) {
    if (typeof(result) === 'string' && typeof(JSON) !== 'undefined') {
      try {
        result = JSON.parse(result);
      } catch(e) {}
    }
    $.each(result.emoticons, function(i, emoticon) {
      var image = emoticon.images[0];
      if (!that._emoticons[image.emoticon_set]) {
        that._emoticons[image.emoticon_set] = [];
      }
      that._emoticons[image.emoticon_set].push({
        regex: new RegExp(emoticon.regex, 'g'),
        code: $('<span>').addClass('emoticon').css({ 'background-image': 'url(' + image.url + ')', 'height': image.height, 'width': image.width }).prop('outerHTML').replace(/&quot;/g, "'")
      });
    });
	that._emoticons = $.merge(specialYogEmotes, normalEmotes); // yog emotes should take priority over normal twitch emotes
    if (that._messagesFinished) {
		that._hideStatusMessage();
	} else {
		that._showStatusMessage('Emoticons done, waiting on Messages');
	}
	that._emotesFinished = true;
    console.log("[YL ReChat] Emotes have loaded!");
  });

};

ReChat.Playback.prototype._loadMessages = function(url, callback) {
  var that = this;
  ReChat.get(url, { },
             callback,
             function() {
               // request failed, let's try again in 5 seconds
               setTimeout(function() {
               	   if (!that._stopped) {
                  	 that._loadMessages(url, callback);
         		   }
               }, 5000);
             });
};

ReChat.Playback.prototype._showStatusMessage = function(message, statusImage) {
  if (!statusImage) {
    statusImage = 'spinner.gif';
  }
  if (this._lastStatusImage != statusImage) {
    this._statusMessageContainer.css('background-image', 'url(' + ReChat.getExtensionResourcePath('res/' + statusImage) + ')');
    this._lastStatusImage = statusImage;
  }
  this._chatMessageContainer.empty();
  this._statusMessageContainer.text(message);
  this._statusMessageContainer.show();
};

ReChat.Playback.prototype._hideStatusMessage = function() {
  this._statusMessageContainer.hide();
};

ReChat.Playback.prototype._scrolledToBottom = function() {
  return Math.abs(this._chatMessageContainer[0].scrollHeight - this._chatMessageContainer.scrollTop() - this._chatMessageContainer.outerHeight()) <= 30;
};

ReChat.Playback.prototype._scrollToBottom = function() {
  this._chatMessageContainer.scrollTop(this._chatMessageContainer[0].scrollHeight);
};

ReChat.Playback.prototype._replay = function() {
  var currentVideoTime = this._currentVideoTime(),
      currentAbsoluteVideoTime = this._currentAbsoluteVideoTime(),
      previousVideoTime = this._previousVideoTime,
      that = this;
  if (typeof previousVideoTime == 'undefined') {
    // first invocation => populate cache
    this._showStatusMessage('Loading messages...');
    console.info('First invocation, populating cache for the first time');
    this._autoPopulateCache(true);
  } else if (previousVideoTime > currentVideoTime || currentVideoTime - previousVideoTime > 60) {
    console.info('Time jumped, discarding cache and starting over');
    this._showStatusMessage('Loading messages...');
    this._newestMessageDate = null;
    this._cachedMessages = [];
    this._autoPopulateCache(true);
  } else if (currentAbsoluteVideoTime >= this._messageStreamEndAt) {
    if (this._chatMessageContainer.is(':empty')) {
      this._showStatusMessage('Sorry, no chat messages for this VOD available', 'sad.png');
    }
  } else if (!this._cachedMessages || !this._cachedMessages.length) {
    console.info('Cache is empty, waiting for population...');
  } else {
    if (this._cachedMessages.length >= ReChat.cacheExhaustionLimit) {
      this._cacheExhaustionHandled = false;
    }
    this._hideStatusMessage();
    var atBottom = this._scrolledToBottom();
    while (this._cachedMessages.length) {
      var message = this._cachedMessages[0],
          messageData = message._source,
          messageDate = new Date(Date.parse(messageData.recieved_at));
      if (messageDate <= currentAbsoluteVideoTime) {
        this._cachedMessages.shift();
        this._chatMessageContainer.append(this._formatChatMessage(messageData));
        if (atBottom) {
          this._scrollToBottom();
        }
      } else {
        if (this._chatMessageContainer.is(':empty')) {
          var secondsToFirstMessage = Math.floor(messageDate.getTime() / 1000 - currentAbsoluteVideoTime.getTime() / 1000);
          if (secondsToFirstMessage > 0) {
            var minutesToFirstMessage = Math.floor(secondsToFirstMessage / 60);
            secondsToFirstMessage -= minutesToFirstMessage * 60;
            secondsToFirstMessage = secondsToFirstMessage < 10 ? '0' + secondsToFirstMessage : secondsToFirstMessage;
            this._showStatusMessage('First recorded message will show up in ' + minutesToFirstMessage + ':' + secondsToFirstMessage);
          }
        }
        break;
      }
    }

    if (atBottom) {
      var numberOfChatMessagesDisplayed = this._chatMessageContainer.find('.rechat-chat-line').length;
      if (numberOfChatMessagesDisplayed >= ReChat.chatDisplayLimit) {
        this._chatMessageContainer.find('.rechat-chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - ReChat.chatDisplayLimit, 10) + ')').remove();
      }
    }

    if (!this._cacheExhaustionHandled && this._cachedMessages.length < ReChat.cacheExhaustionLimit) {
      this._cacheExhaustionHandled = true;
      this._autoPopulateCache();
    }
  }
  this._previousVideoTime = currentVideoTime;
  if (!this._stopped) {
    setTimeout(function() {
      that._replay();
    }, 200);
  }
};

ReChat.Playback.prototype._colorForNickname = function(nickname, usercolor) {
  if (usercolor) {
    return '#' + ('000000' + usercolor.toString(16)).slice(-6);
  } else {
    return this._generateColorForNickname(nickname);
  }
};

ReChat.Playback.prototype._generateColorForNickname = function(nickname) {
  var hash = 0, i, chr, len;
  if (nickname.length == 0) return hash;
  for (i = 0, len = nickname.length; i < len; i++) {
    chr   = nickname.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  hash = Math.abs(hash);
  return ReChat.nicknameColors[hash % (ReChat.nicknameColors.length - 1)];
};

ReChat.Playback.prototype._replaceEmoticons = function(text, emoticon_set) {
  var that = this;
  if (!emoticon_set) {
    emoticon_set = [];
  }
  $.each(emoticon_set.concat([null]), function(i, emoticon_set_id) {
    if (that._emoticons[emoticon_set_id]) {
      $.each(that._emoticons[emoticon_set_id], function(j, emoticon) {
        text = text.replace(emoticon.regex, emoticon.code);
      });
    }
  });
  return text;
};

ReChat.Playback.prototype._formatChatMessage = function(sender, msg) {
  var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
      from = $('<span>').addClass('from').css({
        'color': this._colorForNickname(messageData.from, messageData.usercolor),
        'font-weight': 'bold'
      }),
      colon = $('<span>').addClass('colon'),
      message = $('<span>').addClass('message');
  from.text(sender);
  colon.text(':');
  message.text(messageData.message);
  message.html(this._replaceEmoticons(message.html(), messageData.emoteset));
  line.append(from).append(colon).append(' ').append(message);
  return line;
};

ReChat.Playback.prototype._formatInfoMessage = function(msg) {
	var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
	    message = $('<span>').addClass('from').css({
	      'color': this._colorForNickname(msg),
	      'font-weight': 'bold'
	    });
	message.text(msg);
	line.append(message);
	return line;
};

ReChat.Playback.prototype._appendMessage = function(msg) {
	var atBottom = this._scrolledToBottom();
	this._chatMessageContainer.append(msg);
	if (atBottom) {
	  this._scrollToBottom();
	  var numberOfChatMessagesDisplayed = this._chatMessageContainer.find('.rechat-chat-line').length;
	  if (numberOfChatMessagesDisplayed >= ReChat.chatDisplayLimit) {
	    this._chatMessageContainer.find('.rechat-chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - ReChat.chatDisplayLimit, 10) + ')').remove();
	  }
	}
};

ReChat.Playback.prototype._tick = function() {
	var sub = ((this._pop.currentTime() * 1000) - (this._lastVideoTime * 1000));
	if (sub > 6000 || sub < 0) {
		console.log("[YL ReChat] Resynchronization required, time has either skipped forward or backward.");
		this._resync();
	}
	this._virtualTime.setMilliseconds(this._virtualTime.getMilliseconds() + sub);
	//console.log((pop.currentTime() * 1000) + " " + (lastVideoTime * 1000));
	this._lastVideoTime = this._pop.currentTime();

	$("#rechat-information").text("virtual time: " + this._virtualTime.toLocaleDateString() + " " + this._virtualTime.toLocaleTimeString() +  "  |  message #" + this._currentChatMessage);

	while (this._doDatesMatch()) {
		//console.log("[" + this._virtualTime + "] " + this._chatLog[this._currentChatMessage].sender + ": " + this._chatLog[this._currentChatMessage].message);
		this._appendMessage(this._formatChatMessage(this._chatLog[this._currentChatMessage].sender, this._chatLog[this._currentChatMessage].message));
		this._currentChatMessage++;
	}

};

ReChat.Playback.prototype._doDatesMatch = function() {
	var c = this._currentChatMessage;
	// this is a monstrosity, I know :(
	if ((this._chatLog[c].month - 1) == this._virtualTime.getMonth() && this._chatLog[c].day == this._virtualTime.getDate() && this._chatLog[c].year == this._virtualTime.getFullYear() && this._chatLog[c].hours == this._virtualTime.getHours() && this._chatLog[c].minutes == this._virtualTime.getMinutes() && this._chatLog[c].seconds == this._virtualTime.getSeconds()) {
		return true;
	}
	return false;
};

ReChat.Playback.prototype._resync = function() {
	this._showStatusMessage('Resynchronizing the chat...');
	var targetTime = new Date(this._startingVirtualTime.getTime() + (this._pop.currentTime() * 1000));
	var chatLog = this._chatLog;
	console.log("[YL ReChat] Reynchronization started. Looking for messages past: " + targetTime);
	for (i = 0; i < chatLog.length; i++) { // this may be /really/ inefficient.
		var nextDate = new Date(chatLog[i].year, chatLog[i].month - 1, chatLog[i].day, chatLog[i].hours, chatLog[i].minutes, chatLog[i].seconds);
		if (nextDate > targetTime) {
			console.log("[YL ReChat] Resync done, chosen message #" + i + ", which is at " + nextDate);
			this._currentChatMessage = i;
			this._appendMessage(this._formatInfoMessage("** Chat has been resynchronized **"));
			this._hideStatusMessage();
			return;
		}
	}
	console.log("[YL ReChat] Resynchronization failed, no messages found");
	this.stopWithoutRemoving();
	this._showStatusMessage('No chat messages were found past ' + targetTime.toLocaleTimeString() + ':(', 'sad.png');
};

ReChat.Playback.prototype.start = function(chatConfig) {
    console.info('[YL ReChat] Starting initialization...');

    var that = this;

   	/*var chatConfig = {
		"chatJson": "https://dl.dropboxusercontent.com/u/38313036/yoglogs/hakimon%20the%20return%20fixed.json",
		"day": 10,
		"month": 12,
		"year": 2014,
		"hours": 16,
		"minutes": 59,
		"seconds": 11
	};*/
	console.info('[YL ReChat] Preparing chat interface...');
	this._prepareInterface();

	this._showStatusMessage('Loading...');

	console.log("[YL ReChat] Loading emoticons...");
  	this._loadEmoticons();

	console.log("[YL ReChat] Attaching to YouTube player...");
	$(".html5-main-video").attr("id", "ytvideo");
	this._pop = Popcorn('#ytvideo');
 	this._pop.autoplay(false);
  	this._pop.pause();

	console.log("[YL ReChat] Initializing a bunch of variables that will be used later...");
	this._startingVirtualTime = new Date(chatConfig.year, chatConfig.month - 1, chatConfig.day, chatConfig.hours, chatConfig.minutes, chatConfig.seconds + this.streamDelay);
	this._virtualTime = new Date(this._startingVirtualTime.getTime());
	this._currentChatMessage = 0;
	this._lastVideoTime = 0;
	this._emotesFinished = false;
	this._messagesFinished = false;

	console.log("[YL ReChat] Loading messages...");
	this._loadMessages(chatConfig.chatJson, function(data) {
		that._chatLog = JSON.parse(data);
		that._resync();
		that._pop.on("timeupdate", function() {
			that._tick();
		});
		console.log("[YL ReChat] Messages loaded.");
		if (that._emotesFinished) {
			that._hideStatusMessage();
		} else {
			that._showStatusMessage('Messages done, waiting on Emoticons');
		}
		that._messagesFinished = true;
	});

  //this._replay();
};

ReChat.Playback.prototype.stop = function() {
	console.log("[YL ReChat] Stopping replay.");
	this._pop.off("timeupdate");
	if (this._container) {
    	this._container.empty();
    	this._container.remove();
  	}
    this._emoticons = [];
    this._chatLog = [];
};

ReChat.Playback.prototype.stopWithoutRemoving = function() {
	console.log("[YL ReChat] Stopping replay.");
	this._pop.off("timeupdate");
    this._container.empty();
    this._emoticons = {};
    this._chatLog = [];
};

// https://api.twitch.tv/kraken/videos/

$(document).ready(function() {

	if ($('meta[itemprop="channelId"]').attr("content") != "UCQBs359lwzyVFtc22LzLjuw") {
		console.log("[YL ReChat] Not a YogsLive video, not continuing with init.");
		return;
	}

	var id = $('meta[itemprop="videoId"]').attr('content');
	console.log("[YL ReChat] Loading chat configuration for video " + id + "...");
	ReChat.get('https://expertmac2.pancakeapps.com/rechat/config/' + id + ".json", {}, function(result) {
		new ReChat.Playback().start(result);
  	}, function() {
  		console.log("[YL ReChat] No chat configuration found for " + id + ", not continuing with init.");
  	});

});
