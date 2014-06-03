var Logger = function() {
	this.init();
};

Logger.prototype.init = function() {
	this.iscroll = new IScroll(".lines", {
		mousewheel : true
	});
};

Logger.prototype.log = function(msg) {
	var date = new Date();
	date = date.format("[yyyy-mm-dd HH:MM:ss]");
	var $parent = $(".output>.lines>.scroller");
	var $dom = $("<div>").html(date + " " + msg).appendTo($parent);
	//if ($parent.children().length > 100) $parent.children().first().remove();
	this.iscroll.refresh();
	this.iscroll.scrollToElement($dom[0]);
	console.log(date + " " + msg);
};

var logger = new Logger();
var log = logger.log.bind(logger);


//app

log("connecting...");
//var socket = io.connect("ws://localhost:3333", {"reconnect" : false});
var socket = io.connect("ws://172.16.32.30:3333", {"reconnect" : false});
var timer;
socket.on("connect", function() {
	log("admin connected");
	//socket.emit(")
	log("command list");
	socket.emit("message", "list", {}, function(code, list) {
		list.forEach(function(one) {
			log(JSON.stringify(one));
			$("<div>").addClass("single_server").html(one.id).appendTo($(".current_server_list")).click(function() {
				$(this).siblings().removeClass("active");
				$(this).addClass("active");
				showServerDetail(one);
			});
		});
	});
});

var timer = null;

function showServerDetail(server) {
	if (timer) clearInterval(timer);
	
	$(".session_list tr").not(".head").remove();
	$(".server_list tr").not(".head").remove();

	var refresh = function() {
		socket.emit("message", "status", server.id, function(code, detail) {
			log(JSON.stringify(detail));

			$(".session_list tr").not(".head").remove();
			$(".server_list tr").not(".head").remove();

			$(".overall .serverSentByte").html(detail.servers.sentByte);
			$(".overall .serverReceivedByte").html(detail.servers.receivedByte);
			$(".overall .sessionSentByte").html(detail.sessions.sentByte);
			$(".overall .sessionReceivedByte").html(detail.sessions.receivedByte);

			detail.servers.servers.forEach(function(server) {
				$("<tr>")
				.append($("<td>").html(server.id))
				.append($("<td>").html(server.remoteAddr))
				.append($("<td>").addClass("num").html(server.sentByte))
				.append($("<td>").addClass("num").html(server.receivedByte))
				.appendTo($(".server_list"));
			});
			detail.sessions.sessions.forEach(function(session) {
				$("<tr>")
				.append($("<td>").html(session.id))
				.append($("<td>").html(session.remoteAddr))
				.append($("<td>").addClass("num").html(session.sentByte))
				.append($("<td>").addClass("num").html(session.receivedByte))
				.appendTo($(".session_list"));
			});
		});
	};
	refresh();
	timer = setInterval(refresh, 1000);
}