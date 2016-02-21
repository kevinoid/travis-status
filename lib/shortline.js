/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var EOFError = require('./eof-error');
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var assert = require('assert');
var extend = require('extend');

/** Creates a new instance of Shortline which can be used to prompt users
 * for input.
 *
 * This class is intended to be similar to {@link http://highline.rubyforge.org
 * Highline}, although it is currently missing nearly all of its functionality.
 *
 * @constructor
 * @param {{
 *  input: stream.Readable|undefined,
 *  output: stream.Writable|undefined
 * }=} options Options to control the input source and output destination.
 */
function Shortline(options) {
  var self = this;

  self._input = (options && options.input) || process.stdin;
  self._output = (options && options.output) || process.stderr;

  /** Most recent error emitted by the input stream.
   * @type {Error}
   */
  self.inputError = null;
  self._input.on('end', function onInputEnd() {
    // Same error text as highline
    self.inputError = new EOFError('The input stream is exhausted.');
  });
  // Note:  Can't listen for 'error' since it changes behavior if there are no
  // other listeners.  Listen for it only when reading from input (since that
  // is our error and will be returned to the caller).
}

/** Options for {@link Shortline#ask}.
 *
 * @ template ReturnType
 * @typedef {{
 *  convert: ((function(string): ReturnType)|undefined),
 *  default: string|undefined,
 *  responses: {
 *    notValid: string|undefined
 *  }|undefined,
 *  trim: boolean|undefined,
 *  validate: RegExp|undefined
 * }} ShortlineAskOptions
 * @property {(function(string): ReturnType)=} convert Type conversion used to
 * create the return value from the trimmed and validated user input.
 * @property {string=} default Default value used in place of empty user input.
 * @property {{notValid: string|undefined}} responses Responses to various user
 * input.  <code>notValid</code> is printed if the input does not validate.
 * @property {boolean=} trim Right-trim user input?
 * @property {RegExp=} Prompt repeatedly until the trimmed user input matches a
 * given RegExp.
 */
// var ShortlineAskOptions;

/** Asks the user a "yes or no" question.
 *
 * @param {string} question Question to ask the user.
 * @param {ShortlineAskOptions=} options Options.
 * @return {!Promise<ReturnType>} Promise with result of
 * <code>options.convert</code> applied to the user-entered text, or Error.
 * @private
 */
Shortline.prototype.agree = function agree(question, options) {
  options = extend(true, {
    convert: function agreeToBoolean(answer) {
      return answer.charAt(0).toLowerCase() === 'y';
    },
    responses: {
      notValid: 'Please enter "yes" or "no".'
    },
    validate: /^y(?:es)?|no?$/i
  }, options);
  return this.ask(question, options);
};

/** Asks the user to provide input.
 *
 * @ template ReturnType
 * @param {string} question Question to ask the user.
 * @param {ShortlineAskOptions=} options Options.
 * @return {!Promise<ReturnType>} Promise with result of
 * <code>options.convert</code> applied to the user-entered text, or Error.
 * @private
 */
Shortline.prototype.ask = function ask(question, options) {
  var self = this;
  options = options || {};

  var fullQuestion = question;
  if (options.default) {
    fullQuestion = question.replace(/\s*$/, function(padding) {
      return ' |' + options.default + '|' + (padding || ' ');
    });
  }

  var result = self.prompt(fullQuestion);

  if (options.default) {
    result = result.then(function applyDefault(answer) {
      return answer || options.default;
    });
  }

  if (options.trim) {
    result = result.then(function trimAnswer(answer) {
      return answer.trimRight();
    });
  }

  if (options.validate) {
    result = result.then(function validateAnswer(answer) {
      if (!options.validate.test(answer)) {
        var response = options.responses && options.responses.notValid;
        if (!response) {
          response = 'Your answer isn\'t valid (must match ' +
              options.validate.source + ').';
        }
        self._output.write(response + '\n');
        return self.ask(question, options);
      }

      return answer;
    });
  }

  if (options.convert) {
    result = result.then(options.convert);
  }

  return result;
};

/** Prompts the user for input without validation, retry, type conversion, or
 * trimming.
 *
 * @param {string} text Text with which to prompt the user.
 * @return {!Promise<string>} Promise with user-entered text up to (but not
 * including) the first newline or Error.
 * @private
 */
Shortline.prototype.prompt = function prompt(text) {
  var self = this;
  var input = self._input;
  var output = self._output;

  output.write(text);

  if (self.inputError) {
    return Promise.reject(self.inputError);
  }

  return new Promise(function(resolve, reject) {
    var isDone = false;
    function done(err, value) {
      isDone = true;
      input.removeListener('end', done);
      input.removeListener('error', done);
      input.removeListener('readable', readPending);

      if (err) {
        // Set stream-emitted error as the most recent input error
        self.inputError = err;
        reject(err);
      } else if (value !== undefined) {
        resolve(value);
      } else {
        // Class instance 'end' listener has already been called, use its error
        assert(self.inputError);
        reject(self.inputError);
      }
    }
    input.on('end', done);
    input.on('error', done);

    var response = '';
    function readPending() {
      while (!isDone) {
        var data = input.read();
        if (data === null) {
          if (!isDone) {
            input.on('readable', readPending);
          }
          return;
        }

        var lfInd = data.indexOf('\n');
        if (lfInd >= 0) {
          // Trim \n, which is considered a non-input signaling character
          if (lfInd < data.length - 1) {
            // Read more than we needed.  Put extra back.
            input.unshift(data.slice(lfInd + 1));
          }
          data = data.slice(0, lfInd);
        }

        response += data;
        if (lfInd >= 0) {
          done(null, response);
          return;
        }
      }
    }

    readPending();
  });
};

module.exports = Shortline;
