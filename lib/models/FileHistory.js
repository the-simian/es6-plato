'use strict';

const History = require('./History.js');

class FileHistory extends History {
  addReport(report, date) {
    date = date || report.date || new Date().toUTCString();
    this.push({
      date: date,
      sloc: report.complexity.aggregate.sloc.physical,
      lloc: report.complexity.aggregate.sloc.logical,
      functions: report.complexity.functions.length,
      deliveredBugs: report.complexity.aggregate.halstead.bugs,
      maintainability: report.complexity.maintainability,
      lintErrors: (report.eslint && report.eslint.messages.length) || [],
      difficulty: report.complexity.aggregate.halstead.difficulty
    });
    return this;
  }

}

module.exports = FileHistory;
