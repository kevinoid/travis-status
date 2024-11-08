/**
 * @copyright Copyright 2016-2020 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module travis-status
 */

'use strict';

const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');

const nodeify = require('promise-nodeify');

const GitStatusChecker = require('./lib/git-status-checker.js');
const TravisStatusChecker = require('./lib/travis-status-checker.js');

/** Checks that a build has an expected commit hash.
 *
 * @param {!{commit:!{sha: string}}} build Build (or branch) object returned
 * by the Travis CI API.
 * @param {!{sha: string, name: ?string}} localCommit Expected commit
 * information.
 * @returns {!object} <code>build</code>
 * @throws AssertionError If <code>build.commit.sha</code> is not equal to
 * <code>expected</code>.
 */
function checkBuildCommit(build, localCommit) {
  const buildCommit = build.commit;
  let message = `Build commit ${buildCommit.sha
  } does not match ${localCommit.sha}`;
  if (localCommit.name) {
    message += ` (${localCommit.name})`;
  }
  // assert gives us useful exception properties for callers
  assert.strictEqual(
    buildCommit.sha,
    localCommit.sha,
    message,
  );
  return build;
}

/** Options for {@link travisStatus}.
 *
 * @typedef {{
 *   apiEndpoint: string|undefined,
 *   branch: string|boolean|undefined,
 *   commit: string|undefined,
 *   err: module:stream.Writable|undefined,
 *   in: module:stream.Readable|undefined,
 *   out: module:stream.Writable|undefined,
 *   repo: string|undefined,
 *   requestOpts: object|undefined,
 *   storeRepo: string|undefined,
 *   token: string|undefined,
 *   wait: number|undefined
 * }} TravisStatusOptions
 * @property {boolean=} interactive behave as if being run interactively
 * @property {string=} apiEndpoint Travis API server to talk to
 * @property {(string|boolean)=} branch query latest build for named branch,
 * or the current branch
 * @property {string=} commit require build to be for a specific commit
 * @property {module:stream.Writable=} err Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 * @property {module:stream.Readable=} in Stream from which input is read.
 * (default: <code>process.stdin</code>)
 * @property {module:stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {string=} repo repository to use (default: will try to detect from
 * current git clone)
 * @property {object=} requestOpts Options for Travis CI API requests (suitable
 * for the {@link https://www.npmjs.com/package/request request module}).
 * Callers are encouraged to pass the <code>agent</code> or
 * <code>forever</code> options to leverage TCP keep-alive across requests.
 * @property {string=} storeRepo repository value (as described for
 * <code>repo</code>) to store permanently for future use.  Is used for this
 * invocation if <code>repo</code> is not set.
 * @property {string=} token access token to use
 * @property {number=} wait wait if build is pending (timeout in milliseconds)
 */
// var TravisStatusOptions;

/** Gets the current Travis CI status of a repo/branch.
 *
 * @param {?TravisStatusOptions=} options Options.
 * @param {?function(Error, object=)=} callback Callback function called
 * with the current build information from the Travis CI API, or an
 * <code>Error</code> if it could not be retrieved.
 * @returns {!Promise<!object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the current build information from the Travis CI
 * API, or <code>Error</code> if it could not be retrieved.
 * Otherwise <code>undefined</code>.
 */
