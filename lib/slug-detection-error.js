/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/** Represents an error during repository slug detection. */
class SlugDetectionError extends Error {}

SlugDetectionError.prototype.message = 'Slug detection error';
SlugDetectionError.prototype.name = 'SlugDetectionError';

module.exports = SlugDetectionError;
