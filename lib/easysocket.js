var net = require('net');
var util = require('util');
var events = require('events');

var PACKAGE_TYPE_RESERVED = 0;
var PACKAGE_TYPE_HEART = 1;
var PACKAGE_TYPE_HEART_ACK = 2;
var PACKAGE_TYPE_TEXT = 10;
var PACKAGE_TYPE_BINARY = 11;

var PARSER_EOK = 0; //完成一个数据包解析
var PARSER_EAGAIN = 1; //数据未达到长度要求，过一段时间重试
var PARSER_ETYPE = 3; //未识别的包类型
var PARSER_EJSON = 5;

var PAKCAGE_HEADER_SIZE = 2;//预留(8bit,必须全为0)+类型(8bit,大于1)
var PAKCAGE_HEADER_HEART_SIZE = PAKCAGE_HEADER_SIZE + 4;
var PAKCAGE_HEADER_HEART_ACK_SIZE = PAKCAGE_HEADER_SIZE + 4;
var PACKAGE_HEADER_TEXT_SIZE = PAKCAGE_HEADER_SIZE + 4;

var EasySocketParser = function() {
	this.all_buff_size = 0;
	this.offset = 0;
	this.buffs = [];
};

util.inherits(EasySocketParser, events.EventEmitter);

EasySocketParser.prototype.have = function(package_size) {
	if (package_size > 0 && this.all_buff_size >= package_size) {
		return true;
	}
	return false;
};

EasySocketParser.prototype._read = function(package_size, shrink) {
	if(this.have(package_size)) {
		var all_buff_size = this.all_buff_size;

		var buffs = this.buffs;
		var buff_index = 0;
		var buff_offset = this.offset;
		var data = new Buffer(package_size);
		var size_left = package_size;
		while (size_left > 0) {
			var buff_left = buffs[buff_index].length - buff_offset;
			var can_copy_size = size_left < buff_left ? size_left : buff_left;
			buffs[buff_index].copy(data, (package_size - size_left), buff_offset, buff_offset + can_copy_size);
			size_left -= can_copy_size;
			buff_offset += can_copy_size;
			if (buff_offset >= buffs[buff_index].length-1) {
				buff_offset = 0;
				buff_index++;
			}
		}
		if (shrink) {
			this.offset = buff_offset;
			this.buffs.splice(0, buff_index);
			this.all_buff_size -= (package_size); 
		}
		return data;
	}
	return null;
};

EasySocketParser.prototype.skip = function(package_size) {
	if(this.have(package_size)) {
		var all_buff_size = this.all_buff_size;

		var buffs = this.buffs;
		var buff_index = 0;
		var buff_offset = this.offset;
		var size_left = package_size;
		while (size_left > 0) {
			var buff_left = buffs[buff_index].length - buff_offset;
			var can_copy_size = size_left <buff_left ? size_left : buff_left;
			size_left -= can_copy_size;
			buff_offset += can_copy_size;
			if (buff_offset >= buffs[buff_index].length - 1) {
				buff_offset = 0;
				buff_index++;
			}
		}
		
		this.offset = buff_offset;
		this.buffs.splice(0, buff_index);
		this.all_buff_size -= (package_size); 

		return true;
	}
	return false;
};

EasySocketParser.prototype.read = function(package_size) {
	return this._read(package_size, true);
};

EasySocketParser.prototype.peek = function(package_size) {
	return this._read(package_size, false);
};

EasySocketParser.prototype.feed = function(data) {
	this.all_buff_size += data.length;
	this.buffs.push(data);

	var ecode = null;
	while (PARSER_EOK == (ecode = this.__parse())) { }
console.log(this.buffs);
	if (ecode != PARSER_EOK && ecode != PARSER_EAGAIN) {
		console.log('Package Error Code:',ecode);
		this.emit('error', ecode);
	}
};

EasySocketParser.prototype.__parse = function() {
	var h1 = this.peek(PAKCAGE_HEADER_SIZE);
	if (!h1) return PARSER_EAGAIN;

	var version = h1.readUInt8(0);
	var package_type = h1.readUInt8(1);

	if (package_type == 0) {
		//0为保留字不允许
		return PARSER_ETYPE;
	}

	return this.__parseOnePackage(package_type);
};

