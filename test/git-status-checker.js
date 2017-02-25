/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var Chalk = require('chalk').constructor;
var GitStatusChecker = require('../lib/git-status-checker');
var InvalidSlugError = require('../lib/invalid-slug-error');
var Promise = require('any-promise');   // eslint-disable-line no-shadow
var assert = require('chai').assert;
var git = require('../lib/git');
var path = require('path');
var pify = require('pify');
var promisedRead = require('promised-read');
var rimraf = require('rimraf');
var sinon = require('sinon');
var stream = require('stream');

var chalk = new Chalk({enabled: true});
var read = promisedRead.read;
var rimrafP = pify(rimraf, Promise);

// Global variables
var origCWD;

var BRANCH_REMOTES = {
  branch1: 'remote1/master',
  branch2: 'remote2/master',
  branchnourl: 'nourl/master',
  branchnotslug: 'notslug/master'
};
var REMOTES = {
  notslug: 'foo',
  origin: 'https://github.com/owner/repo',
  remote1: 'git@github.com:owner1/repo1.git',
  remote2: 'https://github.com/owner2/repo2.git'
};
var REMOTE_SLUGS = {
  origin: 'owner/repo',
  remote1: 'owner1/repo1',
  remote2: 'owner2/repo2'
};
/** Path to repository in which tests are run. */
var TEST_REPO_PATH = path.join(__dirname, '..', 'test-repo');

before('setup test repository', function() {
  return rimrafP(TEST_REPO_PATH)
    .then(function createTestRepo() {
      return git('init', '-q', TEST_REPO_PATH);
    })
    // The user name and email must be configured for the later git commands
    // to work.  On Travis CI (and probably others) there is no global config
    .then(function getConfigName() {
      return git('-C', TEST_REPO_PATH,
          'config', 'user.name', 'Test User');
    })
    .then(function getConfigEmail() {
      return git('-C', TEST_REPO_PATH,
          'config', 'user.email', 'test@example.com');
    })
    .then(function createCommit1() {
      return git('-C', TEST_REPO_PATH,
          'commit', '-q', '-m', 'Initial Commit', '--allow-empty');
    })
    .then(function createCommit2() {
      return git('-C', TEST_REPO_PATH,
          'commit', '-q', '-m', 'Second Commit', '--allow-empty');
    })
    .then(function makeRemotes() {
      return Object.keys(REMOTES).reduce(function(p, remoteName) {
        return p.then(function() {
          var remoteUrl = REMOTES[remoteName];
          return git('-C', TEST_REPO_PATH,
              'remote', 'add', remoteName, remoteUrl);
        });
      }, Promise.resolve());
    })
    .then(function makeBranches() {
      return Object.keys(BRANCH_REMOTES).reduce(function(p, branchName) {
        return p.then(function() {
          var upstream = BRANCH_REMOTES[branchName];
          var gitBranchP = git('-C', TEST_REPO_PATH, 'branch', branchName);
          if (upstream) {
            gitBranchP = gitBranchP.then(function setBranchUpstream() {
              // Note:  Can't use 'git branch -u' without fetching remote
              var upstreamParts = upstream.split('/');
              assert.strictEqual(upstreamParts.length, 2);
              var remoteName = upstreamParts[0];
              var remoteBranch = upstreamParts[1];
              var remoteRef = 'refs/heads/' + remoteBranch;
              var configBranch = 'branch.' + branchName;
              var configMerge = configBranch + '.merge';
              var configRemote = configBranch + '.remote';
              return git('-C', TEST_REPO_PATH,
                  'config', '--add', configRemote, remoteName)
                .then(function() {
                  return git('-C', TEST_REPO_PATH,
                      'config', '--add', configMerge, remoteRef);
                });
            });
          }
          return gitBranchP;
        });
      }, Promise.resolve());
    });
});

after('remove test repository', function() {
  return rimrafP(TEST_REPO_PATH);
});

