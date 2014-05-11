var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'pusher-1'; // appId

var App = require('../lib/Application');
var app = new App({ id : appId, dir : __dirname });

var redis = require('redis');
var redisConfig = {
	"host" : "172.16.32.30",
	"port" : "6379"
};

var redisClient = redis.createClient(redisConfig.port, redisConfig.host);
var redisSubscriber = redis.createClient(redisConfig.port, redisConfig.host);

var PushServer = {
	users : {},
	sessions : {},
	syncUser : function(server) {
		var self = this;
		console.log('start sync users...');

		server.command('list_users', {}, function (code, result) {
			console.log('getting ' + result.length + ' users...');
			result.forEach(function (user) {
				var session = app.sessionManager.create2({
					_id : user.sessionId,
					connector : server
				});

				var olduser = self.users[user.id];
				if (olduser) {
					var oldsession = olduser.session;
					delete self.sessions[oldsession.id];
				}

				var newuser = self.users[user.id] = { id : user.id, session : session };
				self.sessions[newuser.sessionId] = session;
			});
		});
	}
};

app.onCommand('connector::user_online', function (server, params, next) {
	var session = app.sessionManager.create2({ _id: params._id, connector: server });
	var olduser = PushServer.users[params.userId];
	if (olduser) {
		var oldsession = olduser.session;
		delete PushServer.sessions[oldsession.id];
	}

	var user = PushServer.users[params.userId] = { id : params.userId, session : session };
	PushServer.sessions[session.id] = user;

	console.log('user add ' + user.id);

	next(200);
});

app.onCommand('connector::user_offline', function (server, params, next) {
	var session = app.sessionManager.get(params._id);
	var user = PushServer.sessions[session.id];
	if (!user || user.session != session) {
		next(200);
		return;
	}

	delete PushServer.users[user.id];
	next(200);
	//TODO 不踢人有bug
});

app.on('server_connect', function (server) {
	if (server.type == 'connector') {
		PushServer.syncUser(server);
	}
});

app.start();

//////////////////////
/// redis listener ///
//////////////////////

var eventReadIndex = 0;
var eventIndex = 0;

var spreading = function(eventId, cb) {
	redisClient.hgetall('event.' + eventId, function(error, result) {
		if (error || !result) {
			console.log('something error when hgetall event.' + eventId);
			cb();
			return;
		}

		var eventInfo = result;
		var receivers, params, realReceivers = [];

		try {
			receivers = eventInfo.users = JSON.parse(eventInfo.users);
			params = eventInfo.params = JSON.parse(eventInfo.params);
		} catch(e) {
			console.log('something error when parse event.' + eventId);
			cb();
			return;
		}

		//TODO
		var sessions = [];
		if (!receivers || !receivers.length) {
			console.log('no receivers');
			cb();
			return;
		}

		receivers.forEach(function(userId) {
			if (PushServer.users[userId]) {
				realReceivers.push(userId);
				sessions.push(PushServer.users[userId].session);
			}
		});

		console.log('send event ' + eventId + ' to sessions ' + realReceivers.length + ' / ' + receivers.length + ' [' + realReceivers.join(',') + ']');
		if (sessions.length) app.sessionManager.send(sessions, 'push', params);
		
		cb();
		return;
	});
};

var check = function(cb) {
	if (!eventReadIndex || !eventIndex) {
		//cb({msg:"eventIndex or eventReadIndex not ready"});
		//return;
	}
	if (eventReadIndex >= eventIndex) {
		cb({msg:"no event to spread... "});
		return;
	}

	spreading(eventReadIndex + 1, function() {
		redisClient.incr('eventReadIndex', function(error, result) {
			eventReadIndex = result;
			check(cb);
		});
	});
};

var getEventIndex = function(cb) {
	redisClient.get('eventIndex', function(error, result) {
		eventIndex = Math.floor(result);
		cb();
	});
};

var getEventReadIndex = function(cb) {
	redisClient.get('eventReadIndex', function(error, result) {
		eventReadIndex = Math.floor(result);
		cb();
	});
};

getEventIndex(function() {
	getEventReadIndex(function() {
		check(function(error) {
			console.log(error);
		});
	});
});

redisSubscriber.subscribe("pushEvent2Player");
redisSubscriber.on("message", function(channel, eventId) {
	console.log("channel " + channel + " has published " + eventId);
	if (eventReadIndex < eventIndex) {
		eventIndex = eventId;
	} else {
		eventIndex = eventId;
		check(function(error) {
			console.log(error);
		});
	}
});
