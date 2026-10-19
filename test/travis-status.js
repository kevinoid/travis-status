/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { rejects: assertRejects } = require('node:assert');

const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const GitStatusChecker = require('../lib/git-status-checker.js');
const TravisStatusChecker = require('../lib/travis-status-checker.js');
const apiResponses = require('../test-lib/api-responses.js');

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
      },
    },
  );

  beforeEach(() => {
    gitChecker = null;
    travisChecker = null;
  });

  it('fetches current repo without storing by default', async () => {
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
    const result = await travisStatus();
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  it('fetches current repo and stores if interactive', async () => {
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
    const result = await travisStatus({ interactive: true });
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  it('fetches options.repo', async () => {
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
    const result = await travisStatus({ repo: testSlug });
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  it('fetches and stores options.storeRepo', async () => {
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
    const result = await travisStatus({ storeRepo: testSlug });
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  // This matches travis.rb behavior
  it('fetches options.repo, stores options.storeRepo', async () => {
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
    const options = { repo: testSlug, storeRepo: testSlug2 };
    const result = await travisStatus(options);
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  it('fetches named branch for options.branch', async () => {
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
    const options = { branch: testBranch, repo: testSlug };
    const result = await travisStatus(options);
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  it('fetches current branch for true options.branch', async () => {
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
    const options = { branch: true, repo: testSlug };
    const result = await travisStatus(options);
    assert.deepEqual(result, testResult);
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  for (const isSameHash of [true, false]) {
    for (const commitIsHash of [true, false]) {
      const desc =
        `${isSameHash ? 'resolves combined result' : 'rejects with Error'
        } for ${
          commitIsHash ? 'same commit hash' : 'matching commit name'}`;
      it(desc, async () => {
        const testSlug = 'foo/bar';
        const testHash = '692064aac95441e2dae7f1780fccc536143a0863';
        const apiHash = isSameHash ? testHash : `${testHash.slice(0, -1)}0`;
        const testCommit = commitIsHash ? testHash : 'v2.0.0';
        const testRepo = apiResponses.repo({
          slug: testSlug,
        });
        const testBuild = apiResponses.build({ sha: apiHash });
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
        const statusP = travisStatus({ commit: testCommit, repo: testSlug });
        if (isSameHash) {
          const result = await statusP;
          assert.deepEqual(result, { ...testRepo, ...testBuild });
        } else {
          await assertRejects(
            statusP,
            (err) => {
              assert.match(err.message, /\bcommit\b/i);
              assert.include(err.message, testCommit);
              assert.include(err.message, testHash);
              assert.include(err.message, apiHash);
              return true;
            },
          );
        }
        gitCheckerMock.verify();
        travisCheckerMock.verify();
      });
    }
  }

  it('rejects with TypeError for non-object options', () => assertRejects(
    travisStatus(true),
    (err) => {
      assert.strictEqual(err.name, 'TypeError');
      assert.match(err.message, /\boptions\b/);
      return true;
    },
  ));

  it('throws TypeError for non-function callback', () => {
    assert.throws(
      () => { travisStatus({}, true); },
      TypeError,
      /\bcallback\b/,
    );
  });

  it('rejects with InvalidSlugError for invalid options.repo', async () => {
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    await assertRejects(
      travisStatus({ repo: 'invalid' }),
      (err) => {
        assert.strictEqual(err.name, 'InvalidSlugError');
        return true;
      },
    );
    gitCheckerMock.verify();
    travisCheckerMock.verify();
  });

  it('invalid options.storeRepo rejects with InvalidSlugError', async () => {
    gitChecker = new GitStatusChecker();
    const gitCheckerMock = sinon.mock(gitChecker);
    gitCheckerMock.expects('storeSlug').never();
    gitCheckerMock.expects('findSlug').never();
    travisChecker = new TravisStatusChecker();
    const travisCheckerMock = sinon.mock(travisChecker);
    travisCheckerMock.expects('getRepo').never();
    travisCheckerMock.expects('getBranch').never();
    travisCheckerMock.expects('getBuild').never();
    await assertRejects(
      travisStatus({ storeRepo: 'invalid' }),
      (err) => {
        assert.strictEqual(err.name, 'InvalidSlugError');
        return true;
      },
    );
    gitCheckerMock.verify();
    travisCheckerMock.verify();
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
    const retVal = travisStatus({ repo: 'invalid' }, (err) => {
      assert.strictEqual(err.name, 'InvalidSlugError');
      gitCheckerMock.verify();
      travisCheckerMock.verify();
      done();
    });
    assert.strictEqual(retVal, undefined);
  });
});
