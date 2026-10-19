/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/** Represents an error caused by a repository slug which does not fit the
 * required format.
 */
class InvalidSlugError extends Error {}

InvalidSlugError.prototype.message = 'Invalid repository slug';
InvalidSlugError.prototype.name = 'InvalidSlugError';

module.exports = InvalidSlugError;
