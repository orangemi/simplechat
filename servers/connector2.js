var argvs = process.argv.slice(2);
var appId = argvs.shift() || 'connector-2'; // appId

var App = require('../lib/Application2');
var app = new App({ id : appId, dir : __dirname });

var users = {};

app.on('session_connect', function (session) {
	//TODO when a session is connected.
	//wait user login
	//serverEnd.command('session_online', { _id : session._id });
	console.log('session connected wait login...');

	session.loginTimer = setTimeout(function() {
		session.disconnect({positive : true});
	}, 5000);
});

app.onMessage('login', function (session, data, next) {
	console.log('session_logined');
	data = data || {};
	var userId = data.u_id || data.uid || data.id;
	if (!userId) {
		next(400, 'no username');
		return;
	}

	if (session.user) {
		next(400, 'you have already logined');
		return;
	}

	//TODO verify userid or username or password or sessionkey or sth.

	//TODO 重复登录检查可以由chat-1发起，chat-1发现有重复登录，将旧的用户Session踢出。
	//TODO 重复登录检查可以依赖于中间存储层(memcache / redis)
	//TODO 重复登录检查也可以由gate-1发起，gate-1生成唯一密钥发给connector和客户端，客户端login到connector时携带密钥，connector检查后删除密钥，好像无法消除重复登录。
	//TODO 重复登录检查需要检查所有connector？re:容易并发登录
	//TODO 重复登录检查需要 通知chat-1，chat-1需要检查session和uid关联，并替换user的session；如果用户真实下线，也需要同时检查session和user的关联，此方案并没有踢走原用户，只是不能让客户端收到相同user_id的消息
	//TODO 由chat-1的处理也可以化为login-1统一来处理。

	var oldUser = users[userId];
	if (oldUser) {
		oldUser.session.disconnect({positive : true});
	}
	
	var user = users[userId] = { id : userId, session : session };
	session.user = user;

	var serverEnd;
	serverEnd = app.serverManager.get('chat-1');
	if (serverEnd) serverEnd.command('user_online', { userId : userId, _id : session._id });
	else console.log('chat-1 is not ready');

	serverEnd = app.serverManager.get('pusher-1');
	if (serverEnd) serverEnd.command('user_online', { userId : userId, _id : session._id });
	else console.log('pusher-1 is not ready');
	
	next(200);
	if (session.loginTimer) clearTimeout(session.loginTimer);
});

app.on('session_disconnect', function (session) {
	if (session.user) console.log('user logout ' + session.user.id);

	var serverEnd;
	serverEnd = app.serverManager.get('chat-1');
	if (serverEnd) serverEnd.command('session_offline', { _id : session._id });
	serverEnd = app.serverManager.get('pusher-1');
	if (serverEnd) serverEnd.command('session_offline', { _id : session._id });
});

//TODO test api
app.onMessage('ping', function (session, data, next) {
	console.log('ping from ' + session.id);
	next(200);
});

app.onCommand('list_users', function (server, params, next) {
	var result = [];
	for (var id in users) {
		var user = users[id];
		result.push({ id : user.id, sessionId : user.session._id });
	}
	next(200, result);
});

app.start();
