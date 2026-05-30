# [6.0.0](https://github.com/kevinoid/travis-status/compare/v5.0.0...v6.0.0) (2026-05-30)

### BREAKING CHANGES

* **deps:** Require Node.js ^20.19 || >=22.12.
* package.json: Declare exports ([90f33af](https://github.com/kevinoid/travis-status/commit/90f33afbd3e58c65ea2f818a8d91817548f529c0))

### Bug Fixes

* anchor RegExp to avoid super-linear search ([975da98](https://github.com/kevinoid/travis-status/commit/975da98bb6ce90e8cc1c8a5059eb6687a15005e3))
* **package:** use git+https for repository.url ([50b6e64](https://github.com/kevinoid/travis-status/commit/50b6e64cef705c9d27313168bb0b06fda681a3e5))

### Features

* implement trusted publishing from GitHub ([6669df9](https://github.com/kevinoid/travis-status/commit/6669df9843ea86e9f674f06347580bafd9395836))
* **deps:** bump commander from 14.0.0 to 15.0.0 ([dc42a4d](https://github.com/kevinoid/travis-status/commit/dc42a4da322064bfbcc8cdba90d09f3d6c8f1e16))
* switch from nyc to c8 for native V8 coverage ([d72a313](https://github.com/kevinoid/travis-status/commit/d72a3136254166eda40fb56c550283758c25ac1f))


## [5.0.0](https://github.com/kevinoid/travis-status/compare/v4.0.1...v5.0.0) (2020-04-02)

### BREAKING CHANGES

* Require Node.js 10.13 or later.

### Features

* Update `chalk` to `^4.0.0`.
* Update `commander` to `^5.0.0`.
* Update `promised-read` to `^3.0.0`.
* Code style improvements.


## [4.0.1](https://github.com/kevinoid/travis-status/tree/v4.0.1) (2019-11-16)
[Full Changelog](https://github.com/kevinoid/travis-status/compare/v4.0.0...4.0.1)

- Use `URL` instead of `url` for URL parsing.
- Improve handling explicit transport in foreign URL.
- Update `chalk` to `^3.0.0`.
- Update `commander` to `^4.0.0`.

## [4.0.0](https://github.com/kevinoid/travis-status/tree/4.0.0) (2019-08-09)
[Full Changelog](https://github.com/kevinoid/travis-status/compare/v3.0.1...4.0.0)

- **BREAKING** Require Node 8 or later.
- **BREAKING** Update `commander` to `v3.0.0`, which changed short option
  parsing.  Short options with optional arguments followed by an adjacent
  character are now interpreted as an adjacent argument instead of an adjacent
  option (e.g. `-wx` is interpreted as `-w x` instead of `-w -x`).  See
  tj/commander.js#599 for details.

## [v3.0.1](https://github.com/kevinoid/travis-status/tree/v3.0.1) (2018-08-12)
[Full Changelog](https://github.com/kevinoid/travis-status/compare/v3.0.0...v3.0.1)

- Update travis-ci to the latest version [\#50](https://github.com/kevinoid/travis-status/pull/50)
- Update pify to the latest version [\#49](https://github.com/kevinoid/travis-status/pull/49)
- Update promised-read to the latest version [\#47](https://github.com/kevinoid/travis-status/pull/47)

## [v3.0.0](https://github.com/kevinoid/travis-status/tree/v3.0.0) (2018-06-29)
[Full Changelog](https://github.com/kevinoid/travis-status/compare/v2.0.0...v3.0.0)

- **BREAKING** Drop support for Node < 6.
- Update dependency versions.
- Replace `debug` dependency with `util.debuglog`.
- Improve code style.

## [v2.0.0](https://github.com/kevinoid/travis-status/tree/v2.0.0) (2017-07-17)
[Full Changelog](https://github.com/kevinoid/travis-status/compare/v1.0.0...v2.0.0)

- **BREAKING** **No API Changes**  Require Node v4 or later (as dependencies
  do).
- Code style updates.
- Dependency updates.

## [v1.0.0](https://github.com/kevinoid/travis-status/tree/v1.0.0) (2017-02-25)
[Full Changelog](https://github.com/kevinoid/travis-status/compare/v0.1.0...v1.0.0)

- **No API Changes**  Bump to 1.0 is declaration of stability rather than an
  indication of changes.
- Code style updates.
- Add AppVeyor CI.
- Dependency updates.

## [v0.1.0](https://github.com/kevinoid/travis-status/tree/v0.1.0) (2016-04-02)
