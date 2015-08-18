var utils = require('util');
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var EasySocket = function() {
	this.init.apply(this, arguments);
};

module.exports = EasySocket;

EasySocket.VERSION = '1.0.0';
EasySocket.USERAGENT = 'nodejs';

EasySocket.ERROR = {};
EasySocket.ERROR.SUCCESS	 = 200;
EasySocket.ERROR.AGAIN		 = 300;
EasySocket.ERROR.CONNECTION	 = 400;
EasySocket.ERROR.NOT_WELCOME = 401;
EasySocket.ERROR.TIMEOUT	 = 408;
EasySocket.ERROR.HEARTBEAT	 = 409;
EasySocket.ERROR.DATA		 = 500;

EasySocket.EVENT = {};
EasySocket.EVENT.CONNECT	 = 'EASY_CONNECT';
EasySocket.EVENT.CONNECTION	 = 'EASY_CONNECTION';
EasySocket.EVENT.DATA		 = 'EASY_DATA';
EasySocket.EVENT.CLOSE		 = 'EASY_CLOSE';
EasySocket.EVENT.ERROR		 = 'EASY_ERROR';
EasySocket.EVENT.REQUEST	 = 'EASY_REQUEST';
EasySocket.EVENT.HEARTBEAT	 = 'EASY_HEARTBEAT';

EasySocket.TYPE = {};
EasySocket.TYPE.HELLO		 = 0x01;
EasySocket.TYPE.HELLOACK	 = 0x02;
EasySocket.TYPE.HEARTBEAT	 = 0x03;
EasySocket.TYPE.HEARTBEATACK = 0x04;
EasySocket.TYPE.TEXT		 = 0x05;
EasySocket.TYPE.GOODBYE		 = 0x06;

EasySocket.LENGTH_TYPE		 = 1;
EasySocket.LENGTH_DATASIZE	 = 3;

EasySocket.welcomeTimeout    = 5; //等待握手时间
EasySocket.heartbeatInterval = 60;
EasySocket.requestTimeout	 = 30;

utils.inherits(EasySocket, EventEmitter);

EasySocket.createServer = function(options, func) {
	options = options || {};
	if (typeof options == 'function') {
		func = options;
		options = {};
	}

	//TODO init something here...
	var createServer = options.createServer || net.createServer;
	return createServer(function(socket) {
		var clientOptions = {
			isServer : true, //什么意思？表示这是在服务器上运行，还是表示这个socket监听？
			socket : socket,
			welcomeTimeout : options.welcomeTimeout || EasySocket.welcomeTimeout
		};

		var client = new EasySocket(clientOptions);
		client.on(EasySocket.EVENT.CONNECTION, func);
	});
};

//EasySocket构造函数
EasySocket.prototype.init = function(options) {
	var self = this;
	options = options || {};

	self.socket = options.socket;
	self.socket = self.socket || new net.Socket();
	//self.userinfo = options.userinfo;
	self.welcomeTimeout = options.welcomeTimeout || EasySocket.welcomeTimeout;
	self.heartbeatInterval = options.heartbeatInterval || EasySocket.heartbeatInterval;
	self.requestTimeout = options.requestTimeout || EasySocket.requestTimeout;
	self.useragent = options.useragent || EasySocket.USERAGENT;

	self.socket.on('connect', self.onConnect.bind(self));
	self.socket.on('error', self.onError.bind(self));
	self.socket.on('close', self.onClose.bind(self));
	self.socket.on('data', self.onData.bind(self));

	self.receivedByte = 0;
	self.sentByte = 0;
	self.receivedCount = 0;
	self.sentCount = 0;
	
	self.isWelcomed = false;
	self.isConnected = !!options.socket;
	self.buffer = new Buffer(0);
	self.requests = {};
	self.currentRequestId = 1;

	if (self.isConnected) self.welcomeTimer = setTimeout(function() {
		self.disconnect();
	}, self.welcomeTimeout * 1000);
};

EasySocket.prototype.connect = function(host, port, user) {
	var self = this;
	if (this.isConnected) return false;

	this.userinfo = user || {};
	this.socket.connect(port, host);
	self.welcomeTimer = setTimeout(function() {
		self.emit(EasySocket.EVENT.ERROR, EasySocket.ERROR.TIMEOUT)
		self.disconnect();
	}, self.welcomeTimeout * 1000);
	return true;
};

EasySocket.prototype.onConnect = function() {
	if (this.isServer) return;
	this.sendHello();
};

EasySocket.prototype.onError = function(error) {
	this.emit(EasySocket.EVENT.ERROR, error);
	this.disconnect();
};

EasySocket.prototype.onClose = function() {
	if (this.isConnected) this.disconnect();
	this.emit(EasySocket.EVENT.CLOSE);
};

