/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var inherits = require('util').inherits;

/** Constructs an EOFError.
 *
 * @class Represents an error caused by reaching the end-of-file (or, more
 * generally, end-of-input).
 * @constructor
 * @param {string=} message Human-readable description of the error.
 */
// Note:  Only needed before https://github.com/eslint/eslint/pull/5398
// eslint-disable-next-line consistent-return
function EOFError(message) {
  if (!(this instanceof EOFError)) { return new EOFError(message); }
  Error.captureStackTrace(this, EOFError);
  // Like http://www.ecma-international.org/ecma-262/6.0/#sec-error-message
  if (message !== undefined) {
    Object.defineProperty(this, 'message', {
      value: String(message),
      configurable: true,
      writable: true
    });
  }
}
inherits(EOFError, Error);
EOFError.prototype.message = 'End Of File';
EOFError.prototype.name = 'EOFError';

module.exports = EOFError;
