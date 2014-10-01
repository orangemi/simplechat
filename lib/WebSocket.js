var ws = require('ws');

var WebSocket = module.exports = function (options) {
	//this._ws = new ws.WebSocket();
};

WebSocket.prototype.connect = function(host, port) {

};

WebSocket.prototype.end = function() {

};

WebSocket.createServer = function(callback) {
	var result = {};
	result.listen = function(port) {
		var server = new ws.Server({port : port});
		server.on('connection', function(socket) {
console.log('some connected...');
			socket.write = function(buffer) {
				socket.send(Uint8Array(buffer), {binary: true, mask: false});
			};
			socket.end = function() {
				return socket.close();
			};

			socket.on('message', function(data, flags) {
console.log('some received...', data);
				socket.emit('data', data);
			});

			socket.on('close', function() {
console.log('some closed');
			});
			
			return callback(socket);
		});
	}
	return result;
};
