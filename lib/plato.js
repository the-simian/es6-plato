/*
 * plato
 * https://github.com/es-analysis/plato
 *
 * Copyright (c) 2012 Jarrod Overson
 * Licensed under the MIT license.
 *
 * es6-plato
 * https://github.com/es-analysis/es6-plato
 * updated from plato, by the-simian (Jesse Harlin)
 * Licensed under the MIT license.
 */

'use strict';

// node api
var path = require('path');

// node api with sugar
var fs = require('fs-extra');

// vendor
var _ = require('lodash');
var glob = require('globby');
var unixify = require('unixify');

var ecmaFeatures = require('./ecmafeatures');
var eslintBase = require('./eslintbase');

// local lib
var util = require('./util'),
	OverviewHistory = require('./models/OverviewHistory'),
	FileHistory = require('./models/FileHistory'),
	Logger = require('./logger'),
	reporters = {
		complexity: require('./reporters/complexity'),
		eslint: require('./reporters/eslint')
	};

var overviewTemplate = __dirname + '/templates/overview.html',
	displayTemplate = __dirname + '/templates/display.html',
	fileTemplate = __dirname + '/templates/file.html',
	assets = __dirname + '/assets/',
	fileDir = 'files';

var log = new Logger(Logger.WARNING);

async function inspect(files, outputDir, options, done) {
	let _inputPattern = files;
	done = done || function noop() {};

	if (!files) {
		console.log('no files');
		return;
	}

	function patternToFile(pattern) {
		let _path = unixify(pattern);
		var t = glob.sync(_path);
		return t;
	}

	files = files instanceof Array ? files : [files];
	files = _
		.chain(files)
		.map(patternToFile)
		.flatten()
		.value();

	if (!files.length) {
		console.log('No files were found, check your glob,' + _inputPattern + '. ( You may need to put it in quotes if you are on Windows )');
		return;
	}

	console.log('Processing ',files.length, ' files');

	var flags = {
		complexity: {
			ecmaFeatures: ecmaFeatures,
			sourceType: 'module',
			ecmaVersion: 6,
			loc: true,
			newmi: true,
			range: true
		},
		eslint: options.eslintrc
			? path.resolve(options.eslintrc)
			: eslintBase
  };

	function cloneOptsAtFlag(flag) {
		if (flag in options) {
			if (typeof options[flag] === 'boolean' && flag === 'eslint') {
				flags[flag] = options[flag];
			} else {
				flags[flag] = _.extend({}, flags[flag], options[flag]);
			}
		}
	}

  Object.keys(flags).forEach(cloneOptsAtFlag);
  if (flags.eslint) {
    const _eslint = require(flags.eslint);
    if (_eslint.parserOptions) {
      delete flags.complexity.ecmaFeatures;
      flags.complexity.parserOptions = Object.assign({}, _eslint.parserOptions);
      let babelOptions;
      if (_eslint.parserOptions?.babelOptions?.configFile) {
        babelOptions = JSON.parse(JSON.stringify(require(`${path.dirname(flags.eslint)}/${_eslint.parserOptions.babelOptions.configFile}`)));
        babelOptions.plugins.push('classProperties');
        babelOptions.plugins.push('@babel/plugin-proposal-class-properties');
        babelOptions.plugins.push(['decorators', { "decoratorsBeforeExport" :true }]);
        babelOptions.plugins.push("transform-class-properties");
        babelOptions.plugins.push(["@babel/plugin-proposal-decorators", { "legacy": true }]);
      } else {
        babelOptions = _eslint.parserOptions?.babelOptions
      }
      flags.complexity.parserOptions.babelOptions = babelOptions;
    }
  } else if (_eslint.ecmaFeatures) {
    flags.complexity.ecmaFeatures = _eslint.ecmaFeatures
  }
	if (options.q) {
		log.level = Logger.ERROR;
	}

	if (options.date) {
		// if we think we were given seconds
		if (options.date < 10000000000) {
			options.date = options.date * 1000;
		}
		options.date = new Date(options.date);
	}

	var reports = [];

	var fileOutputDir = outputDir ? path.join(outputDir, fileDir) : false;

	var commonBasePath = util.findCommonBase(files);

	async function runReports(files, done) {
		files.forEach(async function reportEachFile(file) {
			if (options.exclude && options.exclude.test(file)) {
				return;
			}

			if (options.recurse && fs.statSync(file).isDirectory()) {
				files = fs.readdirSync(file).map(function resolveFile(innerFile) {
					return path.join(file, innerFile);
				});
				await runReports(files);
			}  else if (file.match(/\.(js|jsx|mjs|es6|ts|tsx)$/)) {
				log.info('Reading "%s"', file);

				var fileShort = file.replace(commonBasePath, '');
				var fileSafe = fileShort.replace(/[^a-zA-Z0-9]/g, '_');
				var source = fs.readFileSync(file).toString();
				var trimmedSource = source.trim();
				if (!trimmedSource) {
					log.info('Not parsing empty file "%s"', file);
					return;
				}

				// if skip empty line option
				if (options.noempty) {
					source = source.replace(/^\s*[\r\n]/gm, '');
				}

				// if begins with shebang
				if (source[0] === '#' && source[1] === '!') {
					source = '//' + source;
				}
				var report = {
					info: {
						file: file,
						fileShort: fileShort,
						fileSafe: fileSafe,
						link: fileDir + '/' + fileSafe + '/index.html'
					}
				};

				var error = false;
        for await (let name of Object.keys(reporters)) {
					if (!flags[name]) {
						return;
					}
					try {
            report[name] = await reporters[name].process(source, flags[name], report.info);
					} catch (e) {
						error = true;
						log.error('Error reading file %s: ', file, e.toString());
						log.error(e.stack);
					}
				}

				if (error) {
          return;
				}
				reports.push(report);
				if (fileOutputDir) {
					var outdir = path.join(fileOutputDir, report.info.fileSafe);
					if (!fs.existsSync(outdir)) {
						fs.mkdirSync(outdir);
					}
					await writeFileReport(outdir, report, source, options);
				}
			}
		});
		if (done) {
			done();
		}
	}

	if (!fileOutputDir) {
		await runReports(files, function() {
			done(reports);
		});
	} else {
		fs.mkdirp(fileOutputDir, async function() {
			await runReports(files, function() {
				var reportFilePrefix = path.join(outputDir, 'report');
				var overview = path.join(outputDir, 'index.html');
				var wallDisplay = path.join(outputDir, 'display.html');

				fs.copy(assets, path.join(outputDir, 'assets'), function() {
					var overviewReport = getOverviewReport(reports);
					updateHistoricalOverview(reportFilePrefix, overviewReport, options);
					writeReport(reportFilePrefix, overviewReport);
					writeOverview(
						overview,
						overviewReport,
						{
							title: options.title,
							flags: flags
						},
						overviewTemplate
					);
					writeOverview(
						wallDisplay,
						overviewReport,
						{
							title: options.title,
							flags: flags
						},
						displayTemplate
					);
					done(reports);
				});
			});
		});
	}
}

