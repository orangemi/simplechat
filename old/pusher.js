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

///////////////////////////////


var	redis = require('redis');

var redisClient = redis.createClient(redisConfig.port, redisConfig.host);
var redisSubscriber = redis.createClient(redisConfig.port, redisConfig.host);

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
		var receivers, params;

		try {
			receivers = eventInfo.users = JSON.parse(eventInfo.users);
			params = eventInfo.params = JSON.parse(eventInfo.params);
		} catch(e) {
			console.log('something error when parse event.' + eventId);
			cb();
			return;
		}

		if (receivers && receivers.length) {
			// var sent = 0;
			// var finish = function() {
			// 	if (sent < users.length) return;
			// 	var userString = JSON.stringify(users);
			// 	redisClient.publish('pushEvent2OnlinePlayer', userString, function() {
			// 		console.log("publish: event." + eventId + " on " + userString);
			// 	});
			// 	cb();
			// };
			// users.forEach(function(user_id) {
			// 	redisClient.rpush('eventPlayer.' + user_id, eventId, function() {
			// 		sent++;
			// 		finish();
			// 	});
			// });
			var connectorUsers = [];
			receivers.forEach(function(u_id) {
				var user = users[u_id];
				if (!user) return;
				var connector = user.connector;
				connectorUsers[connector.id] = connectorUsers[connector.id] || [];
				connectorUsers[connector.id].push(u_id);
			});
			connectors.forEach(function(connector) {
				var users = connectorUsers[connector.id];
				if (!users || !users.length) return;
				console.log("send to connector '" + connector.id + "' with " + users.length + " users");
				connector.socket.emit("message", users, "push", params, function (error, code, message) {

				});
			});
			cb();
		} else {
			cb();
		}

		return;
		//eventInfo.users = JSON.parse(eventInfo.users);
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
			process.nextTick(function() {
				check(cb);
			});
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
	getEventReadIndex(function(){
		check(function(error) {
			console.log(error);
		});
	});
});

redisSubscriber.subscribe("pushEvent2Player");
redisSubscriber.on("message", function(channel, data) {
	console.log("channel " + channel + " has published " + data);

	getEventIndex(function() {
		check(function(error) {
			console.log(error);
		});
	});
});