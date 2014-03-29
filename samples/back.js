var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'spread-1'; // appId

var App = require('../lib/Application');
var app = new App({id : 'spread-1'});

app.onCommand('session_online', function (server, params, callback) {
	var session = app.sessionManager.create2({ _id : params._id, connector : server });
	console.log('session_online ' + session.id);

	//test to send a message to client.
	app.sessionManager.send([session], 'hello', {});
});

app.onCommand('session_offline', function (server, params, next) {
	var session  = app.sessionManager.get(params._id);
	if (!session) return;
	console.log('session_online ' + session.id);
	app.sessionManager.drop(session);
	next(200);
});

//TODO test api 
app.onMessage('ping', function (session, params, next) {
	console.log("ping from " + session.id);
	next(200);
});

app.start();