var Application = require('../lib/Application');

var app = new Application({id:'master'});

app.on('server_connect', function (server) {
	//console.log('connected ' + server.id + '.');
	var params = {
		servers:[]
	};
	app.serverManager.filter(function (other) {
		return server != other;
	}).forEach(function (other) {
		params.servers.push(other.id);
	});
	server.command('connect', params);
});

app.on('start', function() {
	var servers = app.loadConfigFile('servers.json');
	servers.forEach(function(config) {
		app.connectBackEnd(config.id);
	});
});

app.onMessage('list', function (params, next) {
	var result = this.serverManager.childrenDisplay();
	next(200, result);
});

app.onMessage('status', function (params, next) {
	var serverId = params;
	var serverEnd = app.serverManager.get(serverId);
	if (!serverEnd) {
		next(500, 'no such a server');
		return;
	}

	serverEnd.command('status', {}, function (code, status) {
		next(code, status);
	});
});

app.onMessage('reload_config', function(params, next) {
	var serverId = params;
	var serverEnd = app.serverManager.get(serverId);
	if (!serverEnd) {
		next(500, 'no such a server');
		return;
	}

	serverEnd.commnad('reload_config', {}, function (code) {
		next(code);
	});
});

app.onMessage('ping', function (params, next) {
	var serverId = params;
	var serverEnd = app.serverManager.get(serverId);
	if (!serverEnd) {
		next(500, 'no such a server');
		return;
	}

	var now = Date.now();
	var timer = setTimeout(function() {
		next(200, 9999);
	}, 1000);

	serverEnd.command('ping', {}, function (code) {
		clearTimeout(timer);
		next(200, Date.now() - now);
	})

});

app.onMessage('login', function (params, next) {

});


app.start();
