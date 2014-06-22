/**
 * grunt-npmcopy
 *
 * Copyright (c) 2014 Timmy Willison
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {
	'use strict';

	// Logging
	var log = grunt.log,
		verbose = grunt.verbose;

	// Utilities
	var _ = require('lodash');

	// Modules
	var path = require('path'),
		glob = require('glob'),
		sep = path.sep;

	// Get all modules
	var npmConfig = grunt.file.readJSON('package.json');
	var allModules = Object.keys(
		_.extend({}, npmConfig.dependencies, npmConfig.devDependencies)
	);
	var unused = allModules.slice(0);

	// Track number of runs
	var numTargets;
	var numRuns = 0;

	// Regex
	var rperiod = /\./;

	/**
	 * Retrieve the number of targets from the grunt config
	 * @returns {number|undefined} Returns the number of targets,
	 *  or undefined if the npmcopy config could not be found
	 */
	function getNumTargets() {
		if (numTargets) {
			return numTargets;
		}
		var targets = grunt.config('npmcopy');
		if (targets) {
			delete targets.options;
			numTargets = Object.keys(targets).length;
		}
		return numTargets;
	}

	/**
	 * Convert from grunt to a cleaner format
	 * @param {Array} files
	 */
	function convert(files) {
		var converted = [];
		files.forEach(function(file) {
			// We need originals as the destinations may not yet exist
			file = file.orig;
			var dest = file.dest;

			// Use destination for source if no source is available
			if (!file.src.length) {
				converted.push({
					src: dest,
					dest: dest
				});
				return;
			}

			file.src.forEach(function(source) {
				converted.push({
					src: source,
					dest: dest
				});
			});
		});
		return converted;
	}

	/**
	 * Filter out all of the modules represented in the filesSrc array
	 * @param {Array} modules
	 * @param {Array} files
	 * @param {Object} options
	 */
	function filterRepresented(modules, files, options) {
		return _.filter(modules, function(module) {
			return !_.some(files, function(file) {
				// Look for the module name somewhere in the source path
				return path.join(sep, options.srcPrefix, file.src, sep)
					.indexOf(sep + module + sep) > -1;
			});
		});
	}

	/**
	 * Ensure all npm dependencies are accounted for
	 * @param {Array} files Files property from the task
	 * @param {Object} options
	 * @returns {boolean} Returns whether all dependencies are accounted for
	 */
	function ensure(files, options) {
		// Update the global array of represented modules
		unused = filterRepresented(unused, files, options);

		verbose.writeln('Unrepresented modules list currently at ', unused);

		// Only print message when all targets have been run
		if (++numRuns === getNumTargets()) {
			if (unused.length) {
				if (options.report) {
					log.writeln('Some npm packages are not configured: ', unused);
				}
			} else if (options.report) {
				log.ok('All modules accounted for');
			}
		}
	}

	/**
	 * Convert an array of files sources to our format
	 * @param {Array} files
	 * @param {Object} options
	 * @param {String} [dest] A folder destination for all of these sources
	 */
	function convertMatches(files, options, dest) {
		return files.map(function(source) {
			return {
				src: source,
				dest: path.join(
					// Build a destination from the new source if no dest
					// was specified
					dest != null ?
						dest :
						path.dirname(source).replace(options.srcPrefix + sep, ''),
					path.basename(source)
				)
			};
		});
	}

	/**
	 * Copy over specified component files from the npm directory
	 *  files format: [{ src: '', dest: '' }, ...]
	 * @param {Array} files
	 * @param {Object} options
	 */
	function copy(files, options) {
		files.forEach(function(file) {
			var src = file.src;
			// Use source for destination if no destionation is available
			// This is done here so globbing can use the original dest
			var dest = file.dest || src;

			// Add source prefix if not already added
			if (src.indexOf(options.srcPrefix) !== 0) {
				src = path.join(options.srcPrefix, src);
			}

			// Add dest prefix if not already added
			if (dest.indexOf(options.destPrefix) !== 0) {
				dest = path.join(options.destPrefix, dest);
			}

			// Copy folders
			if (grunt.file.isDir(src)) {
				grunt.file.recurse(src, function(abspath, rootdir, subdir, filename) {
					grunt.file.copy(
						abspath,
						path.join(dest, subdir || '', filename),
						options.copyOptions
					);
				});
				log.writeln(src + ' -> ' + dest);
			// Copy files
			} else if (grunt.file.exists(src)) {
				if (!rperiod.test(path.basename(dest))) {
					dest = path.join(dest, path.basename(src));
				}
				grunt.file.copy(src, dest, options.copyOptions);
				log.writeln(src + ' -> ' + dest);
			// Glob
			} else {
				var matches = glob.sync(src);
				if (matches.length) {
					matches = convertMatches(matches, options, file.dest);
					copy(matches, options);
				} else {
					log.warn(src + ' was not found');
				}
			}
		});
	}

	/**
	 * Top-level copying run
	 *  files format is Grunt's default:
	 *  [{ orig: { src: '', dest: '' }, src: '', dest: '' }, ...]
	 *  convert to copy()'s format before calling copy()
	 * @param {Array} files
	 * @param {Object} options
	 */
	function run(files, options) {
		verbose.writeln('Using srcPrefix: ' + options.srcPrefix);
		verbose.writeln('Using destPrefix: ' + options.destPrefix);

		// Build the file list
		files = convert(files);

		// Copy files
		copy(files, options);

		// Report if any dependencies have not been copied
		ensure(files, options);
	}

	grunt.registerMultiTask(
		'npmcopy',
		[
			'Copy only the needed files from the node modules folder',
			'over to their specified locations for the front-end'
		].join(' '),
		function npmcopy() {
			var files = this.files;

			// Options
			var options = this.options({
				srcPrefix: 'node_modules',
				destPrefix: '',
				report: false,
				copyOptions: {}
			});

			run(files, options);
		}
	);
};