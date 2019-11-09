/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const Chalk = require('chalk').Instance;
const util = require('util');
// TODO [engine:node@>=10]: Use URL defined globally
const { URL } = require('url'); // eslint-disable-line no-shadow

const InvalidSlugError = require('./invalid-slug-error');
const Shortline = require('./shortline');
const SlugDetectionError = require('./slug-detection-error');
const git = require('./git');

const debug = util.debuglog('travis-status:git-status-checker');

/** Gets the right-trimmed stdout result of <code>execFileP</code>.
 * @param {!Array<string>} result Result Array from <code>execFileP</code>
 * @return {string} The first element of <code>result</code>, right-trimed.
 * @private
 */
function getTrimmedStdout(result) {
  return result[0].trimRight();
}

/** Options for {@link GitStatusChecker}.
 *
 * @typedef {{
 *   err: stream.Writable|undefined,
 *   in: stream.Readable|undefined,
 *   interactive: boolean|undefined,
 *   out: stream.Writable|undefined
 * }} GitStatusCheckerOptions
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 * @property {stream.Readable=} in Stream from which input is read. (default:
 * <code>process.stdin</code>)
 * @property {boolean=} interactive Be interactive and colorful
 * @property {stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 */
// var GitStatusCheckerOptions;

/** Creates a status checker for the current git repository.
 *
 * @constructor
 * @param {GitStatusCheckerOptions=} options Options.
 */
function GitStatusChecker(options) {
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

  this._options = options;
  this._chalk = new Chalk({
    level:
      options.interactive === true ? 1
        : options.interactive === false ? 0
          : options.out.isTTY ? 1
            : 0,
  });
}

/** Message returned when the repository slug is invalid.
 * @const
 */
GitStatusChecker.SLUG_INVALID =
  'GitHub repo name is invalid, it should be on the form \'owner/repo\'';

/** RegExp used to test the validity of a repository slug.
 * Note:  travis.rb only checks for a '/' character, but GitHub currently
 * requires only ASCII letters, numbers, '.', and '-'.  Choose a middle ground
 * which catches likely erroneous names.
 * @const
 */
GitStatusChecker.SLUG_VALID_RE = /^[^\s/]+\/[^\s/]+$/;

/** Git configuration option name in which the Travis CI slug is stored.
 * @const
 */
GitStatusChecker.SLUG_CONFIG_NAME = 'travis.slug';

/** Checks that a repository slug has the correct format.
 * @param {string} slug Slug to check.
 * @return {string} <code>slug</code>.
 * @throws {InvalidSlugError} If <code>slug</code> does not have the correct
 * format.
 * @private
 */
GitStatusChecker.checkSlugFormat = function checkSlugFormat(slug) {
  if (!GitStatusChecker.SLUG_VALID_RE.test(slug)) {
    const err = new InvalidSlugError(GitStatusChecker.SLUG_INVALID);
    err.slug = slug;
    throw err;
  }
  return slug;
};

/** Resolves a named git commit to its hash id.
 * @param {string} commitName Name of the commit (branch, tag, etc.) for which
 * to get the hash.  Can be a hash, which resolves to itself.
 * @return {!Promise<string>} Hash for <code>commitName</code>, or Error if
 * <code>commitName</code> does not name a commit.
 * @private
 */
GitStatusChecker.prototype.resolveHash = function resolveHash(commitName) {
  return git('rev-parse', '--verify', commitName)
    .then(getTrimmedStdout);
};

/** Stores a repository slug as <code>travis.slug</code> in the local git
 * config.
 * @param {string} slug Slug to store.
 * @return {!Promise<string>} Promise with <code>slug</code>.
 * @private
 */
GitStatusChecker.prototype.storeSlug = function storeSlug(slug) {
  try {
    GitStatusChecker.checkSlugFormat(slug);
  } catch (err) {
    return Promise.reject(err);
  }

  return git('config', GitStatusChecker.SLUG_CONFIG_NAME, slug)
    .then(() => slug);
};

/** Tries to store a repository slug as <code>travis.slug</code> in the local
 * git config, prints an error on failure.
 * @param {string} slug Slug to store.
 * @return {!Promise<string>} Promise with <code>slug</code>, never
 * <code>Error</code>.
 * @private
 */
GitStatusChecker.prototype.tryStoreSlug = function tryStoreSlug(slug) {
  const { err } = this._options;
  return this.storeSlug(slug)
    .catch((errStore) => {
      err.write(`Error storing slug in git config: ${errStore}`);
      return slug;
    });
};

/** Prompts the user to confirm that a repository slug is correct.
 * @param {string} slug Slug to prompt about.
 * @return {!Promise<string>} Promise with correct <code>slug</code>.
 * @private
 */
