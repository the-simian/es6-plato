'use strict';

// Node api
const fs = require('fs-extra');

// External libs.
const getopt = require('posix-getopt');

// Local lib
const options = require('./cli/options.json');
const plato = require('./plato');
const info = require('./info');
const util = require('./util');


async function exec(options, done) {
	if (typeof options === 'function') {
		done = options;
		options = undefined;
	}

	if (options) {
		Object.keys(options).forEach(function decorateArgs(key) {
			if (!(key in this.args)) {
				this.args[key] = options[key];
			}
		});
	}

	var files = this.args.files;
	var outputDir = this.args.d.value;
	var platoOptions = {
		recurse: !!this.args.r,
		q: !!this.args.q,
		title: this.args.t && this.args.t.value,
		exclude: this.args.x && new RegExp(this.args.x.value),
		date: this.args.D && this.args.D.value,
		eslintrc: this.args.e && this.args.e.value
	};

	if (this.args.l) {
		var jshintrc = {};
		if (typeof this.args.l.value === 'string') {
			var json = await fs.readFile(this.args.l.value).toString();

			jshintrc = JSON.parse(util.stripComments(json));
		}
		platoOptions.jshint = {
			globals: jshintrc.globals || {}
		};
		delete jshintrc.globals;
		platoOptions.jshint.options = jshintrc;
	}
	return plato.inspect(files, outputDir, platoOptions, done);
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

module.exports = {
  exec,
  options,
  args: parseArgs(options)
};
