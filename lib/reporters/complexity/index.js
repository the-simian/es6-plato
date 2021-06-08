'use strict';

//TODO: make this not a janky munge of old plato code and the new stuff

const escomplex = require('typhonjs-escomplex');
const _ = require('lodash');

class ComplexityReporter {
  constructor(options) {
    this.options = options;
    this.babelOptions = options?.parserOptions?.babelOptions;
  }

  methodToReportFunction(func) {
		func.complexity = _.extend({},{
			cyclomatic: func.cyclomatic,
			sloc: func.sloc,
			halstead: func.halstead
		});

		func.line = func.line || func.lineStart;

		return func;
  }

  methodToReportFunction(func) {
		func.complexity = _.extend({}, {
			cyclomatic: func.cyclomatic,
			sloc: func.sloc,
			halstead: func.halstead
		});

		func.line = func.line || func.lineStart;

		return func;
  }

  allClassMethods(report){
		if(!report.classes.length){
			return [];
		}

		return _
			.chain(report.classes)
			.map(function(_class){
				return _class.methods;
			})
			.flatten()
			.value();
  }

  async process(source, reportInfo) {
    var report = await escomplex.analyzeModule(source, this.options, this.babelOptions);

    // Make the short filename easily accessible
    report.module = reportInfo.fileShort;

    // Munge the new `escomplex-js` format to match the older format of
    // `complexity-report`
    //this is just adapting the new module to the old stuff.
    //TODO its messy and it needs ot not be here forever.
    /*
    date: date,
    sloc: r.aggregate.complexity.sloc.physical,
    lloc: r.aggregate.complexity.sloc.logical,
    functions: r.functions.length,
    deliveredBugs: r.aggregate.complexity.halstead.bugs,
    maintainability: r.maintainability,
    difficulty: r.aggregate.complexity.halstead.difficulty
    */
    report.aggregate = report.aggregate || {};
    report.aggregate.complexity = _.clone(report.aggregateAverage);

    let functions = report.methods.concat(this.allClassMethods(report));
    report.functions = _
      .chain(functions)
      .map(this.methodToReportFunction)
      .value();

    return report;
  }

};

module.exports = ComplexityReporter;
