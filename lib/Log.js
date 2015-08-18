var dateFormat = require('dateformatter');
var fs = require('fs');

var Logger = module.exports = function(options) {
	this.init(options);
};

Logger.prototype.init = function(options) {
	options = options || {};
	this.dir = options.dir || __dirname + '/../logs/';
	this.file = options.file || 'common.log';
};

Logger.prototype.write = function(message, file) {
	file = file || this.file;
	fs.appendFile(this.dir + file, message + "\n", null, this.onWrite.bind(this));
	//TODO debugger
	console.log(message);
};

Logger.prototype.log = function(message, file) {
	var now = new Date();
	this.write(now.format('[Y-m-d H:i:s] ') + message, file);
};

Logger.prototype.csv = function() {
	var now = new Date();
	var args = [ now.format('Y-m-d H:i:s') ];
	for (var k in arguments) {
		args.push(arguments[k]);
	}
	// var file = args.pop();
	this.write(args.join(','));


};

Logger.prototype.onWrite = function(error) {
	if (error) console.log(error);
};