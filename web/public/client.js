var log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	$("<div>").html(date + ' ' + msg).prependTo($("body"));
	console.log(date + ' ' + msg);
}

// var host = 'localhost';
// var port = 3002;
var host = '172.16.32.30';
var port = 8001;
log('connecting...');
var socket = io.connect('ws://' + host + ':' + port, {'reconnect' : false});

var timer;

socket.on('message', function (router, data, callback) {
	log(router + data.toString());
	//console.log(arguments);
	callback(200);
});

socket.on('connect', function() {
	log('connected');

	// socket.on('message', function (data, callback) {
	// 	console.log(data);
	// 	callback(200);
	// 	//log(data.toString());
	// 	//console.log(arguments);
	// 	//callback(200);
	// });

	setTimeout(function() {
		log('send spread.ping');
		socket.emit('message', 'spread.ping', {}, function(code) {
			log('response on spread.ping:' + code);
		})
		setTimeout(function() {
			log('send connector.ping');
			socket.emit('message', 'connector.ping', {}, function(code) {
				log('response on connector.ping:' + code);
			})
		}, 2000);
	}, 2000);

	// timer = setInterval(function() {
	// 	log('send connector.ping');
	// 	socket.emit('message', 'connector.ping', {}, function (code) {
	// 		log('response on ping:' + code);
	// 	});
	// }, 1000);

});

socket.on('disconnect', function() {
	// clearInterval(timer);
	log('disconnect');
	socket.disconnect();
});

