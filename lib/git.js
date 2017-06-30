/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const Promise = require('any-promise');   // eslint-disable-line no-shadow
const execFile = require('child_process').execFile;

/** Runs git with given arguments.
 * @param {...string} args Arguments to git command.
 * @return {Promise} Promise with the process output or Error for non-0 exit.
 * @private
 */
function git(/* [args...] */) {
  // Note:  execFile/spawn requires Array type for arguments
  const args = Array.prototype.slice.call(arguments);
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        // Creating an object with named properties would probably be clearer
        // but this is compatible with thenify/promisify if we switch later.
        resolve([stdout, stderr]);
      }
    });
    child.stdin.end();
  });
}

module.exports = git;
