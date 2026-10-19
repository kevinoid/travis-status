/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { debuglog } = require('node:util');

const { Chalk } = require('chalk'); // eslint-disable-line unicorn/import-style

const git = require('./git.js');
const InvalidSlugError = require('./invalid-slug-error.js');
const Shortline = require('./shortline.js');
const SlugDetectionError = require('./slug-detection-error.js');

const debug = debuglog('travis-status:git-status-checker');

/** Gets the pathname portion of a git URL.
 *
 * @param {string} gitUrl Git URL to parse.
 * @returns {string} Pathname portion of the URL.
 * @private
 */
function gitUrlPathname(gitUrl) {
  // Strip explicit transport from "foreign URL"
  // See https://git-scm.com/docs/git-remote-helpers
  // Matches parsing in transport_get in transport.c
  gitUrl = gitUrl.replace(/^[A-Za-z0-9][A-Za-z0-9+.-]*::/, '');

  // Try parsing as a typical URL
  try {
    return new URL(gitUrl).pathname;
  } catch {
    // Invalid URL, continue
  }

  // Try SCP-like syntax.  Host can be wrapped in [] to disambiguate path.
  // See parse_connect_url and host_end in connect.c
  const scpParts = /^[^@/]+@(?:\[[\s\S]\/\]{2,}|[^:/]+):(.*)$/.exec(gitUrl);
  if (scpParts) {
    return scpParts[1];
  }

  // Assume URL is a local path
  return gitUrl;
}

/** Options for {@link GitStatusChecker}.
 *
 * @typedef {{
 *   err: module:stream.Writable|undefined,
 *   in: module:stream.Readable|undefined,
 *   interactive: boolean|undefined,
 *   out: module:stream.Writable|undefined
 * }} GitStatusCheckerOptions
 * @property {module:stream.Writable=} err Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 * @property {module:stream.Readable=} in Stream from which input is read.
 * (default: <code>process.stdin</code>)
 * @property {boolean=} interactive Be interactive and colorful
 * @property {module:stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 */
// var GitStatusCheckerOptions;

/** A status checker for the current git repository. */
class GitStatusChecker {
  /** Message returned when the repository slug is invalid.
   *
   * @constant
   */
  static SLUG_INVALID =
    'GitHub repo name is invalid, it should be on the form \'owner/repo\'';

  /** RegExp used to test the validity of a repository slug.
   * Note:  travis.rb only checks for a '/' character, but GitHub currently
   * requires only ASCII letters, numbers, '.', and '-'.  Choose a middle ground
   * which catches likely erroneous names.
   *
   * @constant
   */
  static SLUG_VALID_RE = /^[^\s/]+\/[^\s/]+$/;

  /** Git configuration option name in which the Travis CI slug is stored.
   *
   * @constant
   */
  static SLUG_CONFIG_NAME = 'travis.slug';

  /** Checks that a repository slug has the correct format.
   *
   * @param {string} slug Slug to check.
   * @returns {string} <code>slug</code>.
   * @throws {InvalidSlugError} If <code>slug</code> does not have the correct
   * format.
   * @private
   */
  static checkSlugFormat(slug) {
    if (!GitStatusChecker.SLUG_VALID_RE.test(slug)) {
      const err = new InvalidSlugError(GitStatusChecker.SLUG_INVALID);
      err.slug = slug;
      throw err;
    }
    return slug;
  }

