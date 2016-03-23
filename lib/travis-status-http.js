/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var TravisHttp = require('travis-ci/lib/travis-http');
var caseless = require('caseless');
var constants = require('./constants');
var extend = require('extend');
var inherits = require('util').inherits;
var packageJson = require('../package.json');
var request = require('request');
var requestPackageJson = require('request/package.json');
var trimSlash = require('./trim-slash');

/** Default <code>User-Agent</code> header to send with API requests.
 * @const
 * @private
 */
var DEFAULT_USER_AGENT = 'node-travis-status/' + packageJson.version +
  ' Request/' + requestPackageJson.version +
  ' Node.js/' + process.version;

/** Creates an instance of the travis-ci HTTP agent with a given endpoint
 * and request options.
 *
 * This class has the following features above <code>TravisHttp</code>:
 * - Uses a newer version of request (for gzip and proxy support)
 * - Supports caller-specified API endpoints (e.g. for enterprise or local use)
 * - Supports caller-specified request options (e.g. pooling, strictSSL, proxy,
 *   tunnel, timeouts, etc.)
 * - Improved error values which are real Error instances and include the
 *   HTTP response information, regardless of content.
 *
 * @param {string=} endpoint Travis CI API endpoint (base URL).
 * (default: {@link TravisStatusChecker.ORG_URI})
 * @param {Object=} options Options to pass to the <code>request</code>
 * constructor.
 */
function TravisStatusHttp(endpoint, options) {
  if (endpoint && typeof endpoint !== 'string') {
    throw new TypeError('endpoint must be a string');
  }
  endpoint = endpoint && trimSlash(endpoint);

  if (options && typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }

  var defaultOptions = {
    gzip: true,
    // Note:  Header defaults are set case-insensitively below
    headers: {}
  };
  options = extend(true, defaultOptions, options);

  // Careful about providing default values for case-insensitive headers
  var caselessHeaders = caseless(options.headers);
  // The Travis CI API docs say
  // "Always set the Accept header to application/vnd.travis-ci.2+json"
  // but the API actually sends Content-Type application/json.
  // Declare that we accept either.
  caselessHeaders.set(
    'Accept', 'application/vnd.travis-ci.2+json, application/json', false
  );
  caselessHeaders.set('User-Agent', DEFAULT_USER_AGENT, false);

  TravisHttp.call(
    this,
    endpoint === constants.PRO_URI,
    options.headers
  );

  this._endpoint = endpoint || constants.ORG_URI;
  // Set this._headers as TravisHttp does
  this._headers = options.headers;
  delete options.headers;
  this._options = options;
}
inherits(TravisStatusHttp, TravisHttp);

TravisStatusHttp.prototype._getHeaders = function _getHeaders() {
  var headers = this._headers;

  var token = this._getAccessToken();
  if (token) {
    var quotedToken;
    // From https://tools.ietf.org/html/rfc7235#section-2.1
    if (/^[A-Za-z0-9._~+\/-]+$/.test(token)) {
      // The token is a valid HTTP token68 and doesn't require quoting
      quotedToken = token;
    } else {
      // Convert it to a quoted string
      // Note:  No validation is done to ensure it doesn't have prohibited
      // control characters, since there's no way to quote them and I'm more
      // likely to screw up unicode handling than catch real errors.
      quotedToken = '"' + token.replace(/["\\]/g, '\\$&') + '"';
    }

    headers = extend({}, headers);
    caseless(headers).set('Authorization', 'token ' + quotedToken);
  }

  return headers;
};

TravisStatusHttp.prototype.request = function(method, path, data, callback) {
  if (typeof data === 'function') {
    callback = data;
    data = undefined;
  }

  var options = extend({}, this._options, {
    method: method,
    url: this._endpoint + path,
    headers: this._getHeaders()
  });

  if (data instanceof Buffer) {
    options.body = data;
  } else {
    options.json = data || true;
  }
  return request(options, function(errRequest, res, body) {
    if (errRequest) {
      callback(errRequest);
      return;
    }

    var err;

    if (res.statusCode >= 400) {
      err = new Error(res.statusMessage);
    }

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (errJson) {
        err = err || errJson;
      }
    }

    // Note:  This error handling deviates from travis-ci (which returns body
    // or statusCode as err).  I think this is much more sane.
    if (err) {
      err.statusCode = res.statusCode;
      err.statusMessage = res.statusMessage;
      err.headers = res.headers;
      err.body = body;
      callback(err);
      return;
    }

    callback(null, body);
  });
};

module.exports = TravisStatusHttp;
