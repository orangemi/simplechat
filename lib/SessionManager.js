var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;
var ClientSession = require('./ClientSession');
var Session = require('./Session');

var SessionManager = module.exports = function (options) {
	this.init(options);
};

_.extend(SessionManager.prototype, EventEmitter.prototype);

SessionManager.prototype.init = function(options) {
	options = options || {};
	this.app = options.app;
	this.sessions = {};
	this.clientId = 0;

	this.receivedByte = 0;
	this.receivedCount = 0;
	this.sentByte = 0;
	this.sentCount = 0;
};

SessionManager.prototype.create = function(socket) {
	var self = this;

	var clientId = self.clientId++;
	var session = new ClientSession({
//		id : clientId,
		app : self.app,
		_cid : clientId,
		socket : socket
	});

	this.sessions[session._id] = session;
	return session;

};

SessionManager.prototype.create2 = function(options) {
	options = options || {};

	if (!options.connector) throw('need a connector when create a remote session');
	var self = this;
	var session = new Session({
		id : options.id,
		app: self.app,
		_id : options._id,
		//id : options.connector.id + '::' + options._cid,
		//_cid : options._cid,
		connector : options.connector,
	});

	this.sessions[session._id] = session;
	return session;
};

SessionManager.prototype.onConnect = function(socket) {
	this.create(socket);	
};	

SessionManager.prototype.send = function(sessions, router, data, callback) {
	var self = this;
	var key;
	if (!_.isArray(sessions)) return;
	if (typeof callback !== 'function') callback = function() {};
	var emptyfunc = function() {};	

	if (self.app.isConnector()) {
		sessions.forEach(function (session) {
			if (self.get(session._id)) {
				self.get(session._id).send(router, data, callback);
				//TODO broadcast only callback once
				callback = emptyfunc;
			} else {
				//TODO not in this connector or disconnected.
			}
		});
	} else {
		//connectorId;
		var connectors = {};
		sessions.forEach(function(session) {
			key = session instanceof Session ? session._id : session;
			var realSession = self.get(key);
			if (realSession) {
				var connectorId = realSession.connector.id;
				connectors[connectorId] = connectors[connectorId] || [];
				connectors[connectorId].push({_id : realSession._id});
			}
		});

		for (var connectorId in connectors) {
			var connector = self.app.serverManager.get(connectorId);
			if (connector) connector.send(connectors[connectorId], router, data, callback);
		}
	}
};

SessionManager.prototype.add = function(server) {
	var self = this;
	if (!server.id) throw new Error('no id for object');
	self.sessions[server.id] = server;
};

SessionManager.prototype.drop = function(sessions) {
	var self = this;
	if (!_.isArray(sessions)) sessions = [sessions];
	var count = 0;
	sessions.forEach(function(session) {
		if (session == self.sessions[session.id]) {
			delete self.sessions[session.id];
			count++;
		}
	});
	return count;
};

SessionManager.prototype.filter = function(func) {
	var self = this;
	if (typeof func !== 'function') throw new Error('argument is not a function');
	var result = [];
	var server;
	for (var i in self.sessions) {
		server = self.sessions[i];
		if (func(server) === true) result.push(server);
	}
	return result;
};

SessionManager.prototype.get = function(id) {
	var self = this;
	if (!id) throw new Error('id should not empty');
	return self.sessions[id];
};

SessionManager.prototype.childrenDisplay = function() {
	var self = this;
	var result = [];
	self.filter(function (session) {
		result.push(session.display());
	});
	return result;
};

SessionManager.prototype.display = function() {
	return {
		sessions : this.childrenDisplay(),
		receivedByte : this.receivedByte,
		receivedCount : this.receivedCount,
		sentByte : this.sentByte,
		sentCount : this.sentCount,
	};
};