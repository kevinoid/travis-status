/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var Chalk = require('chalk').constructor;
var InvalidSlugError = require('./invalid-slug-error');
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var Shortline = require('./shortline');
var SlugDetectionError = require('./slug-detection-error');
var debug = require('debug')('travis-status:git-status-checker');
var extend = require('extend');
var git = require('./git');
var url = require('url');

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

  this._options = options;
  this._chalk = new Chalk({
    enabled: options.interactive !== undefined ?
      options.interactive :
      options.out.isTTY
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
GitStatusChecker.SLUG_VALID_RE = /^[^\s\/]+\/[^\s\/]+$/;

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
    var err = new InvalidSlugError(GitStatusChecker.SLUG_INVALID);
    err.slug = slug;
    throw err;
  }
  return slug;
};

/** Resolves a named git commit to its hash id.
 * @param {string} commitName Name of the commit (branch, tag, etc.) for which
 * to get the hash.  Can be a hash, which resolves to itself.
 * @return {!Promise<string>} Hash for <code>commitName</code>.
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
    .then(function() { return slug; });
};

/** Tries to store a repository slug as <code>travis.slug</code> in the local
 * git config, prints an error on failure.
 * @param {string} slug Slug to store.
 * @return {!Promise<string>} Promise with <code>slug</code>, never
 * <code>Error</code>.
 * @private
 */
GitStatusChecker.prototype.tryStoreSlug = function tryStoreSlug(slug) {
  var err = this._options.err;
  return this.storeSlug(slug)
    .catch(function logError(errStore) {
      err.write('Error storing slug in git config: ' + errStore);
      return slug;
    });
};

/** Prompts the user to confirm that a repository slug is correct.
 * @param {string} slug Slug to prompt about.
 * @return {!Promise<string>} Promise with correct <code>slug</code>.
 * @private
 */
GitStatusChecker.prototype.confirmSlug = function confirmSlug(slug) {
  var shortline = new Shortline({
    input: this._options.in,
    output: this._options.err
  });
  var question = 'Detected repository as ' + this._chalk.yellow(slug) +
    ' is this correct? ';
  return shortline.agree(question)
    .then(function promptIfIncorrect(correct) {
      if (correct) {
        return slug;
      }

      // Note:  travis.rb accepts an invalid slug here then errors out after
      // storing it in .git/config.  We re-prompt until valid.
      return shortline.ask('Repository slug (owner/name): ', {
        default: slug,
        responses: {
          notValid: GitStatusChecker.SLUG_INVALID
        },
        trim: true,
        validate: GitStatusChecker.SLUG_VALID_RE
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
      function(err) {
        var errMsg = 'Unable to determine current branch: ' +
          (err.stderr || 'detached HEAD');
        return Promise.reject(new Error(errMsg));
      }
    );
};

/** Gets the path portion of a git URL.
 * @param {string} gitUrl Git URL to parse.
 * @return {string} Path portion of the URL.
 * @private
 */
function gitUrlPath(gitUrl) {
  // Foreign URL for remote helper
  // See transport_get in transport.c
  // Note:  url.parse considers second : as part of path.  So check this first.
  var foreignParts = /^([A-Za-z0-9][A-Za-z0-9+.-]*)::(.*)$/.exec(gitUrl);
  if (foreignParts) {
    return foreignParts[2];
  }

  // Typical URL
  var gitUrlObj = url.parse(gitUrl);
  if (gitUrlObj.protocol) {
    return gitUrlObj.path;
  }

  // SCP-like syntax.  Host can be wrapped in [] to disambiguate path.
  // See parse_connect_url and host_end in connect.c
  var scpParts = /^([^@\/]+)@(\[[^]\/]+\]|[^:\/]+):(.*)$/.exec(gitUrl);
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
  var self = this;
  var slugP = this.detectBranch()
    .then(function getBranchRemote(branch) {
      var configName = 'branch.' + branch + '.remote';
      return git('config', '--get', configName)
        .then(getTrimmedStdout);
    })
    .catch(function getDefaultRemote(err) {
      debug('Unable to get remote for current branch', err);
      return 'origin';
    })
    .then(function getRemoteUrl(remoteName) {
      // Note:  ls-remote defaulted to origin since 2010 (git/git@cefb2a5e)
      // then the remote for the current branch since 2015 (git/git@da66b274)
      // The man page was fixed to note defaulting in 2016 (git/git@80b17e58)
      // Can remote remote name determination when using git v2.5.0 or later
      return git('ls-remote', '--get-url', remoteName)
        .then(getTrimmedStdout)
        .then(function checkUrl(remoteUrl) {
          // ls-remote prints its argument when it doesn't have a URL
          if (remoteUrl === remoteName) {
            return Promise.reject(new SlugDetectionError(
              'No URL for \'' + remoteName + '\' remote'
            ));
          }
          return remoteUrl;
        });
    })
    .then(function extractSlug(remoteUrl) {
      var path = gitUrlPath(remoteUrl);
      var match = /([^\/]+\/[^\/]+?)(?:\/?\.git)?$/.exec(path);
      return match ?
        match[1] :
        Promise.reject(new SlugDetectionError(
          'Unable to extract slug from URL <' + remoteUrl + '>'
        ));
    });

  return slugP.then(function confirmOrNotify(slug) {
    if (self._options.interactive) {
      return self.confirmSlug(slug);
    }

    self._options.err.write('detected repository as ' +
        self._chalk.bold(slug) + '\n');
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
        function(err) { return err.code === 1 ? null : Promise.reject(err); }
    );
};

/** Finds the repository slug for the current repository by either loading it
 * from the stored configuration or detecting it from the current repository,
 * stores it if confirmed interactively.
 * @return {!Promise<string>} The slug value for the current repository.
 * @private
 */
GitStatusChecker.prototype.findSlug = function findSlug() {
  var self = this;
  return this.loadSlug().then(function(slug) {
    if (slug) {
      return slug;
    }

    return self.detectSlug();
  });
};


module.exports = GitStatusChecker;