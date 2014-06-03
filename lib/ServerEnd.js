var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

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

	//TODO: login func
	process.nextTick(function() {
		self.onLogin();
	}, 10);
};

ServerEnd.prototype.onLogin = function(options) {
	var self = this;

	self.socket.on('message', self.onMessage.bind(self));
	self.socket.on('send', self.onSend.bind(self));
	self.socket.on('command', self.onCommand.bind(self));
	self.socket.on('disconnect', self.onDisconnecting.bind(self));
	self.socket.on('reconnect', self.onReconnect.bind(self));

	self.app.emit('server_connect', self);
};

ServerEnd.prototype.onDisconnecting = function() {
	var self = this;
	// set a timeout for real disconnect
	var timer = self.disconnectingTimer = setTimeout(function() {
		self.disconnect({positive : true});
	}, 5000);
};

ServerEnd.prototype.onReconnect = function() {
	var self = this;
	console.log('reconnect ' + self.id);
	if (this.disconnectingTimer) {
		clearTimeout(this.disconnectingTimer);
		delete this.disconnectingTimer;
	}
};

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

ServerEnd.prototype.onMessage = function(session, router, data, callback) {
	var self = this;
	session.connector = self;
	//var session = self.app.sessionManager.get(self.id + '::' + sender._cid);
	self.app.emit('message.' + router, session, data, callback);
	this.logFlow(JSON.stringify(router).length + JSON.stringify(data).length, false);
};

ServerEnd.prototype.onCommand = function(command, params, callback) {
	var self = this;
	if (typeof callback !== 'function') callback = function() {};
	self.app.emit('command.' + command, self, params, callback);
	self.app.emit('command.' + self.type + '::' + command, self, params, callback);
	this.logFlow(JSON.stringify(command).length + JSON.stringify(params).length, false);
};

ServerEnd.prototype.send = function(sessions, router, data, callback) {
	this.socket.emit('send', sessions, router, data, callback);
	this.logFlow(JSON.stringify(router).length + JSON.stringify(data).length, true);
};

ServerEnd.prototype.command = function(command, params, callback) {
	this.socket.emit('command', command, params, callback);
	this.logFlow(JSON.stringify(command).length + JSON.stringify(params).length, true);
};

ServerEnd.prototype.processMessage = function(session, router, data, callback) {
	var self = this;
	self.socket.emit('message', { _id : session._id }, router, data, callback);
	this.logFlow(JSON.stringify(router).length + JSON.stringify(data).length, true);
};

ServerEnd.prototype.logFlow = function(bytes, isSent) {
	if (isSent) {
		this.sentCount++;
		this.sentByte += bytes;
		this.app.serverManager.sentCount++;
		this.app.serverManager.sentByte += bytes;
	} else {
		this.receivedCount++;
		this.receivedByte += bytes;
		this.app.serverManager.receivedCount++;
		this.app.serverManager.receivedByte += bytes;		
	}
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
