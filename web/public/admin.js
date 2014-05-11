var Logger = function() {
	this.init();
};

Logger.prototype.init = function() {
	this.iscroll = new IScroll('.lines', {
		mousewheel : true
	});
};

Logger.prototype.log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	var $parent = $(".output>.lines>.scroller");
	var $dom = $("<div>").html(date + ' ' + msg).appendTo($parent);
	//if ($parent.children().length > 100) $parent.children().first().remove();
	this.iscroll.refresh();
	this.iscroll.scrollToElement($dom[0]);
	console.log(date + ' ' + msg);
};

var logger = new Logger();
var log = logger.log.bind(logger);


//app

log('connecting...');
//var socket = io.connect('ws://localhost:3333', {'reconnect' : false});
var socket = io.connect('ws://localhost:3333', {'reconnect' : false});
var timer;
socket.on('connect', function() {
	log('admin connected');
	//socket.emit('')
	log('command list');
	socket.emit('message', 'list', {}, function(code, list) {
		list.forEach(function(one) {
			log(JSON.stringify(one));
		});
	});
});

