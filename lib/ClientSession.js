var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

var ClientSession = module.exports = function(options) {
	this.init(options);
};

//inherits from EventEmitter;
_.extend(ClientSession.prototype, EventEmitter.prototype);

ClientSession.prototype.init = function(options) {
	options = options || {};

	this.id = options.id;
	this._cid = options._cid;
	this._id = options.app.id + '::' + options._cid;
	this.socket = options.socket;
	this.app = options.app;
	this.serverEnds = {};

	var self = this;

	//TODO: login func
	process.nextTick(function() {
		self.onLogin();
	});
};

ClientSession.prototype.onLogin = function(options) {
	var self = this;

	//start listen message
	self.socket.on('message', self.onMessage.bind(self));
	self.socket.on('disconnect', self.disconnect.bind(self));
	//self.socket.on('disconnect', self.onDisconnecting.bind(self));

	self.app.emit('session_connect', self);

};

ClientSession.prototype.onDisconnecting = function() {
	var self = this;
	// set a timeout for real disconnect
	var timer = self.disconnectingTimer = setTimeout(function() {
		self.disconnect({positive : true});
	}, 5000);
};

ClientSession.prototype.disconnect = function(options) {
	var self = this;
	options = options || {};

	//clear all timers
	if (this.disconnectingTimer) {
		clearTimeout(this.disconnectingTimer);
		delete this.disconnectingTimer;
	}

	if (options.positive) {
		//console.log('positive disconnect ' + self.id);
		self.socket.disconnect();
	}

	self.app.sessionManager.drop(self);
	self.app.emit('session_disconnect', self);
};


ClientSession.prototype.onMessage = function(router, data, callback) {
	var self = this;
	var reg = /^(\w+)\.(\w+)$/;

	if (typeof callback !== 'function') callback = function() {};
	if (typeof router !== 'string' || !reg.test(router)) return callback(501, 'router must be a string');

	var path = reg.exec(router);
	path.shift();

	var name = path[0];
	var method = path[1];
	var serverEnd = self.serverEnds[name];
	if (serverEnd) {
		serverEnd.processMessage(self, method, data, callback);
	} else if (name == self.app.type) {
		self.app.emit('message.' + method, self, data, callback);
	}

};

ClientSession.prototype.send = function(router, data, callback) {
	this.socket.emit('message', router, data, callback);
};

// @experimental
ClientSession.prototype.setBackEnd = function(type, serverEnd) {
	this.serverEnds[type] = serverEnd;
};

ClientSession.prototype.display = function() {
	var self = this;
	return {
		id : self.id,
		app : self.app.id,
		connected : self.socket.connected,
		url : self.socket.io.uri,
//		qps : this.getQps(),
	};
};
