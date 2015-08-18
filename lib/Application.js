/*
Application.js

所有服务进程包含 "Connector服务", "Master/Backend互联" Bootstrap和Context 
启动根据配置启动Master行为或者Slave行为。
根据配置监听端口启动监听server socket
Accept联入的 client socket, 并将其加入对应的SessionManager。

注意:
	作为Context，SessionManager或者ServerManager会通过它emit事件出来，会emit的事件参照各个Manager

启动：
	var App = require('../lib/Application');
	var app = new App({ id : appId, dir : __dirname });
	app.start()

*/

JSON.minify = JSON.minify || require('node-json-minify');

var fs = require('fs');
var net = require('net');
var EasySocket = require('./EasySocket');
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;

var ServerEnd = require('./ServerEnd');
var SessionManager = require('./SessionManager');
var ServerManager = require('./ServerManager');
var Cache = require('./Cache');
var Log = require('./Log');

var md5 = function(string, encoding) {
	encoding = encoding || 'hex';
	// var crypto = require('crypto');
	// var md5 = crypto.createHash('md5');
	return require('crypto').createHash('md5').update(string).digest(encoding);
};

var Application = module.exports = function (options) {
	this.init(options);
};

_.extend(Application.prototype, EventEmitter.prototype);

Application.prototype.loadServerConfig = function(id) {
	var configs, config;

	try {
		configs = JSON.parse(JSON.minify(this.loadConfigFile('servers.json')));
	} catch (e) {
		console.log(e);
		throw('servers config error');
	}

	if (!id) return configs;

	for (var i in configs) {
		config = configs[i];
		if (config && config.id == id) {
			return _.extend({}, config);
		}
	}

	throw('no config readed');
};

Application.prototype.loadConfigFile = function(file, options) {
	options = options || {};
	var self = this;
	var configStr;

	configStr = self.cache.load('configfile', file);
	if (configStr && !options.force) {
		return configStr;
	}

	try {
		configStr = fs.readFileSync(this.dir + '/configs/' + file).toString();
	} catch (e) {
		console.log(e);
		throw('servers config error');
	}

	self.cache.save('configfile', file, configStr);

	return configStr;
};

Application.prototype.loadMasterConfig = function(options) {
	options = options || {};
	var configs = JSON.parse(JSON.minify(this.loadConfigFile('master.json')));
	return configs;
};

Application.prototype.init = function(options) {
	options = options || {};
	var self = this;
	this.pid = process.pid;
	this.dir = options.dir || __dirname;
	this.cache = new Cache();

	if (!options.id) throw('can not start a server without its id.');

	this.id = options.id;
	this.uniqueId = md5('app.' + options.id + ':' + Math.floor(Math.random() * 10000) + ':' + new Date().getTime()).substring(0, 16);
	if (options.id == 'master') {
		this.type = 'master';
		this.config = this.loadMasterConfig();
	} else {
		this.config = this.loadServerConfig(options.id);
		this.type = this.config.type;
	}

	this.authkey = this.loadConfigFile("auth.key");

	this.logger = new Log({ file : this.config.logfile });
	this.sessionManager = new SessionManager({app : this});
	this.serverManager = new ServerManager({app : this});
};

Application.prototype.start = function(options) {
	options = options || {};
	var self = this;

	this.logger.log(self.id + ' start...');

	// TODO TEST
	// handle all exception here.
	// process.on('uncaughtException', function(err) {
	// 	console.error('Caught exception: ' + err);
	// 	self.logger.log(err.stack);
	// });

	if (this.isMaster()) {
		//启动Master服务
		this.startMaster();

	} else {
		if (this.isConnector()) {
			//启动Connector服务
			this.startConnector();
		} else {
			//启动普通Backend服务
			this.startBackEndServer();
		}
	}

	this.onStart();
	this.emit('start');
};

///////////////////////////////////////////////////////
// Master Server
///////////////////////////////////////////////////////
Application.prototype.startMaster = function() {
	var self = this;
	var config = this.config;
	this.startBackEndServer();
//	var sockets = io.listen(this.config.port);
// 	var server = EasySocket.createServer({}, function (socket, info, next) {
// 		//self.serverManager.addConnection(socket);
// 		socket.on('request', function (command, params, callback) {
// //			self.emit('message.' + command, params, callback);
// 		});
// 	});

//	this.logger.log('listen to admin: ' + this.config.port + ' ...');
};