function travisStatus(options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (callback && typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  let agent, gitChecker, travisChecker;
  try {
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
    options ||= {};

    if (options.repo) {
      GitStatusChecker.checkSlugFormat(options.repo);
    }
    if (options.storeRepo) {
      GitStatusChecker.checkSlugFormat(options.storeRepo);
    }

    // If the caller didn't request an agent behavior, control it ourselves.
    // Each function call will use HTTP keep-alive for the duration of the
    // function, but not after completion, which callers may not expect.
    let { requestOpts } = options;
    if (!requestOpts
        || (requestOpts.agent === undefined
         && requestOpts.agentClass === undefined
         && requestOpts.agentOptions === undefined
         && requestOpts.forever === undefined
         && requestOpts.pool === undefined)) {
      const apiUrl =
        new URL(options.apiEndpoint || TravisStatusChecker.ORG_URI);
      const Agent = apiUrl.protocol === 'https:' ? https.Agent
        : apiUrl.protocol === 'http:' ? http.Agent
          : undefined;
      if (Agent) {
        agent = new Agent({ keepAlive: true });
        // .destroy() and keepAlive added to Agent in 0.11.4, nodejs@9fc9b874
        // If Agent doesn't support keepAlive/destroy, we don't need/want it.
        if (typeof agent.destroy === 'function') {
          requestOpts = { ...requestOpts };
          requestOpts.agent = agent;
          options = { ...options };
          options.requestOpts = requestOpts;
        } else {
          agent = undefined;
        }
      }
    }

    gitChecker = new GitStatusChecker(options);
    travisChecker = new TravisStatusChecker(options);
  } catch (errOptions) {
    const errResult = Promise.reject(errOptions);
    return nodeify(errResult, callback);
  }

  let repoSlugP;
  if (options.storeRepo) {
    const storedSlugP = gitChecker.tryStoreSlug(options.storeRepo);
    // If both .repo and .storeRepo are present, store .storeRepo and use .repo
    repoSlugP =
      options.repo ? storedSlugP.then(() => options.repo)
        : storedSlugP;
  } else if (options.repo) {
    repoSlugP = Promise.resolve(options.repo);
  } else {
    const foundSlugP = gitChecker.findSlug()
      .then(GitStatusChecker.checkSlugFormat);
    if (options.interactive) {
      repoSlugP = foundSlugP.then((slug) => gitChecker.tryStoreSlug(slug));
    } else {
      repoSlugP = foundSlugP;
    }
  }

  let localCommitP;
  if (options.commit) {
    localCommitP = gitChecker.resolveHash(options.commit)
      .then((resolved) => {
        const localCommit = { sha: resolved };
        if (resolved !== options.commit) {
          localCommit.name = options.commit;
        }
        return localCommit;
      });
  }

  // Before doing remote queries, ensure that there are no errors locally
  const slugForQueryP = Promise.all([repoSlugP, localCommitP])
    .then((slugAndHash) => slugAndHash[0]);

  let resultP;
  if (options.branch) {
    const branchP = options.branch === true ? gitChecker.detectBranch()
      : Promise.resolve(options.branch);
    resultP = Promise.all([slugForQueryP, branchP])
      .then((results) => {
        const slug = results[0];
        const branch = results[1];
        return travisChecker.getBranch(slug, branch, options);
      });
  } else {
    const repoP =
      slugForQueryP.then((slug) => travisChecker.getRepo(slug, options));

    if (localCommitP) {
      // Add build information to result
      resultP = repoP.then((repo) => travisChecker.getBuild(
        repo.repo.slug,
        repo.repo.last_build_id,
      )
        .then((build) => ({ ...repo, ...build })));
    } else {
      resultP = repoP;
    }
  }

  let checkedResultP = resultP;
  if (localCommitP) {
    checkedResultP = Promise.all([resultP, localCommitP])
      .then((all) => {
        const result = all[0];
        const localCommit = all[1];
        checkBuildCommit(result, localCommit);
        return result;
      });
  }

  let cleanupP;
  if (agent) {
    cleanupP = checkedResultP.then(
      (result) => { agent.destroy(); return result; },
      (err) => { agent.destroy(); throw err; },
    );
  } else {
    cleanupP = checkedResultP;
  }

  return nodeify(cleanupP, callback);
}

module.exports = travisStatus;
module.exports.ORG_URI = TravisStatusChecker.ORG_URI;
module.exports.PRO_URI = TravisStatusChecker.PRO_URI;
module.exports.GitStatusChecker = GitStatusChecker;
module.exports.TravisStatusChecker = TravisStatusChecker;
