/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var GitStatusChecker = require('./lib/git-status-checker');
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var TravisStatusChecker = require('./lib/travis-status-checker');
var assert = require('assert');
var extend = require('extend');
var http = require('http');
var https = require('https');
var nodeify = require('promise-nodeify');
var url = require('url');

/** Checks that a build has an expected commit hash.
 * @param {!{commit:!{sha: string}}} build Build (or branch) object returned
 * by the Travis CI API.
 * @param {!{sha: string, name: ?string}} localCommit Expected commit
 * information.
 * @return {!Object} <code>build</code>
 * @throws AssertionError If <code>build.commit.sha</code> is not equal to
 * <code>expected</code>.
 */
function checkBuildCommit(build, localCommit) {
  var buildCommit = build.commit;
  var message = 'Build commit ' + buildCommit.sha +
    ' does not match ' + localCommit.sha;
  if (localCommit.name) {
    message += ' (' + localCommit.name + ')';
  }
  // assert gives us useful exception properties for callers
  assert.strictEqual(
      buildCommit.sha,
      localCommit.sha,
      message
  );
  return build;
}

/** Options for {@link travisStatus}.
 *
 * @typedef {{
 *   apiEndpoint: string|undefined,
 *   branch: string|boolean|undefined,
 *   commit: string|undefined,
 *   err: stream.Writable|undefined,
 *   in: stream.Readable|undefined,
 *   out: stream.Writable|undefined,
 *   repo: string|undefined,
 *   requestOpts: Object|undefined,
 *   storeRepo: string|undefined,
 *   token: string|undefined,
 *   wait: number|undefined
 * }} TravisStatusOptions
 * @property {boolean=} interactive behave as if being run interactively
 * @property {string=} apiEndpoint Travis API server to talk to
 * @property {(string|boolean)=} branch query latest build for named branch,
 * or the current branch
 * @property {string=} commit require build to be for a specific commit
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 * @property {stream.Readable=} in Stream from which input is read. (default:
 * <code>process.stdin</code>)
 * @property {stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {string=} repo repository to use (default: will try to detect from
 * current git clone)
 * @property {Object=} requestOpts Options for Travis CI API requests (suitable
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
 * @param {?function(Error, Object=)=} callback Callback function called
 * with the current build information from the Travis CI API, or an
 * <code>Error</code> if it could not be retrieved.
 * @return {!Promise<!Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the current build information from the Travis CI
 * API, or <code>Error</code> if it could not be retrieved.
 * Otherwise <code>undefined</code>.
 */
function travisStatus(options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (callback && typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  var agent, gitChecker, travisChecker;
  try {
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
    options = options || {};

    if (options.repo) {
      GitStatusChecker.checkSlugFormat(options.repo);
    }
    if (options.storeRepo) {
      GitStatusChecker.checkSlugFormat(options.storeRepo);
    }

    // If the caller didn't request an agent behavior, control it ourselves.
    // Each function call will use HTTP keep-alive for the duration of the
    // function, but not after completion, which callers may not expect.
    var requestOpts = options.requestOpts;
    if (!requestOpts ||
        (requestOpts.agent === undefined &&
         requestOpts.agentClass === undefined &&
         requestOpts.agentOptions === undefined &&
         requestOpts.forever === undefined &&
         requestOpts.pool === undefined)) {
      var apiUrl =
        url.parse(options.apiEndpoint || TravisStatusChecker.ORG_URI);
      // Agent keep-alive introduced in 0.11.4 nodejs@9fc9b874
      var nodeVer = process.version.replace(/^v/, '').split('.').map(Number);
      if ((apiUrl.protocol === 'https:' || apiUrl.protocol === 'http:') &&
          (nodeVer[0] > 0 ||
           (nodeVer[0] === 0 && nodeVer[1] > 11) ||
           (nodeVer[0] === 0 && nodeVer[1] === 11 && nodeVer[2] >= 4))) {
        var Agent = apiUrl.protocol === 'https:' ? https.Agent : http.Agent;
        agent = new Agent({keepAlive: true});
        requestOpts = extend({}, requestOpts);
        requestOpts.agent = agent;
        options = extend({}, options);
        options.requestOpts = requestOpts;
      }
    }

    gitChecker = new GitStatusChecker(options);
    travisChecker = new TravisStatusChecker(options);
  } catch (errOptions) {
    var errResult = Promise.reject(errOptions);
    return nodeify(errResult, callback);
  }

  var repoSlugP;
  if (options.storeRepo) {
    var storedSlugP = gitChecker.tryStoreSlug(options.storeRepo);
    // If both .repo and .storeRepo are present, store .storeRepo and use .repo
    repoSlugP =
      options.repo ? storedSlugP.then(function() { return options.repo; }) :
      storedSlugP;
  } else if (options.repo) {
    repoSlugP = Promise.resolve(options.repo);
  } else {
    var foundSlugP = gitChecker.findSlug()
      .then(GitStatusChecker.checkSlugFormat);
    if (options.interactive) {
      repoSlugP = foundSlugP.then(function(slug) {
        return gitChecker.tryStoreSlug(slug);
      });
    } else {
      repoSlugP = foundSlugP;
    }
  }

  var localCommitP;
  if (options.commit) {
    localCommitP = gitChecker.resolveHash(options.commit)
      .then(function hashToTravisCommit(resolved) {
        var localCommit = {sha: resolved};
        if (resolved !== options.commit) {
          localCommit.name = options.commit;
        }
        return localCommit;
      });
  }

  // Before doing remote queries, ensure that there are no errors locally
  var slugForQueryP = Promise.all([repoSlugP, localCommitP])
    .then(function(slugAndHash) { return slugAndHash[0]; });

  var resultP;
  if (options.branch) {
    var branchP = options.branch === true ? gitChecker.detectBranch() :
      Promise.resolve(options.branch);
    resultP = Promise.all([slugForQueryP, branchP])
      .then(function queryBranchFor(results) {
        var slug = results[0];
        var branch = results[1];
        return travisChecker.getBranch(slug, branch, options);
      });
  } else {
    var repoP = slugForQueryP.then(function queryRepoFor(slug) {
      return travisChecker.getRepo(slug, options);
    });

    if (localCommitP) {
      // Add build information to result
      resultP = repoP.then(function queryBuildForRepo(repo) {
        return travisChecker.getBuild(repo.repo.slug, repo.repo.last_build_id)
          .then(function(build) {
            return extend({}, repo, build);
          });
      });
    } else {
      resultP = repoP;
    }
  }

  var checkedResultP = resultP;
  if (localCommitP) {
    checkedResultP = Promise.all([resultP, localCommitP])
      .then(function checkResultCommit(all) {
        var result = all[0];
        var localCommit = all[1];
        checkBuildCommit(result, localCommit);
        return result;
      });
  }

  var cleanupP;
  if (agent) {
    cleanupP = checkedResultP.then(
      function(result) { agent.destroy(); return result; },
      function(err) { agent.destroy(); return Promise.reject(err); }
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
