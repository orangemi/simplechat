var net = require('net');
var io = require('socket.io');
var ioclient = require('socket.io-client');
var easysocket = require('../lib/easysocket');

var port = 8001;
var proxy_host = '172.16.32.30';
var proxy_port = 3001;
var clientSockets = io.listen(port);
console.log('start listen to : ' + port + ' ...');
clientSockets.on('connection', function (socket) {
	var proxyClient = net.connect({host:proxy_host, port:proxy_port}, function() {

		var easyClient = new easysocket.Connection(proxyClient, { isClient: true });
		socket.on('message', function (router, data, next) {
			easyClient.request(router, data, next);
//			console.log('request' , router, data, next);
		});
		socket.on('disconnect', function () {
			easyClient.disconnect();
		});

		easyClient.on('request', function(method, params, callback) {
			socket.emit('message', method, params, callback);
		});
		easyClient.on('notify', function(method, params, callback) {
			callback = callback || function() {};
			socket.emit('message', method, params, callback);
		});
		easyClient.on('disconnect', function() {
			socket.disconnect();
		});

	});
});
