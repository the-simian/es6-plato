'use strict';

const { ESLint } = require('eslint');

async function process(source, options, info) {
	var results = await lint(source, options, info.file);

	var report = generateReport(results);

	return report;
}

function generateReport(data) {
	var out = {
		messages: []
	};

	function addResultToMessages(result) {

		let severityMap = {
			0: 'off',
			1: 'warn',
			2: 'error'
		};

		out.messages.push({
			severity: severityMap[result.severity],
			line: result.line,
			column: result.column,
			message: result.message,
			fix: result.fix || {}
		});
	}

	data.results.forEach(addResultToMessages);
	return out;
}

async function lint(source, options, file) {
	if (typeof options === 'boolean') {
		options = null;
	}
	var data = [];

  // Remove potential Unicode BOM.
  source = source.replace(/^\uFEFF/, '');
  const config = require(options);
  var cli = new ESLint({ overrideConfig: config});
  var cliResults = await cli.lintText(source);
  var results = cliResults[0].messages || [];

	return {
		results: results,
		data: data
	};
}

exports.process = process;
