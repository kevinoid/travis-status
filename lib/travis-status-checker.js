/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const Travis = require('travis-ci');

const TravisStatusHttp = require('./travis-status-http.js');
const constants = require('./constants.js');
const stateInfo = require('./state-info.js');
const trimSlash = require('./trim-slash.js');

/** Time to wait before polling status on first retry (subsequent retries use
 * truncated exponential backoff) in milliseconds.
 *
 * @constant
 * @private
 */
const POLL_TIME_START_MS = 4000;

/** Maximum amount of time to wait between each status request when polling.
 *
 * @constant
 * @private
 */
const POLL_TIME_MAX_MS = 60000;

/** Options for {@link TravisStatusChecker}.
 *
 * @typedef {{
 *   apiEndpoint: string|undefined,
 *   requestOpts: object|undefined,
 *   token: string|undefined
 * }} TravisStatusCheckerOptions
 * @property {string=} apiEndpoint Travis API server to talk to
 * @property {object=} requestOpts Options for Travis CI API requests (suitable
 * for the {@link https://www.npmjs.com/package/request request module}).
 * Callers are encouraged to pass the <code>agent</code> or
 * <code>forever</code> options to leverage TCP keep-alive across requests.
 * @property {string=} token access token to use for Travis CI API requests
 */
// var TravisStatusCheckerOptions;

/** Creates a status checker for Travis CI.
 *
 * @class
 * @param {TravisStatusCheckerOptions=} options Options.
 */
function TravisStatusChecker(options) {
  if (options && typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  options ||= {};

  const apiEndpoint = options.apiEndpoint && trimSlash(options.apiEndpoint);
  this._travis = new Travis({
    pro: apiEndpoint === constants.PRO_URI,
    version: '2.0.0',
  });
  this._travis.agent = new TravisStatusHttp(apiEndpoint, options.requestOpts);
  if (options.token) {
    this._travis.agent.setAccessToken(options.token);
  }
}

function branchIsPending(branch) {
  return stateInfo.isPending[branch.branch.state];
}

function buildIsPending(build) {
  return stateInfo.isPending[build.build.state];
}

function repoIsPending(repo) {
  return stateInfo.isPending[repo.repo.last_build_state];
}

/** Options for {@link TravisStatusQueryOptions}.
 *
 * @typedef {{
 *   wait: number|undefined
 * }} TravisStatusQueryOptions
 * @property {number=} wait The maximum amount of time during which to retry
 * while the response is pending (in milliseconds). (default: no retry)
 */
// var TravisStatusQueryOptions;

/** Performs a travis-ci query, retrying while pending, up to a given wait
 * time.
 *
 * @param {!{get: function(function(Error, object))}} query
 * <code>travis-ci</code> resource to query.
 * @param {(function(!object): boolean)=} valueIsPending Function which
 * determines if an API value is considered to be pending for retry purposes.
 * @param {TravisStatusQueryOptions=} options Query options.
 * @returns {Promise<!object>} Promise with the response content or Error.
 * @private
 */
function queryWithWait(query, valueIsPending, options) {
  const maxWaitMs = options && options.wait ? Number(options.wait) : 0;
  if (Number.isNaN(maxWaitMs)) {
    return Promise.reject(new TypeError('wait must be a number'));
  }
  if (maxWaitMs < 0) {
    return Promise.reject(new RangeError('wait must be non-negative'));
  }

  const startMs = Date.now();
  // Note:  Divide by 2 so we can double unconditionally below
  let nextWaitMs = POLL_TIME_START_MS / 2;

  function doQuery(cb) {
    query.get(cb);
  }

  return new Promise((resolve, reject) => {
    function checkBuild(err, result) {
      if (err) {
        reject(err);
        return;
      }

      if (maxWaitMs) {
        let isPending;
        try {
          isPending = valueIsPending(result);
        } catch (errPending) {
          reject(errPending);
          return;
        }

        if (isPending) {
          const nowMs = Date.now();
          const totalWaitMs = nowMs - startMs;
          if (totalWaitMs < maxWaitMs) {
            nextWaitMs = Math.min(
              nextWaitMs * 2,
              POLL_TIME_MAX_MS,
              maxWaitMs - totalWaitMs,
            );
            setTimeout(doQuery, nextWaitMs, checkBuild);
            return;
          }
        }
      }

      resolve(result);
    }

    doQuery(checkBuild);
  });
}

/** Gets the Travis CI branch information for a given branch and repo name.
 *
 * @param {string} repoName Travis repository name to query (e.g. owner/repo).
 * @param {string} branchName Branch name to query.
 * @param {TravisStatusQueryOptions=} options Query options.
 * @returns {Promise<!object>} Promise with the response content or Error.
 */
TravisStatusChecker.prototype.getBranch = function getBranch(
  repoName,
  branchName,
  options,
) {
  const queryBranch = this._travis.repos(repoName).branches(branchName);
  return queryWithWait(queryBranch, branchIsPending, options);
};

/** Gets the Travis CI build information for a given build.
 *
 * @param {string} repoName Travis repository name to query (e.g. owner/repo).
 * @param {string} buildId ID of the build to query.
 * @param {TravisStatusQueryOptions=} options Query options.
 * @returns {Promise<!object>} Promise with the response content or Error.
 */
TravisStatusChecker.prototype.getBuild = function getBuild(
  repoName,
  buildId,
  options,
) {
  // Note:  travis-ci doesn't expose /repos/{repository.id}/builds/{build.id}
  // Use /builds/{build.id} instead
  const queryBuild = this._travis.builds(buildId);
  return queryWithWait(queryBuild, buildIsPending, options);
};

/** Gets the Travis CI repository information for a given name.
 *
 * @param {string} repoName Travis repository name to query (e.g. owner/repo).
 * @param {TravisStatusQueryOptions=} options Query options.
 * @returns {Promise<!object>} Promise with the response content or Error.
 */
TravisStatusChecker.prototype.getRepo = function getRepo(repoName, options) {
  const queryRepo = this._travis.repos(repoName);
  return queryWithWait(queryRepo, repoIsPending, options);
};

/** Travis CI for open source API endpoint.
 * Same name/value as lib/travis/client.rb#ORG_URI.
 *
 * @constant
 */
TravisStatusChecker.ORG_URI = `${constants.ORG_URI}/`;

/** Travis Pro API endpoint.
 * Same name/value as lib/travis/client.rb#PRO_URI.
 *
 * @constant
 */
TravisStatusChecker.PRO_URI = `${constants.PRO_URI}/`;

module.exports = TravisStatusChecker;
