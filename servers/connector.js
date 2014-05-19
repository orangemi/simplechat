var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'connector-1'; // appId

var App = require('../lib/Application');
var app = new App({ id : appId, dir : __dirname });

app.on('session_connect', function (session) {
	//TODO when a session is connected.
	//wait user login
	console.log('session connected wait login...');

	session.setBackEnd('gate', app.serverManager.get('gate-1'));
	session.setBackEnd('chat', app.serverManager.get('chat-1'));
	session.setBackEnd('pusher', app.serverManager.get('pusher-1'));

	session.loginTimer = setTimeout(function() {
		console.log('log timeout');
		session.disconnect({positive : true});
	}, 5000);
});

app.onCommand('gate::user_login', function (server, params) {
	var session = app.sessionManager.get(params._id);
	if (!session) return;
	console.log('session_logined');
	console.log(params);
	clearTimeout(session.loginTimer);
	delete session.loginTimer;
	session.userId = params.userId;

	var serverEnd;
	serverEnd = app.serverManager.get('chat-1');
	if (serverEnd) serverEnd.command('user_online', { id : params.userId, _id : session._id });
	else console.log('chat-1 is not ready');

	serverEnd = app.serverManager.get('pusher-1');
	if (serverEnd) serverEnd.command('user_online', { id : params.userId, _id : session._id });
	else console.log('pusher-1 is not ready');

});

app.on('session_disconnect', function (session) {
	if (session.userId) console.log('user logout ' + session.userId);
	
	var serverEnd;
	serverEnd = app.serverManager.get('chat-1');
	if (serverEnd) serverEnd.command('user_offline', { _id : session._id });
	serverEnd = app.serverManager.get('pusher-1');
	if (serverEnd) serverEnd.command('user_offline', { _id : session._id });
});

//TODO test api
app.onMessage('ping', function (session, data, next) {
	console.log('ping from ' + session.id);
	next(200);
});

app.onCommand('list_users', function (server, params, next) {
	var result = [];
	app.sessionManager.filter(function (session) {
	 	result.push({ id : session.userId, _id : session._id });
	});
	next(200, result);
});

app.onCommand('kick_session', function (server, params, next) {
	params = params || {};
	var _id = params._id;
	if (!_id) return next(500);
	var session = app.sessionManager.get(_id);
	//console.log(app.sessionManager.sessions);
	console.log('kick_session3 : ' + _id);
	if (!session) return next(400);
	console.log('kick_session4 : ' + _id);
	session.disconnect({ positive: true });
});


app.start();
