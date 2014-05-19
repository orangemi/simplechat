var log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	$("<div>").html(date + ' ' + msg).prependTo($("body"));
	console.log(date + ' ' + msg);
};

var username = 'mwj2';
var password = '1';

$.ajax({
	type : 'GET',
	url  : 'http://localhost/ourwar/server/game/auth/login',
	data : { username:username, password: password, action:'normal' },
	dataType: 'jsonp',
	jsonp: "jsoncallback",
	success : function(data) {
		next(data.result);
	}
});

next = function(res) {
	var host = res.socketHost;
	var port = res.socketPort;

	log('connecting...');
	var socket = io.connect('ws://' + host + ':' + port, {'reconnect' : false});
	socket.on('connect', function() {
		log('connected');
		socket.on('disconnect', function() {
			// clearInterval(timer);
			log('disconnect');
			socket.disconnect();
		});
		socket.on('message', function (router, data, callback) {
			log(router + ': ' + JSON.stringify(data));
			callback(200);
		});

		log('start login session: ' + res.key);
		socket.emit('message', 'gate.login', { key : res.key }, function(code) {
			log('login response: ' + code);
		});
	});
};