EasySocket.prototype.onData = function(buffer) {
	this.receivedByte += buffer.length;
	this.buffer = Buffer.concat([this.buffer, buffer]);
	while (true) {
		//TODO: using try catch will catch all the failure while parsing.
		// it's not the best way to catch error.
		// Think another method to fix.
		try {
			this.parseData();
		} catch (error) {
			if (error == EasySocket.ERROR.AGAIN) {
				return;
			} else if (error == EasySocket.ERROR.NOT_WELCOME) {
				this.emit(EasySocket.EVENT.ERROR, error);
				return;
			} else if (error == EasySocket.ERROR.DATA) {
				this.emit(EasySocket.EVENT.ERROR, error);
				//TODO: if error happened nothing can be done but disconnect.
				this.disconnect();
				return;
			} else {
				throw error;
			}
		}
	}
};

EasySocket.prototype.parseData = function() {
	var buffer = this.buffer;
	if (buffer.length < EasySocket.LENGTH_TYPE) throw EasySocket.ERROR.AGAIN;

	this.receivedCount++;
	var type = buffer.readUInt8(0);
	if (type == EasySocket.TYPE.HELLO) {
		this.onHello();
	} else if (type == EasySocket.TYPE.HELLOACK) {
		this.onHelloAck();
	} else if (type == EasySocket.TYPE.HEARTBEAT) {
		this.onHeartbeat();
	} else if (type == EasySocket.TYPE.HEARTBEATACK) {
		this.onHeartbeatAck();
	} else if (type == EasySocket.TYPE.TEXT) {
		this.onText();
	} else if (type == EasySocket.TYPE.GOODBYE) {
		this.onGoodbye();
	} else {
		throw EasySocket.ERROR.DATA;
	}
};

EasySocket.prototype.onText = function() {
	var body = this.readBody(EasySocket.LENGTH_DATASIZE);
	if (!this.isWelcomed) throw EasySocket.ERROR.NOT_WELCOME;

	//TODO whether body is a request callback
	if (this.onRequest(body)) return;
	if (this.onReply(body)) return;

	this.emit(EasySocket.EVENT.DATA, body);
};

EasySocket.prototype.onReply = function(body) {
	try { body = JSON.parse(body); } catch (e) { }
	if (!body) return;
	if (!body.reply) return;

	var request = this.requests[body.reply];
	if (!request) return;

	clearTimeout(request.timer);
	request.callback(body.code, body.params);
	delete this.requests[body.reply];

	return true;
};

EasySocket.prototype.onRequest = function(body) {

	try { body = JSON.parse(body); } catch (e) { }
	if (!body) return;
	if (!body.request) return;

	var self = this;
	var callback = function(code, params) {
		var requestAck = {
			reply : body.request,
			code : code,
			params : params,
		};

		var text = JSON.stringify(requestAck);
		self.sendText(text);
	};

	this.emit(EasySocket.EVENT.REQUEST, body.router, body.params, callback);
	return true;
};

EasySocket.prototype.onHello = function() {

	var self = this;
	var body = this.readBody(EasySocket.LENGTH_DATASIZE);
	try { body = JSON.parse(body); } catch (e) { }

	if (this.isWelcomed) return;
	if (!body) throw EasySocket.ERROR.DATA;
	if (!body.version || !body.client) throw EasySocket.ERROR.DATA;
	if (self.welcomeTimer) {
		clearTimeout(self.welcomeTimer);
		self.welcomeTimer = null;
	}

	this.isWelcomed = true;
	this.version = body.version;
	this.client = body.client;

	this.emit(EasySocket.EVENT.CONNECTION, this, body.user, function(code, user) {
		self.sendHelloAck(code, user);
	});
	//TODO send welcomeAck
	//send welcomeAck should be in the EVENT.CONNECTON
	//this.sendHelloAck();

};

EasySocket.prototype.onHelloAck = function() {
	var self = this;
	var body = self.readBody(EasySocket.LENGTH_DATASIZE);
	try { body = JSON.parse(body); } catch (e) { }

	if (self.isServer) return;
	if (!body) throw EasySocket.ERROR.DATA;
	if (!body.code || body.code != 200) throw EasySocket.ERROR.NOT_WELCOME;
	if (self.welcomeTimer) {
		clearTimeout(self.welcomeTimer);
		self.welcomeTimer = null;
	}

	self.isWelcomed = true;
	self.heartbeatInterval = body.heartbeat;
	self.zip = body.zip;

	self.emit(EasySocket.EVENT.CONNECT);
};

EasySocket.prototype.onHeartbeat = function() {
	this.readBody(0);
	if (!this.isWelcomed) throw EasySocket.ERROR.NOT_WELCOME;

	this.sendHeartbeatAck();
	this.emit(EasySocket.EVENT.HEARTBEAT);
};

