/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var inherits = require('util').inherits;

/** Constructs a SlugDetectionError.
 *
 * @class Represents an error during repository slug detection.
 * @constructor
 * @param {string=} message Human-readable description of the error.
 */
// Note:  Only needed before https://github.com/eslint/eslint/pull/5398
// eslint-disable-next-line consistent-return
function SlugDetectionError(message) {
  if (!(this instanceof SlugDetectionError)) {
    return new SlugDetectionError(message);
  }

  Error.captureStackTrace(this, SlugDetectionError);
  // Like http://www.ecma-international.org/ecma-262/6.0/#sec-error-message
  if (message !== undefined) {
    Object.defineProperty(this, 'message', {
      value: String(message),
      configurable: true,
      writable: true
    });
  }
}
inherits(SlugDetectionError, Error);
SlugDetectionError.prototype.message = 'Slug detection error';
SlugDetectionError.prototype.name = 'SlugDetectionError';

module.exports = SlugDetectionError;
