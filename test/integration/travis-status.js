/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const http = require('node:http');

const { assert } = require('chai');
const enableDestroy = require('server-destroy');
const sinon = require('sinon');

const travisStatus = require('../../index.js');
const packageJson = require('../../package.json');
const apiResponses = require('../../test-lib/api-responses.js');

const { match } = sinon;

function checkRequest(req) {
  const { accept } = req.headers;
  const acceptTravisRE = /^application\/vnd\.travis-ci\.2\+json(?:,|$)/;
  if (!acceptTravisRE.test(accept)) {
    throw new Error(`Accept does not start with Travis Media Type: ${
      accept}`);
  }

  if (!/application\/json/.test(accept)) {
    throw new Error(`Accept does not include JSON Media Type: ${accept}`);
  }

  const acceptEncoding = req.headers['accept-encoding'];
  if (!/gzip/.test(acceptEncoding)) {
    throw new Error(`Accept-Encoding does not include gzip: ${
      acceptEncoding}`);
  }

  const userAgent = req.headers['user-agent'];
  const uaVersionRE = new RegExp(`node-travis-status/${
    packageJson.version.replaceAll('.', '\\.')}`);
  if (!uaVersionRE.test(userAgent)) {
    throw new Error('User-Agent does not include module and version');
  }
}

describe('travisStatus integration', () => {
  let apiUrl;
  let connCount = 0;
  let server;
  const testApiResponses = { ...apiResponses };
  before((done) => {
    server = http.createServer((req, res) => {
      checkRequest(req);

      /* eslint no-cond-assign: [2, "except-parens"] */

      let json;
      let parts;
      if ((parts = /^\/repos\/(.*)\/branches\/(.*)$/.exec(req.url))) {
        json = testApiResponses.branch({
          slug: parts[1],
          branch: parts[2],
        });
      } else if ((parts = /^(?:\/repos\/(.*))?\/builds\/(.*)$/.exec(req.url))) {
        json = testApiResponses.build({
          slug: parts[1],
          buildId: parts[2],
        });
      } else if ((parts = /^\/repos\/(.*)$/.exec(req.url))) {
        json = testApiResponses.repo({
          slug: parts[1],
        });
      } else {
        throw new Error(`Unrecognized API URL: ${req.url}`);
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(json));
    });
    enableDestroy(server);
    server.on('connection', () => {
      connCount += 1;
    });
    server.once('error', done);
    server.listen(0, 'localhost', () => {
      server.removeListener('error', done);
      const address = server.address();
      // IPv6 addresses must be surrounded by [] to disambiguate : for port:
      // https://datatracker.ietf.org/doc/html/rfc3986#section-3.2.2
      const hostname =
        address.family === 6 || address.family === 'IPv6'
          ? `[${address.address}]`
          : address.address;
      apiUrl = `http://${hostname}:${address.port}`;
      done();
    });
  });

  after((done) => {
    server.destroy(done);
    server = null;
  });

  beforeEach(() => {
    connCount = 0;
  });

  let apiMock;
  beforeEach(() => {
    apiMock = sinon.mock(testApiResponses);
  });
  afterEach(() => {
    apiMock.restore();
  });

  let realClearTimeout;
  let realSetTimeout;
  beforeEach(() => {
    realClearTimeout = clearTimeout;
    realSetTimeout = setTimeout;
    globalThis.clearTimeout = clearInterval;
    globalThis.setTimeout = function mockSetTimeout(fn, delay, ...args) {
      return setImmediate(fn, ...args);
    };
  });
  afterEach(() => {
    globalThis.clearTimeout = realClearTimeout;
    globalThis.setTimeout = realSetTimeout;
  });

  it('fetches branch state', () => {
    const testSlug = 'foo/bar';
    const testBranch = 'branch1';
    const testOpts = { slug: testSlug, branch: testBranch };
    const testResult = apiResponses.branch(testOpts);
    apiMock.expects('branch')
      .once().withExactArgs(match(testOpts))
      .returns(testResult);
    apiMock.expects('build').never();
    apiMock.expects('repo').never();
    const options = {
      apiEndpoint: apiUrl,
      branch: testBranch,
      repo: testSlug,
    };
    return travisStatus(options).then((result) => {
      assert.deepEqual(result, testResult);
      apiMock.verify();
      assert.strictEqual(connCount, 1);
    });
  });

  it('fetches repo state', () => {
    const testSlug = 'foo/bar';
    const testOpts = { slug: testSlug };
    const testResult = apiResponses.repo(testOpts);
    apiMock.expects('branch').never();
    apiMock.expects('build').never();
    apiMock.expects('repo')
      .once().withExactArgs(match(testOpts))
      .returns(testResult);
    const options = {
      apiEndpoint: apiUrl,
      repo: testSlug,
    };
    return travisStatus(options).then((result) => {
      assert.deepEqual(result, testResult);
      apiMock.verify();
      assert.strictEqual(connCount, 1);
    });
  });

  it('fetches repo and build for commit', () => {
    const testSlug = 'foo/bar';
    const testCommit = '4e2c26acca22601fb54da35485faff7c303084eb';
    const testBuildId = 123456;
    const testOpts = {
      buildId: testBuildId,
      sha: testCommit,
      slug: testSlug,
    };
    const testBuild = apiResponses.build(testOpts);
    const testRepo = apiResponses.repo(testOpts);
    apiMock.expects('branch').never();
    apiMock.expects('build')
      .once().withExactArgs(match({ buildId: String(testBuildId) }))
      .returns(testBuild);
    apiMock.expects('repo')
      .once().withExactArgs(match({ slug: testSlug }))
      .returns(testRepo);
    const options = {
      apiEndpoint: apiUrl,
      commit: testCommit,
      repo: testSlug,
    };
    return travisStatus(options).then((result) => {
      assert.deepEqual(result, { ...testRepo, ...testBuild });
      apiMock.verify();
      // If Agent doesn't have .destroy(), travisStatus can't do keep-alive.
      // TODO:  Check that travisStatusCmd does.
      if (typeof new http.Agent().destroy === 'function') {
        assert.strictEqual(connCount, 1);
      }
    });
  });

  it('fetches repo state with wait', () => {
    const testSlug = 'foo/bar';
    const pendingResult =
      apiResponses.repo({ slug: testSlug, state: 'started' });
    const passedResult = apiResponses.repo({ slug: testSlug });
    apiMock.expects('branch').never();
    apiMock.expects('build').never();
    const expect = apiMock.expects('repo')
      .atLeast(2)
      .withExactArgs(match({ slug: testSlug }));
    // We don't want to over-specify the timeout/backoff values.
    // So extra calls are added to ensure it is long enough to exceed the
    // keep-alive timeout.
    for (let i = 0; i < 5; i += 1) {
      expect.onCall(i).returns(pendingResult);
    }
    expect.onCall(5).returns(passedResult);
    const options = {
      apiEndpoint: apiUrl,
      repo: testSlug,
      wait: Infinity,
    };
    const promise = travisStatus(options).then((result) => {
      assert.deepEqual(result, passedResult);
      apiMock.verify();
    });
    return promise;
  });
});
