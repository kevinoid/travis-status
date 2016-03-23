/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var Travis = require('travis-ci');
var TravisStatusHttp = require('../lib/travis-status-http');
var apiResponses = require('../test-lib/api-responses');
var assert = require('chai').assert;
var proxyquire = require('proxyquire');
var sinon = require('sinon');

var match = sinon.match;

describe('TravisStatusChecker', function() {
  // In order to test TravisStatusChecker in isolation, we need to mock
  // travis-ci and travis-status-http.  To use different mocks for each test
  // without re-injecting the module repeatedly, we use this shared variable.
  var TravisMock;
  var travisHttpMock;
  var travisRequestMock;
  var TravisStatusChecker = proxyquire(
    '../lib/travis-status-checker',
    {
      'travis-ci': function TravisInjected() {
        var travis = Object.create(TravisMock);
        return TravisMock.apply(travis, arguments) || travis;
      },
      './travis-status-http': function TravisStatusHttpInjected() {
        var travisHttp;
        if (travisHttpMock) {
          travisHttp = travisHttpMock;
        } else {
          travisHttp = Object.create(TravisStatusHttp);
          travisHttp =
            TravisStatusHttp.apply(travisHttp, arguments) || travisHttp;
        }
        if (travisRequestMock) {
          travisHttp.request = travisRequestMock;
        }
        return travisHttp;
      }
    }
  );

  beforeEach(function resetMocks() {
    // By default, don't mock
    TravisMock = Travis;
    travisRequestMock = null;
  });

  it('throws TypeError for non-object options', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new TravisStatusChecker(true); },
      TypeError,
      /\boptions\b/
    );
  });

  it('passes {pro: true} to Travis when apiEndpoint is PRO_URI', function() {
    TravisMock = sinon.mock()
      .once()
      .withExactArgs(
        match({pro: true})
      );
    // eslint-disable-next-line no-new
    new TravisStatusChecker({
      apiEndpoint: TravisStatusChecker.PRO_URI
    });
    TravisMock.verify();
  });

  // This avoids the extra API call that travis-ci adds for .authenticate()
  it('passes options.token to agent.setAccessToken', function() {
    var testToken = '123456';
    travisHttpMock = new TravisStatusHttp();
    var mock = sinon.mock(travisHttpMock);
    mock.expects('setAccessToken').once().withExactArgs(testToken);
    // eslint-disable-next-line no-new
    new TravisStatusChecker({
      token: testToken
    });
    mock.verify();
  });

  function apiMethod(methodName, args, travisUrlRe, pendingResponse,
      passedResponse) {
    it('returns Travis CI API resource', function() {
      travisRequestMock = sinon.mock()
        .once()
        .withArgs(match(/GET/i), match(travisUrlRe))
        .yields(null, passedResponse);
      var checker = new TravisStatusChecker();
      var promise = checker[methodName].apply(checker, args)
        .then(function(response) {
          assert.deepEqual(response, passedResponse);
        });
      travisRequestMock.verify();
      return promise;
    });

    describe('with options.wait', function() {
      var clock;
      beforeEach(function setUpClock() {
        clock = sinon.useFakeTimers();
      });
      afterEach(function tearDownClock() {
        clock.restore();
        clock = null;
      });

      it('does not wait if state is not pending', function() {
        travisRequestMock = sinon.mock()
          .once()
          .withArgs(match(/GET/i), match(travisUrlRe))
          .yields(null, passedResponse);
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: 10000}))
          .then(function(response) {
            assert.deepEqual(response, passedResponse);
          });
        travisRequestMock.verify();
        return promise;
      });

      it('retries during wait if state is pending', function() {
        travisRequestMock = sinon.mock()
          .twice()
          .withArgs(match(/GET/i), match(travisUrlRe));
        travisRequestMock.onFirstCall().yields(null, pendingResponse);
        travisRequestMock.onSecondCall().yields(null, passedResponse);
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: 10000}))
          .then(function(response) {
            assert.deepEqual(response, passedResponse);
          });
        for (var i = 1; i < 11; ++i) {
          clock.tick(1000);
        }
        travisRequestMock.verify();
        return promise;
      });

      it('returns pending state if wait elapses', function() {
        travisRequestMock = sinon.mock()
          .atLeast(1)
          .withArgs(match(/GET/i), match(travisUrlRe))
          .yields(null, pendingResponse);
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: 10000}))
          .then(function(response) {
            assert.deepEqual(response, pendingResponse);
          });
        for (var i = 1; i < 11; ++i) {
          clock.tick(1000);
        }
        travisRequestMock.verify();
        return promise;
      });

      it('does not wait after API error', function() {
        var errTest = new Error('Test API error');
        travisRequestMock = sinon.mock()
          .once()
          .withArgs(match(/GET/i), match(travisUrlRe))
          .yields(errTest);
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: 30000}))
          .then(
            sinon.mock().never(),
            function(err) {
              assert.strictEqual(err, errTest);
            }
          );
        travisRequestMock.verify();
        return promise;
      });

      it('stops waiting after API error', function() {
        var errTest = new Error('Test API error');
        travisRequestMock = sinon.mock()
          .twice()
          .withArgs(match(/GET/i), match(travisUrlRe));
        travisRequestMock.onFirstCall().yields(null, pendingResponse);
        travisRequestMock.onSecondCall().yields(errTest);
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: 30000}))
          .then(
            sinon.mock().never(),
            function(err) {
              assert.strictEqual(err, errTest);
            }
          );
        for (var i = 1; i < 31; ++i) {
          clock.tick(1000);
        }
        travisRequestMock.verify();
        return promise;
      });

      it('rejects with TypeError for non-number wait', function() {
        travisRequestMock = sinon.mock().never();
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: 'hello'}))
          .then(
            sinon.mock().never(),
            function(err) {
              assert.strictEqual(err.name, 'TypeError');
              assert.match(err.message, /\bwait\b/);
            }
          );
        travisRequestMock.verify();
        return promise;
      });

      it('rejects with RangeError for negative wait', function() {
        travisRequestMock = sinon.mock().never();
        var checker = new TravisStatusChecker();
        var promise =
          checker[methodName].apply(checker, args.concat({wait: -5}))
          .then(
            sinon.mock().never(),
            function(err) {
              assert.strictEqual(err.name, 'RangeError');
              assert.match(err.message, /\bwait\b/);
            }
          );
        travisRequestMock.verify();
        return promise;
      });
    });
  }

  describe('#getBranch()', function() {
    var testSlug = 'owner/repo';
    var testBranch = 'branch1';
    var pendingResponse = apiResponses.branch({
      branch: testBranch,
      slug: testSlug,
      state: 'started'
    });
    var passedResponse = apiResponses.branch({
      branch: testBranch,
      slug: testSlug,
      state: 'passed'
    });
    var travisUrlRe =
      new RegExp('^/repos/' + testSlug + '/branches/' + testBranch + '$');
    var args = [testSlug, testBranch];
    apiMethod('getBranch', args, travisUrlRe, pendingResponse, passedResponse);
  });

  describe('#getBuild()', function() {
    var testSlug = 'owner/repo';
    var testBuildId = 'branch1';
    var pendingResponse = apiResponses.build({
      buildId: testBuildId,
      slug: testSlug,
      state: 'started'
    });
    var passedResponse = apiResponses.build({
      buildId: testBuildId,
      slug: testSlug,
      state: 'passed'
    });
    var travisUrlRe =
      new RegExp('^(?:/repos/' + testSlug + ')?/builds/' + testBuildId + '$');
    var args = [testSlug, testBuildId];
    apiMethod('getBuild', args, travisUrlRe, pendingResponse, passedResponse);
  });

  describe('#getRepo()', function() {
    var testSlug = 'owner/repo';
    var pendingResponse = apiResponses.repo({
      slug: testSlug,
      state: 'started'
    });
    var passedResponse = apiResponses.repo({
      slug: testSlug,
      state: 'passed'
    });
    var travisUrlRe =
      new RegExp('^/repos/' + testSlug + '$');
    var args = [testSlug];
    apiMethod('getRepo', args, travisUrlRe, pendingResponse, passedResponse);
  });
});
