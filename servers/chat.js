var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'chat-1'; // appId

var App = require('../lib/Application');
var app = new App({ id : appId, dir : __dirname });

var redisConfig = {
	"host" : "172.16.32.30",
	"port" : "6379"
};

var redis = require('redis');

var ChatServer = {
	users : {},
	groups : {},
	sessions : {},

	onPushGroup : function(name, message) {
		var self = this;

		var group = this.groups[name] || [];
		if (!group || !group.length) {
			console.log('no such a group or no one in "' + group + '".');
			return;
		}
		
		var sessions = [];
		group.forEach(function(userId) {
			var user = self.users[userId];
			if (!user) return;
			sessions.push(user.session);
		});
		console.log('send message to ' + sessions.length + ' users');
		app.sessionManager.send(sessions, 'chat', message);
		//console.log("send to connector '" + connector.id + "' with " + users.length + " users message " + message);
	},

	onJoinGroup : function(name, userId) {
		var self = this;

		var group = self.groups[name];
		if (!userId) return;
		if (!group) group = self.groups[name] = [];
		if (group.indexOf(userId) >= 0) return;
		group.push(userId);
		console.log(userId + " joined " + name);
	},

	onLeaveGroup : function(name, userId) {
		var self = this;

//		var user = users[u_id];
		var group = self.groups[name];
		if (!group || !group.length) return;
		var index = group.indexOf(u_id);
		if (index >= 0) group.splice(index, 1);
		console.log(u_id + " leave " + name);
	},

	onUpdateGroup : function(names, userId) {
		//TODO
		cosole.log('update user group is not complete');
	},

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

				var user = self.users[user.id] = { id : user.id, session : session };
				self.sessions[user.sessionId] = session;
			});
		});
	}
};


app.onCommand('connector::user_online', function (server, params, next) {
	var session = app.sessionManager.create2({ _id: params._id, connector: server });
	var olduser = ChatServer.users[params.userId];
	if (olduser) {
		var oldsession = olduser.session;
		delete ChatServer.sessions[oldsession.id];
	}

	var user = ChatServer.users[params.userId] = { id : params.userId, session : session };
	ChatServer.sessions[session.id] = user;

	console.log('user add ' + user.id);

	next(200);
});

app.onCommand('connector::user_offline', function (server, params, next) {
	var session = app.sessionManager.get(params._id);
	var user = ChatServer.sessions[session.id];
	if (!user || user.session != session) {
		next(200);
		return;
	}

	//TODO clear rooms;
	for (var name in groups) {
		var group = groups[name];
		var index = group.indexOf(user.id);
		if (index >= 0) group.splice(index, 1);
		if (!group.length) delete groups[name];
	}

	delete users[user.id];
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

redisSubscriber.subscribe("pushGroup");
redisSubscriber.subscribe("joinGroup");
redisSubscriber.subscribe("leaveGroup");
redisSubscriber.subscribe("updateGroup");
console.log("redis start to listen pushGroup...");
redisSubscriber.on("message", function(channel, params) {
	try {
		params = JSON.parse(params);
	} catch (e) {
		consoel.log('push params error with ' + params);
		return;
	}

	params = params || {};
	switch (channel) {
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

	}
});