EasySocketParser.prototype.__parseOnePackage = function(type) {
	if (type == PACKAGE_TYPE_RESERVED) {
		return PARSER_ETYPE;
	} else if (type == PACKAGE_TYPE_HEART) {
		//心跳请求,包长为0
		if (!this.have(PAKCAGE_HEADER_HEART_SIZE)) return PARSER_EAGAIN;

		var header = this.read(PAKCAGE_HEADER_HEART_SIZE);
		var sequence = header.readInt32BE(PAKCAGE_HEADER_SIZE + 0);
		this.emit('heart-request', sequence);
		return PARSER_EOK;
	} else if (type == PACKAGE_TYPE_HEART_ACK) {
		//心跳回复
		if (!this.have(PAKCAGE_HEADER_HEART_ACK_SIZE)) return PARSER_EAGAIN;
		var header = this.read(PAKCAGE_HEADER_HEART_ACK_SIZE);
		var sequence = header.readInt32BE(PAKCAGE_HEADER_SIZE + 0);
		this.emit('heart-response', sequence);
		return PARSER_EOK;
	} else if (type == PACKAGE_TYPE_TEXT) {
		//JSON数据包
		if (!this.have(PACKAGE_HEADER_TEXT_SIZE)) return PARSER_EAGAIN;

		var header = this.peek(PACKAGE_HEADER_TEXT_SIZE);
		var length = header.readUInt32BE(PAKCAGE_HEADER_SIZE + 0);

		if (!this.have(PACKAGE_HEADER_TEXT_SIZE + length)) return PARSER_EAGAIN;
		
		this.skip(PACKAGE_HEADER_TEXT_SIZE);
		
		var data = this.read(length);
		var text = data.toString();
//		console.log("message", text)
		this.emit('text', text);
		return PARSER_EOK;
	}

	return PARSER_ETYPE;
};

//////////////////////////////////////////////////////////////////

var EasyConnection = function(socket, options) {
	options = options || {};

	var self = this;
	this.socket = socket;
	this.heartTime = 5;
	this.heartTimeout = 5;
	this.requestTimeout = 5;
	this.heartResponsed = false;
	this.HEADER_SIZE = 4;
	//this.offset = 0;
	this.open = true;
	this.heartId = 0;
	this.heartResponsed = false;

	this.requests = {};

	var parser = this.parser = new EasySocketParser();	

	socket.on('error', self.onError.bind(self));
	socket.on('close', self.onClose.bind(self));
	socket.on('data', parser.feed.bind(parser));

	parser.on('error', self.onParseError.bind(self));
	parser.on('text', self.onText.bind(self));
	parser.on('heart-response', self.onHeartBeatResponse.bind(self));
	parser.on('heart-request', self.writeHeatAck.bind(self));

	if (!options.isClient) this.beginHeartBeat();
};

util.inherits(EasyConnection, events.EventEmitter);

EasyConnection.prototype.onError = function(error) {
	var self = this;
	self.destroy();
	self.emit("error", error);
};

EasyConnection.prototype.onClose = function () {
	var self = this;
	self.destroy();
	self.emit("close");
	self.emit("disconnect");
};

EasyConnection.prototype.onParseError = function(code) {
	console.log('parser-error', code);
};

EasyConnection.prototype.onText = function(text) {
	var self = this;
	//self.emit('message', text);
	self.onMessage(text);
};

EasyConnection.prototype.onHeartBeatResponse = function(id) {
	var self = this;
	if (id == self.heartId) {
		self.heartResponsed = true;
	}
};

EasyConnection.prototype.destroy = function() {
	var self = this;
	self.open = false;

	if (self.timer1) {
		clearTimeout(self.timer1);
		self.timer1 = null;
	}

	if (self.timer2) {
		clearTimeout(self.timer2);
		self.timer2 = null;
	}
};

EasyConnection.prototype.disconnect = function() {
	this.destroy();
	this.socket.end();
	this.emit('disconnect');
};

EasyConnection.prototype.beginHeartBeat = function() {
	var self = this;
	self.timer1 = setTimeout(self.sendHeartBeat.bind(self), self.heartTime * 1000);
};

EasyConnection.prototype.sendHeartBeat = function() {
	var self = this;
	self.timer1 = null;
	
	if (!self.open) {
		console.log("网络关闭，心跳不了");
		return;
	}

	self.heartResponsed = false;
	console.log("心跳检查");
	self.writeHeart();
	self.timer2 = setTimeout(self.heartBeatTimesUp.bind(self), self.heartTimeout * 1000)
};

EasyConnection.prototype.heartBeatTimesUp = function() {
	var self = this;
	self.timer2 = null;

	if (self.heartResponsed) {
		console.log("心跳检查通过, 准备下次的")
		if (self.open) self.beginHeartBeat();
	} else {
		console.log("自爆！")
		self.disconnect();
	}
};

EasyConnection.prototype.writeHeart = function() {
	var buf = new Buffer(PAKCAGE_HEADER_HEART_SIZE);
	buf.writeUInt8(0, 0);
	buf.writeUInt8(PACKAGE_TYPE_HEART, 1);
	buf.writeUInt32BE(++this.heartId, PAKCAGE_HEADER_SIZE+0);
	this.socket.write(buf);
};

EasyConnection.prototype.writeHeatAck = function(id) {
console.log('response for heartbeat');
	var buf = new Buffer(PAKCAGE_HEADER_HEART_ACK_SIZE);
	buf.writeUInt8(0, 0);
	buf.writeUInt8(PACKAGE_TYPE_HEART_ACK, 1);
	buf.writeUInt32BE(id, PAKCAGE_HEADER_SIZE+0);
	this.socket.write(buf);
};

