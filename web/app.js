var Http = require('http');
require('./utils/date.js');

var log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	console.log(date + " " + msg);
};

var mimes = {
	html	: 'text/html',
	htm		: 'text/html',
	js		: 'application/javascript',
	json	: 'application/json',
	css		: 'text/css',
	png		: 'image/png',
	jpg		: 'image/jpeg',
	jpeg	: 'image/jpeg',
	gif		: 'image/gif',
	bmp		: 'image/bmp',
	''		: 'text/plain'
};

// -----------------------------------------------------------------
var root = "./public";
var logpath = "../logs";
var port = 8000;
// -----------------------------------------------------------------

var http = Http.createServer(function(req, res) {
	var path = require('url').parse(req.url).pathname;
	if (/\/$/.test(path)) path += 'index.html';

	//static
	var filename = root + path;
	var type = /\.(\w+)$/.test(filename) ? /\.(\w+)$/.exec(filename)[1] : '';
	var mimetype = mimes[type] ? mimes[type] : mimes[''];

	require('fs').readFile(filename, function(err, data) {
		if (err) {
			res.writeHead(404);
			res.end();
			log(' GET ' + req.url + ' 404');
			return;
		}
		res.writeHead(200, {'Content-Type' : mimetype});
		res.write(data);
		res.end();
		log('GET ' + req.url + ' 200');
	});
	//console.log(req);
	//console.log(res);
}).listen(port);



console.log('HTTP Server http://0.0.0.0:' + port + '/ start');