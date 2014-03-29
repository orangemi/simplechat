var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'connector-1'; // appId

var App = require('../lib/Application');
var app = new App({id : appId});

app.on('session_connect', function (session) {
	//TODO when a session is connected.

	//test code
	//notify the backend and add backend to ths session list
	var serverEnd = app.serverManager.get('spread-1');
	session.setBackEnd('spread', serverEnd);
	serverEnd.command('session_online', { _id : session._id });
});

app.on('session_disconnect', function (session) {
	var serverEnd = app.serverManager.get('spread-1');
	serverEnd.command('session_offline', { _id : session._id });
});

//TODO test api 
app.onMessage("ping", function (session, data, next) {
	console.log("ping from " + session.id);
	next(200);
});

app.start();
