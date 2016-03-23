/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var assert = require('chai').assert;
var extend = require('extend');
var http = require('http');
var packageJson = require('../package.json');
var proxyquire = require('proxyquire');
var sinon = require('sinon');

var match = sinon.match;

describe('TravisStatusHttp', function() {
  // In order to test the TravisStatusHttp module in isolation, we need to mock
  // the request module.  To use different mocks for each test without
  // re-injecting the module repeatedly, we use this shared variable.
  var request;
  var TravisStatusHttp = proxyquire(
    '../lib/travis-status-http',
    {
      request: function requestInjected() {
        return request.apply(this, arguments);
      }
    }
  );

  it('throws TypeError for non-string endpoint', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new TravisStatusHttp(true); },
      TypeError,
      /\bendpoint\b/
    );
  });

  it('throws TypeError for non-object options', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new TravisStatusHttp(null, true); },
      TypeError,
      /\boptions\b/
    );
  });

  describe('#request()', function() {
    it('accepts Travis and JSON media types by default', function() {
      var status = new TravisStatusHttp();
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Accept: match(function(accept) {
              var travisRE = /^application\/vnd\.travis-ci\.2\+json(?:,|$)/;
              return travisRE.test(accept) &&
                / application\/json(?:,|$)/.test(accept);
            }, 'match Travis and JSON media types')
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('can send custom accept header', function() {
      var testAccept = 'text/plain';
      // Note:  Testing lower case properly replaces upper
      var status = new TravisStatusHttp(null, {headers: {accept: testAccept}});
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Accept: undefined,
            accept: testAccept
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('supports gzip by default', function() {
      var status = new TravisStatusHttp();
      request = sinon.mock()
        .once()
        .withArgs(match({gzip: true}));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('sends User-Agent including module version by default', function() {
      var uaVersionRE = new RegExp('node-travis-status\/' +
        packageJson.version.replace(/\./g, '\\.'));
      var status = new TravisStatusHttp();
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            'User-Agent': match(uaVersionRE)
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('can send custom user-agent header', function() {
      var testUA = 'Test Agent';
      // Note:  Testing lower case properly replaces upper
      var status =
        new TravisStatusHttp(null, {headers: {'user-agent': testUA}});
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            'User-Agent': undefined,
            'user-agent': testUA
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('builds Authorization header from setAccessToken', function() {
      var testToken = '12345';
      var status = new TravisStatusHttp();
      status.setAccessToken(testToken);
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Authorization: 'token ' + testToken
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('builds quoted Authorization header from setAccessToken', function() {
      var testToken = '12345"67\\89';
      var quotedToken = '"12345\\"67\\\\89"';
      var status = new TravisStatusHttp();
      status.setAccessToken(testToken);
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Authorization: 'token ' + quotedToken
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('setAccessToken overrides options.headers.Authorization', function() {
      var testToken = '12345';
      var status =
        new TravisStatusHttp(null, {headers: {Authorization: 'foo'}});
      status.setAccessToken(testToken);
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Authorization: 'token ' + testToken
          })
        }));
      status.request('GET', '/repos', function() {});
      request.verify();
    });

    it('returns errors from request', function() {
      var errTest = new Error('Test request error');
      var status = new TravisStatusHttp();
      request = sinon.mock().once().yields(errTest);
      status.request('GET', '/repos', function(err) {
        assert.strictEqual(err, errTest);
      });
      request.verify();
    });

    it('returns errors for HTTP status >= 400', function() {
      var status = new TravisStatusHttp();
      var errProps = {
        statusCode: 400,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'application/json',
          test: 'ok'
        }
      };
      var testBody = {test: 'stuff'};
      var testBodyStr = JSON.stringify(testBody);
      var response = new http.IncomingMessage();
      extend(response, errProps);
      request = sinon.mock().once().yields(null, response, testBodyStr);
      status.request('GET', '/repos', function(err) {
        assert.strictEqual(err.message, errProps.statusMessage);
        assert.deepEqual(extend({}, err), extend({body: testBody}, errProps));
      });
      request.verify();
    });

    it('returns errors for non-JSON', function() {
      var status = new TravisStatusHttp();
      var errProps = {
        statusCode: 200,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'text/plain',
          test: 'ok'
        }
      };
      var testBody = 'Body?';
      var testErr;
      try { JSON.parse(testBody); } catch (errJson) { testErr = errJson; }
      var response = new http.IncomingMessage();
      extend(response, errProps);
      request = sinon.mock().once().yields(null, response, testBody);
      status.request('GET', '/repos', function(err) {
        assert.strictEqual(err.message, testErr.message);
        assert.deepEqual(extend({}, err), extend({body: testBody}, errProps));
      });
      request.verify();
    });

    it('returns HTTP errors in preference to JSON', function() {
      var status = new TravisStatusHttp();
      var errProps = {
        statusCode: 400,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'text/plain',
          test: 'ok'
        }
      };
      var testBody = 'Body?';
      var response = new http.IncomingMessage();
      extend(response, errProps);
      request = sinon.mock().once().yields(null, response, testBody);
      status.request('GET', '/repos', function(err) {
        assert.strictEqual(err.message, errProps.statusMessage);
        assert.deepEqual(extend({}, err), extend({body: testBody}, errProps));
      });
      request.verify();
    });

    it('returns body JSON without Error', function() {
      var status = new TravisStatusHttp();
      var errProps = {
        statusCode: 200,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'application/json',
          test: 'ok'
        }
      };
      var testBody = {prop: 'OK'};
      var testBodyStr = JSON.stringify(testBody);
      var response = new http.IncomingMessage();
      extend(response, errProps);
      request = sinon.mock().once().yields(null, response, testBodyStr);
      status.request('GET', '/repos', function(err, body) {
        assert.deepEqual(body, testBody);
      });
      request.verify();
    });
  });
});
