/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var Promise = require('any-promise');   // eslint-disable-line no-shadow
var execFile = require('child_process').execFile;

/** Runs git with given arguments.
 * @param {...string} args Arguments to git command.
 * @return {Promise} Promise with the process output or Error for non-0 exit.
 * @private
 */
function git(/* [args...] */) {
  // Note:  execFile/spawn requires Array type for arguments
  var args = Array.prototype.slice.call(arguments);
  return new Promise(function(resolve, reject) {
    execFile('git', args, function(err, stdout, stderr) {
      if (err) {
        reject(err);
      } else {
        // Creating an object with named properties would probably be clearer
        // but this is compatible with thenify/promisify if we switch later.
        resolve([stdout, stderr]);
      }
    });
  });
}

module.exports = git;
