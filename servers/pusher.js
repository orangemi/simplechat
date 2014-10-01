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

redisSubscriber.subscribe("push2ids");
redisSubscriber.on("message", function(channel, event) {
	try {
		event = JSON.parse(event);
	} catch (e) {
		consoel.log('push event error with ', event);
		return;
	}

	var sessions = [];
	var realReceivers = [];
	if (!event.users || !event.users.length) {
		console.log('push no user');
		return;
	}

	event.users.forEach(function(userId) {
		if (!PushServer.users[userId]) return;
		realReceivers.push(userId);
		sessions.push(PushServer.users[userId].session);
	});

	app.logger.log('send event ' + event.router + ' to sessions ' + realReceivers.length + ' / ' + event.users.length + ' [' + realReceivers.join(',') + ']');
	if (sessions.length) app.sessionManager.send(sessions, event.router, event.params);
});
