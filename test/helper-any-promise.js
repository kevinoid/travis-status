/**
 * Mocha helper to register Bluebird with any-promise when global.Promise is
 * not defined.
 *
 * This is necessary because native-promise-only is preferred by any-promise
 * and uses global setImmediate which is overridden by sinon in some tests,
 * causing test failures when native-promise-only is present.
 *
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

if (!global.Promise) {
  // eslint-disable-next-line global-require
  require('any-promise/register/bluebird');
}