EasySocket.prototype.onHeartbeatAck = function() {
	this.readBody(0);
	if (!this.isWelcomed) throw EasySocket.ERROR.NOT_WELCOME;

	if (!this.heartbeatTimer) return;
	//this.heartbeatTimer = null;
	this.heartbeatReceived = true;
	this.heartbeatLost = 0;
	this.heartbeatCount++;
	this.emit(EasySocket.EVENT.HEARTBEAT);
};

EasySocket.prototype.onGoodbye = function() {
	this.disconnect();
};


EasySocket.prototype.readBody = function(datasize) {
	var buffer = this.buffer;
	if (buffer.length < EasySocket.LENGTH_TYPE + datasize)
		throw EasySocket.ERROR.AGAIN;
	var lengthBuffer = new Buffer(4);
	lengthBuffer.fill(0);
	buffer.copy(lengthBuffer, EasySocket.LENGTH_TYPE, EasySocket.LENGTH_TYPE, EasySocket.LENGTH_TYPE + datasize);
	var length;
	try {
		length = lengthBuffer.readUInt32BE(0);
	} catch (e) {
		throw EasySocket.ERROR.DATA
	}

	var totalLength = EasySocket.LENGTH_TYPE + datasize + length;
	var body = buffer.toString('utf8', EasySocket.LENGTH_TYPE + datasize, totalLength);

	this.buffer = new Buffer(buffer.length - totalLength);
	if (buffer.length > totalLength) {
		buffer.copy(this.buffer, 0, totalLength);
	}
	return body;
};

EasySocket.prototype.disconnect = function() {
	if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
	if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
	this.socket.destroy();
	this.isConnected = false;
};

EasySocket.prototype.startHeartbeat = function() {
	var self = this;
	self.heartbeatReceived = false;
	var timeout = function() {
		//self.heartbeatTimer = null;
		if (!self.heartbeatReceived) {
			self.heartbeatLost++;
			self.emit(EasySocket.EVENT.ERROR, EasySocket.ERROR.HEARTBEAT, self.heartbeatLost);
		}
		self.startHeartbeat();
	};
	self.heartbeatTimer = setTimeout(timeout, self.heartbeatInterval * 1000);
	self._send(EasySocket.TYPE.HEARTBEAT);
};

EasySocket.prototype.sendHello = function() {
	var info = {
		version : EasySocket.VERSION,
		client : this.useragent,
		user : this.userinfo,
	};

	var data = JSON.stringify(info);
	var buffer = new Buffer(data);

	this._send(EasySocket.TYPE.HELLO, buffer);
};

EasySocket.prototype.sendHelloAck = function(code, info) {
	var self = this;
	var info = {
		code : code,
		heartbeat : this.heartbeatInterval,
		zip: "",
		user : info
	};

	var data = JSON.stringify(info);
	var buffer = new Buffer(data);

	this._send(EasySocket.TYPE.HELLOACK, buffer);

	//TODO start a heartbeat
	this.heartbeatTimer = setTimeout(function() {
		self.startHeartbeat();
	}, self.heartbeatInterval * 1000);
};

EasySocket.prototype.sendHeartbeatAck = function() {
	this._send(EasySocket.TYPE.HEARTBEATACK);
};

EasySocket.prototype.sendText = function(text) {
	var buffer = new Buffer(text);
	this._send(EasySocket.TYPE.TEXT, buffer);
};

EasySocket.prototype.sendRequest = function(router, params, callback) {
	var self = this;
	var requestId = this.currentRequestId++;
	var request = this.requests[requestId] = {
		router : router,
		params : params,
		request : requestId,
	};

	var text = JSON.stringify(request);

	callback = callback || function() {};
	request.callback = callback;
	request.timer = setTimeout(function() {
		delete self.requests[requestId];
		callback(EasySocket.ERROR.TIMEOUT);
	}, self.requestTimeout * 1000);

	this.sendText(text);
};

EasySocket.prototype._send = function(type, buffer) {
	var data, datasize;
	
	if (buffer) {
		datasize = buffer.length;
		data = new Buffer(EasySocket.LENGTH_TYPE + EasySocket.LENGTH_DATASIZE + datasize);
	} else {
		data = new Buffer(EasySocket.LENGTH_TYPE);
	}

	if (datasize) {
		data.writeUInt32BE(datasize, 0);
		buffer.copy(data, EasySocket.LENGTH_TYPE + EasySocket.LENGTH_DATASIZE);
	}
	data.writeUInt8(type, 0);
	this.socket.write(data);

	this.sentCount++;
	this.sentByte += data.length;
};

