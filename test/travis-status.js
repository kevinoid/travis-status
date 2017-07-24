/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const GitStatusChecker = require('../lib/git-status-checker');
const Promise = require('any-promise'); // eslint-disable-line no-shadow
const TravisStatusChecker = require('../lib/travis-status-checker');
const apiResponses = require('../test-lib/api-responses');
const assert = require('chai').assert;
const assign = require('object-assign');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

describe('travisStatus', () => {
  // In order to test travisStatus in isolation, we need to mock
  // GitStatusChecker and TravisStatusChecker.  To use different mocks for each
  // test without re-injecting the module repeatedly, we use this shared
  // variable.
  let gitChecker;
  let travisChecker;
  const travisStatus = proxyquire(
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

  beforeEach(() => {
    gitChecker = null;
    travisChecker = null;
  });

  it('fetches current repo without storing by default', () => {
    const testSlug = 'foo/bar';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug')
      .once().withExactArgs().returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus().then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches current repo and stores if interactive', () => {
    const testSlug = 'foo/bar';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug')
      .once().withExactArgs().returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('storeSlug')
      .once().withExactArgs(testSlug).returns(Promise.resolve(testSlug));
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({interactive: true}).then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches options.repo', () => {
    const testSlug = 'foo/bar';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug').never();
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({repo: testSlug}).then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches and stores options.storeRepo', () => {
    const testSlug = 'foo/bar';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug')
      .once().withExactArgs(testSlug).returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({storeRepo: testSlug}).then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  // This matches travis.rb behavior
  it('fetches options.repo, stores options.storeRepo', () => {
    const testSlug = 'foo/bar';
    const testSlug2 = 'baz/quux';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug')
      .once().withExactArgs(testSlug2).returns(Promise.resolve(testSlug2));
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    const options = {repo: testSlug, storeRepo: testSlug2};
    return travisStatus(options).then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches named branch for options.branch', () => {
    const testSlug = 'foo/bar';
    const testBranch = 'branch1';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('detectBranch').never();
    gitCheckerMock.expects('findSlug').never();
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch')
      .once().withArgs(testSlug, testBranch)
      .returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBuild').never();
    const options = {branch: testBranch, repo: testSlug};
    return travisStatus(options).then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  it('fetches current branch for true options.branch', () => {
    const testSlug = 'foo/bar';
    const testBranch = 'branch1';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('detectBranch')
      .once().withExactArgs().returns(Promise.resolve(testBranch));
    gitCheckerMock.expects('findSlug').never();
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch')
      .once().withArgs(testSlug, testBranch)
      .returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBuild').never();
    const options = {branch: true, repo: testSlug};
    return travisStatus(options).then((result) => {
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
    });
  });

  [true, false].forEach((isSameHash) => {
    [true, false].forEach((commitIsHash) => {
      const desc =
        `${isSameHash ? 'resolves combined result' : 'rejects with Error'
        } for ${
          commitIsHash ? 'same commit hash' : 'matching commit name'}`;
      it(desc, () => {
        const testSlug = 'foo/bar';
        const testHash = '692064aac95441e2dae7f1780fccc536143a0863';
        const apiHash = isSameHash ? testHash : `${testHash.slice(0, -1)}0`;
        const testCommit = commitIsHash ? testHash : 'v2.0.0';
        const testRepo = apiResponses.repo({
          slug: testSlug
        });
        const testBuild = apiResponses.build({sha: apiHash});
        gitChecker = new GitStatusChecker();
        const gitCheckerMock = sinon.mock(gitChecker);
        gitCheckerMock.expects('resolveHash')
          .once().withExactArgs(testCommit).returns(Promise.resolve(testHash));
        gitCheckerMock.expects('findSlug').never();
        gitCheckerMock.expects('storeSlug').never();
        travisChecker = new TravisStatusChecker();
        const travisCheckerMock = sinon.mock(travisChecker);
        travisCheckerMock.expects('getRepo')
          .once().withArgs(testSlug).returns(Promise.resolve(testRepo));
        travisCheckerMock.expects('getBranch').never();
        travisCheckerMock.expects('getBuild')
          .once().withArgs(testSlug, testRepo.repo.last_build_id)
          .returns(Promise.resolve(testBuild));
        const statusP = travisStatus({commit: testCommit, repo: testSlug});
        let testP;
        if (isSameHash) {
          testP = statusP.then((result) => {
            assert.deepEqual(result, assign({}, testRepo, testBuild));
          });
        } else {
          testP = statusP.then(
            sinon.mock().never(),
            (err) => {
              assert.match(err.message, /\bcommit\b/i);
              assert.include(err.message, testCommit);
              assert.include(err.message, testHash);
              assert.include(err.message, apiHash);
            }
          );
        }
        return testP.then(() => {
          gitCheckerMock.verify();
          travisCheckerMock.verify();
        });
      });
    });
  });

  it('rejects with TypeError for non-object options', () => travisStatus(true).then(
    sinon.mock().never(),
    (err) => {
      assert.strictEqual(err.name, 'TypeError');
      assert.match(err.message, /\boptions\b/);
    }
  ));

  it('throws TypeError for non-function callback', () => {
    assert.throws(
      () => { travisStatus({}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('rejects with InvalidSlugError for invalid options.repo', () => {
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({repo: 'invalid'}).then(
      sinon.mock().never(),
      (err) => {
        assert.strictEqual(err.name, 'InvalidSlugError');
        gitCheckerMock.verify();
        travisCheckerMock.verify();
      }
    );
  });

  it('rejects with InvalidSlugError for invalid options.storeRepo', () => {
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    return travisStatus({storeRepo: 'invalid'}).then(
      sinon.mock().never(),
      (err) => {
        assert.strictEqual(err.name, 'InvalidSlugError');
        gitCheckerMock.verify();
        travisCheckerMock.verify();
      }
    );
  });

  it('yields result to callback without returning Promise', (done) => {
    const testSlug = 'foo/bar';
    const testResult = {};
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('findSlug')
      .once().withExactArgs().returns(Promise.resolve(testSlug));
    gitCheckerMock.expects('storeSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo')
      .once().withArgs(testSlug).returns(Promise.resolve(testResult));
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    const retVal = travisStatus((err, result) => {
      assert.strictEqual(err, null);
      assert.deepEqual(result, testResult);
      gitCheckerMock.verify();
      travisCheckerMock.verify();
      done();
    });
    assert.strictEqual(retVal, undefined);
  });

  it('yields Error to callback without returning Promise', (done) => {
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    const retVal = travisStatus({repo: 'invalid'}, (err) => {
      assert.strictEqual(err.name, 'InvalidSlugError');
      gitCheckerMock.verify();
      travisCheckerMock.verify();
      done();
    });
    assert.strictEqual(retVal, undefined);
  });
});
