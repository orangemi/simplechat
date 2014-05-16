var memcache = require('memcache');
var redis = require('redis');

var memcacheConfig = {
	host : '172.16.32.30',
	port : 11211
};

var redisConfig = {
	host : "172.16.32.30",
	port : 6379
};

var memcacheClient = new memcache.Client(memcacheConfig.port, memcacheConfig.host);
var redisClient = redis.createClient(redisConfig.port, redisConfig.host);
memcacheClient.on('error', function(err) {
	console.log(err);
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


app.onCommand('connector::user_login', function (connector, data, next) {
	data = data || {};
	//var userId = data.u_id || data.uid || data.id;
	var key = data.key;
	var _id = data._id;

	if (!key || typeof(key) !== 'string') {
		next(403, 'no userid or session');
		return;
	}
	memcacheClient.get('Session::' + key, function (err, uid) {
		console.log('login key: ' + key + ' , _id: ' + _id + ' , uid: ' + uid);
		if (!uid) next(403, 'invalid session');
		var olduser = users[uid];
		if (olduser && olduser.session && olduser.session._id != _id) {
			//app.sessionManager.send([olduser.session], 'logout', message);
			//TODO kick old session (olduser.session)
			app.sessionManager.drop(olduser.session);
			connector.command('kick_session', { _id : olduser.session._id });
		}
		var session = app.sessionManager.create2({ _id: _id, connector: connector, id: uid });
		var user = users[uid] = {
			id : uid,
			session : session
		};
		//users[uid] = user;
		console.log('return 200 ' + uid);
		next(200, '', uid);
		return;
	});

});

app.start();