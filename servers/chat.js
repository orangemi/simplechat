var redis = require('redis');
var fs = require('fs');
JSON.minify = JSON.minify || require('node-json-minify');

var redisConfig = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/configs/redis.json', 'utf8')));

var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'chat-1'; // appId

var App = require('../lib/Application');
var app = new App({ id : appId, dir : __dirname });

var ChatServer = {
	users : {},
	groups : {},

	onPushGroup : function(name, message) {
		var self = this;
		var group = this.groups[name] || [];
		if (!group || !group.length) {
			app.logger.log('no such a group or no one in "' + group + '".');
			return;
		}

		var sessions = [];
		group.forEach(function(userId) {
			var user = self.users[userId];
			if (!user) return;
			sessions.push(user.session);
		});
		app.logger.log('send message to ' + sessions.length + ' users');
		app.sessionManager.send(sessions, 'chat', message);
	},

	onJoinGroup : function(name, userId) {
		var self = this;

		var group = self.groups[name];
		if (!userId) return;
		if (!group) group = self.groups[name] = [];
		if (group.indexOf(userId) >= 0) return;
		group.push(userId);
		app.logger.log(userId + " joined " + name);
	},

	onLeaveGroup : function(name, userId) {
		var self = this;

//		var user = users[u_id];
		var group = self.groups[name];
		if (!group || !group.length) return;
		var index = group.indexOf(u_id);
		if (index >= 0) group.splice(index, 1);
		app.logger.log(u_id + " leave " + name);
	},

	onUpdateGroup : function(names, userId) {
		//TODO
		cosole.log('update user group is not complete');
	},

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
	var user = ChatServer.users[params.id] || { id : params.id };

	if (user.timer) {
		clearTimeout(user.timer);
		delete user.timer;
		app.logger.log('user reconnected: ' + user.id);
	}

	user.session = session;
	ChatServer.users[params.id] = session.user = user;

	app.logger.log('user add ' + user.id);

	next(200);
});

app.onCommand('connector::user_offline', function (connector, params, next) {
	var session = app.sessionManager.get(params._id);
	if (!session) return;

	var user = session.user;
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
		// for (var name in ChatServer.groups) {
		// 	var group = ChatServer.groups[name];
		// 	var index = group.indexOf(user.id);
		// 	if (index >= 0) group.splice(index, 1);
		// 	if (!group.length) delete ChatServer.groups[name];
		// }
		delete ChatServer.users[user.id];
	}, 5 * 60 * 1000);

	next(200);
});

app.on('server_connect', function (server) {
	if (server.type == 'connector') {
		ChatServer.syncUser(server);
	}
});

app.start();

//////////////////////
/// redis listener ///
//////////////////////

var redisSubscriber = redis.createClient(redisConfig.port, redisConfig.host);

// redisSubscriber.subscribe("pushGroup");
// redisSubscriber.subscribe("joinGroup");
// redisSubscriber.subscribe("leaveGroup");
redisSubscriber.subscribe("push2group");
app.logger.log("redis start to listen pushGroup...");
redisSubscriber.on("message", function(channel, event) {
	try {
		event = JSON.parse(event);
	} catch (e) {
		consoel.log('push event error with ' + event);
		return;
	}

	//event = params || {};
	var params = event.params;
	switch (event.router) {
		case 'pushGroup' :
			ChatServer.onPushGroup(params.name, params.message);
			break;
		case 'joinGroup' :
			ChatServer.onJoinGroup(params.name, params.u_id);
			break;
		case 'leaveGroup' :
			ChatServer.onLeaveGroup(params.name, params.u_id);
			break;
		case 'updateGroup' :
			ChatServer.onUpdateGroup(params.names, params.u_id);
			break;
		default:
			console.log("no router support: ", event.router);

	}
});