// Filters out information unused in the overview for space/performance
function getOverviewReport(reports) {
	var culledReports = [];
	var summary = {
		total: {
			eslint: 0,
			sloc: 0,
			maintainability: 0
		},
		average: {
			sloc: 0,
			maintainability: 0
		}
	};

	reports.forEach(function(report) {
		// clone objects so we don't have to worry about side effects
		summary.total.sloc += report.complexity.aggregate.sloc.physical;
		summary.total.maintainability += report.complexity.maintainability;

		var aggregate = _.cloneDeep(report.complexity.aggregate);
		var reportItem = {};
		reportItem.info = report.info;
		if (report.eslint) {
			summary.total.eslint += report.eslint.messages.length;
			reportItem.eslint = {
				messages: report.eslint.messages.length
			};
		}
		if (report.complexity) {
			reportItem.complexity = {
				aggregate: aggregate,
				module: report.complexity.module,
				module_safe: report.complexity.module_safe,
				maintainability: _.cloneDeep(report.complexity.maintainability)
			};
		}
		culledReports.push(reportItem);
	});

	summary.average.sloc = Math.round(summary.total.sloc / reports.length);
	summary.average.eslint = (summary.total.eslint / reports.length).toFixed(2);
	summary.average.maintainability = (
		summary.total.maintainability / reports.length
	).toFixed(2);

	return {
		summary: summary,
		reports: culledReports
	};
}

function updateHistoricalOverview(outfilePrefix, overview, options) {
	var existingData =
		util.readJSON(outfilePrefix + '.history.json', options) || {};
	var history = new OverviewHistory(existingData);
	history.addReport(overview, options.date);
	writeReport(outfilePrefix + '.history', history.toJSON(), '__history');
}

function updateHistoricalReport(outfilePrefix, overview, options) {
	var existingData =
		util.readJSON(outfilePrefix + '.history.json', options) || {};
	var history = new FileHistory(existingData);
	overview.date = options.date;
	history.addReport(overview, options.date);
	writeReport(outfilePrefix + '.history', history.toJSON(), '__history');
}

function writeFile(file, source) {
	log.info('Writing file "%s".', file);
	return fs.writeFile(file, source, 'utf8');
}

async function writeReport(outfilePrefix, report, exportName) {
	var formatted = util.formatJSON(report);

	await writeFile(outfilePrefix + '.json', formatted);

	exportName = exportName || '__report';

	var module = exportName + ' = ' + formatted;

	await writeFile(outfilePrefix + '.js', module);
}

function writeOverview(outfile, report, options, templatePath) {
	var overviewSource = fs.readFileSync(templatePath).toString();

	var parsed = _.template(overviewSource)({
		report: report,
		options: options
	});
	writeFile(outfile, parsed);
}

async function writeFileReport(outdir, report, source, options) {
	var overviewSource = fs.readFileSync(fileTemplate).toString();

	var parsed = _.template(overviewSource)({
		source: util.escapeHTML(source),
		report: report
	});
	var indexPath = path.join(outdir, 'index.html');
	var outfilePrefix = path.join(outdir, 'report');

	await writeFile(indexPath, parsed);
	updateHistoricalReport(outfilePrefix, report, options);
	await writeReport(outfilePrefix, report);
}
exports.getOverviewReport = getOverviewReport;
exports.inspect = inspect;
