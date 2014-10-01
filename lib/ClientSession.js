var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');
var EasySocket = require('./EasySocket');

var ClientSession = module.exports = function(options) {
	this.init(options);
};

//inherits from EventEmitter;
_.extend(ClientSession.prototype, EventEmitter.prototype);

ClientSession.prototype.init = function(options) {
	options = options || {};

	this._cid = options._cid;
	this._id = options.app.id + '::' + options._cid;
	this.id = this._id;
	this.socket = options.socket;
	this.remoteAddr = options.socket.remoteAddr;
	this.app = options.app;
	this.serverEnds = {};

	// this.receivedByte = 0;
	// this.receivedCount = 0;
	// this.sentByte = 0;
	// this.sentCount = 0;

	var self = this;

	self.socket.on(EasySocket.EVENT.REQUEST, self.onRequest.bind(self));
	self.socket.on(EasySocket.EVENT.CLOSE, self.onClose.bind(self));
	self.socket.on(EasySocket.EVENT.ERROR, self.onClose.bind(self));

};

ClientSession.prototype.disconnect = function() {
	var self = this;
	self.socket.disconnect();
}

ClientSession.prototype.onClose = function(options) {
	var self = this;
	options = options || {};

	//clear all timers
	if (this.disconnectingTimer) {
		clearTimeout(this.disconnectingTimer);
		delete this.disconnectingTimer;
	}

	self.app.sessionManager.drop(self);
	self.app.emit('session_disconnect', self);
};


ClientSession.prototype.onRequest = function(router, data, callback) {
	var self = this;
	var reg = /^(\w+)\.(\w+)$/;
	var path, name, method;

	if (typeof callback !== 'function') callback = function() {};
	if (typeof router !== 'string' || !reg.test(router)) return callback(501, 'router must be a string');

	path = reg.exec(router);
	path.shift();

	name = path[0];
	method = path[1];

	var serverEnd = self.serverEnds[name];
	if (serverEnd) {
		serverEnd.sendMessage(self, method, data, callback);
	} else if (name == self.app.type) {
		self.app.emit('message.' + method, self, data, callback);
	} else {
		callback(404);
	}
};

ClientSession.prototype.send = function(router, data, callback) {
	this.socket.sendRequest(router, data, callback);
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
		remoteAddr : self.remoteAddr,
		receivedByte : self.receivedByte,
		receivedCount : self.receivedCount,
		sentByte : self.sentByte,
		sentCount : self.sentCount,
	};
};
