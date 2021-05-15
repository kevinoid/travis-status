#!/usr/bin/env node
/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

// Set NODE_DEBUG for request before importing it
if (require.main === module
    && (process.argv.includes('--debug')
     || process.argv.includes('--debug-http'))) {
  const nodeDebug = process.env.NODE_DEBUG;
  if (!nodeDebug) {
    process.env.NODE_DEBUG = 'request';
  } else if (!/\brequest\b/.test(nodeDebug)) {
    process.env.NODE_DEBUG = `${nodeDebug},request`;
  }
}

const Chalk = require('chalk').Instance;
const { Command } = require('commander');
const { debuglog } = require('util');

const packageJson = require('../package.json');
const stateInfo = require('../lib/state-info.js');
const travisStatus = require('..');

const debug = debuglog('travis-status');

/** Options for command entry points.
 *
 * @typedef {{
 *   in: (module:stream.Readable|undefined),
 *   out: (module:stream.Writable|undefined),
 *   err: (module:stream.Writable|undefined)
 * }} CommandOptions
 * @property {module:stream.Readable=} in Stream from which input is read.
 * (default: <code>process.stdin</code>)
 * @property {module:stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {module:stream.Writable=} err Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 */
// var CommandOptions;

/**
 * Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=} callback Callback for the exit code or
 * an <code>Error</code>.
 * @returns {Promise<number>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the exit code or <code>Error</code>.
 */
function travisStatusCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (!callback) {
    return new Promise((resolve, reject) => {
      travisStatusCmd(args, options, (err, result) => {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (args === undefined || args === null || args.length === 0) {
      // Fake args to keep Commander.js happy
      args = [
        process.execPath,
        __filename,
      ];
    } else if (typeof args !== 'object'
               || Math.floor(args.length) !== args.length) {
      throw new TypeError('args must be Array-like');
    } else if (args.length < 2) {
      throw new RangeError('non-empty args must have at least 2 elements');
    } else {
      args = Array.prototype.map.call(args, String);
    }

    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = {
      in: process.stdin,
      out: process.stdout,
      err: process.stderr,
      ...options,
    };

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
    process.nextTick(() => {
      callback(err);
    });
    return undefined;
  }

  const stdout = options.out || process.stdout;
  const stderr = options.err || process.stderr;

  const command = new Command()
    .exitOverride()
    .configureOutput({
      writeOut: (str) => stdout.write(str),
      writeErr: (str) => stderr.write(str),
      getOutHelpWidth: () => stdout.columns,
      getErrHelpWidth: () => stderr.columns,
    })
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
      `short-cut for --api-endpoint '${travisStatus.PRO_URI}'`)
    .on('option:pro', function() {
      this.emit('option:api-endpoint', travisStatus.PRO_URI);
    })
    .option('--org',
      `short-cut for --api-endpoint '${travisStatus.ORG_URI}'`)
    .on('option:org', function() {
      this.emit('option:api-endpoint', travisStatus.ORG_URI);
    })
    .option('--staging', 'talks to staging system')
    .on('option:staging', function() {
      const { apiEndpoint } = this.opts();
      const newApiEndpoint = (apiEndpoint || travisStatus.ORG_URI)
        .replace(/api/g, 'api-staging');
      this.emit('option:api-endpoint', newApiEndpoint);
    })
    .option('-t, --token <ACCESS_TOKEN>', 'access token to use')
    .option('--debug', 'show API requests')
    .option('--debug-http', 'show HTTP(S) exchange')
    .option('-r, --repo <SLUG>',
      'repository to use (will try to detect from current git clone)')
    .option('-R, --store-repo <SLUG>',
      'like --repo, but remembers value for current directory')
    .on('option:store-repo', function(val) {
      this.emit('option:repo', val);
    })
    .option('-x, --exit-code', 'sets the exit code to 1 if the build failed')
    .option('-q, --quiet', 'does not print anything')
    .option('-p, --fail-pending',
      'sets the status code to 1 if the build is pending')
    .option('-b, --branch [BRANCH]',
      'query latest build for a branch (default: current)')
    .option('-c, --commit [COMMIT]',
      'require build to be for a specific commit (default: HEAD)')
    .option('-w, --wait [TIMEOUT]',
      'wait if build is pending (timeout in seconds)')
    .version(packageJson.version);

  try {
    command.parse(args);
  } catch (errParse) {
    const exitCode =
      errParse.exitCode !== undefined ? errParse.exitCode : undefined;
    process.nextTick(() => {
      if (exitCode !== undefined) {
        // Use null to preserve current API
        // eslint-disable-next-line unicorn/no-null
        callback(null, exitCode);
      } else {
        callback(errParse);
      }
    });
    return undefined;
  }

  const cmdOpts = command.opts();

  if (cmdOpts.commit === true) {
    cmdOpts.commit = 'HEAD';
  }
  if (typeof cmdOpts.interactive === 'undefined') {
    // Note:  Same default as travis.rb
    // Need cast to Boolean so undefined becomes false to disable Chalk
    cmdOpts.interactive = Boolean(options.out.isTTY);
  }
  if (cmdOpts.wait === true) {
    cmdOpts.wait = Infinity;
  }

  const chalk = new Chalk({
    level: cmdOpts.interactive ? 1 : 0,
  });

  if (command.args.length > 0) {
    options.err.write(`${chalk.red('too many arguments')}\n${
      command.helpInformation()}`);
    // Use null to preserve current API
    // eslint-disable-next-line unicorn/no-null
    process.nextTick(() => { callback(null, 1); });
    return undefined;
  }

  if (hasOwnProperty.call(cmdOpts, 'wait')) {
    const wait = Number(cmdOpts.wait);
    if (Number.isNaN(wait)) {
      const waitErr = chalk.red(`invalid wait time "${cmdOpts.wait}"`);
      options.err.write(`${waitErr}\n`);
      // Use null to preserve current API
      // eslint-disable-next-line unicorn/no-null
      process.nextTick(() => { callback(null, 1); });
      return undefined;
    }
    cmdOpts.wait = wait * 1000;
  }

  // Pass through options
  cmdOpts.in = options.in;
  cmdOpts.out = options.out;
  cmdOpts.err = options.err;

  // Use HTTP keep-alive to avoid unnecessary reconnections
  cmdOpts.requestOpts = {
    forever: true,
  };

  if (cmdOpts.insecure) {
    cmdOpts.requestOpts.strictSSL = false;
  }

  travisStatus(cmdOpts, (err, build) => {
    if (err && err.name === 'SlugDetectionError') {
      debug('Error detecting repo slug', err);
      options.err.write(chalk.red(
        'Can\'t figure out GitHub repo name. '
        + 'Ensure you\'re in the repo directory, or specify the repo name via '
        + 'the -r option (e.g. travis-status -r <owner>/<repo>)\n',
      ));
      // Use null to preserve current API
      // eslint-disable-next-line unicorn/no-null
      callback(null, 1);
      return;
    }

    if (err) {
      options.err.write(`${chalk.red(err.message)}\n`);
      // Use null to preserve current API
      // eslint-disable-next-line unicorn/no-null
      callback(null, 1);
      return;
    }

    const state = build.repo ? build.repo.last_build_state : build.branch.state;

    if (!cmdOpts.quiet) {
      const color = stateInfo.colors[state] || 'yellow';
      const number =
        build.repo ? build.repo.last_build_number : build.branch.number;
      options.out.write(`build #${number} ${chalk[color](state)
      }\n`);
    }

    let code = 0;
    if ((cmdOpts.exitCode && stateInfo.isUnsuccessful[state])
        || (cmdOpts.failPending && stateInfo.isPending[state])) {
      code = 1;
    }

    // Use null to preserve current API
    // eslint-disable-next-line unicorn/no-null
    callback(null, code);
  });

  return undefined;
}

module.exports = travisStatusCmd;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  const mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr,
  };
  travisStatusCmd(process.argv, mainOptions, (err, code) => {
    if (err) {
      if (err.stdout) { process.stdout.write(err.stdout); }
      if (err.stderr) { process.stderr.write(err.stderr); }
      process.stderr.write(`${err.name}: ${err.message}\n`);

      code = typeof err.code === 'number' ? err.code : 1;
    }

    process.exit(code);
  });
}
