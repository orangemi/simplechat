var Cache = module.exports = function(options) {
	this.init(options);
};

Cache.prototype.init = function (options) {
	this.data = {};
};

Cache.prototype.load = function() {
	var length = arguments.length;
	var key = '';

	for (var i = 0; i < length; i++) {
		key += arguments[i];
	}
	return this.data[key];
};

Cache.prototype.save = function() {
	var result = this.data;
	var length = arguments.length;
	var key = '';

	if (length < 2) throw('cache save should have 2 args least');

	for (var i = 0; i < length - 1; i++) {
		if (typeof arguments[i] != 'string' && typeof arguments[i] != 'number')
			console.log('WARN: cache path is not a string');
		key += arguments[i].toString();
		//result = this.data[key];
		//if (!result) result = this.data[key] = {};
	}
	this.data[key] = arguments[length - 1];
};

Cache.prototype.del = function() {
	var length = arguments.length;
	var key = '';

	for (var i = 0; i < length; i++) {
		key += arguments[i];
	}
	delete this.data[key];
};