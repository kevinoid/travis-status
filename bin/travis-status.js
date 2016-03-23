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
var Command = require('commander').Command;
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var debug = require('debug')('travis-status');
var extend = require('extend');
var packageJson = require('../package.json');
var stateInfo = require('../lib/state-info');
var travisStatus = require('..');

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
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = extend(
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

  var command = new Command()
    .description('Checks status of the latest build.')
    // Note:  Option order matches travis.rb with new ones at bottom
    .option('-i, --interactive', 'be interactive and colorful')
    .option('-E, --explode', 'ignored for compatibility with travis.rb')
    .option('--skip-version-check', 'ignored for compatibility with travis.rb')
    .option('--skip-completion-check',
        'ignored for compatibility with travis.rb')
    .option('-I, --insecure', 'do not verify SSL certificate of API endpoint')
    .option('-e, --api-endpoint <URL>', 'Travis API server to talk to')
    .option('--pro',
        'short-cut for --api-endpoint \'' + travisStatus.PRO_URI + '\'')
    .on('pro', function() {
      this.apiEndpoint = travisStatus.PRO_URI;
    })
    .option('--org',
        'short-cut for --api-endpoint \'' + travisStatus.ORG_URI + '\'')
    .on('org', function() {
      this.apiEndpoint = travisStatus.ORG_URI;
    })
    .option('--staging', 'talks to staging system')
    .on('staging', function() {
      this.apiEndpoint = (this.apiEndpoint || travisStatus.ORG_URI)
        .replace(/api/g, 'api-staging');
    })
    .option('-t, --token <ACCESS_TOKEN>', 'access token to use')
    .option('--debug', 'show API requests')
    .option('--debug-http', 'show HTTP(S) exchange')
    .option('-r, --repo <SLUG>',
        'repository to use (will try to detect from current git clone)')
    .option('-R, --store-repo <SLUG>',
        'like --repo, but remembers value for current directory')
    .on('store-repo', function() {
      this.repo = this.storeRepo;
    })
    .option('-x, --exit-code', 'sets the exit code to 1 if the build failed')
    .option('-q, --quiet', 'does not print anything')
    .option('-p, --fail-pending',
        'sets the status code to 1 if the build is pending')
    .option('-b, --branch [BRANCH]',
        'query latest build for a branch (default: current)')
    .option('-c, --commit [COMMIT]',
        'require build to be for a specific commit (default: HEAD)',
        'HEAD')
    .option('-w, --wait [TIMEOUT]',
        'wait if build is pending (timeout in seconds)',
        Infinity)
    .version(packageJson.version);

  // Patch stdout, stderr, and exit for Commander
  // See: https://github.com/tj/commander.js/pull/444
  var exitDesc = Object.getOwnPropertyDescriptor(process, 'exit');
  var stdoutDesc = Object.getOwnPropertyDescriptor(process, 'stdout');
  var stderrDesc = Object.getOwnPropertyDescriptor(process, 'stderr');
  var consoleDesc = Object.getOwnPropertyDescriptor(global, 'console');
  var errExit = new Error('process.exit() called');
  process.exit = function throwOnExit(code) {
    errExit.code = code;
    throw errExit;
  };
  if (options.out) {
    Object.defineProperty(
        process,
        'stdout',
        {configurable: true, enumerable: true, value: options.out}
    );
  }
  if (options.err) {
    Object.defineProperty(
        process,
        'stderr',
        {configurable: true, enumerable: true, value: options.err}
    );
  }
  if (options.out || options.err) {
    Object.defineProperty(
      global,
      'console',
      {
        configurable: true,
        enumerable: true,
        // eslint-disable-next-line no-console
        value: new console.Console(process.stdout, process.stderr)
      }
    );
  }
  try {
    command.parse(args);
  } catch (errParse) {
    var exitCode = errParse === errExit ? errExit.code || 0 : null;
    process.nextTick(function() {
      if (exitCode !== null) {
        callback(null, exitCode);
      } else {
        callback(errParse);
      }
    });
    return undefined;
  } finally {
    Object.defineProperty(process, 'exit', exitDesc);
    Object.defineProperty(process, 'stdout', stdoutDesc);
    Object.defineProperty(process, 'stderr', stderrDesc);
    Object.defineProperty(global, 'console', consoleDesc);
  }

  if (typeof command.interactive === 'undefined') {
    // Note:  Same default as travis.rb
    // Need cast to Boolean so undefined becomes false to disable Chalk
    command.interactive = Boolean(options.out.isTTY);
  }

  var chalk = new Chalk({enabled: command.interactive});

  if (command.args.length > 0) {
    options.err.write(chalk.red('too many arguments') + '\n' +
        command.helpInformation());
    process.nextTick(function() { callback(null, 1); });
    return undefined;
  }

  if (command.hasOwnProperty('wait')) {
    var wait = Number(command.wait);
    if (isNaN(wait)) {
      var waitErr = chalk.red('invalid wait time "' + command.wait + '"');
      options.err.write(waitErr + '\n');
      process.nextTick(function() { callback(null, 1); });
      return undefined;
    }
    command.wait = wait * 1000;
  }

  // Pass through options
  command.in = options.in;
  command.out = options.out;
  command.err = options.err;

  if (command.insecure) {
    command.request = {strictSSL: false};
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

    var state = build.last_build_state || build.branch.state;

    if (!command.quiet) {
      var color = stateInfo.colors[state] || 'yellow';
      var number = build.last_build_number || build.branch.number;
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