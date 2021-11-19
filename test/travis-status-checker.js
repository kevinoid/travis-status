/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const Travis = require('travis-ci');
const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const apiResponses = require('../test-lib/api-responses.js');
const TravisStatusHttp = require('../lib/travis-status-http.js');

const { match } = sinon;

describe('TravisStatusChecker', () => {
  // In order to test TravisStatusChecker in isolation, we need to mock
  // travis-ci and travis-status-http.  To use different mocks for each test
  // without re-injecting the module repeatedly, we use this shared variable.
  let TravisMock;
  let travisHttpMock;
  let travisRequestMock;
  const TravisStatusChecker = proxyquire(
    '../lib/travis-status-checker',
    {
      'travis-ci': function TravisInjected(...args) {
        const travis = Object.create(TravisMock);
        return TravisMock.apply(travis, args) || travis;
      },
      './travis-status-http': function TravisStatusHttpInjected(...args) {
        let travisHttp;
        if (travisHttpMock) {
          travisHttp = travisHttpMock;
        } else {
          travisHttp = Object.create(TravisStatusHttp);
          travisHttp =
            TravisStatusHttp.apply(travisHttp, args) || travisHttp;
        }
        if (travisRequestMock) {
          travisHttp.request = travisRequestMock;
        }
        return travisHttp;
      },
    },
  );

  beforeEach(() => {
    // By default, don't mock
    TravisMock = Travis;
    travisRequestMock = null;
  });

  it('throws TypeError for non-object options', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new TravisStatusChecker(true); },
      TypeError,
      /\boptions\b/,
    );
  });

  it('passes {pro: true} to Travis when apiEndpoint is PRO_URI', () => {
    TravisMock = sinon.mock()
      .once()
      .withExactArgs(
        match({ pro: true }),
      );
    // eslint-disable-next-line no-new
    new TravisStatusChecker({
      apiEndpoint: TravisStatusChecker.PRO_URI,
    });
    TravisMock.verify();
  });

  // This avoids the extra API call that travis-ci adds for .authenticate()
  it('passes options.token to agent.setAccessToken', () => {
    const testToken = '123456';
    travisHttpMock = new TravisStatusHttp();
    const mock = sinon.mock(travisHttpMock);
    mock.expects('setAccessToken').once().withExactArgs(testToken);
    // eslint-disable-next-line no-new
    new TravisStatusChecker({
      token: testToken,
    });
    mock.verify();
  });

  function apiMethod(methodName, args, travisUrlRe, pendingResponse,
    passedResponse) {
    it('returns Travis CI API resource', () => {
      travisRequestMock = sinon.mock()
        .once()
        .withArgs(match(/GET/i), match(travisUrlRe))
        .yields(null, passedResponse);
      const checker = new TravisStatusChecker();
      const promise = checker[methodName](...args)
        .then((response) => {
          assert.deepEqual(response, passedResponse);
        });
      travisRequestMock.verify();
      return promise;
    });

    describe('with options.wait', () => {
      let clock;
      beforeEach(() => {
        clock = sinon.useFakeTimers();
      });
      afterEach(() => {
        clock.restore();
        clock = null;
      });

      it('does not wait if state is not pending', () => {
        travisRequestMock = sinon.mock()
          .once()
          .withArgs(match(/GET/i), match(travisUrlRe))
          .yields(null, passedResponse);
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: 10000 })
            .then((response) => {
              assert.deepEqual(response, passedResponse);
            });
        travisRequestMock.verify();
        return promise;
      });

      it('retries during wait if state is pending', () => {
        travisRequestMock = sinon.mock()
          .twice()
          .withArgs(match(/GET/i), match(travisUrlRe));
        travisRequestMock.onFirstCall().yields(null, pendingResponse);
        travisRequestMock.onSecondCall().yields(null, passedResponse);
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: 10000 })
            .then((response) => {
              assert.deepEqual(response, passedResponse);
            });
        for (let i = 1; i < 11; i += 1) {
          clock.tick(1000);
        }
        travisRequestMock.verify();
        return promise;
      });

      it('returns pending state if wait elapses', () => {
        travisRequestMock = sinon.mock()
          .atLeast(1)
          .withArgs(match(/GET/i), match(travisUrlRe))
          .yields(null, pendingResponse);
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: 10000 })
            .then((response) => {
              assert.deepEqual(response, pendingResponse);
            });
        for (let i = 1; i < 11; i += 1) {
          clock.tick(1000);
        }
        travisRequestMock.verify();
        return promise;
      });

      it('does not wait after API error', () => {
        const errTest = new Error('Test API error');
        travisRequestMock = sinon.mock()
          .once()
          .withArgs(match(/GET/i), match(travisUrlRe))
          .yields(errTest);
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: 30000 })
            .then(
              sinon.mock().never(),
              (err) => {
                assert.strictEqual(err, errTest);
              },
            );
        travisRequestMock.verify();
        return promise;
      });

      it('stops waiting after API error', () => {
        const errTest = new Error('Test API error');
        travisRequestMock = sinon.mock()
          .twice()
          .withArgs(match(/GET/i), match(travisUrlRe));
        travisRequestMock.onFirstCall().yields(null, pendingResponse);
        travisRequestMock.onSecondCall().yields(errTest);
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: 30000 })
            .then(
              sinon.mock().never(),
              (err) => {
                assert.strictEqual(err, errTest);
              },
            );
        for (let i = 1; i < 31; i += 1) {
          clock.tick(1000);
        }
        travisRequestMock.verify();
        return promise;
      });

      it('rejects with TypeError for non-number wait', () => {
        travisRequestMock = sinon.mock().never();
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: 'hello' })
            .then(
              sinon.mock().never(),
              (err) => {
                assert.strictEqual(err.name, 'TypeError');
                assert.match(err.message, /\bwait\b/);
              },
            );
        travisRequestMock.verify();
        return promise;
      });

      it('rejects with RangeError for negative wait', () => {
        travisRequestMock = sinon.mock().never();
        const checker = new TravisStatusChecker();
        const promise =
          checker[methodName](...args, { wait: -5 })
            .then(
              sinon.mock().never(),
              (err) => {
                assert.strictEqual(err.name, 'RangeError');
                assert.match(err.message, /\bwait\b/);
              },
            );
        travisRequestMock.verify();
        return promise;
      });
    });
  }

  describe('#getBranch()', () => {
    const testSlug = 'owner/repo';
    const testBranch = 'branch1';
    const pendingResponse = apiResponses.branch({
      branch: testBranch,
      slug: testSlug,
      state: 'started',
    });
    const passedResponse = apiResponses.branch({
      branch: testBranch,
      slug: testSlug,
      state: 'passed',
    });
    const travisUrlRe =
      new RegExp(`^/repos/${testSlug}/branches/${testBranch}$`);
    const args = [testSlug, testBranch];
    apiMethod('getBranch', args, travisUrlRe, pendingResponse, passedResponse);
  });

  describe('#getBuild()', () => {
    const testSlug = 'owner/repo';
    const testBuildId = 'branch1';
    const pendingResponse = apiResponses.build({
      buildId: testBuildId,
      slug: testSlug,
      state: 'started',
    });
    const passedResponse = apiResponses.build({
      buildId: testBuildId,
      slug: testSlug,
      state: 'passed',
    });
    const travisUrlRe =
      new RegExp(`^(?:/repos/${testSlug})?/builds/${testBuildId}$`);
    const args = [testSlug, testBuildId];
    apiMethod('getBuild', args, travisUrlRe, pendingResponse, passedResponse);
  });

  describe('#getRepo()', () => {
    const testSlug = 'owner/repo';
    const pendingResponse = apiResponses.repo({
      slug: testSlug,
      state: 'started',
    });
    const passedResponse = apiResponses.repo({
      slug: testSlug,
      state: 'passed',
    });
    const travisUrlRe =
      new RegExp(`^/repos/${testSlug}$`);
    const args = [testSlug];
    apiMethod('getRepo', args, travisUrlRe, pendingResponse, passedResponse);
  });
});
