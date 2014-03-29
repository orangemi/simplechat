JSON.minify = JSON.minify || require('node-json-minify');

var fs = require('fs');

var argvs = process.argv.slice(2);
var moduleName = argvs.shift(); // server-id
//var actionName = argvs.shift(); // start stop reload

if (moduleName == 'master') {
	//TODO
} else {
	//TODO
}