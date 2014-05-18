var Application = require('../lib/Application');
var app = new Application({ id: 'chat-1', dir: __dirname });

app.onMessage('login', function (session, params, next) {
	//console.log(session);
	if (app.sessionManager.get(session._id)) return next(302, 'you cannot relogin');
	session = app.sessionManager.create2(session);
	var user = { nick : params.nick };
	session.user = user;
	var sessions = app.sessionManager.filter(function() { return true; });
	app.sessionManager.send(sessions, 'system', user.nick + ' login');
	next(200);
});

app.onCommand('session_disconnect', function (server, params) {
	session = app.sessionManager.get(params._id);
	if (!session) return;
	app.sessionManager.drop(session);
	var sessions = app.sessionManager.filter(function() { return true; });
	app.sessionManager.send(sessions, 'system', session.user.nick + ' logout');
});

app.onMessage('chat', function (session, params, next) {
	session = app.sessionManager.get(session._id);
	console.log(session);
	if (!session) return;
	var message = params.message;
	var sessions = app.sessionManager.filter(function() { return true; });
	console.log(message);
	app.sessionManager.send(sessions, 'system', session.user.nick + ' say ' + message);
});

app.start();