  /** Constructs a status checker for the current git repository.
   *
   * @param {GitStatusCheckerOptions=} options Options.
   */
  constructor(options) {
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

  /** Resolves a named git commit to its hash id.
   *
   * @param {string} commitName Name of the commit (branch, tag, etc.) for which
   * to get the hash.  Can be a hash, which resolves to itself.
   * @returns {!Promise<string>} Hash for <code>commitName</code>, or Error if
   * <code>commitName</code> does not name a commit.
   * @private
   */
  async resolveHash(commitName) {
    const [stdout] = await git('rev-parse', '--verify', commitName);
    return stdout.trimEnd();
  }

  /** Stores a repository slug as <code>travis.slug</code> in the local git
   * config.
   *
   * @param {string} slug Slug to store.
   * @returns {!Promise<string>} Promise with <code>slug</code>.
   * @private
   */
  async storeSlug(slug) {
    GitStatusChecker.checkSlugFormat(slug);
    await git('config', GitStatusChecker.SLUG_CONFIG_NAME, slug);
    return slug;
  }

  /** Tries to store a repository slug as <code>travis.slug</code> in the local
   * git config, prints an error on failure.
   *
   * @param {string} slug Slug to store.
   * @returns {!Promise<string>} Promise with <code>slug</code>, never
   * <code>Error</code>.
   * @private
   */
  async tryStoreSlug(slug) {
    const { err } = this._options;
    try {
      return await this.storeSlug(slug);
    } catch (errStore) {
      err.write(`Error storing slug in git config: ${errStore}`);
      return slug;
    }
  }

  /** Prompts the user to confirm that a repository slug is correct.
   *
   * @param {string} slug Slug to prompt about.
   * @returns {!Promise<string>} Promise with correct <code>slug</code>.
   * @private
   */
  async confirmSlug(slug) {
    const shortline = new Shortline({
      input: this._options.in,
      output: this._options.err,
    });
    const question = `Detected repository as ${this._chalk.yellow(slug)
    } is this correct? `;
    const correct = await shortline.agree(question);
    if (correct) {
      return slug;
    }

    // Note:  travis.rb accepts an invalid slug here then errors out after
    // storing it in .git/config.  We re-prompt until valid.
    return await shortline.ask('Repository slug (owner/name): ', {
      default: slug,
      responses: {
        notValid: GitStatusChecker.SLUG_INVALID,
      },
      trim: true,
      validate: GitStatusChecker.SLUG_VALID_RE,
    });
  }

  /** Detects the current branch the current repository.
   *
   * @returns {!Promise<string>} The name of the current branch in the current
   * repository, or Error.
   * @private
   */
  async detectBranch() {
    try {
      const [stdout] = await git('symbolic-ref', '-q', '--short', 'HEAD');
      return stdout.trimEnd();
    } catch (err) {
      const errMsg = `Unable to determine current branch: ${
        err.stderr || 'detached HEAD'}`;
      throw new Error(errMsg);
    }
  }

  /** Detects the repository slug for the current repository.
   *
   * @returns {!Promise<string>} The slug value for the current repository.
   * @private
   */
  async detectSlug() {
    let remoteName;
    try {
      const branch = await this.detectBranch();
      const configName = `branch.${branch}.remote`;

      const [configStdout] = await git('config', '--get', configName);
      remoteName = configStdout.trimEnd();
    } catch (err) {
      debug('Unable to get remote for current branch', err);
      remoteName = 'origin';
    }

    const [stdout] = await git('ls-remote', '--get-url', remoteName);
    const remoteUrl = stdout.trimEnd();
    // ls-remote prints its argument when it doesn't have a URL
    if (remoteUrl === remoteName) {
      throw new SlugDetectionError(
        `No URL for '${remoteName}' remote`,
      );
    }

    const path = gitUrlPathname(remoteUrl);
    const match = /^\/?([^/]+\/[^/]+?)(?:\/?\.git)?$/.exec(path);
    if (!match) {
      throw new SlugDetectionError(
        `Unable to extract slug from URL <${remoteUrl}>`,
      );
    }

    const slug = match[1];
    if (this._options.interactive) {
      return await this.confirmSlug(slug);
    }

    this._options.err.write(`detected repository as ${
      this._chalk.bold(slug)}\n`);
    return slug;
  }

  /** Loads the repository slug from <code>travis.slug</code> in the git config.
   *
   * @returns {!Promise<?string>} The slug value for the current repository, or
   * <code>null</code> if not configured.
   * @private
   */
  async loadSlug() {
    try {
      const [stdout] =
        await git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME);
      return stdout.trimEnd();
    } catch (err) {
      // git config exits with code 1 if the configuration value is not set
      if (err.code === 1) {
        // Note: Use null to preserve current API.
        // eslint-disable-next-line unicorn/no-null
        return null;
      }

      throw err;
    }
  }

  /** Finds the repository slug for the current repository by either loading it
   * from the stored configuration or detecting it from the current repository,
   * stores it if confirmed interactively.
   *
   * @returns {!Promise<string>} The slug value for the current repository.
   * @private
   */
  async findSlug() {
    const slug = await this.loadSlug();
    if (slug) {
      return slug;
    }

    return await this.detectSlug();
  }
}

module.exports = GitStatusChecker;
