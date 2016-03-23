/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var apiResponses = require('../../test-lib/api-responses');
var assert = require('chai').assert;
var enableDestroy = require('server-destroy');
var extend = require('extend');
var http = require('http');
var packageJson = require('../../package.json');
var sinon = require('sinon');
var travisStatus = require('../..');

var match = sinon.match;

function checkRequest(req) {
  var accept = req.headers.accept;
  var acceptTravisRE = /^application\/vnd\.travis-ci\.2\+json(?:,|$)/;
  if (!acceptTravisRE.test(accept)) {
    throw new Error('Accept does not start with Travis Media Type: ' +
        accept);
  }

  if (!/application\/json/.test(accept)) {
    throw new Error('Accept does not include JSON Media Type: ' + accept);
  }

  var acceptEncoding = req.headers['accept-encoding'];
  if (!/gzip/.test(acceptEncoding)) {
    throw new Error('Accept-Encoding does not include gzip: ' +
        acceptEncoding);
  }

  var userAgent = req.headers['user-agent'];
  var uaVersionRE = new RegExp('node-travis-status\/' +
      packageJson.version.replace(/\./g, '\\.'));
  if (!uaVersionRE.test(userAgent)) {
    throw new Error('User-Agent does not include module and version');
  }
}

describe('travisStatus integration', function() {
  var apiUrl;
  var connCount = 0;
  var server;
  var testApiResponses = extend({}, apiResponses);
  before(function startServer(done) {
    server = http.createServer(function(req, res) {
      checkRequest(req);

      /* eslint no-cond-assign: [2, "except-parens"]*/

      var json;
      var parts;
      if ((parts = /^\/repos\/(.*)\/branches\/(.*)$/.exec(req.url))) {
        json = testApiResponses.branch({
          slug: parts[1],
          branch: parts[2]
        });
      } else if ((parts = /^(?:\/repos\/(.*))?\/builds\/(.*)$/.exec(req.url))) {
        json = testApiResponses.build({
          slug: parts[1],
          buildId: parts[2]
        });
      } else if ((parts = /^\/repos\/(.*)$/.exec(req.url))) {
        json = testApiResponses.repo({
          slug: parts[1]
        });
      } else {
        throw new Error('Unrecognized API URL: ' + req.url);
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(json));
    });
    enableDestroy(server);
    server.on('connection', function() {
      ++connCount;
    });
    server.once('error', done);
    server.listen(0, 'localhost', function() {
      server.removeListener('error', done);
      var address = server.address();
      apiUrl = 'http://' + address.address + ':' + address.port;
      done();
    });
  });

  after(function stopServer(done) {
    server.destroy(done);
    server = null;
  });

  beforeEach(function resetConnCount() {
    connCount = 0;
  });

  var apiMock;
  beforeEach(function mockApi() {
    apiMock = sinon.mock(testApiResponses);
  });
  afterEach(function restoreApi() {
    apiMock.restore();
  });

  var realClearTimeout;
  var realSetTimeout;
  beforeEach(function setUpClock() {
    realClearTimeout = clearTimeout;
    realSetTimeout = setTimeout;
    global.clearTimeout = clearInterval;
    global.setTimeout = function mockSetTimeout(fn, delay) {
      if (arguments.length <= 2) {
        return setImmediate(fn);
      }
      var args = Array.prototype.slice.call(arguments, 1);
      args[0] = fn;
      return setImmediate.apply(null, args);
    };
  });
  afterEach(function tearDownClock() {
    global.clearTimeout = realClearTimeout;
    global.setTimeout = realSetTimeout;
  });

  it('fetches branch state', function() {
    var testSlug = 'foo/bar';
    var testBranch = 'branch1';
    var testOpts = {slug: testSlug, branch: testBranch};
    var testResult = apiResponses.branch(testOpts);
    apiMock.expects('branch')
      .once().withExactArgs(match(testOpts))
      .returns(testResult);
    apiMock.expects('build').never();
    apiMock.expects('repo').never();
    var options = {
      apiEndpoint: apiUrl,
      branch: testBranch,
      repo: testSlug
    };
    return travisStatus(options).then(function(result) {
      assert.deepEqual(result, testResult);
      apiMock.verify();
      assert.strictEqual(connCount, 1);
    });
  });

  it('fetches repo state', function() {
    var testSlug = 'foo/bar';
    var testOpts = {slug: testSlug};
    var testResult = apiResponses.repo(testOpts);
    apiMock.expects('branch').never();
    apiMock.expects('build').never();
    apiMock.expects('repo')
      .once().withExactArgs(match(testOpts))
      .returns(testResult);
    var options = {
      apiEndpoint: apiUrl,
      repo: testSlug
    };
    return travisStatus(options).then(function(result) {
      assert.deepEqual(result, testResult);
      apiMock.verify();
      assert.strictEqual(connCount, 1);
    });
  });

  it('fetches repo and build for commit', function() {
    var testSlug = 'foo/bar';
    var testCommit = '4e2c26acca22601fb54da35485faff7c303084eb';
    var testBuildId = 123456;
    var testOpts = {
      buildId: testBuildId,
      sha: testCommit,
      slug: testSlug
    };
    var testBuild = apiResponses.build(testOpts);
    var testRepo = apiResponses.repo(testOpts);
    apiMock.expects('branch').never();
    apiMock.expects('build')
      .once().withExactArgs(match({buildId: String(testBuildId)}))
      .returns(testBuild);
    apiMock.expects('repo')
      .once().withExactArgs(match({slug: testSlug}))
      .returns(testRepo);
    var options = {
      apiEndpoint: apiUrl,
      commit: testCommit,
      repo: testSlug
    };
    return travisStatus(options).then(function(result) {
      assert.deepEqual(result, extend({}, testRepo, testBuild));
      apiMock.verify();
      assert.strictEqual(connCount, 1);
    });
  });

  it('fetches repo state with wait', function() {
    var testSlug = 'foo/bar';
    var pendingResult = apiResponses.repo({slug: testSlug, state: 'started'});
    var passedResult = apiResponses.repo({slug: testSlug});
    apiMock.expects('branch').never();
    apiMock.expects('build').never();
    var expect = apiMock.expects('repo')
      .atLeast(2)
      .withExactArgs(match({slug: testSlug}));
    // We don't want to over-specify the timeout/backoff values.
    // So extra calls are added to ensure it is long enough to exceed the
    // keep-alive timeout.
    for (var i = 0; i < 5; ++i) {
      expect.onCall(i).returns(pendingResult);
    }
    expect.onCall(5).returns(passedResult);
    var options = {
      apiEndpoint: apiUrl,
      repo: testSlug,
      wait: Infinity
    };
    var promise = travisStatus(options).then(function(result) {
      assert.deepEqual(result, passedResult);
      apiMock.verify();
    });
    return promise;
  });
});
