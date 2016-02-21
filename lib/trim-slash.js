/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

/** Trims a single slash from the end of a string, if present.
 * @ template ArgType
 * @param {ArgType} string String to trim.
 * @return {ArgType} If <code>string</code> is a string which ends with
 * <code>'/'</code>, <code>string</code> with the last character removed.
 * Otherwise, <code>string</code> unmodified.
 * @ nosideeffects
 */
function trimSlash(string) {
  if (typeof string !== 'string') {
    return string;
  }
  if (string.length > 0 && string.charAt(string.length - 1) === '/') {
    return string.slice(0, string.length - 1);
  }
  return string;
}

module.exports = trimSlash;