GitStatusChecker.prototype.confirmSlug = function confirmSlug(slug) {
  const shortline = new Shortline({
    input: this._options.in,
    output: this._options.err,
  });
  const question = `Detected repository as ${this._chalk.yellow(slug)
  } is this correct? `;
  return shortline.agree(question)
    .then((correct) => {
      if (correct) {
        return slug;
      }

      // Note:  travis.rb accepts an invalid slug here then errors out after
      // storing it in .git/config.  We re-prompt until valid.
      return shortline.ask('Repository slug (owner/name): ', {
        default: slug,
        responses: {
          notValid: GitStatusChecker.SLUG_INVALID,
        },
        trim: true,
        validate: GitStatusChecker.SLUG_VALID_RE,
      });
    });
};

/** Detects the current branch the current repository.
 * @return {!Promise<string>} The name of the current branch in the current
 * repository, or Error.
 * @private
 */
GitStatusChecker.prototype.detectBranch = function detectBranch() {
  return git('symbolic-ref', '-q', '--short', 'HEAD')
    .then(
      getTrimmedStdout,
      (err) => {
        const errMsg = `Unable to determine current branch: ${
          err.stderr || 'detached HEAD'}`;
        return Promise.reject(new Error(errMsg));
      },
    );
};

/** Gets the pathname portion of a git URL.
 * @param {string} gitUrl Git URL to parse.
 * @return {string} Pathname portion of the URL.
 * @private
 */
function gitUrlPathname(gitUrl) {
  // Strip explicit transport from "foreign URL"
  // See https://git-scm.com/docs/git-remote-helpers
  // Matches parsing in transport_get in transport.c
  gitUrl = gitUrl.replace(/^([A-Za-z0-9][A-Za-z0-9+.-]*)::/, '');

  // Try parsing as a typical URL
  try {
    return new URL(gitUrl).pathname;
  } catch (err) {
    // Invalid URL, continue
  }

  // Try SCP-like syntax.  Host can be wrapped in [] to disambiguate path.
  // See parse_connect_url and host_end in connect.c
  const scpParts = /^([^@/]+)@(\[[^]\/]+\]|[^:/]+):(.*)$/.exec(gitUrl);
  if (scpParts) {
    return scpParts[3];
  }

  // Assume URL is a local path
  return gitUrl;
}

/** Detects the repository slug for the current repository.
 * @return {!Promise<string>} The slug value for the current repository.
 * @private
 */
GitStatusChecker.prototype.detectSlug = function detectSlug() {
  const self = this;
  const slugP = this.detectBranch()
    .then((branch) => {
      const configName = `branch.${branch}.remote`;
      return git('config', '--get', configName)
        .then(getTrimmedStdout);
    })
    .catch((err) => {
      debug('Unable to get remote for current branch', err);
      return 'origin';
    })
    .then((remoteName) => git('ls-remote', '--get-url', remoteName)
      .then(getTrimmedStdout)
      .then((remoteUrl) => {
        // ls-remote prints its argument when it doesn't have a URL
        if (remoteUrl === remoteName) {
          return Promise.reject(new SlugDetectionError(
            `No URL for '${remoteName}' remote`,
          ));
        }
        return remoteUrl;
      }))
    .then((remoteUrl) => {
      const path = gitUrlPathname(remoteUrl);
      const match = /([^/]+\/[^/]+?)(?:\/?\.git)?$/.exec(path);
      return match
        ? match[1]
        : Promise.reject(new SlugDetectionError(
          `Unable to extract slug from URL <${remoteUrl}>`,
        ));
    });

  return slugP.then((slug) => {
    if (self._options.interactive) {
      return self.confirmSlug(slug);
    }

    self._options.err.write(`detected repository as ${
      self._chalk.bold(slug)}\n`);
    return slug;
  });
};

/** Loads the repository slug from <code>travis.slug</code> in the git config.
 * @return {!Promise<?string>} The slug value for the current repository, or
 * <code>null</code> if not configured.
 * @private
 */
GitStatusChecker.prototype.loadSlug = function loadSlug() {
  return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
    .then(
      getTrimmedStdout,
      // git config exits with code 1 if the configuration value is not set
      (err) => (err.code === 1 ? null : Promise.reject(err)),
    );
};

/** Finds the repository slug for the current repository by either loading it
 * from the stored configuration or detecting it from the current repository,
 * stores it if confirmed interactively.
 * @return {!Promise<string>} The slug value for the current repository.
 * @private
 */
GitStatusChecker.prototype.findSlug = function findSlug() {
  const self = this;
  return this.loadSlug().then((slug) => {
    if (slug) {
      return slug;
    }

    return self.detectSlug();
  });
};


module.exports = GitStatusChecker;
