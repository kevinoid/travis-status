#!/usr/bin/env node
/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

// Set NODE_DEBUG for request before importing it
if (require.main === module &&
    (process.argv.indexOf('--debug') >= 0 ||
     process.argv.indexOf('--debug-http') >= 0)) {
  var nodeDebug = process.env.NODE_DEBUG;
  if (!nodeDebug) {
    process.env.NODE_DEBUG = 'request';
  } else if (!/\brequest\b/.test(nodeDebug)) {
    process.env.NODE_DEBUG = nodeDebug + ',request';
  }
}

var Chalk = require('chalk').constructor;
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var Yargs = require('yargs/yargs');
var debug = require('debug')('travis-status');
var assign = require('object-assign');
var packageJson = require('../package.json');
var stateInfo = require('../lib/state-info');
var travisStatus = require('..');

/** Calls <code>yargs.parse</code> and passes any thrown errors to the callback.
 * Workaround for https://github.com/yargs/yargs/issues/755
 * @private
 */
function parseYargs(yargs, args, callback) {
  // Since yargs doesn't nextTick its callback, this function must be careful
  // that exceptions thrown from callback (which propagate through yargs.parse)
  // are not caught and passed to a second invocation of callback.
  var called = false;
  try {
    yargs.parse(args, function() {
      called = true;
      return callback.apply(this, arguments);
    });
  } catch (err) {
    if (called) {
      // err was thrown after or by callback.  Let it propagate.
      throw err;
    } else {
      callback(err);
    }
  }
}

/** Options for command entry points.
 *
 * @typedef {{
 *   in: (stream.Readable|undefined),
 *   out: (stream.Writable|undefined),
 *   err: (stream.Writable|undefined)
 * }} CommandOptions
 * @property {stream.Readable=} in Stream from which input is read. (default:
 * <code>process.stdin</code>)
 * @property {stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 */
// var CommandOptions;

/** Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=}
 * callback Callback for the exit code or an <code>Error</code>.
 * @return {Promise<number>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the exit code or <code>Error</code>.
 */
function travisStatusCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback) {
    return new Promise(function(resolve, reject) {
      travisStatusCmd(args, options, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (args === undefined || args === null || args.length === 0) {
      args = [];
    } else if (typeof args !== 'object' ||
               Math.floor(args.length) !== args.length) {
      throw new TypeError('args must be Array-like');
    } else if (args.length < 2) {
      throw new RangeError('non-empty args must have at least 2 elements');
    } else {
      args = Array.prototype.slice.call(args, 2).map(String);
    }

    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = assign(
      {
        in: process.stdin,
        out: process.stdout,
        err: process.stderr
      },
      options
    );

    if (!options.in || typeof options.in.read !== 'function') {
      throw new TypeError('options.in must be a stream.Readable');
    }
    if (!options.out || typeof options.out.write !== 'function') {
      throw new TypeError('options.out must be a stream.Writable');
    }
    if (!options.err || typeof options.err.write !== 'function') {
      throw new TypeError('options.err must be a stream.Writable');
    }
  } catch (err) {
    process.nextTick(function() {
      callback(err);
    });
    return undefined;
  }

  // Workaround for https://github.com/yargs/yargs/issues/783
  require.main = module;
  var yargs = new Yargs(null, null, require)
    .usage('Usage: $0 [options] [args...]')
    .help()
    .alias('help', 'h')
    .alias('help', '?')
    // Note:  Option order matches travis.rb with new ones at bottom
    .option('interactive', {
      alias: 'i',
      default: undefined,
      describe: 'be interactive and colorful',
      type: 'boolean'
    })
    .option('explode', {
      alias: 'E',
      describe: 'ignored for compatibility with travis.rb',
      type: 'boolean'
    })
    .option('skip-version-check', {
      describe: 'ignored for compatibility with travis.rb',
      type: 'boolean'
    })
    .option('skip-completion-check', {
      describe: 'ignored for compatibility with travis.rb',
      type: 'boolean'
    })
    .option('insecure', {
      alias: 'I',
      describe: 'do not verify SSL certificate of API endpoint',
      type: 'boolean'
    })
    .option('api-endpoint', {
      alias: 'e',
      describe: 'Travis API server to talk to',
      nargs: 1
    })
    .option('pro', {
      describe: 'short-cut for --api-endpoint \'' + travisStatus.PRO_URI + '\'',
      type: 'boolean'
    })
    .option('org', {
      describe: 'short-cut for --api-endpoint \'' + travisStatus.ORG_URI + '\'',
      type: 'boolean'
    })
    .option('staging', {
      describe: 'talks to staging system',
      type: 'boolean'
    })
    .option('token', {
      alias: 't',
      describe: 'access token to use',
      nargs: 1
    })
    .option('debug', {
      describe: 'show API requests',
      type: 'boolean'
    })
    .option('debug-http', {
      describe: 'show HTTP(S) exchange',
      type: 'boolean'
    })
    .option('repo', {
      alias: 'r',
      describe: 'repository to use (will try to detect from current git clone)',
      nargs: 1
    })
    .option('store-repo', {
      alias: 'R',
      describe: 'like --repo, but remembers value for current directory',
      nargs: 1
    })
    .option('exit-code', {
      alias: 'x',
      describe: 'sets the exit code to 1 if the build failed',
      type: 'boolean'
    })
    .option('quiet', {
      alias: 'q',
      describe: 'does not print anything',
      type: 'boolean'
    })
    .option('fail-pending', {
      alias: 'p',
      describe: 'sets the status code to 1 if the build is pending'
    })
    .option('branch', {
      alias: 'b',
      defaultDescription: 'current',
      describe: 'query latest build for a branch'
    })
    .option('commit', {
      alias: 'c',
      defaultDescription: 'HEAD',
      describe: 'require build to be for a specific commit'
    })
    .option('wait', {
      alias: 'w',
      defaultDescription: 'Infinity',
      describe: 'wait if build is pending (timeout in seconds)'
    })
    .version(packageJson.name + ' ' + packageJson.version)
    .alias('version', 'V')
    .strict();
  parseYargs(yargs, args, function(errYargs, command, output) {
    if (errYargs) {
      options.err.write(output ?
                          output + '\n' :
                          errYargs.name + ': ' + errYargs.message + '\n');
      callback(null, 1);
      return;
    }

    if (output) {
      options.out.write(output + '\n');
    }

    if (command.help || command.version) {
      callback(null, 0);
      return;
    }

    if (typeof command.interactive === 'undefined') {
      // Note:  Same default as travis.rb
      // Need cast to Boolean so undefined becomes false to disable Chalk
      command.interactive = Boolean(options.out.isTTY);
    }

    var chalk = new Chalk({enabled: command.interactive});

    if (command._.length > 0) {
      yargs.showHelp(function(helpStr) {
        options.err.write(chalk.red('too many arguments') + '\n' + helpStr);
        process.nextTick(function() { callback(null, 1); });
      });
      return;
    }

    if (command.commit === true) {
      command.commit = 'HEAD';
    }

    if (command.org) {
      command.apiEndpoint = travisStatus.ORG_URI;
    }
    if (command.pro) {
      command.apiEndpoint = travisStatus.PRO_URI;
    }
    if (command.staging) {
      command.apiEndpoint = (command.apiEndpoint || travisStatus.ORG_URI)
        .replace(/api/g, 'api-staging');
    }

    if (command.storeRepo) {
      command.repo = command.storeRepo;
    }

    if (command.wait !== undefined) {
      var wait = command.wait === true ? Infinity : Number(command.wait);
      if (isNaN(wait)) {
        var waitErr = chalk.red('invalid wait time "' + command.wait + '"');
        options.err.write(waitErr + '\n');
        process.nextTick(function() { callback(null, 1); });
        return;
      }
      command.wait = wait * 1000;
    }

    // Pass through options
    command.in = options.in;
    command.out = options.out;
    command.err = options.err;

    // Use HTTP keep-alive to avoid unnecessary reconnections
    command.requestOpts = {
      forever: true
    };

    if (command.insecure) {
      command.requestOpts.strictSSL = false;
    }

    travisStatus(command, function(err, build) {
      if (err && err.name === 'SlugDetectionError') {
        debug('Error detecting repo slug', err);
        options.err.write(chalk.red(
          'Can\'t figure out GitHub repo name. ' +
          'Ensure you\'re in the repo directory, or specify the repo name via ' +
          'the -r option (e.g. travis-status -r <owner>/<repo>)\n'
        ));
        callback(null, 1);
        return;
      }

      if (err) {
        options.err.write(chalk.red(err.message) + '\n');
        callback(null, 1);
        return;
      }

      var state = build.repo ? build.repo.last_build_state : build.branch.state;

      if (!command.quiet) {
        var color = stateInfo.colors[state] || 'yellow';
        var number =
          build.repo ? build.repo.last_build_number : build.branch.number;
        options.out.write('build #' + number + ' ' + chalk[color](state) +
            '\n');
      }

      var code = 0;
      if ((command.exitCode && stateInfo.isUnsuccessful[state]) ||
          (command.failPending && stateInfo.isPending[state])) {
        code = 1;
      }

      callback(null, code);
    });
  });

  return undefined;
}

module.exports = travisStatusCmd;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  var mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr
  };
  travisStatusCmd(process.argv, mainOptions, function(err, code) {
    if (err) {
      if (err.stdout) { process.stdout.write(err.stdout); }
      if (err.stderr) { process.stderr.write(err.stderr); }
      process.stderr.write(err.name + ': ' + err.message + '\n');

      code = typeof err.code === 'number' ? err.code : 1;
    }

    process.exit(code);
  });
}
