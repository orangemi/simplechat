var memcache = require('memcache');
var redis = require('redis');
var fs = require('fs');
JSON.minify = JSON.minify || require('node-json-minify');

var memcacheConfig = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/configs/memcache.json', 'utf8')));
var redisConfig = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/configs/redis.json', 'utf8')));

var memcacheClient = new memcache.Client(memcacheConfig.port, memcacheConfig.host);
memcacheClient.on('error', function(err) {
	app.logger.log('memcache error: ' + err);
	var self = this;
	setTimeout(function() {
		self.connect();
	}, 1000);
});
memcacheClient.connect();

var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'gate-1'; // appId

var App = require('../lib/Application');
var app = new App({ id : appId, dir : __dirname });

var users = {};

app.onCommand('connector::login', function (server, params, next) {
	//if (app.sessionManager.get(params._id)) return next(403, 'you cannot relogin');
	params = params || {};
	var key = params.key;
	if (!key || typeof(key) !== 'string') return next(403, 'no userid or session');

	memcacheClient.get('Session::' + key, function (err, uid) {
		app.logger.log('login key: ' + key + ' , _id: ' + params._id + ' , uid: ' + uid);

		if (!uid) return next(403, 'invalid session');
		var olduser = users[uid];
		if (olduser && olduser._id != params._id) {
			//TODO kick old session (olduser.session)
			app.sessionManager.send([olduser._id], 'logout', {});
			olduser.connector.command('kick_session', { _id : olduser._id });
			//app.sessionManager.drop(olduser.session);
			delete users[uid];
		}
		//session = app.sessionManager.create2(session);
		var user = users[uid] = {
			id : uid,
			connector : server,
			_id : params._id,
			//session : session
		};
		app.logger.log('return 200 ' + uid);
		next(200, {uid: uid});
	});
});

app.onCommand('connector::session_disconnect', function (server, params) {
	var session = app.sessionManager.get(params._id);
	if (!session) return;
	app.sessionManager.drop(session);
});

app.start();

var redisSubscriber = redis.createClient(redisConfig.port, redisConfig.host);
redisSubscriber.subscribe("kick_user");
redisSubscriber.on("message", function(channel, userIds) {
	try {
		userIds = JSON.parse(userIds);
	} catch (e) {
		app.logger.log(e);
	}

	userIds.forEach(function(userId) {
		var user = users[userId];
		if (!user) return;
		var session = user.session;
		session.connector.command('kick_session', { _id : session._id });
		app.sessionManager.drop(session);
		delete users[userId];
	});

});
