var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;
var ServerEnd = require('./ServerEnd');

var ServerManager = module.exports = function (options) {
	this.init(options);
};

_.extend(ServerManager.prototype, EventEmitter.prototype);

ServerManager.prototype.init = function(options) {
	options = options || {};
	this.app = options.app;
	this.servers = {};
	this.serverId = 0;
};

ServerManager.prototype.create = function(data, socket) {
	var self = this;

	if (!data || !data.id || !data.type) {
		console.log('can not create a server without id & type');
		return;
	}

	var oldserver = self.get(data.id);
	if (oldserver) {
		//kill exist serverend
		oldserver.disconnect({positive : true});
	}

	var server = new ServerEnd({
		_sid : self.serverId++,
		socket : socket,
		app : self.app,
		id : data.id,
		type : data.type
	});
	
	self.add(server);
};

ServerManager.prototype.onConnect = function(socket) {
	var self = this;

	var timer = setTimeout(function() {
		socket.disconnect();
	}, 5000);

	socket.once('login', function (data, next) {

		//TODO verify data
		if (!data || data.key != self.app.authkey) {
			socket.disconnect();
			return;
		}

		clearTimeout(timer);

		self.create(data, socket);
		if (next) next(200);
	});
};

ServerManager.prototype.login = function(config, socket, options) {
	var self = this;
	options = options || {};

	var oldserver = self.get(config.id);
	if (options.force && oldserver) {
		oldserver.disconnect({positive : true});
	} else if (oldserver) {
		//duplicated login
		console.log('it is already connected to ' + config.id);
		socket.disconnect();
		return;
	}

	var timer = setTimeout(function() {
		socket.disconnect();
	}, 5000);

	//TODO key is should be upgrade
	socket.emit('login', {key: self.app.authkey, id: self.app.id, type: self.app.type}, function (code) {
		//onlogin
		clearTimeout(timer);
		self.create({id:config.id, type:config.type}, socket);
	});
};

ServerManager.prototype.add = function(server) {
	var self = this;
	if (!server.id) throw new Error('no id for object');
	self.servers[server.id] = server;
};

ServerManager.prototype.drop = function(servers) {
	var self = this;
	if (!_.isArray(servers)) servers = [servers];
	var count = 0;
	servers.forEach(function(server) {
		if (server == self.servers[server.id]) {
			delete self.servers[server.id];
			count++;
		}
	});
	return count;
};

ServerManager.prototype.filter = function(func) {
	var self = this;
	if (typeof func !== 'function') throw new Error('argument is not a function');
	var result = [];
	var server;
	for (var i in self.servers) {
		server = self.servers[i];
		if (func(server) === true) result.push(server);
	}
	return result;
};

ServerManager.prototype.get = function(id) {
	var self = this;
	if (!id) throw new Error('id should not empty');
	return self.servers[id];
};

ServerManager.prototype.childrenDisplay = function() {
	var self = this;
	var result = [];
	self.servers.forEach(function (serverEnd) {
		result.push(serverEnd.display());
	});
	return result;
};

