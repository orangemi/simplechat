JSON.minify = JSON.minify || require('node-json-minify');

var fs = require('fs');
var net = require('net');
var io = require('socket.io');
var easysocket = require('./easysocket');
var ioclient = require('socket.io-client');
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;

var ServerEnd = require('./ServerEnd');
var SessionManager = require('./SessionManager');
var ServerManager = require('./ServerManager');
var Cache = require('./Cache');
var Log = require('./Log');

var Application = module.exports = function (options) {
	this.init(options);
};

_.extend(Application.prototype, EventEmitter.prototype);

Application.prototype.loadConfig = function(id) {
	var i, configs, config;

	configs = this.loadConfigFile('servers.json');

	for (i in configs) {
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
	var configs;

	configs = self.cache.load('configfile', file);
	if (configs && !options.force) {
		return configs;
	}

	try {
		configs = JSON.parse(JSON.minify(fs.readFileSync(this.dir + '/configs/' + file).toString()));
	} catch (e) {
		console.log(e);
		throw('servers config error');
	}

	self.cache.save('configfile', file, configs);

	return configs;
};

Application.prototype.loadMasterConfig = function(options) {
	options = options || {};
	var config = this.loadConfigFile('master.json', options);
	return config;
};

Application.prototype.init = function(options) {
	options = options || {};
	var self = this;
	this.pid = process.pid;
	this.dir = options.dir || __dirname;
	this.cache = new Cache();
	this.logger = new Log();

	if (!options.id) throw('can not start a server without its id.');

	this.id = options.id;
	if (options.id == 'master') {
		this.type = 'master';
		this.config = this.loadMasterConfig();
	} else {
		this.serverConfig = this.loadConfig(options.id);
		this.type = this.serverConfig.type;
	}

	this.sessionManager = new SessionManager({app : this});
	this.serverManager = new ServerManager({app : this});
};

Application.prototype.start = function(options) {
	options = options || {};
	var self = this;

	this.logger.log(self.id + ' start...');

	// TODO TEST
	// handle all exception here.
	process.on('uncaughtException', function(err) {
		console.error('Caught exception: ' + err);
		self.logger.log(err.stack);
	});

	if (this.isMaster()) {
		this.startMaster();
	} else if (this.isConnector()) {
		this.startConnector();
	} else {
		this.startBackEndServer();
	}

	this.onStart();
	this.emit('start');
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

	self.onCommand('master::status', function (server, params, next) {
		//TODO return server status
		next(200, {
			id : self.id,
			type : self.type,
			servers : self.serverManager.childrenDisplay(),
			sessions : self.sessionManager.childrenDisplay(),
			//qps : self.qps
			//qpsTimestamp : self.qpsTimestamp
		});
	});

	self.onCommand('master::quit', function (server, params, next) {
		self.logger.log('quiting...');
		process.exit();
	});

	self.onCommand('master::reload_config', function (server, params, next) {
		this.loadConfigFile('servers.json', {force: true});
		next(200);
	});

	self.on('server_connect', function (server) {
		self.logger.log('connected ' + server.id);
	});

	self.on('server_disconnect', function (server) {
		self.logger.log('disconnected ' + server.id);
	});

};

Application.prototype.isConnector = function() {
	return this.serverConfig.public;
};

Application.prototype.isMaster = function() {
	return this.id == 'master';
};

Application.prototype.startConnector = function() {
	//TODO check host
	var self = this;
	var config = this.serverConfig;
	//var clientSockets = io.listen(config.clientPort, {'log level' : 3});
	//clientSockets.on('connection', self.sessionManager.onConnect.bind(self.sessionManager));
	var clientSockets = net.createServer(function (c) {
		var socket = new easysocket.Connection(c);
		self.sessionManager.onConnect(socket);
	});

	this.logger.log('listen to client: ' + config.clientPort + ' ...');
	clientSockets.listen(config.clientPort);

	this.startBackEndServer(config);
};

Application.prototype.startBackEndServer = function() {
	var self = this;
	var config = this.serverConfig;
	var sockets = io.listen(config.port, {'log level' : 3});
	this.logger.log('listen to server: ' + config.port + ' ...');
	sockets.on('connection', self.serverManager.onConnect.bind(self.serverManager));
};

Application.prototype.startMaster = function() {
	var self = this;
	var sockets = io.listen(this.config.port);
	this.logger.log('listen to admin: ' + this.config.port + ' ...');
	sockets.on('connection', function (socket) {
		this.logger.log('admin is connected.');
		//TODO verify admin here...
		//TODO get admin command here...
		socket.on('message', function (command, params, callback) {
			if (typeof callback != 'function') callback = function() {};
			params = params || {};
			self.emit('message.' + command, params, callback);
		});
	});
};

Application.prototype.onMessage = function(router, func) {
	this.on('message.' + router, func);
};

Application.prototype.onCommand = function(command, func) {
	this.on('command.' + command, func);
};

Application.prototype.connectBackEnd = function(id) {
	var self = this;

	var config = this.loadConfig(id);
	var oldserver = self.serverManager.get(id);
	if (oldserver) {
		this.logger.log('it is already connected to ' + id);
		return;	
	}

	this.logger.log('connecting ' + id + '(' + config.host + ':' + config.port + ')' + ' ...');
	var socket = ioclient.connect('ws://' + config.host + ':' + config.port, {'reconnection' : false, 'force new connection' : true});
	socket.on('connect', function() {
		//this.logger.log('connected to ' + config.host + ':' + config.port + '.');
		self.serverManager.login(config, socket);
	});

	socket.on('disconnect', function() {
		//this.logger.log('disconnect on ' + config.host + ':' + config.port + ' ');
	});

	socket.on('error', function(err) {
		self.logger.log('error on ' + config.host + ':' + config.port + ' ' + err);
	});
};