EasyConnection.prototype.write = EasyConnection.prototype.send = function(message) {
	if (typeof message !== "string") {
		return false;
	}
	var data = new Buffer(message);
	var length = data.length;
	var buf = new Buffer(PACKAGE_HEADER_TEXT_SIZE + length);
	buf.writeUInt8(0, 0);
	buf.writeUInt8(PACKAGE_TYPE_TEXT, 1);
	buf.writeUInt32BE(length, PAKCAGE_HEADER_SIZE + 0);
	data.copy(buf, PACKAGE_HEADER_TEXT_SIZE);
	this.socket.write(buf);
};

EasyConnection.prototype.onMessage = function(data) {
	var self = this;
	var json = null;

	try {
		json = JSON.parse(data);
	} catch(e) {
		console.log('parse json error with data : ' + data);
		return;
	}

	if (json.method && json.id) {
		//request
		self.onRequest(json.id, json.method, json.params);
	} else if (json.method) {
		//notify
		self.onNotify(json.method, json.params);
	} else if (json.result && json.id) {
		//request ack
		var callback = self.requests[json.id];
		if (typeof callback != 'function') return;
		delete self.requests[json.id];
		callback(json.params);
	} else {
		//error
		console.log("message error format with : " + data);
	}
};

EasyConnection.prototype.onRequest = function(requestId, method, params) {
	var self = this;
	var callbacked = false;
	var callback = function(params) {
		if (callbacked) return;
		callbacked = true;
		params = params || null;
		var message = JSON.stringify({
			result : method,
			params : params,
			id 	   : requestId
		});
		self.send(message);
	};
	this.emit('request', method, params, callback);
	this.emit('request.' + method, params, callback);
};

EasyConnection.prototype.onNotify = function(method, params) {
	this.emit('notify', method, params);
	this.emit('notify.' + method, params);
};

EasyConnection.prototype.request = function(method, params, callback) {
	var self = this;
	callback = callback || function() {};
	var requestId = '_' + (self.request_id++);
	self.requests[requestId] = callback;
	setTimeout(function() {
		var callback = self.requests[requestId];
		if (typeof callback != 'function') return;
		delete self.requests[requestId];
		callback({ error:408, result:'request time out' });
	}, self.requestTimeout * 1000);
	var message = JSON.stringify({
		method : method,
		params : params,
		id     : requestId
	});
	self.send(message);
};

////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////

// var EasyJSONProtocol = function(conn){
//	 var self = this;
//	 this.conn = conn;
//	 this.request_id = 1;
//	 this.requests = {};
//	 this.conn.on("message", function(str){
//	 	console.log("asdfasfdsa",str);
//		 var json = null;
//		 try{
//			 json = JSON.parse(str);
//		 } catch(e) {
//			 console.log(e, e.stack);
//		 }
//		 if(json.method && json.id ) {
//			 //request
//			 var callbacked = false;
//			 self.onrequest(json.method, json.params, function(params) {
//			 	if(callbacked) return;
//			 	callbacked = true;
//			 	console.log("callback emit")
//				 params = params || null;
//				 self.conn.send(JSON.stringify({"result":json.method, "params":params, "id":json.id}));
//			 });
//		 } else if(json.method) {
//			 //notify
//			 self.onnotify(json.method, json.params);
//		 } else if(json.result && json.id) {
//			 //request ack
//			 if(self.requests[json.id]) {
//				 var fn = self.requests[json.id];
//				 delete self.requests[json.id];
//				 fn(json.params);
//			 }
//		 } else {
//			 //error
//			 console.log("message error format")
//		 }
//	 })
// };


// util.inherits(EasyJSONProtocol, events.EventEmitter);

// EasyJSONProtocol.prototype.onrequest = function(method, params, cb) {
// 	console.log("request",'request.'+method, params, cb);
// 	this.emit('request', method, params, cb);
//	 this.emit('request.'+method, params, cb);
// }

// EasyJSONProtocol.prototype.onnotify = function(method, params, cb) {
// 	this.emit('notify', method, params);
//	 this.emit('notify.'+method, params);
// }

// EasyJSONProtocol.prototype.request = function(fn, params, callback) {
//	 callback = callback || function(){};
//	 var next_id = "_"+(this.request_id++);
//	 this.requests[next_id] = callback;
//	 this.conn.write(JSON.stringify({"method":fn, "params":params, "id":next_id}));
// }

// EasyJSONProtocol.prototype.notify = function(fn, params) {
//	 this.conn.write(JSON.stringify({"method":fn, "params":params}));
// }

module.exports = {
	Connection: EasyConnection,
	Paser: EasySocketParser,
//	JSONProtocol: EasyJSONProtocol
};
