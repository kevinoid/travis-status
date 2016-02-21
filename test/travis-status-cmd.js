/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var Promise = require('any-promise');   // eslint-disable-line no-shadow
var SlugDetectionError = require('../lib/slug-detection-error');
var apiResponses = require('../test-lib/api-responses');
var assert = require('chai').assert;
var chalk = require('chalk');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var stateInfo = require('../lib/state-info');
var stream = require('stream');

var match = sinon.match;

// Simulate arguments passed by the node runtime
var RUNTIME_ARGS = ['node', 'travis-status'];

describe('travis-status command', function() {
  // In order to test the command parsing module in isolation, we need to mock
  // the travis-status module function.  To use different mocks for each test
  // without re-injecting the module repeatedly, we use this shared variable.
  var travisStatus;
  var travisStatusCmd = proxyquire(
    '../bin/travis-status',
    {
      '..': function travisStatusInjected() {
        return travisStatus.apply(this, arguments);
      }
    }
  );

  // Ensure that expectations are not carried over between tests
  beforeEach(function() {
    travisStatus = sinon.expectation.create('travisStatus').never();
  });

  it('accepts empty arguments', function() {
    travisStatus = sinon.mock()
      .once()
      .withArgs(
        match.any,
        match.func
      );
    travisStatusCmd([], sinon.mock().never());
    travisStatus.verify();
  });

  it('returns undefined when called with a function', function() {
    travisStatus = sinon.mock()
      .once()
      .withArgs(
        match.any,
        match.func
      );
    var result = travisStatusCmd(RUNTIME_ARGS, sinon.mock().never());
    travisStatus.verify();
    assert.strictEqual(result, undefined);
  });

  // Note:  Same default as travis.rb
  it('default interactive true for TTY stdout', function() {
    travisStatus = sinon.mock()
      .once()
      .withArgs(
        match({interactive: true}),
        match.func
      );
    var outStream = new stream.PassThrough();
    outStream.isTTY = true;
    var options = {
      out: outStream,
      err: new stream.PassThrough()
    };
    travisStatusCmd(RUNTIME_ARGS, options, sinon.mock().never());
    travisStatus.verify();
  });

  function expectArgsAs(args, expectObj) {
    it('interprets ' + args.join(' ') + ' as ' + expectObj, function() {
      travisStatus = sinon.mock()
        .once()
        .withArgs(
          expectObj,
          match.func
        );
      var allArgs = RUNTIME_ARGS.concat(args);
      travisStatusCmd(allArgs, sinon.mock().never());
      travisStatus.verify();
    });
  }

  function expectArgsErr(args, expectErrMsg) {
    it('prints error and exits for ' + args.join(' '), function(done) {
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var options = {
        out: outStream,
        err: errStream
      };
      var allArgs = RUNTIME_ARGS.concat(args);
      travisStatusCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.isAtLeast(code, 1);
        assert.strictEqual(outStream.read(), null);
        assert.match(String(errStream.read()), expectErrMsg);
        done();
      });
    });
  }

  function expectArgsStateCode(args, state, expectCode) {
    var desc = (args.length ? 'with ' + args.join(' ') : 'normally') +
      ' exits with code ' + expectCode + ' if build ' + state;
    it(desc, function(done) {
      travisStatus = sinon.stub();
      var options = {
        out: new stream.PassThrough(),
        err: new stream.PassThrough()
      };
      var allArgs = RUNTIME_ARGS.concat(args);
      travisStatusCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, expectCode);
        done();
      });
      travisStatus.yield(
        null,
        apiResponses.repo({state: state}).repo
      );
    });
  }

  // Check individual arguments are handled correctly
  expectArgsAs(['--api-endpoint', 'https://example.com'], match({apiEndpoint: 'https://example.com'}));
  expectArgsAs(['--branch', 'branchname'], match({branch: 'branchname'}));
  expectArgsAs(['--branch'], match({branch: true}));
  expectArgsAs(['--commit', 'v1.0.0'], match({commit: 'v1.0.0'}));
  expectArgsAs(['--commit'], match({commit: 'HEAD'}));
  expectArgsAs(['--debug'], match.object);
  expectArgsAs(['--debug-http'], match.object);
  expectArgsAs(['--explode'], match.object);
  expectArgsAs(['--insecure'], match({request: match({strictSSL: false})}));
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
  expectArgsAs(['-I'], match({request: match({strictSSL: false})}));
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
  ['-x', '--exit-code'].forEach(function(arg) {
    expectArgsStateCode([arg], 'canceled', 1);
    expectArgsStateCode([arg], 'errored', 1);
    expectArgsStateCode([arg], 'failed', 1);
  });

  expectArgsStateCode([], 'queued', 0);
  ['-p', '--fail-pending'].forEach(function(arg) {
    expectArgsStateCode([arg], 'created', 1);
    expectArgsStateCode([arg], 'queued', 1);
    expectArgsStateCode([arg], 'received', 1);
    expectArgsStateCode([arg], 'started', 1);
  });

  ['-q', '--quiet'].forEach(function(arg) {
    it(arg + ' exits without printing state', function(done) {
      travisStatus = sinon.stub();
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var options = {
        out: outStream,
        err: errStream
      };
      var allArgs = RUNTIME_ARGS.concat(arg);
      travisStatusCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        assert.strictEqual(outStream.read(), null);
        assert.strictEqual(errStream.read(), null);
        done();
      });
      travisStatus.yield(
        null,
        apiResponses.repo({state: 'failed'}).repo
      );
    });
  });

  [false, true].forEach(function(isBranch) {
    var desc = 'prints build number and state for ' +
      (isBranch ? 'branch' : 'repo') + ' to stdout';
    it(desc, function(done) {
      travisStatus = sinon.stub();
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var options = {
        out: outStream,
        err: errStream
      };
      var buildNum = 500;
      var state = 'passed';
      var allArgs = RUNTIME_ARGS.concat(isBranch ? ['--branch'] : []);
      travisStatusCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        assert.strictEqual(
          String(outStream.read()),
          // We are strict about this format since other programs may use it
          'build #' + buildNum + ' ' + state + '\n'
        );
        assert.strictEqual(errStream.read(), null);
        done();
      });
      travisStatus.yield(
        null,
        isBranch ?
          apiResponses.branch({number: buildNum, state: state}) :
          apiResponses.repo({number: buildNum, state: state}).repo
      );
    });
  });

  Object.keys(stateInfo.colors).forEach(function(state) {
    var color = stateInfo.colors[state];
    it('prints ' + state + ' in ' + color + ' if interactive', function(done) {
      travisStatus = sinon.stub();
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var options = {
        out: outStream,
        err: errStream
      };
      var allArgs = RUNTIME_ARGS.concat(['--interactive']);
      travisStatusCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        var outString = String(outStream.read());
        assert.include(
          outString,
          chalk.styles[color].open + state + chalk.styles[color].close
        );
        assert.strictEqual(errStream.read(), null);
        done();
      });
      travisStatus.yield(
        null,
        apiResponses.repo({state: state}).repo
      );
    });
  });

  it('prints error messages in red if interactive', function(done) {
    travisStatus = sinon.stub();
    var outStream = new stream.PassThrough();
    var errStream = new stream.PassThrough();
    var options = {
      out: outStream,
      err: errStream
    };
    var errMsg = 'super duper test error';
    var allArgs = RUNTIME_ARGS.concat(['--interactive']);
    travisStatusCmd(allArgs, options, function(err, code) {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      var errString = String(errStream.read());
      assert.include(errString, chalk.styles.red.open);
      assert.include(errString, errMsg);
      done();
    });
    travisStatus.yield(new Error(errMsg));
  });

  it('throws for non-function callback', function() {
    assert.throws(
      function() { travisStatusCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('returns Error for non-object options', function(done) {
    travisStatusCmd([], true, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('returns Error for non-Readable in', function(done) {
    travisStatusCmd([], {in: new stream.Writable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.in\b/);
      done();
    });
  });

  it('returns Error for non-Writable out', function(done) {
    travisStatusCmd([], {out: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.out\b/);
      done();
    });
  });

  it('returns Error for non-Writable err', function(done) {
    travisStatusCmd([], {err: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.err\b/);
      done();
    });
  });

  it('prints error messages in red if interactive', function(done) {
    travisStatus = sinon.stub();
    var outStream = new stream.PassThrough();
    var errStream = new stream.PassThrough();
    var options = {
      out: outStream,
      err: errStream
    };
    var errMsg = 'super duper test error';
    var allArgs = RUNTIME_ARGS.concat(['--interactive']);
    travisStatusCmd(allArgs, options, function(err, code) {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      var errString = String(errStream.read());
      assert.include(errString, chalk.styles.red.open);
      assert.include(errString, errMsg);
      done();
    });
    travisStatus.yield(new Error(errMsg));
  });

  it('prints error messages without color if not interactive', function(done) {
    travisStatus = sinon.stub();
    var outStream = new stream.PassThrough();
    var errStream = new stream.PassThrough();
    var options = {
      out: outStream,
      err: errStream
    };
    var errMsg = 'super duper test error';
    travisStatusCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      var errString = String(errStream.read());
      assert(!chalk.hasColor(errString), 'string has color');
      assert.include(errString, errMsg);
      done();
    });
    travisStatus.yield(new Error(errMsg));
  });

  it('prints a help message for SlugDetectionError', function(done) {
    travisStatus = sinon.stub();
    var outStream = new stream.PassThrough();
    var errStream = new stream.PassThrough();
    var options = {
      out: outStream,
      err: errStream
    };
    travisStatusCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      assert.strictEqual(outStream.read(), null);
      assert.match(String(errStream.read()), /\brepo name\b.*-r/i);
      done();
    });
    travisStatus.yield(new SlugDetectionError('oops'));
  });

  it('returns a Promise when called without a function', function() {
    travisStatus = sinon.stub();
    var result = travisStatusCmd(RUNTIME_ARGS);
    assert(result instanceof Promise);
  });

  it('returned Promise is resolved with exit code', function() {
    travisStatus = sinon.stub();
    var options = {
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    var result = travisStatusCmd(RUNTIME_ARGS, options);
    travisStatus.yield(
      null,
      apiResponses.repo().repo
    );
    return result.then(function(code) {
      assert.strictEqual(code, 0);
    });
  });

  it('returned Promise is rejected with Error', function() {
    travisStatus = sinon.stub();
    var result = travisStatusCmd(RUNTIME_ARGS, true);
    return result.then(
      sinon.mock().never(),
      function(err) { assert.instanceOf(err, TypeError); }
    );
  });
});
