var redis = require('redis');

var redisClient = redis.createClient();

var timers = {};

redisClient.subscribe('autogrow');
redisClient.on('message', function(channel, data) {
	try {
		data = JSON.parse(data);
	} catch (e) {
		console.log('cant parse data:' + data);
		return;
	}
	if (timers[data.id]) clearTimeout(timers[data.id]);
	var timer = setTimeout(function() {
		call_php(data.id);
	}, data.endtime);
	timer[data.id] = timer;
});