'use strict';

// node api
const fs = require('fs-extra');
const path = require('path');

// local lib
const Logger = require('./logger.js');

const log = new Logger(Logger.WARNING);

function findCommonBase(files) {
	if (!files || files.length ===0 ||files.length === 1) {
		return '';
	}

	var lastSlash = files[0].lastIndexOf(path.sep);

	if (!lastSlash) {
		return '';
	}

	var first = files[0].substr(0, lastSlash + 1);
	var prefixlen = first.length;

	function handleFilePrefixing(file) {
		for (var i = prefixlen; i > 0; i--) {
			if (file.substr(0, i) === first.substr(0, i)) {
				prefixlen = i;
				return;
			}
		}
		prefixlen = 0;
	}

	files.forEach(handleFilePrefixing);

	return first.substr(0, prefixlen);
}

function formatJSON(report) {
	function replacer(k, v) {
		if (k === 'identifiers') {
			return ['__stripped__'];
		}
		return v;
	}
	return JSON.stringify(report, replacer);
}

async function readJSON(file, options) {
	if (options.q) {
		log.level = Logger.ERROR;
	}
	var result = {};
	if (await fs.stat(file).then(() => true).catch(() => false)) {
		log.debug('Parsing JSON from file %s', file);
		try {
			result = JSON.parse(fs.readFileSync(file));
		} catch (e) {
			log.warning('Could not parse JSON from file %s', file);
		}
	} else {
		log.info('Not parsing missing file "%s"', file);
	}
	return result;
}

function stripComments(str) {
  /*jshint regexp:false */
	str = str || '';

	var multiline = /\/\*(?:(?!\*\/)|.|\n)*?\*\//g;
	var singleline = /\/\/.*/g;

	return str.replace(multiline, '').replace(singleline, '');
}

// http://stackoverflow.com/a/4835406/338762
function escapeHTML(html) {
	return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  findCommonBase,
  formatJSON,
  readJSON,
  stripComments,
  escapeHTML
};
