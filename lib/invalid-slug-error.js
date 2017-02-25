/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var inherits = require('util').inherits;

/** Constructs an InvalidSlugError.
 *
 * @class Represents an error caused by a repository slug which does not
 * fit the required format.
 * @constructor
 * @param {string=} message Human-readable description of the error.
 */
// Note:  Only needed before https://github.com/eslint/eslint/pull/5398
// eslint-disable-next-line consistent-return
function InvalidSlugError(message) {
  if (!(this instanceof InvalidSlugError)) {
    return new InvalidSlugError(message);
  }

  Error.captureStackTrace(this, InvalidSlugError);
  // Like http://www.ecma-international.org/ecma-262/6.0/#sec-error-message
  if (message !== undefined) {
    Object.defineProperty(this, 'message', {
      value: String(message),
      configurable: true,
      writable: true
    });
  }
}
inherits(InvalidSlugError, Error);
InvalidSlugError.prototype.message = 'Invalid repository slug';
InvalidSlugError.prototype.name = 'InvalidSlugError';

module.exports = InvalidSlugError;
