/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { inherits } = require('util');

/** Constructs an InvalidSlugError.
 *
 * @class Represents an error caused by a repository slug which does not
 * fit the required format.
 * @class
 * @param {string=} message Human-readable description of the error.
 */
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
      writable: true,
    });
  }
}
inherits(InvalidSlugError, Error);
InvalidSlugError.prototype.message = 'Invalid repository slug';
InvalidSlugError.prototype.name = 'InvalidSlugError';

module.exports = InvalidSlugError;
