var child_process = require('child_process');
var redis = require('redis');
var queue = [];
var autogrows = {};
var runnings = {};

var php = '/usr/bin/php';
var phpfile = '/home/ourwar/htdoc/system/autogrow.php';
var phpargs = '';

var run = function(autogrow_id) {
	if (runnings[autogrow_id]) return false;

	//console.log("running " + autogrow_id);
	var childProcess = child_process.exec([php, phpfile, autogrow_id].join(' '), {}, function(error, stdout, stderr) {
		//console.log(stdout.toString());
		var result;
		try {
			result = JSON.parse(stdout.toString());
			if (result.code == 200) {
				var index = queue.indexOf(autogrow_id);
				queue.splice(index, 1);
				console.log("SUCCESS " + autogrow_id + ".");
			} else {
				throw("finish fail");
			}
		} catch (e) {
			autogrows[autogrow_id] += 5;
			insert(autogrow_id, autogrows[autogrow_id]);
			console.log("FAILED " + autogrow_id + ". Next Try in 5 sec.");
		}
		//next
		runnings[autogrow_id] = 0;
		// setTimeout(function() {
		// 	intervalRun();
		// });
	});
	runnings[autogrow_id] = childProcess.pid;
	return true;
};

var insert = function(id, time) {
	var index = queue.indexOf(id);
	//remove previous position.
	if (index >=0) queue.splice(index, 1);

	var length = queue.length;
	for (index = length; index--; ) {
		if (time < autogrows[queue[index]]) {
			queue.splice(index - 1, 0, id);
			return;
		}
	}
	queue.push(id);
};

var intervalRun = function() {
console.log(JSON.stringify(queue));
console.log(JSON.stringify(runnings));

//TODO return;
	var now = Date.now() / 1000;
	var length = queue.length;
	var max = 10;

	for (var index = 0; index < length && index < max; index++) {
		var id = queue[index];	
//	id = queue[0];
		if (autogrows[id] && now >= autogrows[id]) {
			run(id);
		} else {
			console.log("ID : " + id);
			console.log("Time : " + autogrows[id]);
			console.log("NOW : " + now);
			console.log("Index : " + index);
			console.log("Max : " + max);
			break;
		}
	}
}

setInterval(intervalRun, 100);

/////////////////////////////////////
// first run need call autogrow sync
/////////////////////////////////////

(function() {
	child_process.exec([php, phpfile, 'sync'].join(' '), {}, function (error, stdout, stderr) {
		var json = JSON.parse(stdout.toString());
		for (var id in json) {
			var time = json[id];
			autogrows[id] = time;
			insert(id, time);
		}
		console.log("current queue : ");
		console.log(queue);
	});
})();