before('run from test repository', function() {
  origCWD = process.cwd();
  process.chdir(TEST_REPO_PATH);
});

after('restore original working directory', function() {
  process.chdir(origCWD);
});

function unsetTravisSlug() {
  return git('config', '--unset-all', GitStatusChecker.SLUG_CONFIG_NAME)
    .catch(function(err) {
      // Exit code 5 is 'try to unset an option which does not exist'
      return err.code === 5 ? null : Promise.reject(err);
    });
}

describe('GitStatusChecker', function() {
  it('throws TypeError for non-object options', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new GitStatusChecker(true); },
      TypeError,
      /\boptions\b/
    );
  });

  it('throws TypeError for non-Readable in', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new GitStatusChecker({in: new stream.Writable()}); },
      TypeError,
      /\boptions.in\b/
    );
  });

  it('throws TypeError for non-Writable out', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new GitStatusChecker({out: new stream.Readable()}); },
      TypeError,
      /\boptions.out\b/
    );
  });

  it('returns Error for non-Writable err', function() {
    assert.throws(
      // eslint-disable-next-line no-new
      function() { new GitStatusChecker({err: new stream.Readable()}); },
      TypeError,
      /\boptions.err\b/
    );
  });

  describe('.checkSlugFormat()', function() {
    var GOOD_SLUGS = [
      // Canonical example
      'owner/repo',
      // Numbers and hyphens are fine
      'owner-1/repo-1'
    ];
    GOOD_SLUGS.forEach(function acceptsSlug(slug) {
      it('accepts "' + slug + '"', function() {
        var result = GitStatusChecker.checkSlugFormat(slug);
        assert.strictEqual(result, slug);
      });
    });

    var BAD_SLUGS = [
      // Missing slash (this is the only case checked by travis.rb)
      'repo',
      // We reject things which would change the URL interpretation
      '/owner/repo',
      '/repo',
      'owner/',
      'owner//repo',
      'owner/repo/',
      'owner/repo/branch',
      // And things with spaces, since GitHub is unlikely to ever support
      // them in the future and they are likely user errors
      ' owner/repo',
      'owner /repo',
      'owner/ repo',
      'owner/repo '
    ];
    BAD_SLUGS.forEach(function rejectsSlug(slug) {
      it('rejects "' + slug + '"', function() {
        assert.throws(
          function() { GitStatusChecker.checkSlugFormat(slug); },
          InvalidSlugError
        );
      });
    });
  });

  describe('#resolveHash()', function() {
    var headHash;
    it('can resolve the hash of HEAD', function() {
      var checker = new GitStatusChecker();
      return checker.resolveHash('HEAD').then(function(hash) {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
        headHash = hash;
      });
    });

    it('can resolve a hash to itself', function() {
      var checker = new GitStatusChecker();
      return checker.resolveHash(headHash).then(function(hash) {
        assert.strictEqual(hash, headHash);
      });
    });

    it('rejects with Error for unresolvable name', function() {
      var checker = new GitStatusChecker();
      return checker.resolveHash('notabranch').then(
        sinon.mock().never(),
        function(err) {
          assert(err);
        }
      );
    });
  });

  describe('#storeSlug()', function() {
    afterEach(unsetTravisSlug);

    it('can store a valid slug', function() {
      var checker = new GitStatusChecker();
      var testSlug = 'foo/bar';
      return checker.storeSlug(testSlug).then(function(slug) {
        assert.strictEqual(slug, testSlug);

        return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
          .then(function(result) {
            var configSlug = result[0].trimRight();
            assert.strictEqual(configSlug, testSlug);
          });
      });
    });

    it('returns Error for an invalid slug', function() {
      var checker = new GitStatusChecker();
      var testSlug = 'foobar';
      return checker.storeSlug(testSlug).then(
        sinon.mock().never(),
        function(errStore) {
          assert.instanceOf(errStore, InvalidSlugError);

          return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
            .then(
              function(configSlug) {
                assert.fail(configSlug, null, 'slug should not be stored');
              },
              function(errGit) {
                return errGit.code === 1 ? null : Promise.reject(errGit);
              }
            );
        }
      );
    });
  });

  describe('#tryStoreSlug()', function() {
    afterEach(unsetTravisSlug);

    it('can store a valid slug', function() {
      var checker = new GitStatusChecker();
      var testSlug = 'foo/bar';
      return checker.tryStoreSlug(testSlug).then(function(slug) {
        assert.strictEqual(slug, testSlug);

        return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
          .then(function(result) {
            var configSlug = result[0].trimRight();
            assert.strictEqual(configSlug, testSlug);
          });
      });
    });

    it('prints error message for an invalid slug', function() {
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var checker = new GitStatusChecker({
        out: outStream,
        err: errStream
      });
      var testSlug = 'foobar';
      return checker.tryStoreSlug(testSlug).then(function(slug) {
        assert.strictEqual(slug, testSlug);
        assert.strictEqual(outStream.read(), null);
        assert.match(String(errStream.read()), /error/i);

        return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
          .then(
            function(configSlug) {
              assert.fail(configSlug, null, 'slug should not be stored');
            },
            function(errGit) {
              return errGit.code === 1 ? null : Promise.reject(errGit);
            }
          );
      });
    });
  });

  describe('#confirmSlug()', function() {
    it('prompts user for confirmation', function() {
      var inStream = new stream.PassThrough();
      var outStream = new stream.PassThrough({encoding: 'utf8'});
      var errStream = new stream.PassThrough({encoding: 'utf8'});
      var checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream
      });

      var testSlug = 'foo/bar';
      var confirmP = checker.confirmSlug(testSlug);

      return read(errStream)
        .then(function checkPrompt(promptMsg) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg, /correct/i);
          assert.include(promptMsg, testSlug);
          inStream.write('y\n');
          return confirmP;
        })
        .then(function checkSlug(slug) {
          assert.strictEqual(slug, testSlug);
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('prompts user for slug if not confirmed', function() {
      var inStream = new stream.PassThrough();
      var outStream = new stream.PassThrough({encoding: 'utf8'});
      var errStream = new stream.PassThrough({encoding: 'utf8'});
      var checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream
      });

      var testSlug1 = 'foo/bar';
      var testSlug2 = 'baz/quux';
      var confirmP = checker.confirmSlug(testSlug1);

      return read(errStream)
        .then(function checkPrompt1(promptMsg1) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg1, /correct/i);
          assert.include(promptMsg1, testSlug1);
          inStream.write('n\n');
          return read(errStream);
        })
        .then(function checkPrompt2(promptMsg2) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg2, /repository/i);
          assert.include(promptMsg2, testSlug1);
          inStream.write(testSlug2 + '\n');
          return confirmP;
        }).then(function checkSlug(slug) {
          assert.strictEqual(slug, testSlug2);
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('re-prompts user if slug is invalid', function() {
      var inStream = new stream.PassThrough();
      var outStream = new stream.PassThrough({encoding: 'utf8'});
      var errStream = new stream.PassThrough({encoding: 'utf8'});
      var checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream
      });

      var testSlug1 = 'foo/bar';
      var testSlug2 = 'fred';
      var testSlug3 = 'baz/quux';
      var confirmP = checker.confirmSlug(testSlug1);

      return read(errStream)
        .then(function checkPrompt1(promptMsg1) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg1, /correct/i);
          assert.include(promptMsg1, testSlug1);
          inStream.write('n\n');
          return read(errStream);
        })
        .then(function checkPrompt2(promptMsg2) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg2, /repository/i);
          assert.include(promptMsg2, testSlug1);
          inStream.write(testSlug2 + '\n');
          return read(errStream);
        })
        .then(function checkError(errorMsg) {
          assert.strictEqual(outStream.read(), null);
          assert.match(errorMsg, /invalid/i);
          // Prompt may be part of error message or not
          if (errorMsg.indexOf(testSlug1) >= 0) {
            return errorMsg;
          }
          return read(errStream);
        })
        .then(function checkPrompt3(promptMsg3) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg3, /repository/i);
          assert.include(promptMsg3, testSlug1);
          inStream.write(testSlug3 + '\n');
          return confirmP;
        })
        .then(function checkSlug(slug) {
          assert.strictEqual(slug, testSlug3);
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('rejects with EOFError if input ends', function() {
      var inStream = new stream.PassThrough();
      var outStream = new stream.PassThrough({encoding: 'utf8'});
      var errStream = new stream.PassThrough({encoding: 'utf8'});
      var checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream
      });

      var testSlug = 'foo/bar';
      var confirmP = checker.confirmSlug(testSlug);

      return read(errStream)
        .then(function checkPrompt(promptMsg) {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg, /correct/i);
          assert.include(promptMsg, testSlug);
          // End without newline (e.g. user hit ^D before return)
          inStream.end('y');
          return confirmP;
        })
        .then(
          sinon.mock().never(),
          function(err) {
            assert.strictEqual(err.name, 'EOFError');
            // Same message as travis.rb
            assert.strictEqual(err.message, 'The input stream is exhausted.');
            // Doesn't print error message itself, but calling code will
            assert.strictEqual(outStream.read(), null);
            assert.strictEqual(errStream.read(), null);
          }
        );
    });
  });

  describe('#detectBranch()', function() {
    after(function checkoutMaster() {
      return git('checkout', 'master');
    });

    it('resolves master on master', function() {
      var checker = new GitStatusChecker();
      return git('checkout', 'master')
        .then(function runDetect() {
          return checker.detectBranch();
        })
        .then(function checkBranch(branch) {
          assert.strictEqual(branch, 'master');
        });
    });

    it('resolves branch1 on branch1', function() {
      var checker = new GitStatusChecker();
      return git('checkout', 'branch1')
        .then(function runDetect() {
          return checker.detectBranch();
        })
        .then(function checkBranch(branch) {
          assert.strictEqual(branch, 'branch1');
        });
    });

    it('rejects with Error not on branch', function() {
      var checker = new GitStatusChecker();
      return git('checkout', 'HEAD^')
        .then(function runDetect() {
          return checker.detectBranch();
        })
        .then(
            sinon.mock().never(),
            function checkErr(err) {
              assert.match(err.message, /branch/i);
            }
          );
    });
  });

  describe('#detectSlug()', function() {
    after(function checkoutMaster() {
      return git('checkout', 'master');
    });

    Object.keys(BRANCH_REMOTES).forEach(function(branchName) {
      var remoteName = BRANCH_REMOTES[branchName].split('/')[0];
      var remoteSlug = REMOTE_SLUGS[remoteName];
      if (!remoteSlug) {
        return;
      }

      it('resolves ' + remoteSlug + ' for ' + branchName, function() {
        var checker = new GitStatusChecker({
          out: new stream.PassThrough(),
          err: new stream.PassThrough()
        });
        return git('checkout', branchName)
          .then(function runDetect() {
            return checker.detectSlug();
          })
          .then(function checkSlug(slug) {
            assert.strictEqual(slug, remoteSlug);
          });
      });
    });

    it('defaults to origin if branch has no remote', function() {
      var checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough()
      });
      return git('checkout', 'master')
        .then(function runDetect() {
          return checker.detectSlug();
        })
        .then(function checkSlug(slug) {
          assert.strictEqual(slug, REMOTE_SLUGS.origin);
        });
    });

    it('defaults to origin if not on branch', function() {
      var checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough()
      });
      return git('checkout', 'HEAD^')
        .then(function runDetect() {
          return checker.detectSlug();
        })
        .then(function checkSlug(slug) {
          assert.strictEqual(slug, REMOTE_SLUGS.origin);
        });
    });

    it('rejects with SlugDetectionError for remote with no URL', function() {
      var checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough()
      });
      return git('checkout', 'branchnourl')
        .then(function runDetect() {
          return checker.detectSlug();
        })
        .then(
          sinon.mock().never(),
          function checkError(err) {
            assert.strictEqual(err.name, 'SlugDetectionError');
            assert.match(err.message, /remote/i);
          }
        );
    });

    it('rejects with SlugDetectionError for remote without slug', function() {
      var checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough()
      });
      return git('checkout', 'branchnotslug')
        .then(function runDetect() {
          return checker.detectSlug();
        })
        .then(
          sinon.mock().never(),
          function checkError(err) {
            assert.strictEqual(err.name, 'SlugDetectionError');
            assert.match(err.message, /URL/i);
          }
        );
    });

    it('prompts for confirmation if interactive', function() {
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var checker = new GitStatusChecker({
        interactive: true,
        out: outStream,
        err: errStream
      });
      var testSlug = 'prompt/slug';
      var mock = sinon.mock(checker);
      mock.expects('confirmSlug')
        .once().withExactArgs(REMOTE_SLUGS.origin).returns(testSlug);

      return git('checkout', 'master')
        .then(function runDetect() {
          return checker.detectSlug();
        })
        .then(function checkSlug(slug) {
          assert.strictEqual(slug, testSlug);
          // Only output is from prompt (which is mocked)
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('prints result without confirmation if not interactive', function() {
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough({encoding: 'utf8'});
      var checker = new GitStatusChecker({
        out: outStream,
        err: errStream
      });
      var mock = sinon.mock(checker);
      mock.expects('confirmSlug').never();

      return git('checkout', 'master')
        .then(function runDetect() {
          return checker.detectSlug();
        })
        .then(function checkSlug(slug) {
          assert.strictEqual(slug, REMOTE_SLUGS.origin);
          assert.strictEqual(outStream.read(), null);
          // From travis.rb
          var detectMsg = 'detected repository as ' + chalk.bold(slug) + '\n';
          assert.strictEqual(errStream.read(), detectMsg);
        });
    });
  });

  describe('#loadSlug()', function() {
    afterEach(unsetTravisSlug);

    it('loads slug set by #storeSlug()', function() {
      var checker = new GitStatusChecker();
      var testSlug = 'foo/bar';
      return checker.storeSlug(testSlug).then(function() {
        return checker.loadSlug().then(function checkSlug(slug) {
          assert.strictEqual(slug, testSlug);
        });
      });
    });

    it('resolves null if slug is not set', function() {
      var checker = new GitStatusChecker();
      return checker.loadSlug().then(function checkSlug(slug) {
        assert.strictEqual(slug, null);
      });
    });
  });

  describe('#findSlug()', function() {
    it('uses #loadSlug() result if non-null', function() {
      var checker = new GitStatusChecker();
      var testSlug = 'foo/bar';
      var mock = sinon.mock(checker);
      mock.expects('loadSlug')
        .once().withExactArgs().returns(Promise.resolve(testSlug));
      mock.expects('detectSlug').never();
      return checker.findSlug().then(function checkSlug(slug) {
        assert.strictEqual(slug, testSlug);
      });
    });

    it('uses #detectSlug() result if #loadSlug() is null', function() {
      var checker = new GitStatusChecker();
      var testSlug = 'foo/bar';
      var mock = sinon.mock(checker);
      mock.expects('loadSlug')
        .once().withExactArgs().returns(Promise.resolve(null));
      mock.expects('detectSlug')
        .once().withExactArgs().returns(Promise.resolve(testSlug));
      return checker.findSlug().then(function checkSlug(slug) {
        assert.strictEqual(slug, testSlug);
      });
    });
  });
});
