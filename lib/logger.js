'use strict';


function Logger(level) {
	this.level = level;
}

var levels = [
	'TRACE',
	'DEBUG',
	'INFO',
	'WARNING',
	'ERROR'
];

function decorateLoggerAtLevel(level, i) {
	Logger[level] = i;
	Logger.prototype[level.toLowerCase()] = function() {
		if (i >= this.level) {
			console.log.apply(console, arguments);
		}
	};
}

levels.forEach(decorateLoggerAtLevel);

module.exports = Logger;
