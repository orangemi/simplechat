/*
* Connector 前端
* 客户端连接，并保持连接。
* 提供对Backend的服务，提供服务包括：查询在线、推送消息、上线、下线通知。
*/
var Http = require('http'),
	URL = require('url'),
	fs = require('fs'),
	io = require('socket.io');

var users = {};
var servers = [];

var userIndex = 1;

var User = function(socket) {
	this.socket = socket;
	this.timeout = 5000;
	this.timers = [];
	this.isLogined = false;

	this.u_id = 0;
	this._cid = userIndex++;

	this.init();
};

User.prototype.init = function() {
	var self = this;
	this.waitLogin(function() {
		self.onLogin.apply(self, arguments);
	});

	this.socket.on('disconnect', function() {
		self.disconnect();
	});
};

User.prototype.onLogin = function(params, next) {
	var self = this;

	//for compactive
	params.u_id = params.u_id || params.user_id;
	if (!params || !params.u_id) return next(null, 500);

	//TODO verify login session...
	self.u_id = params.u_id;

	//TODO :fire event to push the user in users
	if (users[params.u_id] && users[params.u_id] != this) return next(null, 500);
	users[params.u_id] = self;
	console.log('socket connected u_id=' + self.u_id);

	this.clearTimer();
	this.socket.removeAllListeners('login');
	next(null, 200);

	//TODO listen client Message
	//need to use event emittor
	//none

	//TODO call something else when client login
	//need to use event emittor
	servers.forEach(function (server) {
		//console.log(server);
		server.userOnline(self);
	});
};

User.prototype.waitLogin = function(next) {
	var self = this;
	var socket = this.socket;

	this.addTimer(setTimeout(function() {
		self.disconnect();
	}, this.timeout));

	socket.on('login', function(params, callback) {
		next(params, callback);
	});
};

User.prototype.disconnect = function(positive) {
	// TODO: fire disconnect to notify the system to remove user from users;
	//need to use event emittor
	var self = this;
	servers.forEach(function (server) {
		server.userOffline(self);
	});

	delete users[this.u_id];
	this.clearTimer();
	if (positive) this.socket.disconnect();
};

User.prototype.addTimer = function(timer) {
	this.timers.push(timer);
};

User.prototype.clearTimer = function(timer) {
	if (!timer) {
		this.timers.forEach(function(timer) {
			clearTimeout(timer);
		});
		this.timers = [];
		return;
	}

	var index = this.timers.indexOf(timer);
	if (index >= 0) {
		clearTimeout(timer);
		this.timers.splice(index, 1);
	}
};

User.prototype.getInfo = function() {
	return {
		_cid : this._cid,
		u_id : this.u_id,
		session : this.session
	};
};


// listen client port
function startClientServer(clientPort) {
	var mimes = {
		html	: 'text/html',
		htm		: 'text/html',
		js		: 'application/javascript',
		json	: 'application/json',
		css		: 'text/css',
		png		: 'image/png',
		jpg		: 'image/jpeg',
		jpeg	: 'image/jpeg',
		gif		: 'image/gif',
		bmp		: 'image/bmp',
		''		: 'text/plain'
	};

	var http = Http.createServer(function(req, res) {
		var path = URL.parse(req.url).pathname;
		if (path == '/') path = '/index.html';
		//static
		var filename = __dirname + '/public' + path;
		var type = /\.(\w+)$/.test(filename) ? /\.(\w+)$/.exec(filename)[1] : '';
		var mimetype = mimes[type] ? mimes[type] : mimes[''];
		//console.log(filename);
		fs.readFile(filename, function(err, data) {
			if (err) {
				res.writeHead(404);
				res.end();
				//log(' GET ' + req.url + ' 404');
				return;
			}
			res.writeHead(200, {'Content-Type' : mimetype});
			res.write(data);
			res.end();
			//log('GET ' + req.url + ' 200');
		});
	});


	http.listen(clientPort);
	var clientSockets = io.listen(http);
	clientSockets.on('connection', function(socket) {
		var user = new User(socket);
	});
}

/////////////////////////////////////////////////////////////////
// BackServer
/////////////////////////////////////////////////////////////////

var BackServer = function(socket) {
	this.socket = socket;
	this.init();
};

BackServer.prototype.init = function() {
	var self = this;
	// this.waitLogin(function() {
		self.onLogin.apply(self, arguments);
	// });
};

BackServer.prototype.userOnline = function(user) {
	var userInfo = user.getInfo();
	this.socket.emit('command', 'userOnline', userInfo, function (err, code, result) {
	});
};

BackServer.prototype.userOffline = function(user) {
	var userInfo = user.getInfo();
	this.socket.emit('command', 'userOffline', userInfo, function (err, code, result) {
	});
};

BackServer.prototype.onLogin = function(next) {
	var self = this;
	this.socket.on('message', function (receivers, router, params, callback) {
		self.onMessage(receivers, router, params, callback);
	});

	this.socket.on('command', function (command, params, callback) {
		self.onCommand(command, params, callback);
	});

	this.socket.on('disconnect', function() {
		//TODO remove server info.
	});
	//
	servers.push(this);

	if (next) next(null, 200);

};

BackServer.prototype.onMessage = function(receivers, router, params, next) {
	var realReceivers = [];

	var needDone = 0;
	var hasSuccess = 0;
	var hasFailed = 0;

	if (!receivers || !receivers.length) next(null, 500);
	//check receivers is in users list;
	receivers.forEach(function(receiver) {
		if (!users[receiver]) return;
		realReceivers.push(users[receiver]);
	});

	needDone = realReceivers.length;
	realReceivers.forEach(function(user) {
		//TODO, this could diff if client don't sue socket.io
		user.socket.emit('message', router, params, function(code) {
			if (code == 200) hasSuccess++; else hasFailed++;
			finish();
		});
	});

	var finish = function() {
		if (needDone == hasSuccess + hasFailed) {
			if (next) next(null, 200, {success : hasSuccess, failed : hasFailed});
		}
	};
};

BackServer.prototype.onCommand = function(action, params, next) {
	switch (action) {
		case 'users' : return this.onUserList(params, next);
		case 'bind' : return this.onBind(params, next);
		case 'unbind' : return this.onUnbind(params, next);
		default : return next('no such command', 500);
	}
};

// func : get user list
BackServer.prototype.onUserList = function(params, next) {
	var result = [];
	//users.forEach(function(user) {
	for (var id in users) {
		var user = users[id];
		result.push(user.getInfo());
	}
	//});

	next(null, 200, result);
};

function startBackendServer(port) {
	// listen back port
	var backSockets = io.listen(port);
	backSockets.on('connection', function(socket) {
		var server = new BackServer(socket);
	});
}


///////////////////////
// Bootstrap
//////////////////////
var clientPort = 8001;
var port = 8011;

startClientServer(clientPort);
startBackendServer(port);