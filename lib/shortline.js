/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { EOFError, readTo } = require('promised-read');

// Same error text as highline
const EOF_MESSAGE = 'The input stream is exhausted.';

/** Creates a new instance of Shortline which can be used to prompt users
 * for input.
 *
 * This class is intended to be similar to {@link http://highline.rubyforge.org
 * Highline}, although it is currently missing nearly all of its functionality.
 *
 * @class
 * @param {{
 *  input: module:stream.Readable|undefined,
 *  output: module:stream.Writable|undefined
 * }=} options Options to control the input source and output destination.
 */
function Shortline(options) {
  this._input = (options && options.input) || process.stdin;
  this._output = (options && options.output) || process.stderr;

  /** Most recent error emitted by the input stream.
   *
   * @type {Error}
   */
  this.inputError = undefined;
  this._input.on('end', () => {
    this.inputError = new EOFError(EOF_MESSAGE);
  });
  // Note:  Can't listen for 'error' since it changes behavior if there are no
  // other listeners.  Listen for it only when reading from input (since that
  // is our error and will be returned to the caller).
}

/** Options for {@link Shortline#ask}.
 *
 * @template ReturnType
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
 * @template ReturnType
 * @param {string} question Question to ask the user.
 * @param {ShortlineAskOptions<ReturnType>=} options Options.
 * @returns {!Promise<ReturnType>} Promise with result of
 * <code>options.convert</code> applied to the user-entered text, or Error.
 * @private
 */
Shortline.prototype.agree = function agree(question, options) {
  options = {
    convert: function agreeToBoolean(answer) {
      return answer.charAt(0).toLowerCase() === 'y';
    },
    validate: /no?$|^y(?:es)?/i,
    ...options,
  };
  options.responses = {
    notValid: 'Please enter "yes" or "no".',
    ...options.responses,
  };
  return this.ask(question, options);
};

/** Asks the user to provide input.
 *
 * @template ReturnType
 * @param {string} question Question to ask the user.
 * @param {ShortlineAskOptions=} options Options.
 * @returns {!Promise<ReturnType>} Promise with result of
 * <code>options.convert</code> applied to the user-entered text, or Error.
 * @private
 */
Shortline.prototype.ask = function ask(question, options) {
  options ||= {};

  let fullQuestion = question;
  if (options.default) {
    fullQuestion = question.replace(
      /\s*$/,
      (padding) => ` |${options.default}|${padding || ' '}`,
    );
  }

  return this.prompt(fullQuestion).then((answer) => {
    if (options.default) {
      answer ||= options.default;
    }

    if (options.trim) {
      answer = answer.trimEnd();
    }

    if (options.validate && !options.validate.test(answer)) {
      let response = options.responses && options.responses.notValid;
      response ||= `Your answer isn't valid (must match ${
        options.validate.source}).`;
      this._output.write(`${response}\n`);
      return this.ask(question, options);
    }

    if (options.convert) {
      answer = options.convert(answer);
    }

    return answer;
  });
};

/** Prompts the user for input without validation, retry, type conversion, or
 * trimming.
 *
 * @param {string} text Text with which to prompt the user.
 * @returns {!Promise<string>} Promise with user-entered text up to (but not
 * including) the first newline or Error.
 * @private
 */
Shortline.prototype.prompt = function prompt(text) {
  const input = this._input;
  const output = this._output;

  output.write(text);

  if (this.inputError) {
    return Promise.reject(this.inputError);
  }

  const onError = (err) => {
    this.inputError = err;
  };
  input.once('error', onError);
  return readTo(input, '\n').then(
    (result) => {
      input.removeListener('error', onError);
      // Trim \n, which is considered a non-input signaling character
      // Convert to a string, since stream may not have an encoding set
      return String(result.slice(0, -1));
    },
    (err) => {
      input.removeListener('error', onError);
      if (err.name === 'EOFError') {
        err.message = EOF_MESSAGE;
      }
      throw err;
    },
  );
};

module.exports = Shortline;
