var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'connector-2'; // appId

var App = require('../lib/Application2');
var app = new App({ id : appId, dir : __dirname });

app.on('session_connect', function (session, info, next) {
	//TODO when a session is connected.
	//wait user login
	app.logger.log('session connected wait login...');
	info = info || {};
	info._id = session._id;

	app.serverManager.get('gate-1').command('login', info, function (code, result) {
		if (code != 200) return next(code, result);

		session.setBackEnd('chat', app.serverManager.get('chat-1'));
		session.setBackEnd('pusher', app.serverManager.get('pusher-1'));
		session.userId = result.uid;

		var serverEnd;
		serverEnd = app.serverManager.get('chat-1');
		if (serverEnd) serverEnd.command('user_online', { id : result.uid, _id : session._id });
		else app.logger.log('chat-1 is not ready');

		serverEnd = app.serverManager.get('pusher-1');
		if (serverEnd) serverEnd.command('user_online', { id : result.uid, _id : session._id });
		else app.logger.log('pusher-1 is not ready');

		next(200);

	});
	

});

app.on('session_disconnect', function (session) {
	if (session.userId) app.logger.log('user logout ' + session.userId);
	
	var serverEnd;
	serverEnd = app.serverManager.get('chat-1');
	if (serverEnd) serverEnd.command('user_offline', { _id : session._id });
	serverEnd = app.serverManager.get('pusher-1');
	if (serverEnd) serverEnd.command('user_offline', { _id : session._id });
});

//TODO test api
app.onMessage('ping', function (session, data, next) {
	app.logger.log('ping from ' + session.id);
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
	app.logger.log('kick_session3 : ' + _id);
	if (!session) return next(400);
	app.logger.log('kick_session4 : ' + _id);
	session.disconnect({ positive: true });
});

app.start();
