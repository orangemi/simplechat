var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

var ServerSession = module.exports = function(options) {
	this.init(options);
}

//inherits from EventEmitter;
_.extend(ServerSession.prototype, EventEmitter.prototype);

ServerSession.prototype.init = function(options) {
	options = options || {};
	this.id = options._id;
	this._id = options._id;
	console.log(options._id);
	this._cid = /::(\d+)$/.exec(options._id)[1];
	this.connector = options.connector;
};