Application.prototype.isMaster = function() {
	return this.id == 'master';
};

///////////////////////////////////////////////////////
// Backend Server
///////////////////////////////////////////////////////
Application.prototype.startBackEndServer = function() {
	var self = this;
	var config = this.config;
	//var sockets = io.listen(config.port, {'log level' : 3});
	var server = EasySocket.createServer({}, function (socket, info, next) {
		self.serverManager.addConnection(socket, info, next);
	});

	this.logger.log('listen to server: ' + config.port + ' ...');
	server.listen(config.port);

	//	sockets.on('connection', self.serverManager.addConnection.bind(self.serverManager));
};

//连接到一个Backend服务
Application.prototype.connectBackEnd = function(id) {
	var self = this;

	var config;
	config = id == 'master' ? this.loadMasterConfig() : this.loadServerConfig(id);
	var oldserver = self.serverManager.get(id);
	if (oldserver) {
		this.logger.log('it is already connected to ' + id);
		return;	
	}

	var socket = new EasySocket();
	socket.on(EasySocket.EVENT.CONNECT, function() {
		self.logger.log('connected to ' + config.host + ':' + config.port + '.');
		self.serverManager.login(config, socket);
	});

	socket.on(EasySocket.EVENT.CLOSE, function() {
		self.logger.log('disconnect on ' + config.host + ':' + config.port + ' ');
	});

	socket.on(EasySocket.EVENT.ERROR, function (err) {
		self.logger.log('error on ' + config.host + ':' + config.port);
		self.logger.log(err);
	});

	this.logger.log('connecting ' + id + '(' + config.host + ':' + config.port + ')' + ' ...');
	socket.connect(config.host, config.port, {
		key		: self.authkey,
		id 		: self.id,
		type	: self.type,
	});
};

//一个Backend启动后，告知Master服务
Application.prototype.connectMaster = function() {
	return this.connectBackEnd('master');
};

///////////////////////////////////////////////////////
// Connector Server
///////////////////////////////////////////////////////
Application.prototype.startConnector = function() {
	//TODO check host
	var self = this;
	var config = this.config;
	
	var server = EasySocket.createServer({}, function (socket, info, next) {
		self.sessionManager.addConnection(socket, info, next);
	});

	this.logger.log('listen to client: ' + config.clientPort + ' ...');
	server.listen(config.clientPort);

	this.startBackEndServer(config);
};

Application.prototype.isConnector = function() {
	return this.config.public;
};


///////////////////////////////////////////////////////
// Master,Backend,Connector 公用
///////////////////////////////////////////////////////

// Master/Backend RPC, receive an message
Application.prototype.onMessage = function(router, func) {
	this.on('message.' + router, func);
};

// Master/Backend RPC, receive an command
Application.prototype.onCommand = function(command, func) {
	this.on('command.' + command, func);
};

Application.prototype.onStart = function() {
	var self = this;
	//@unstable
	//TODO app interval api
	self.onCommand('ping', function (server, params, next) {
		console.log('ping from ' + server.id);
		next(200);
	});

	self.onCommand('master::connect', function (server, params, next) {
		params.servers.forEach(function (serverId) {
			self.connectBackEnd(serverId);
		});
		next(200);
	});

	self.onCommand('master::status', function (sender, params, next) {
		//TODO return server status
		next(200, {
			id : self.id,
			type : self.type,
			servers : self.serverManager.display(params), //childrenDisplay(),
			sessions : self.sessionManager.display(params), //.childrenDisplay(),

//			hardware : 
			//qps : self.qps
			//qpsTimestamp : self.qpsTimestamp
		});
	});

	self.onCommand('master::quit', function (server, params, next) {
		self.logger.log('quiting...');
		process.exit();
	});

	self.onCommand('master::reload_config', function (server, params, next) {
		self.loadConfigFile('servers.json', { force: true });
		next(200);
	});

	self.onCommand('add_listener', function (server, params, next) {
		var name = params.name;
		var command = params.command;

		self.serverManager.addListener(name, function (params, callback) {
			server.command(command, params, callback);
		});

		// var events = self.serverManager.events[name] = self.serverManager.events[name] || {};
		// server.listens.pu
		// events.push({
		// 	server: server,
		// 	command: command,
		// });
	});

	self.on('server_connect', function (server) {
		self.logger.log('connected ' + server.id);
	});

	self.on('server_disconnect', function (server) {
		self.logger.log('disconnected ' + server.id);
	});
};