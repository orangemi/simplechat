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

	this.receivedByte = 0;
	this.receivedCount = 0;
	this.sentByte = 0;
	this.sentCount = 0;
};

ServerManager.prototype.create = function(data, socket) {
	var self = this;

	if (!data || !data.id || !data.type) {
		self.app.logger.log('can not create a server without id & type');
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
	return server;
};

ServerManager.prototype.onConnect = function(socket, info, next) {
	var self = this;

	//TODO verify data
	if (!info || info.key != self.app.authkey) return next(500);
	var server = self.create(info, socket);
	next(200);
	self.app.emit('server_connect', server);
};

ServerManager.prototype.login = function(config, socket, options) {
	var self = this;
	options = options || {};

	var oldserver = self.get(config.id);
	if (options.force && oldserver) {
		oldserver.disconnect({positive : true});
	} else if (oldserver) {
		//duplicated login
		self.app.logger.log('it is already connected to ' + config.id);
		return;
	}

	var server = self.create({id: config.id, type: config.type}, socket);
	self.app.emit('server_connect', server);
};

ServerManager.prototype.add = function(server) {
	var self = this;
	if (!server.id) {
		console.log('no id for object');
		throw 'no id for object';
	}
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
	self.filter(function (serverEnd) {
		result.push(serverEnd.display());
	});
	return result;
};

ServerManager.prototype.display = function() {
	return {
		servers : this.childrenDisplay(),
		receivedByte : this.receivedByte,
		receivedCount : this.receivedCount,
		sentByte : this.sentByte,
		sentCount : this.sentCount,
	};
};

