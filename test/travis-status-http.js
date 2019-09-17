/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { assert } = require('chai');
const http = require('http');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const packageJson = require('../package.json');

const { match } = sinon;

describe('TravisStatusHttp', () => {
  // In order to test the TravisStatusHttp module in isolation, we need to mock
  // the request module.  To use different mocks for each test without
  // re-injecting the module repeatedly, we use this shared variable.
  let request;
  const TravisStatusHttp = proxyquire(
    '../lib/travis-status-http',
    {
      request: function requestInjected(...args) {
        return request.apply(this, args);
      },
    },
  );

  it('throws TypeError for non-string endpoint', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new TravisStatusHttp(true); },
      TypeError,
      /\bendpoint\b/,
    );
  });

  it('throws TypeError for non-object options', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new TravisStatusHttp(null, true); },
      TypeError,
      /\boptions\b/,
    );
  });

  describe('#request()', () => {
    it('accepts Travis and JSON media types by default', () => {
      const status = new TravisStatusHttp();
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Accept: match((accept) => {
              const travisRE = /^application\/vnd\.travis-ci\.2\+json(?:,|$)/;
              return travisRE.test(accept)
                && / application\/json(?:,|$)/.test(accept);
            }, 'match Travis and JSON media types'),
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('can send custom accept header', () => {
      const testAccept = 'text/plain';
      // Note:  Testing lower case properly replaces upper
      const status =
        new TravisStatusHttp(null, { headers: { accept: testAccept } });
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Accept: undefined,
            accept: testAccept,
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('supports gzip by default', () => {
      const status = new TravisStatusHttp();
      request = sinon.mock()
        .once()
        .withArgs(match({ gzip: true }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('sends User-Agent including module version by default', () => {
      const uaVersionRE = new RegExp(`node-travis-status/${
        packageJson.version.replace(/\./g, '\\.')}`);
      const status = new TravisStatusHttp();
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            'User-Agent': match(uaVersionRE),
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('can send custom user-agent header', () => {
      const testUA = 'Test Agent';
      // Note:  Testing lower case properly replaces upper
      const status =
        new TravisStatusHttp(null, { headers: { 'user-agent': testUA } });
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            'User-Agent': undefined,
            'user-agent': testUA,
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('builds Authorization header from setAccessToken', () => {
      const testToken = '12345';
      const status = new TravisStatusHttp();
      status.setAccessToken(testToken);
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Authorization: `token ${testToken}`,
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('builds quoted Authorization header from setAccessToken', () => {
      const testToken = '12345"67\\89';
      const quotedToken = '"12345\\"67\\\\89"';
      const status = new TravisStatusHttp();
      status.setAccessToken(testToken);
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Authorization: `token ${quotedToken}`,
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('setAccessToken overrides options.headers.Authorization', () => {
      const testToken = '12345';
      const status =
        new TravisStatusHttp(null, { headers: { Authorization: 'foo' } });
      status.setAccessToken(testToken);
      request = sinon.mock()
        .once()
        .withArgs(match({
          headers: match({
            Authorization: `token ${testToken}`,
          }),
        }));
      status.request('GET', '/repos', () => {});
      request.verify();
    });

    it('returns errors from request', () => {
      const errTest = new Error('Test request error');
      const status = new TravisStatusHttp();
      request = sinon.mock().once().yields(errTest);
      status.request('GET', '/repos', (err) => {
        assert.strictEqual(err, errTest);
      });
      request.verify();
    });

    it('returns errors for HTTP status >= 400', () => {
      const status = new TravisStatusHttp();
      const errProps = {
        statusCode: 400,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'application/json',
          test: 'ok',
        },
      };
      const testBody = { test: 'stuff' };
      const testBodyStr = JSON.stringify(testBody);
      const response = new http.IncomingMessage();
      Object.assign(response, errProps);
      request = sinon.mock().once().yields(null, response, testBodyStr);
      status.request('GET', '/repos', (err) => {
        assert.strictEqual(err.message, errProps.statusMessage);
        assert.deepEqual(
          { ...err },
          { body: testBody, ...errProps },
        );
      });
      request.verify();
    });

    it('returns errors for non-JSON', () => {
      const status = new TravisStatusHttp();
      const errProps = {
        statusCode: 200,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'text/plain',
          test: 'ok',
        },
      };
      const testBody = 'Body?';
      let testErr;
      try { JSON.parse(testBody); } catch (errJson) { testErr = errJson; }
      const response = new http.IncomingMessage();
      Object.assign(response, errProps);
      request = sinon.mock().once().yields(null, response, testBody);
      status.request('GET', '/repos', (err) => {
        assert.strictEqual(err.message, testErr.message);
        assert.deepEqual(
          { ...err },
          { body: testBody, ...errProps },
        );
      });
      request.verify();
    });

    it('returns HTTP errors in preference to JSON', () => {
      const status = new TravisStatusHttp();
      const errProps = {
        statusCode: 400,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'text/plain',
          test: 'ok',
        },
      };
      const testBody = 'Body?';
      const response = new http.IncomingMessage();
      Object.assign(response, errProps);
      request = sinon.mock().once().yields(null, response, testBody);
      status.request('GET', '/repos', (err) => {
        assert.strictEqual(err.message, errProps.statusMessage);
        assert.deepEqual(
          { ...err },
          { body: testBody, ...errProps },
        );
      });
      request.verify();
    });

    it('returns body JSON without Error', () => {
      const status = new TravisStatusHttp();
      const errProps = {
        statusCode: 200,
        statusMessage: 'Test Message',
        headers: {
          'Content-Type': 'application/json',
          test: 'ok',
        },
      };
      const testBody = { prop: 'OK' };
      const testBodyStr = JSON.stringify(testBody);
      const response = new http.IncomingMessage();
      Object.assign(response, errProps);
      request = sinon.mock().once().yields(null, response, testBodyStr);
      status.request('GET', '/repos', (err, body) => {
        assert.deepEqual(body, testBody);
      });
      request.verify();
    });
  });
});
