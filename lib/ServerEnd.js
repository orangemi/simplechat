var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');
var EasySocket = require('./EasySocket');

var ServerEnd = module.exports = function(options) {
	this.init(options);
};

//inherits from EventEmitter;
_.extend(ServerEnd.prototype, EventEmitter.prototype);

ServerEnd.prototype.init = function(options) {
	options = options || {};
	this._sid = options._sid;
	this.id = options.id;
	this.type = options.type;
	this.app = options.app;
	this.socket = options.socket;

	this.receivedByte = 0;
	this.receivedCount = 0;
	this.sentByte = 0;
	this.sentCount = 0;

	this.timeout = options.timeout || 5000;

	var self = this;

	self.socket.on(EasySocket.EVENT.REQUEST, self.onRequest.bind(self));
	self.socket.on(EasySocket.EVENT.CLOSE, self.onClose.bind(self));

};

ServerEnd.prototype.onClose = function() {
	var self = this;
	// set a timeout for real disconnect
	var timer = self.disconnectingTimer = setTimeout(function() {
		self.disconnect({positive : true});
	}, 5000);
};

// ServerEnd.prototype.onReconnect = function() {
// 	var self = this;
// 	console.log('reconnect ' + self.id);
// 	if (this.disconnectingTimer) {
// 		clearTimeout(this.disconnectingTimer);
// 		delete this.disconnectingTimer;
// 	}
// };

ServerEnd.prototype.disconnect = function(options) {
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
	self.app.serverManager.drop(self);
	self.app.emit('server_disconnect', self);
};

ServerEnd.prototype.onSend = function (sessions, router, data, callback) {
	var self = this;
	if (!_.isArray(sessions)) return;
	this.app.sessionManager.send(sessions, router, data, callback);
};

ServerEnd.prototype.onRequest = function(router, data, callback) {
	var self = this;

	if (router == 'command') {
		self.onCommand(data.command, data.params, callback);
	} else if (router == 'message') {
		self.onMessage(data.session, data.router, data.data, callback);
	} else if (router == 'send') {
		self.onSend(data.sessions, data.router, data.data, callback);
	} else {
		console.log("router " + router + " is not recognized.");
	}
};

ServerEnd.prototype.onMessage = function(session, router, data, callback) {
	var self = this;
	session.connector = self;
	self.app.emit('message.' + router, session, data, callback);
};

ServerEnd.prototype.onCommand = function(command, params, callback) {
	var self = this;
	if (typeof callback !== 'function') callback = function() {};
	self.app.emit('command.' + command, self, params, callback);
	self.app.emit('command.' + self.type + '::' + command, self, params, callback);
};

ServerEnd.prototype.send = function(sessions, router, data, callback) {
	//this.socket.emit('send', sessions, router, data, callback);
	this.socket.sendRequest('send', {
		sessions	: sessions,
		router		: router,
		data		: data,
	}, callback);
};

ServerEnd.prototype.command = function(command, params, callback) {
	//this.socket.emit('command', command, params, callback);
	this.socket.sendRequest('command', {
		command		: command,
		params		: params,
	}, callback);
};

ServerEnd.prototype.sendMessage = function(session, router, data, callback) {
	var self = this;
	//self.socket.emit('message', { _id : session._id }, router, data, callback);
	this.socket.sendRequest('message', {
		_id 		: session_id,
		router		: router,
		data		: data,
	}, callback);
};

ServerEnd.prototype.display = function() {
	var self = this;
	return {
		id : self.id,
		type : self.type,
		app : self.app.id,
		remoteAddr : self.remoteAddr,
		receivedByte : self.receivedByte,
		receivedCount : self.receivedCount,
		sentByte : self.sentByte,
		sentCount : self.sentCount,
	};
};
