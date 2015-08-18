var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');
var EasySocket = require('./EasySocket');

var md5 = function(string, encoding) {
	encoding = encoding || 'hex';
	// var crypto = require('crypto');
	// var md5 = crypto.createHash('md5');
	return require('crypto').createHash('md5').update(string).digest(encoding);
};

var ClientSession = module.exports = function(options) {
	this.init(options);
};

//inherits from EventEmitter;
_.extend(ClientSession.prototype, EventEmitter.prototype);

ClientSession.prototype.init = function(options) {
	options = options || {};

	this._cid = options._cid;
	this.uniqueId = md5('client.' + this._cid + ':' + Math.floor(Math.random() * 10000) + ':' + new Date().getTime()).substring(0, 16);
	this._id = options.app.id + '::' + options.app.uniqueId + '::' + this.uniqueId;
	this.id = this._id;
	this.socket = options.socket;
	this.remoteAddr = this.socket.socket.remoteAddress;
	this.remotePort = this.socket.socket.remotePort;
	this.app = options.app;
	this.createtime = new Date();
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
};

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
	self.disconnect();
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
		remotePort : self.remotePort,
		receivedByte : self.socket.receivedByte,
		receivedCount : self.socket.receivedCount,
		sentByte : self.socket.sentByte,
		sentCount : self.socket.sentCount,
	};
};
