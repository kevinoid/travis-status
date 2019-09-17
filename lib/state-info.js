/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

/** Colors used to output each Travis status.
 * From lib/travis/client/states.rb#color.
 * @const
 * @type {Object<string,boolean>}
 */
exports.colors = Object.freeze({
  canceled: 'red',
  created: 'yellow',
  errored: 'red',
  failed: 'red',
  passed: 'green',
  queued: 'yellow',
  ready: 'green',
  received: 'yellow',
  started: 'yellow',
});

/** Statuses which are considered to be pending.
 * From lib/travis/client/states.rb#pending?.
 * @const
 * @type {Object<string,boolean>}
 */
exports.isPending = Object.freeze({
  created: true,
  queued: true,
  received: true,
  started: true,
});

/** Statuses which are considered to be unsuccessful.
 * From lib/travis/client/states.rb#unsuccessful?.
 * @const
 * @type {Object<string,boolean>}
 */
exports.isUnsuccessful = Object.freeze({
  canceled: true,
  errored: true,
  failed: true,
});
