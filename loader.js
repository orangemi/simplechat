JSON.minify = JSON.minify || require('node-json-minify');

var fs = require('fs');
var loadConfigFile = function(file, options) {
	options = options || {};
	var configs;

	try {
		configs = JSON.parse(JSON.minify(fs.readFileSync('./config/' + file).toString()));
	} catch (e) {
		console.log(e);
		throw('servers config error');
	}

	return configs;
};