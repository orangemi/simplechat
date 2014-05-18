var log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	$("<div>").html(date + ' ' + msg).prependTo($("body"));
	console.log(date + ' ' + msg);
};

// var host = 'localhost';
// var port = 8001;
//var host = '172.16.32.30';
//var port = 8001;
var host = 'localhost';
var port = 8001;

log('connecting...');
var socket = io.connect('ws://' + host + ':' + port, {'reconnect' : false});

socket.on('connect', function() {
	log('connected');
	socket.on('message', function (router, params, callback) {
		log('router: ' + router);
		log('params: ' + params);
	});

	socket.emit('message', 'chat.login', {nick: 'mwj'}, function (code) {
		log(code);
	});
});

$("#btn_test").click(function() {
	var message = $("#text_test").val();
	socket.emit('message','chat.chat', {message : message});
});