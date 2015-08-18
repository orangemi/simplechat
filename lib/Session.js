var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

var ServerSession = module.exports = function(options) {
	this.init(options);
};

//inherits from EventEmitter;
_.extend(ServerSession.prototype, EventEmitter.prototype);

ServerSession.prototype.init = function(options) {
	options = options || {};
	this.id = options._id;
	this._id = options._id;
	// this._cid = /::(\d+)$/.exec(options._id)[1];
	this.app = options.app;
	this.connector = options.connector;
};

ServerSession.prototype.send = function(router, data, callback) {
	this.app.SessionManager.send([this], router, data, callback);
};

ServerSession.prototype.display = function() {
	return {
		id : this.id,
	};
};
