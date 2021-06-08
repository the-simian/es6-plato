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
const path = require('path');

// node api with sugar
const fs = require('fs-extra');

// vendor
const _ = require('lodash');
const fastglob = require('fast-glob');
const unixify = require('unixify');
const mkdirp = require('mkdirp');

const ecmaFeatures = require('./ecmafeatures.js');
const eslintBase = require('./eslintbase.js');

// local lib
const util = require('./util.js');
const OverviewHistory = require('./models/OverviewHistory.js');
const FileHistory = require('./models/FileHistory.js');
const Logger = require('./logger.js');

const ComplexityReporter = require('./reporters/complexity/index.js');
const ESLintReporter = require('./reporters/eslint/index.js');

const reporters = {};

let _ESLINT_FILE;
let _BABEL_OPTIONS_JSON_FILE;

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

	files = files instanceof Array ? files : [files];
	files = await Promise.all(files.map(async pattern => await fastglob(unixify(pattern))));
	files = files.flat();

	if (!files.length) {
		console.log('No files were found, check your glob,' + _inputPattern + '. ( You may need to put it in quotes if you are on Windows )');
		return;
	}

	// console.log(`Processing ${files.length} files from ${_inputPattern}`);

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
  if (options.eslintrc) {
    _ESLINT_FILE = (require(`${process.cwd()}/${options.eslintrc}`));
    const _eslint = _ESLINT_FILE;
    if (_eslint.parserOptions) {
      delete flags.complexity.ecmaFeatures;
      flags.complexity.parserOptions = Object.assign({}, _eslint.parserOptions);
      let babelOptions;
      if (_eslint.parserOptions?.babelOptions?.configFile) {
		    if (!_BABEL_OPTIONS_JSON_FILE) {
			    _BABEL_OPTIONS_JSON_FILE = (require(`${process.cwd()}/${path.dirname(options.eslintrc)}/${_eslint.parserOptions.babelOptions.configFile}`));
		    }
        let _babelOptionsJSON = _BABEL_OPTIONS_JSON_FILE;
        babelOptions = JSON.parse(JSON.stringify(_babelOptionsJSON));
        babelOptions.plugins.push('classProperties');
        babelOptions.plugins.push('classPrivateProperties');
        babelOptions.plugins.push('@babel/plugin-proposal-class-properties');
        babelOptions.plugins.push(['decorators', { "decoratorsBeforeExport" :true }]);
        babelOptions.plugins.push("transform-class-properties");
        babelOptions.plugins.push(["@babel/plugin-proposal-decorators", { "legacy": true }]);
      } else {
        babelOptions = _eslint.parserOptions?.babelOptions
      }
      flags.complexity.parserOptions.babelOptions = babelOptions;
    } else if (_eslint.ecmaFeatures) {
      flags.complexity.ecmaFeatures = _eslint.ecmaFeatures
    }
    // create the eslint reporter once
    reporters.eslint = new ESLintReporter(_eslint);
  }
  reporters.complexity = new ComplexityReporter(flags.complexity);

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

  var fileOutputDir = outputDir ? path.join(outputDir, fileDir) : false;

  let reports;
	if (!fileOutputDir) {
		reports = await runReports(files, options, flags);
	} else {
		await fs.mkdirp(fileOutputDir);
    reports = await runReports(files, options, flags, fileOutputDir);
    var reportFilePrefix = path.join(outputDir, 'report');
    var overview = path.join(outputDir, 'index.html');
    var wallDisplay = path.join(outputDir, 'display.html');

    await fs.copy(assets, path.join(outputDir, 'assets'))
    var overviewReport = getOverviewReport(reports);
    await updateHistoricalOverview(reportFilePrefix, overviewReport, options);
    await writeReport(reportFilePrefix, overviewReport);
    await writeOverview(
      overview,
      overviewReport,
      {
        title: options.title,
        flags: flags
      },
      overviewTemplate
    );
    await writeOverview(
      wallDisplay,
      overviewReport,
      {
        title: options.title,
        flags: flags
      },
      displayTemplate
    );
	}
  done(reports);
  return reports;
}

async function runReports(files, options, flags, fileOutputDir) {
  var commonBasePath = util.findCommonBase(files);
  let reports = files.map(async function reportEachFile(file) {
    if (options.exclude && options.exclude.test(file)) {
      return
    }

    let fileState = await fs.stat(file);
    if (options.recurse && fileState.isDirectory()) {
      files = (await fs.readdir(file)).map(innerFile => path.join(file, innerFile));
      return runReports(files);
    } else if (file.match(/\.jsx?$/)) {
      log.info('Reading "%s"', file);

      var fileShort = file.replace(commonBasePath, '');
      var fileSafe = fileShort.replace(/[^a-zA-Z0-9]/g, '_');
      var source = (await fs.readFile(file)).toString();
      var trimmedSource = source.trim();
      if (!trimmedSource) {
        log.info('Not parsing empty file "%s"', file);
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
        if (fileOutputDir) {
          var outdir = path.join(fileOutputDir, report.info.fileSafe);
          let outdirExists = await fs.stat(outdir).then(() => true).catch(() => false);
          if (!outdirExists) {
            await fs.mkdir(outdir);
          }
          await writeFileReport(outdir, report, source, options);
        }
        return report;
      }
    }
  });
  return Promise.all(reports).then(r => r.filter(r => !!r));
}

async function updateHistoricalOverview(outfilePrefix, overview, options) {
	var existingData =
		await util.readJSON(outfilePrefix + '.history.json', options) || {};
	var history = new OverviewHistory(existingData);
	history.addReport(overview, options.date);
	await writeReport(outfilePrefix + '.history', history.toJSON(), '__history');
}

async function updateHistoricalReport(outfilePrefix, overview, options) {
	var existingData =
		await util.readJSON(outfilePrefix + '.history.json', options) || {};
	var history = new FileHistory(existingData);
	overview.date = options.date;
	history.addReport(overview, options.date);
	await writeReport(outfilePrefix + '.history', history.toJSON(), '__history');
}

async function writeReport(outfilePrefix, report, exportName) {
	var formatted = util.formatJSON(report);

	await writeFile(outfilePrefix + '.json', formatted);

	exportName = exportName || '__report';

	var module = exportName + ' = ' + formatted;

	await writeFile(outfilePrefix + '.js', module);
}

async function writeOverview(outfile, report, options, templatePath) {
	var overviewSource = (await fs.readFile(templatePath)).toString();

	var parsed = _.template(overviewSource)({
		report: report,
		options: options
	});
	await writeFile(outfile, parsed);
}

async function writeFileReport(outdir, report, source, options) {
	var overviewSource = (await fs.readFile(fileTemplate)).toString();

	var parsed = _.template(overviewSource)({
		source: util.escapeHTML(source),
		report: report
	});
	var indexPath = path.join(outdir, 'index.html');
	var outfilePrefix = path.join(outdir, 'report');

	await writeFile(indexPath, parsed);
	await updateHistoricalReport(outfilePrefix, report, options);
	await writeReport(outfilePrefix, report);
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

async function writeFile(file, source) {
	// console.log(`Writing file ${file} to  ${path.dirname(file)}`);
	await mkdirp(path.dirname(file));
	return fs.writeFile(file, source, 'utf8');
}

module.exports = {
  getOverviewReport,
  updateHistoricalOverview,
  writeReport,
  writeFile,
  writeOverview,
  inspect,
}

