Travis Status (for Node.js)
===========================

[![Build Status](https://img.shields.io/github/actions/workflow/status/kevinoid/travis-status/node.js.yml?branch=main&style=flat&label=build)](https://github.com/kevinoid/travis-status/actions?query=branch%3Amain)
[![Coverage](https://img.shields.io/codecov/c/github/kevinoid/travis-status/main.svg?style=flat)](https://app.codecov.io/gh/kevinoid/travis-status/branch/main)
[![Dependency Status](https://img.shields.io/david/kevinoid/travis-status.svg?style=flat)](https://david-dm.org/kevinoid/travis-status)
[![Supported Node Version](https://img.shields.io/node/v/travis-status.svg?style=flat)](https://www.npmjs.com/package/travis-status)
[![Version on NPM](https://img.shields.io/npm/v/travis-status.svg?style=flat)](https://www.npmjs.com/package/travis-status)

This project is an implementation of the `status` subcommand of [The Travis
Client](https://github.com/travis-ci/travis.rb) in
[Node.js](https://nodejs.org/), with a few extra features.

## Introductory Example

    $ npm install -g travis-status
    $ travis-status
    build #42 passed

## Features

* It is a drop-in replacement for [`travis
  status`](https://github.com/travis-ci/travis.rb#status).  Any differences in
  behavior are considered issues and users are encouraged to report them.
* It can be installed using [npm](https://www.npmjs.com/).  This is the major
  feature which spurred development of this module (it is a clone after all).
  It makes development environment setup easier and use in npm scripts (such
  as [`version`](https://docs.npmjs.com/cli/version)) both easier and
  version-managed.
* It adds the `--branch` option to query the status of a branch, rather than
  the most recent build for the repo.
* It adds the `--commit` option to ensure the status of the repo (or branch)
  resulted from a build of a particular commit.
* It adds the `--wait` option to wait for a pending build to complete within a
  given time interval.

## Installation

[This package](https://www.npmjs.com/package/travis-status) can be
installed using [npm](https://www.npmjs.com/), either globally or locally, by
running:

```sh
npm install travis-status
```

## Recipes

### Check branch status and commit

To check the status of a named branch and confirm that it matches a named
commit (named by tag, branch, or sha1):

```sh
travis-status --branch release --commit v2.0.1
```

### Check repo is passing, not pending

Although `travis-status` defaults to checking the status of the repository in
which it is run, it can check other repositories using the `--repo` option.
The `--fail-pending` option can be used to cause non-0 exit for pending
status:

```sh
travis-status --repo kevinoid/travis-status --fail-pending || echo 'Not yet passing'
```

### Check status before release

To check that the build for the current commit is passing before releasing it
as a new version, add the following to `package.json`:

```json
{
  "scripts": {
    "preversion": "travis-status -c -qxw"
  }
}
```

This will check that the Travis CI status for the current repository is
passing (and will wait if pending), that it matches the current commit, then
exits quietly if passing or prints an error and exits with non-0 exit code if
not.

### Check status using Pro API

To use the Travis CI Pro API with an access token stored in an environment
variable:

```sh
travis-status --pro --token "$TRAVIS_TOKEN"
```

### Use from JavaScript

The `travis-status` module can be used to retrieve information from the Travis
CI API as follows:

```js
var travisStatus = require('travis-status');
// Note:  Most options match camelized command-line option names
var options = {
  branch: 'master',
  wait: 60000
};
travisStatus(options).then(function(apiObject) {
  console.log(apiObject);
});
```

If the calling code already knows the relevant git information (e.g. repo
name, branch name, commit hash), it is recommended to use the
[`travis-ci`](https://github.com/pwmckenna/node-travis-ci) module directly
(and consult [`lib/travis-status-http.js`](lib/travis-status-http.js) for an
example of how to use a more recent version of
[`request`](https://github.com/request/request) to enable gzip, proxy, and/or
HTTP keep-alive support where appropriate).

### Use interactively from JavaScript

To prompt the user for input (to confirm and store the repo name) set the
`interactive` option to `true`:

```js
var stream = require('stream');
var travisStatus = require('travis-status');
var options = {
  // Prompt the user for input
  interactive: true,
  // Redirect input/output streams (defaults to process.stdin, stdout, stderr)
  in: new stream.PassThrough(),
  out: new stream.PassThrough(),
  err: new stream.PassThrough()
};
travisStatus(options).then(function(apiObject) {
  console.log(apiObject);
});
// read prompts from options.err, respond on options.in
```

### Emulate command-line from JavaScript

To call the module using command-line arguments, require
`travis-status/bin/travis-status`:

```js
var stream = require('stream');
var travisStatusCmd = require('travis-status/bin/travis-status');
var options = {
  // Redirect input/output streams (defaults to process.stdin, stdout, stderr)
  in: new stream.PassThrough(),
  out: new stream.PassThrough(),
  err: new stream.PassThrough()
};
travisStatusCmd(['node', 'travis-status', '--quiet'], options, function(err, exitCode) {
  if (err) { console.error(err); }
  process.exit(exitCode);
});
// read prompts from options.err, respond on options.in
```

More examples can be found in the [test
specifications](https://kevinoid.github.io/travis-status/spec).

## API Docs

Command-line usage information is available via `--help`:

```sh
travis-status --help
```

To use this module as a library, see the [API
Documentation](https://kevinoid.github.io/travis-status/api).

## Contributing

Contributions are appreciated.  Contributors agree to abide by the [Contributor
Covenant Code of
Conduct](https://www.contributor-covenant.org/version/1/4/code-of-conduct.html).
If this is your first time contributing to a Free and Open Source Software
project, consider reading [How to Contribute to Open
Source](https://opensource.guide/how-to-contribute/)
in the Open Source Guides.

If the desired change is large, complex, backwards-incompatible, can have
significantly differing implementations, or may not be in scope for this
project, opening an issue before writing the code can avoid frustration and
save a lot of time and effort.

## License

This project is available under the terms of the [MIT License](LICENSE.txt).
See the [summary at TLDRLegal](https://tldrlegal.com/license/mit-license).
