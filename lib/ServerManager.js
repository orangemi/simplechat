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
	this.servers = [];
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
	
	self.servers.push(server);
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

ServerManager.prototype.drop = function(servers) {
	if (!_.isArray(servers)) servers = [servers];
	this.servers = _.difference(this.servers, servers);
};
ServerManager.prototype.filter = function(func) {
	return this.servers.filter(func);
};
ServerManager.prototype.get = function(id) {
	return this.filter(function (server) {
		return server.id == id;
	}).pop();
};

ServerManager.prototype.childrenDisplay = function() {
	var self = this;
	var result = [];
	self.servers.forEach(function (serverEnd) {
		result.push(serverEnd.display());
	});
	return result;
};

