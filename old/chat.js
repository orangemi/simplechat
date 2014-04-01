//TODO make configs to file
var connecterConfigs = [
	{
		"id"		: "connector-1",
		"host"		: "127.0.0.1",
		"port"		: "8011",
		"public"	: true
	}
];

var redisConfig = {
	"host" : "172.16.32.30",
	"port" : "6379"
};

var io = require('socket.io-client'),
	redis = require('redis');

var connectors = [];
var users = {};
var groups = {};

var ChatServer = {
};

var Connector = function(socket, config) {
	this.socket = socket;
	this.config = config;
	this.id = config.id;
	this.init();
};

Connector.prototype.init = function() {
	this.login();
};

Connector.prototype.login = function() {
	//TODO
	this.onLogin();
};

Connector.prototype.onLogin = function(next) {
	var self = this;

	this.syncUsers(next);
	this.socket.on('command', function (command, params, callback) {
		self.onCommand(command, params, callback);
	});
	//next(null, 200);
};

Connector.prototype.onCommand = function(command, params, next) {
	var self = this;
	console.log('get connector command:' + command + ' :');
	console.log(params);
	switch (command) {
		case 'userOnline' : return this.onUserOnline(params, next);
		case 'userOffline' : return this.onUserOffline(params, next);
		default : return next(null, 500);
	}

};

Connector.prototype.onUserOnline = function(params, next) {
	var self = this;
	var user = params;
	user.connector = self;
	//user.groups = [];
	users[user.u_id] = user;
	next(null, 200);

	//TODO getUserGroupInfo
};

Connector.prototype.onUserOffline = function(params, next) {
	var self = this;
	var user = params;
	//user.connector = self;
	users[user.u_id] = user;

	//delete users in group
	for (var name in groups) {
		var group = groups[name];
		var index = group.indexOf(user.u_id);
		if (index >= 0) group.splice(index, 1);
	}
	delete users[user.u_id];

	next(null, 200);

	//TODO getUserGroupInfo
};

Connector.prototype.syncUsers = function(next) {
	console.log('start sync users...');
	var self = this;
	this.socket.emit('command', 'users', {}, function (err, code, result) {
		console.log('getting users...');
		console.log(result);
		result.forEach(function (user) {
			user.connector = self;
			users[user.u_id] = user;
		});

		if (next) next();
	});
};


(function() {
	
	connecterConfigs.forEach(function(config) {
		//var connetorConfig = connecterConfigs[name];
		var socket = io.connect(null, { host : config.host, port : config.port });
		socket.on('connect', function() {
			var connector = new Connector(socket, config);
			connectors.push(connector);
			//todo try login
		});
	});

})();

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

ChatServer.onPushGroup = function(name, message) {

	// var name = params.name;
	// var message = params.message;
	// console.log(name);
	// console.log(message);

	var group = groups[name] || [];
	//TODO process single user condition
	if (/^p\.(\d+)$/.test(name)) group = [name.slice(2)];

	//
	if (!group || !group.length) {
		console.log('no such a group or no one in "' + group + '".');
		return;
	}

	var connectorUsers = [];
	group.forEach(function(u_id) {
		var user = users[u_id];
		if (!user) return;
		var connector = user.connector;
		connectorUsers[connector.id] = connectorUsers[connector.id] || [];
		connectorUsers[connector.id].push(u_id);
	});

	connectors.forEach(function(connector) {
		var users = connectorUsers[connector.id];
		if (!users || !users.length) return;
		console.log("send to connector '" + connector.id + "' with " + users.length + " users message " + message);
		connector.socket.emit("message", users, "message", message, function(error, code, message) {

		});
	});
};

ChatServer.onJoinGroup = function(name, u_id) {
	var group = groups[name];
	if (!u_id) return;
	if (!group) group = groups[name] = [];
	if (group.indexOf(u_id) >= 0) return;
	group.push(u_id);
	console.log(u_id + " joined " + name);
};

ChatServer.onLeaveGroup = function(name, u_id) {
	var user = users[u_id];
	var group = groups[name];
	if (!group) return;
	var index = group.indexOf(u_id);
	if (index >= 0) group.splice(index, 1);
	console.log(u_id + " leave " + name);
};

ChatServer.onUpdateGroup = function(names, u_id) {
	var name;
	var self;
	for (name in groups) {
		self.onLeaveGroup(name, u_id);
	}
	names.forEach(function(name) {
		self.onJoinGroup(name, u_id);
	});
};