/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const Promise = require('any-promise');   // eslint-disable-line no-shadow
const SlugDetectionError = require('../lib/slug-detection-error');
const ansiStyles = require('ansi-styles');
const apiResponses = require('../test-lib/api-responses');
const assert = require('chai').assert;
const hasAnsi = require('has-ansi');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const stateInfo = require('../lib/state-info');
const stream = require('stream');

const match = sinon.match;

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'travis-status'];

describe('travis-status command', () => {
  // In order to test the command parsing module in isolation, we need to mock
  // the travis-status module function.  To use different mocks for each test
  // without re-injecting the module repeatedly, we use this shared variable.
  let travisStatus;
  const travisStatusCmd = proxyquire(
    '../bin/travis-status',
    {
      '..': function travisStatusInjected() {
        return travisStatus.apply(this, arguments);
      }
    }
  );

  // Ensure that expectations are not carried over between tests
  beforeEach(() => {
    travisStatus = sinon.expectation.create('travisStatus').never();
  });

  it('accepts empty arguments', () => {
    travisStatus = sinon.mock()
      .once()
      .withArgs(
        match.any,
        match.func
      );
    travisStatusCmd([], sinon.mock().never());
    travisStatus.verify();
  });

  it('returns undefined when called with a function', () => {
    travisStatus = sinon.mock()
      .once()
      .withArgs(
        match.any,
        match.func
      );
    const result = travisStatusCmd(RUNTIME_ARGS, sinon.mock().never());
    travisStatus.verify();
    assert.strictEqual(result, undefined);
  });

  // Note:  Same default as travis.rb
  it('default interactive true for TTY stdout', () => {
    travisStatus = sinon.mock()
      .once()
      .withArgs(
        match({interactive: true}),
        match.func
      );
    const outStream = new stream.PassThrough();
    outStream.isTTY = true;
    const options = {
      out: outStream,
      err: new stream.PassThrough()
    };
    travisStatusCmd(RUNTIME_ARGS, options, sinon.mock().never());
    travisStatus.verify();
  });

  function expectArgsAs(args, expectObj) {
    it(`interprets ${args.join(' ')} as ${expectObj}`, () => {
      travisStatus = sinon.mock()
        .once()
        .withArgs(
          expectObj,
          match.func
        );
      const allArgs = RUNTIME_ARGS.concat(args);
      travisStatusCmd(allArgs, sinon.mock().never());
      travisStatus.verify();
    });
  }

  function expectArgsErr(args, expectErrMsg) {
    it(`prints error and exits for ${args.join(' ')}`, (done) => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const options = {
        out: outStream,
        err: errStream
      };
      const allArgs = RUNTIME_ARGS.concat(args);
      travisStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.isAtLeast(code, 1);
        assert.strictEqual(outStream.read(), null);
        assert.match(String(errStream.read()), expectErrMsg);
        done();
      });
    });
  }

  function expectArgsStateCode(args, state, expectCode) {
    const desc = `${args.length ? `with ${args.join(' ')}` : 'normally'
      } exits with code ${expectCode} if build ${state}`;
    it(desc, (done) => {
      travisStatus = sinon.stub();
      const options = {
        out: new stream.PassThrough(),
        err: new stream.PassThrough()
      };
      const allArgs = RUNTIME_ARGS.concat(args);
      travisStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, expectCode);
        done();
      });
      travisStatus.yield(
        null,
        apiResponses.repo({state})
      );
    });
  }

  // Check individual arguments are handled correctly
  expectArgsAs([], match({
    apiEndpoint: undefined,
    branch: undefined,
    commit: undefined,
    repo: undefined,
    // requestOpts may have defaults set.  Ensure --insecure isn't default
    requestOpts: match((requestOpts) => !requestOpts ||
        requestOpts.strictSSL === undefined ||
        requestOpts.strictSSL === true, 'not insecure'),
    storeRepo: undefined,
    token: undefined,
    wait: undefined
  }));
  expectArgsAs(['--api-endpoint', 'https://example.com'], match({apiEndpoint: 'https://example.com'}));
  expectArgsAs(['--branch', 'branchname'], match({branch: 'branchname'}));
  expectArgsAs(['--branch'], match({branch: true}));
  expectArgsAs(['--commit', 'v1.0.0'], match({commit: 'v1.0.0'}));
  expectArgsAs(['--commit'], match({commit: 'HEAD'}));
  expectArgsAs(['--debug'], match.object);
  expectArgsAs(['--debug-http'], match.object);
  expectArgsAs(['--explode'], match.object);
  expectArgsAs(['--insecure'], match({requestOpts: match({strictSSL: false})}));
  expectArgsAs(['--interactive'], match({interactive: true}));
  expectArgsAs(['--org'], match({apiEndpoint: 'https://api.travis-ci.org/'}));
  expectArgsAs(['--pro'], match({apiEndpoint: 'https://api.travis-ci.com/'}));
  expectArgsAs(['--repo', 'foo/bar'], match({repo: 'foo/bar'}));
  expectArgsAs(['--skip-completion-check'], match.object);
  expectArgsAs(['--skip-version-check'], match.object);
  expectArgsAs(['--staging'], match({apiEndpoint: 'https://api-staging.travis-ci.org/'}));
  expectArgsAs(['--org', '--staging'], match({apiEndpoint: 'https://api-staging.travis-ci.org/'}));
  expectArgsAs(['--pro', '--staging'], match({apiEndpoint: 'https://api-staging.travis-ci.com/'}));
  expectArgsAs(['--store-repo', 'foo/bar'], match({storeRepo: 'foo/bar'}));
  expectArgsAs(['--token', '12345'], match({token: '12345'}));
  expectArgsAs(['--wait', '60'], match({wait: 60000}));
  expectArgsAs(['--wait'], match({wait: Infinity}));
  expectArgsAs(['-E'], match.object);
  expectArgsAs(['-I'], match({requestOpts: match({strictSSL: false})}));
  expectArgsAs(['-R', 'foo/bar'], match({storeRepo: 'foo/bar'}));
  expectArgsAs(['-b', 'branchname'], match({branch: 'branchname'}));
  expectArgsAs(['-b'], match({branch: true}));
  expectArgsAs(['-c', 'v1.0.0'], match({commit: 'v1.0.0'}));
  expectArgsAs(['-c'], match({commit: 'HEAD'}));
  expectArgsAs(['-e', 'https://example.com'], match({apiEndpoint: 'https://example.com'}));
  expectArgsAs(['-i'], match({interactive: true}));
  expectArgsAs(['-r', 'foo/bar'], match({repo: 'foo/bar'}));
  expectArgsAs(['-t', '12345'], match({token: '12345'}));
  expectArgsAs(['-w', '60'], match({wait: 60000}));
  expectArgsAs(['-w'], match({wait: Infinity}));

  // Check odd argument combinations are handled correctly
  // Like travis.rb:  Store --store-repo but use last of repo/storeRepo
  expectArgsAs(
    ['--repo', 'foo/bar', '--store-repo', 'baz/quux'],
    match({repo: 'baz/quux', storeRepo: 'baz/quux'})
  );
  expectArgsAs(
    ['--store-repo', 'foo/bar', '--repo', 'baz/quux'],
    match({repo: 'baz/quux', storeRepo: 'foo/bar'})
  );
  // Like travis.rb: Last endpoint specified wins
  expectArgsAs(
    ['--api-endpoint', 'https://example.com', '--org', '--pro'],
    match({apiEndpoint: 'https://api.travis-ci.com/'})
  );
  expectArgsAs(
    ['--pro', '--org', '--api-endpoint', 'https://example.com'],
    match({apiEndpoint: 'https://example.com'})
  );
  // Like travis.rb: --staging only affects arguments before it
  expectArgsAs(
    ['--pro', '--staging'],
    match({apiEndpoint: 'https://api-staging.travis-ci.com/'})
  );
  expectArgsAs(
    ['--staging', '--pro'],
    match({apiEndpoint: 'https://api.travis-ci.com/'})
  );

  // Check argument errors are handled correctly
  expectArgsErr(['-w', 'nope'], /\bwait\b/i);
  expectArgsErr(
    ['--unknown'],
    /\b(unknown|recognized|unsupported)\b.+--unknown\b/i
  );
  expectArgsErr(['extraarg'], /\barguments?\b/i);

  // Check argument behavior
  expectArgsStateCode([], 'failed', 0);
  ['-x', '--exit-code'].forEach((arg) => {
    expectArgsStateCode([arg], 'canceled', 1);
    expectArgsStateCode([arg], 'errored', 1);
    expectArgsStateCode([arg], 'failed', 1);
  });

  expectArgsStateCode([], 'queued', 0);
  ['-p', '--fail-pending'].forEach((arg) => {
    expectArgsStateCode([arg], 'created', 1);
    expectArgsStateCode([arg], 'queued', 1);
    expectArgsStateCode([arg], 'received', 1);
    expectArgsStateCode([arg], 'started', 1);
  });

  ['-q', '--quiet'].forEach((arg) => {
    it(`${arg} exits without printing state`, (done) => {
      travisStatus = sinon.stub();
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const options = {
        out: outStream,
        err: errStream
      };
      const allArgs = RUNTIME_ARGS.concat(arg);
      travisStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        assert.strictEqual(outStream.read(), null);
        assert.strictEqual(errStream.read(), null);
        done();
      });
      travisStatus.yield(
        null,
        apiResponses.repo({state: 'failed'})
      );
    });
  });

  [false, true].forEach((isBranch) => {
    const desc = `prints build number and state for ${
      isBranch ? 'branch' : 'repo'} to stdout`;
    it(desc, (done) => {
      travisStatus = sinon.stub();
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const options = {
        out: outStream,
        err: errStream
      };
      const buildNum = 500;
      const state = 'passed';
      const allArgs = RUNTIME_ARGS.concat(isBranch ? ['--branch'] : []);
      travisStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        assert.strictEqual(
          String(outStream.read()),
          // We are strict about this format since other programs may use it
          `build #${buildNum} ${state}\n`
        );
        assert.strictEqual(errStream.read(), null);
        done();
      });
      travisStatus.yield(
        null,
        isBranch ?
          apiResponses.branch({number: buildNum, state}) :
          apiResponses.repo({number: buildNum, state})
      );
    });
  });

  Object.keys(stateInfo.colors).forEach((state) => {
    const color = stateInfo.colors[state];
    it(`prints ${state} in ${color} if interactive`, (done) => {
      travisStatus = sinon.stub();
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const options = {
        out: outStream,
        err: errStream
      };
      const allArgs = RUNTIME_ARGS.concat(['--interactive']);
      travisStatusCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        const outString = String(outStream.read());
        assert.include(
          outString,
          ansiStyles[color].open + state + ansiStyles[color].close
        );
        assert.strictEqual(errStream.read(), null);
        done();
      });
      travisStatus.yield(
        null,
        apiResponses.repo({state})
      );
    });
  });

  it('prints error messages in red if interactive', (done) => {
    travisStatus = sinon.stub();
    const outStream = new stream.PassThrough();
    const errStream = new stream.PassThrough();
    const options = {
      out: outStream,
      err: errStream
    };
    const errMsg = 'super duper test error';
    const allArgs = RUNTIME_ARGS.concat(['--interactive']);
    travisStatusCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      const errString = String(errStream.read());
      assert.include(errString, ansiStyles.red.open);
      assert.include(errString, errMsg);
      done();
    });
    travisStatus.yield(new Error(errMsg));
  });

  it('throws for non-function callback', () => {
    assert.throws(
      () => { travisStatusCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('returns Error for non-object options', (done) => {
    travisStatusCmd([], true, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('returns Error for non-Readable in', (done) => {
    travisStatusCmd([], {in: new stream.Writable()}, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.in\b/);
      done();
    });
  });

  it('returns Error for non-Writable out', (done) => {
    travisStatusCmd([], {out: new stream.Readable()}, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.out\b/);
      done();
    });
  });

  it('returns Error for non-Writable err', (done) => {
    travisStatusCmd([], {err: new stream.Readable()}, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.err\b/);
      done();
    });
  });

  it('prints error messages in red if interactive', (done) => {
    travisStatus = sinon.stub();
    const outStream = new stream.PassThrough();
    const errStream = new stream.PassThrough();
    const options = {
      out: outStream,
      err: errStream
    };
    const errMsg = 'super duper test error';
    const allArgs = RUNTIME_ARGS.concat(['--interactive']);
    travisStatusCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      const errString = String(errStream.read());
      assert.include(errString, ansiStyles.red.open);
      assert.include(errString, errMsg);
      done();
    });
    travisStatus.yield(new Error(errMsg));
  });

  it('prints error messages without color if not interactive', (done) => {
    travisStatus = sinon.stub();
    const outStream = new stream.PassThrough();
    const errStream = new stream.PassThrough();
    const options = {
      out: outStream,
      err: errStream
    };
    const errMsg = 'super duper test error';
    travisStatusCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      const errString = String(errStream.read());
      assert(!hasAnsi(errString), 'string has color');
      assert.include(errString, errMsg);
      done();
    });
    travisStatus.yield(new Error(errMsg));
  });

  it('prints a help message for SlugDetectionError', (done) => {
    travisStatus = sinon.stub();
    const outStream = new stream.PassThrough();
    const errStream = new stream.PassThrough();
    const options = {
      out: outStream,
      err: errStream
    };
    travisStatusCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      assert.match(String(errStream.read()), /\brepo name\b.*-r/i);
      done();
    });
    travisStatus.yield(new SlugDetectionError('oops'));
  });

  it('returns a Promise when called without a function', () => {
    travisStatus = sinon.stub();
    const result = travisStatusCmd(RUNTIME_ARGS);
    assert(result instanceof Promise);
  });

  it('returned Promise is resolved with exit code', () => {
    travisStatus = sinon.stub();
    const options = {
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    const result = travisStatusCmd(RUNTIME_ARGS, options);
    travisStatus.yield(
      null,
      apiResponses.repo()
    );
    return result.then((code) => {
      assert.strictEqual(code, 0);
    });
  });

  it('returned Promise is rejected with Error', () => {
    travisStatus = sinon.stub();
    const result = travisStatusCmd(RUNTIME_ARGS, true);
    return result.then(
      sinon.mock().never(),
      (err) => { assert.instanceOf(err, TypeError); }
    );
  });
});
