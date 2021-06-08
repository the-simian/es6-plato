'use strict';

const ESLint = require('eslint');

class ESLintReporter {
  constructor(options) {
    this.cli = new ESLint.ESLint({ overrideConfig: options });
  }

  generateReport(data) {
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

  async process(source) {
    var results = await this.lint(source);

    var report = this.generateReport(results);

    return report;
  }

  async lint(source) {
    var data = [];

    // Remove potential Unicode BOM.
    let _source = source.replace(/^\uFEFF/, '');

    var cliResults = await this.cli.lintText(_source);
    var results = cliResults[0].messages || [];

    return {
      results: results,
      data: data
    };
  }
}

module.exports = ESLintReporter;
