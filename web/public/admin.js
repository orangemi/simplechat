var log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	$("<div>").html(date + ' ' + msg).prependTo($("body"));
	console.log(date + ' ' + msg);
}

log('connecting...');
var socket = io.connect('ws://localhost:3333', {'reconnect' : false});

var timer;

socket.on('connect', function() {
	log('admin connected');
	//socket.emit('')
	console.log(socket);
	socket.emit('message', 'list', {}, function(code, list) {
		log(list);
		list.forEach(function(one) {
			console.log(one);
		});
	});

	// setInterval(function() {
	// 	socket.emit('message', 'ping', 'connector-1', function (code, ping) {
	// 		log('ping from connector-1 is ' + ping);
	// 	})
	// }, 1000);

});

