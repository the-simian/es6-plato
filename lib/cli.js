'use strict';

// Node api
var fs = require('fs');

// External libs.
var getopt = require('posix-getopt');

// Local lib
var plato = require('./plato'),
	info = require('./info'),
	util = require('./util');


function exec(options, done) {
	if (typeof options === 'function') {
		done = options;
		options = undefined;
	}

	if (options) {
		Object.keys(options).forEach(function decorateArgs(key) {
			if (!(key in exports.args)) {
				exports.args[key] = options[key];
			}
		});
	}

	var files = exports.args.files;
	var outputDir = exports.args.d.value;
	var platoOptions = {
		recurse: !!exports.args.r,
		q: !!exports.args.q,
		title: exports.args.t && exports.args.t.value,
		exclude: exports.args.x && new RegExp(exports.args.x.value),
		date: exports.args.D && exports.args.D.value,
		eslintrc: exports.args.e && exports.args.e.value
	};

	if (exports.args.l) {
		var jshintrc = {};
		if (typeof exports.args.l.value === 'string') {
			var json = fs.readFileSync(exports.args.l.value).toString();

			jshintrc = JSON.parse(util.stripComments(json));
		}
		platoOptions.jshint = {
			globals: jshintrc.globals || {}
		};
		delete jshintrc.globals;
		platoOptions.jshint.options = jshintrc;
	}
	plato.inspect(files, outputDir, platoOptions, done);
}

function parseArgs(options) { //  \/\\*(?:(?!\\*\/)|.|\\n)*?\\*\/
	var optionString = '',
		required = [],
		modal = false;


	function parseArg(option) {
		var def = options[option];
		optionString += option;
		if (def.type === 'String') {
			optionString += ':';
		}
		if (def.long) {
			optionString += '(' + def.long + ')';
		}
		if (def.required) {
			required.push(option);
		}
	}

	Object.keys(options).forEach(parseArg);

	var parser = new getopt.BasicParser(optionString, process.argv);
	var args = {},
		option;

	while ((option = parser.getopt())) {
		var arg = args[option.option] || {
			count: 0
		};
		arg.count++;
		arg.value = option.optarg || true;

		args[option.option] = arg;

		if (options[option.option].modal) {
			modal = true;
		}
	}

	if (!modal) {
		required.forEach(function handleNonModal(option) {
			if (!args[option] || !args[option].value) {
				// eslint-disable-next-line no-console
				console.log('Must specify a value for option %s (%s : %s)', option, options[option].long, options[option].desc);
				info.help();
				process.exit(1);
			}
		});
	}
	// what's left in argv
	args.files = process.argv.slice(parser.optind());

	return args;
}

exports.exec = exec;
exports.options = require('./cli/options');
exports.args = parseArgs(exports.options);
