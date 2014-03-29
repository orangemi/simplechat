var Cache = require('../lib/Cache');

var c = new Cache();
c.save('1','abc',1);
console.log(c.data);
// var ioServer = require('socket.io');

// var server = new ioServer();

// server.listen(3001).on('connection', function(socket) {
// 	console.log('shakehand...');
// 	socket.emit('message', {data:1}, function(code) {
// 		console.log(code);
// 	});
// });

// console.log('listen 3001...');