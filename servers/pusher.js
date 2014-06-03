var redis = require('redis');
var fs = require('fs');
JSON.minify = JSON.minify || require('node-json-minify');

var redisConfig = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/configs/redis.json', 'utf8')));
var redisClient = redis.createClient(redisConfig.port, redisConfig.host);
var redisSubscriber = redis.createClient(redisConfig.port, redisConfig.host);

var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'pusher-1'; // appId

var App = require('../lib/Application');
var app = new App({ id : appId, dir : __dirname });

var PushServer = {
	users : {},
	syncUser : function(server) {
		var self = this;
		app.logger.log('start sync users...');

		server.command('list_users', {}, function (code, result) {
			app.logger.log('getting ' + result.length + ' users...');
			result.forEach(function (user) {
				var session = app.sessionManager.create2({
					_id : user._id,
					connector : server
				});

				var olduser = self.users[user.id];
				if (olduser) {
					var oldsession = olduser.session;
				}

				var newuser = self.users[user.id] = { id : user.id, session : session };
				session.user = newuser;
			});
		});
	}
};

app.onCommand('connector::user_online', function (connector, params, next) {
	var session;
	session = app.sessionManager.get(params._id)
			|| app.sessionManager.create2({ _id: params._id, connector: connector });
	var user = PushServer.users[params.id] || { id : params.id };
	if (user.timer) {
		clearTimeout(user.timer);
		delete user.timer;
		app.logger.log('user reconnected: ' + user.id);
	}

	user.session = session;
	PushServer.users[params.id] = session.user = user;

	app.logger.log('user add ' + user.id);

	next(200);
});

app.onCommand('connector::user_offline', function (connector, params, next) {
	var session = app.sessionManager.get(params._id);
	if (!session) return;

	var user = session.user;
//	app.logger.log('user disconnect: ' + user.id);
	if (!user || user.session != session) {
		app.sessionManager.drop(session);
		next(200);
		return;
	}

	app.sessionManager.drop(session);
	//TODO clear rooms in 5s if nobody login;
	app.logger.log('wait 5m for disconnect user: ' + user.id);
	user.timer = setTimeout(function() {
		app.logger.log('user disconnected: ' + user.id);
		user.timer = null;
		delete PushServer.users[user.id];
	}, 5*60*1000);

	next(200);
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
			app.logger.log('something error when hgetall event.' + eventId);
			cb();
			return;
		}

		var eventInfo = result;
		var receivers, params, realReceivers = [];

		try {
			receivers = eventInfo.users = JSON.parse(eventInfo.users);
			params = eventInfo.params = JSON.parse(eventInfo.params);
		} catch(e) {
			app.logger.log('something error when parse event.' + eventId);
			cb();
			return;
		}

		//TODO
		var sessions = [];
		if (!receivers || !receivers.length) {
			app.logger.log('no receivers');
			cb();
			return;
		}

		receivers.forEach(function(userId) {
			if (PushServer.users[userId]) {
				realReceivers.push(userId);
				sessions.push(PushServer.users[userId].session);
			}
		});

		app.logger.log('send event ' + eventId + ' to sessions ' + realReceivers.length + ' / ' + receivers.length + ' [' + realReceivers.join(',') + ']');
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
			app.logger.log(error);
		});
	});
});

redisSubscriber.subscribe("pushEvent2Player");
redisSubscriber.on("message", function(channel, eventId) {
	app.logger.log("channel " + channel + " has published " + eventId);
	if (eventReadIndex < eventIndex) {
		eventIndex = eventId;
	} else {
		eventIndex = eventId;
		check(function(error) {
			app.logger.log(error);
		});
	}
});
