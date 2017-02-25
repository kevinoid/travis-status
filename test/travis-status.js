/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var GitStatusChecker = require('../lib/git-status-checker');
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var TravisStatusChecker = require('../lib/travis-status-checker');
var apiResponses = require('../test-lib/api-responses');
var assert = require('chai').assert;
var extend = require('extend');
var proxyquire = require('proxyquire');
var sinon = require('sinon');

describe('travisStatus', function() {
  // In order to test travisStatus in isolation, we need to mock
  // GitStatusChecker and TravisStatusChecker.  To use different mocks for each
  // test without re-injecting the module repeatedly, we use this shared
  // variable.
  var gitChecker;
  var travisChecker;
  var travisStatus = proxyquire(
    '..',
    {
      './lib/git-status-checker': function GitStatusCheckerInjected() {
        return gitChecker;
      },
      './lib/travis-status-checker': function TravisStatusCheckerInjected() {
        return travisChecker;
      }
    }
  );

  beforeEach(function resetMocks() {
    gitChecker = null;
    travisChecker = null;
  });

  it('fetches current repo without storing by default', function() {
    var testSlug = 'foo/bar';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug')
      .once().withExactArgs().returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus().then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches current repo and stores if interactive', function() {
    var testSlug = 'foo/bar';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug')
      .once().withExactArgs().returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('storeSlug')
      .once().withExactArgs(testSlug).returns(Promise.resolve(testSlug));
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({interactive: true}).then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches options.repo', function() {
    var testSlug = 'foo/bar';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug').never();
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({repo: testSlug}).then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches and stores options.storeRepo', function() {
    var testSlug = 'foo/bar';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug')
      .once().withExactArgs(testSlug).returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({storeRepo: testSlug}).then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  // This matches travis.rb behavior
  it('fetches options.repo, stores options.storeRepo', function() {
    var testSlug = 'foo/bar';
    var testSlug2 = 'baz/quux';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug')
      .once().withExactArgs(testSlug2).returns(Promise.resolve(testSlug2));
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    var options = {repo: testSlug, storeRepo: testSlug2};
    return travisStatus(options).then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches named branch for options.branch', function() {
    var testSlug = 'foo/bar';
    var testBranch = 'branch1';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('detectBranch').never();
    gitCheckerMock.expects('findSlug').never();
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch')
      .once().withArgs(testSlug, testBranch)
        .returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBuild').never();
    var options = {branch: testBranch, repo: testSlug};
    return travisStatus(options).then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches current branch for true options.branch', function() {
    var testSlug = 'foo/bar';
    var testBranch = 'branch1';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('detectBranch')
      .once().withExactArgs().returns(Promise.resolve(testBranch));
    gitCheckerMock.expects('findSlug').never();
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch')
      .once().withArgs(testSlug, testBranch)
        .returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBuild').never();
    var options = {branch: true, repo: testSlug};
    return travisStatus(options).then(function(result) {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  [true, false].forEach(function(isSameHash) {
    [true, false].forEach(function(commitIsHash) {
      var desc =
        (isSameHash ? 'resolves combined result' : 'rejects with Error') +
        ' for ' +
        (commitIsHash ? 'same commit hash' : 'matching commit name');
      it(desc, function() {
        var testSlug = 'foo/bar';
        var testHash = '692064aac95441e2dae7f1780fccc536143a0863';
        var apiHash = isSameHash ? testHash : testHash.slice(0, -1) + '0';
        var testCommit = commitIsHash ? testHash : 'v2.0.0';
        var testRepo = apiResponses.repo({
          slug: testSlug
        });
        var testBuild = apiResponses.build({sha: apiHash});
        gitChecker = new GitStatusChecker();
        var gitCheckerMock = sinon.mock(gitChecker);
        gitCheckerMock.expects('resolveHash')
          .once().withExactArgs(testCommit).returns(Promise.resolve(testHash));
        gitCheckerMock.expects('findSlug').never();
        gitCheckerMock.expects('storeSlug').never();
        travisChecker = new TravisStatusChecker();
        var travisCheckerMock = sinon.mock(travisChecker);
        travisCheckerMock.expects('getRepo')
          .once().withArgs(testSlug).returns(Promise.resolve(testRepo));
        travisCheckerMock.expects('getBranch').never();
        travisCheckerMock.expects('getBuild')
          .once().withArgs(testSlug, testRepo.repo.last_build_id)
            .returns(Promise.resolve(testBuild));
        var statusP = travisStatus({commit: testCommit, repo: testSlug});
        var testP;
        if (isSameHash) {
          testP = statusP.then(function(result) {
            assert.deepEqual(result, extend({}, testRepo, testBuild));
          });
        } else {
          testP = statusP.then(
            sinon.mock().never(),
            function(err) {
              assert.match(err.message, /\bcommit\b/i);
              assert.include(err.message, testCommit);
              assert.include(err.message, testHash);
              assert.include(err.message, apiHash);
            }
          );
        }
        return testP.then(function() {
          gitCheckerMock.verify();
          travisCheckerMock.verify();
        });
      });
    });
  });

  it('rejects with TypeError for non-object options', function() {
    return travisStatus(true).then(
      sinon.mock().never(),
      function(err) {
        assert.strictEqual(err.name, 'TypeError');
        assert.match(err.message, /\boptions\b/);
      }
    );
  });

  it('throws TypeError for non-function callback', function() {
    assert.throws(
      function() { travisStatus({}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('rejects with InvalidSlugError for invalid options.repo', function() {
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({repo: 'invalid'}).then(
      sinon.mock().never(),
      function(err) {
        assert.strictEqual(err.name, 'InvalidSlugError');
        gitCheckerMock.verify();
        travisCheckerMock.verify();
      }
    );
  });

  it('rejects with InvalidSlugError for invalid options.storeRepo', function() {
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({storeRepo: 'invalid'}).then(
      sinon.mock().never(),
      function(err) {
        assert.strictEqual(err.name, 'InvalidSlugError');
        gitCheckerMock.verify();
        travisCheckerMock.verify();
      }
    );
  });

  it('yields result to callback without returning Promise', function(done) {
    var testSlug = 'foo/bar';
    var testResult = {};
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug')
      .once().withExactArgs().returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    var retVal = travisStatus(function(err, result) {
      assert.strictEqual(err, null);
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
      done();
    });
    assert.strictEqual(retVal, undefined);
  });

  it('yields Error to callback without returning Promise', function(done) {
    gitChecker = new GitStatusChecker();
    var gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    var travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    var retVal = travisStatus({repo: 'invalid'}, function(err) {
      assert.strictEqual(err.name, 'InvalidSlugError');
      gitCheckerMock.verify();
      travisCheckerMock.verify();
      done();
    });
    assert.strictEqual(retVal, undefined);
  });
});
