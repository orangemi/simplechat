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
	this.sessions = [];

	this.clientId = 0;
};

SessionManager.prototype.create = function(socket) {
	var self = this;

	var clientId = self.clientId++;
	var session = new ClientSession({
		id : clientId,
		app : self.app,
		_cid : clientId,
		socket : socket
	});

	this.sessions.push(session);
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

	this.sessions.push(session);
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

	if (self.app.isConnector()) {
		sessions.forEach(function (session) {
			if (self.get(session._id)) {
				self.get(session._id).send(router, data, callback);
			} else {
				//TODO not in this connector or disconnected.
			}
		});
	} else {
		var connectorId 
		var connectors = {};
		sessions.forEach(function(session) {
			key = session instanceof Session ? session._id : session;
			var realSession = self.get(key);
			if (realSession) {
				connectorId = realSession.connector.id;
				connectors[connectorId] = connectors[connectorId] || [];
				connectors[connectorId].push({_id : realSession._id});
			}
		});

		for (connectorId in connectors) {
			var connector = self.app.serverManager.get(connectorId);
			connector.send(connectors[connectorId], router, data, callback);
			//connector.socket.emit('send', sessions, router, data, callback);
		}
		//if (!connector) throw('no such a connector');
	}
};

SessionManager.prototype.drop = function(sessions) {
	if (_.isArray(sessions)) sessions = [sessions];
	this.sessions = _.difference(this.sessions, sessions);
};

SessionManager.prototype.filter = function(func) {
	return this.sessions.filter(func);
};
SessionManager.prototype.get = function(_id) {
	return this.filter(function (sessions) {
		return sessions._id == _id;
	}).pop();
};


SessionManager.prototype.childrenDisplay = function() {
	var self = this;
	var result = [];
	self.sessions.forEach(function (session) {
		result.push(session.display());
	});
	return result;
};
