var Application = require('../lib/Application');
var app = new Application({ id: 'connector-1', dir: __dirname });

app.on('session_connect', function(session) {
	console.log(session.socket.request.connection.remoteAddress);
	session.setBackEnd('chat', app.serverManager.get('chat-1'));
});

app.on('session_disconnect', function(session) {
	var server = app.serverManager.get('chat-1');
	if (server) server.command('session_disconnect', {_id : session._id});
});

app.start();