/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { assert } = require('chai');
const path = require('path');
const { read } = require('promised-read');
const rimraf = require('rimraf');
const sinon = require('sinon');
const stream = require('stream');
const util = require('util');

const GitStatusChecker = require('../lib/git-status-checker');
const InvalidSlugError = require('../lib/invalid-slug-error');
const git = require('../lib/git');

const isWindows = /^win/i.test(process.platform);
const rimrafP = util.promisify(rimraf);

// Global variables
let origCWD;

const BRANCH_REMOTES = {
  branch1: 'remote1/master',
  branch2: 'remote2/master',
  branch3: 'remote3/master',
  branchnourl: 'nourl/master',
  branchnotslug: 'notslug/master',
};
const REMOTES = {
  notslug: 'foo',
  origin: 'https://github.com/owner/repo',
  remote1: 'git@github.com:owner1/repo1.git',
  remote2: 'https://github.com/owner2/repo2.git',
  remote3: 'https::https://github.com/owner3/repo3.git',
};
const REMOTE_SLUGS = {
  origin: 'owner/repo',
  remote1: 'owner1/repo1',
  remote2: 'owner2/repo2',
  remote3: 'owner3/repo3',
};
/** Path to repository in which tests are run. */
const TEST_REPO_PATH = path.join(__dirname, '..', 'test-repo');

before('setup test repository', function() {
  // Some git versions can run quite slowly on Windows
  this.timeout(isWindows ? 8000 : 4000);

  return rimrafP(TEST_REPO_PATH)
    .then(() => git('init', '-q', TEST_REPO_PATH))
    // The user name and email must be configured for the later git commands
    // to work.  On Travis CI (and probably others) there is no global config
    .then(() => git('-C', TEST_REPO_PATH,
      'config', 'user.name', 'Test User'))
    .then(() => git('-C', TEST_REPO_PATH,
      'config', 'user.email', 'test@example.com'))
    .then(() => git('-C', TEST_REPO_PATH,
      'commit', '-q', '-m', 'Initial Commit', '--allow-empty'))
    .then(() => git('-C', TEST_REPO_PATH,
      'commit', '-q', '-m', 'Second Commit', '--allow-empty'))
    .then(() => Object.keys(REMOTES).reduce((p, remoteName) => p.then(() => {
      const remoteUrl = REMOTES[remoteName];
      return git('-C', TEST_REPO_PATH,
        'remote', 'add', remoteName, remoteUrl);
    }), Promise.resolve()))
    .then(() => Object.keys(BRANCH_REMOTES)
      .reduce((p, branchName) => p.then(() => {
        const upstream = BRANCH_REMOTES[branchName];
        let gitBranchP = git('-C', TEST_REPO_PATH, 'branch', branchName);
        if (upstream) {
          gitBranchP = gitBranchP.then(() => {
            // Note:  Can't use 'git branch -u' without fetching remote
            const upstreamParts = upstream.split('/');
            assert.strictEqual(upstreamParts.length, 2);
            const remoteName = upstreamParts[0];
            const remoteBranch = upstreamParts[1];
            const remoteRef = `refs/heads/${remoteBranch}`;
            const configBranch = `branch.${branchName}`;
            const configMerge = `${configBranch}.merge`;
            const configRemote = `${configBranch}.remote`;
            return git('-C', TEST_REPO_PATH,
              'config', '--add', configRemote, remoteName)
              .then(() => git('-C', TEST_REPO_PATH,
                'config', '--add', configMerge, remoteRef));
          });
        }
        return gitBranchP;
      }), Promise.resolve()));
});

before('run from test repository', () => {
  origCWD = process.cwd();
  process.chdir(TEST_REPO_PATH);
});

after('restore original working directory', () => {
  process.chdir(origCWD);
});

after('remove test repository', () => rimrafP(TEST_REPO_PATH));

function unsetTravisSlug() {
  return git('config', '--unset-all', GitStatusChecker.SLUG_CONFIG_NAME)
    .catch((err) => (err.code === 5 ? null : Promise.reject(err)));
}

describe('GitStatusChecker', () => {
  it('throws TypeError for non-object options', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new GitStatusChecker(true); },
      TypeError,
      /\boptions\b/,
    );
  });

  it('throws TypeError for non-Readable in', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new GitStatusChecker({ in: new stream.Writable() }); },
      TypeError,
      /\boptions.in\b/,
    );
  });

  it('throws TypeError for non-Writable out', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new GitStatusChecker({ out: new stream.Readable() }); },
      TypeError,
      /\boptions.out\b/,
    );
  });

  it('returns Error for non-Writable err', () => {
    assert.throws(
      // eslint-disable-next-line no-new
      () => { new GitStatusChecker({ err: new stream.Readable() }); },
      TypeError,
      /\boptions.err\b/,
    );
  });

  describe('.checkSlugFormat()', () => {
    const GOOD_SLUGS = [
      // Canonical example
      'owner/repo',
      // Numbers and hyphens are fine
      'owner-1/repo-1',
    ];
    GOOD_SLUGS.forEach((slug) => {
      it(`accepts "${slug}"`, () => {
        const result = GitStatusChecker.checkSlugFormat(slug);
        assert.strictEqual(result, slug);
      });
    });

    const BAD_SLUGS = [
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
      'owner/repo ',
    ];
    BAD_SLUGS.forEach((slug) => {
      it(`rejects "${slug}"`, () => {
        assert.throws(
          () => { GitStatusChecker.checkSlugFormat(slug); },
          InvalidSlugError,
        );
      });
    });
  });

  describe('#resolveHash()', () => {
    let headHash;
    it('can resolve the hash of HEAD', () => {
      const checker = new GitStatusChecker();
      return checker.resolveHash('HEAD').then((hash) => {
        assert.match(hash, /^[a-fA-F0-9]{40}$/);
        headHash = hash;
      });
    });

    it('can resolve a hash to itself', () => {
      const checker = new GitStatusChecker();
      return checker.resolveHash(headHash).then((hash) => {
        assert.strictEqual(hash, headHash);
      });
    });

    it('rejects with Error for unresolvable name', () => {
      const checker = new GitStatusChecker();
      return checker.resolveHash('notabranch').then(
        sinon.mock().never(),
        (err) => {
          assert(err);
        },
      );
    });
  });

  describe('#storeSlug()', () => {
    afterEach(unsetTravisSlug);

    it('can store a valid slug', () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      return checker.storeSlug(testSlug).then((slug) => {
        assert.strictEqual(slug, testSlug);

        return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
          .then((result) => {
            const configSlug = result[0].trimRight();
            assert.strictEqual(configSlug, testSlug);
          });
      });
    });

    it('returns Error for an invalid slug', () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foobar';
      return checker.storeSlug(testSlug).then(
        sinon.mock().never(),
        (errStore) => {
          assert.instanceOf(errStore, InvalidSlugError);

          return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
            .then(
              (configSlug) => {
                assert.fail(configSlug, null, 'slug should not be stored');
              },
              (errGit) => (errGit.code === 1 ? null : Promise.reject(errGit)),
            );
        },
      );
    });
  });

  describe('#tryStoreSlug()', () => {
    afterEach(unsetTravisSlug);

    it('can store a valid slug', () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      return checker.tryStoreSlug(testSlug).then((slug) => {
        assert.strictEqual(slug, testSlug);

        return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
          .then((result) => {
            const configSlug = result[0].trimRight();
            assert.strictEqual(configSlug, testSlug);
          });
      });
    });

    it('prints error message for an invalid slug', () => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const checker = new GitStatusChecker({
        out: outStream,
        err: errStream,
      });
      const testSlug = 'foobar';
      return checker.tryStoreSlug(testSlug).then((slug) => {
        assert.strictEqual(slug, testSlug);
        assert.strictEqual(outStream.read(), null);
        assert.match(String(errStream.read()), /error/i);

        return git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME)
          .then(
            (configSlug) => {
              assert.fail(configSlug, null, 'slug should not be stored');
            },
            (errGit) => (errGit.code === 1 ? null : Promise.reject(errGit)),
          );
      });
    });
  });

  describe('#confirmSlug()', () => {
    it('prompts user for confirmation', () => {
      const inStream = new stream.PassThrough();
      const outStream = new stream.PassThrough({ encoding: 'utf8' });
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream,
      });

      const testSlug = 'foo/bar';
      const confirmP = checker.confirmSlug(testSlug);

      return read(errStream)
        .then((promptMsg) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg, /correct/i);
          assert.include(promptMsg, testSlug);
          inStream.write('y\n');
          return confirmP;
        })
        .then((slug) => {
          assert.strictEqual(slug, testSlug);
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('prompts user for slug if not confirmed', () => {
      const inStream = new stream.PassThrough();
      const outStream = new stream.PassThrough({ encoding: 'utf8' });
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream,
      });

      const testSlug1 = 'foo/bar';
      const testSlug2 = 'baz/quux';
      const confirmP = checker.confirmSlug(testSlug1);

      return read(errStream)
        .then((promptMsg1) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg1, /correct/i);
          assert.include(promptMsg1, testSlug1);
          inStream.write('n\n');
          return read(errStream);
        })
        .then((promptMsg2) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg2, /repository/i);
          assert.include(promptMsg2, testSlug1);
          inStream.write(`${testSlug2}\n`);
          return confirmP;
        }).then((slug) => {
          assert.strictEqual(slug, testSlug2);
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('re-prompts user if slug is invalid', () => {
      const inStream = new stream.PassThrough();
      const outStream = new stream.PassThrough({ encoding: 'utf8' });
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream,
      });

      const testSlug1 = 'foo/bar';
      const testSlug2 = 'fred';
      const testSlug3 = 'baz/quux';
      const confirmP = checker.confirmSlug(testSlug1);

      return read(errStream)
        .then((promptMsg1) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg1, /correct/i);
          assert.include(promptMsg1, testSlug1);
          inStream.write('n\n');
          return read(errStream);
        })
        .then((promptMsg2) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg2, /repository/i);
          assert.include(promptMsg2, testSlug1);
          inStream.write(`${testSlug2}\n`);
          return read(errStream);
        })
        .then((errorMsg) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(errorMsg, /invalid/i);
          // Prompt may be part of error message or not
          if (errorMsg.includes(testSlug1)) {
            return errorMsg;
          }
          return read(errStream);
        })
        .then((promptMsg3) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg3, /repository/i);
          assert.include(promptMsg3, testSlug1);
          inStream.write(`${testSlug3}\n`);
          return confirmP;
        })
        .then((slug) => {
          assert.strictEqual(slug, testSlug3);
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('rejects with EOFError if input ends', () => {
      const inStream = new stream.PassThrough();
      const outStream = new stream.PassThrough({ encoding: 'utf8' });
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream,
      });

      const testSlug = 'foo/bar';
      const confirmP = checker.confirmSlug(testSlug)
        .then(
          sinon.mock().never(),
          (err) => {
            assert.strictEqual(err.name, 'EOFError');
            // Same message as travis.rb
            assert.strictEqual(err.message, 'The input stream is exhausted.');
            // Doesn't print error message itself, but calling code will
            assert.strictEqual(outStream.read(), null);
            assert.strictEqual(errStream.read(), null);
          },
        );
      const promptP = read(errStream)
        .then((promptMsg) => {
          assert.strictEqual(outStream.read(), null);
          assert.match(promptMsg, /correct/i);
          assert.include(promptMsg, testSlug);
          // End without newline (e.g. user hit ^D before return)
          inStream.end('y');
        });
      return Promise.all([confirmP, promptP]);
    });
  });

  describe('#detectBranch()', () => {
    after(() => git('checkout', 'master'));

    it('resolves master on master', () => {
      const checker = new GitStatusChecker();
      return git('checkout', 'master')
        .then(() => checker.detectBranch())
        .then((branch) => {
          assert.strictEqual(branch, 'master');
        });
    });

    it('resolves branch1 on branch1', () => {
      const checker = new GitStatusChecker();
      return git('checkout', 'branch1')
        .then(() => checker.detectBranch())
        .then((branch) => {
          assert.strictEqual(branch, 'branch1');
        });
    });

    it('rejects with Error not on branch', () => {
      const checker = new GitStatusChecker();
      return git('checkout', 'HEAD^')
        .then(() => checker.detectBranch())
        .then(
          sinon.mock().never(),
          (err) => {
            assert.match(err.message, /branch/i);
          },
        );
    });
  });

  describe('#detectSlug()', () => {
    after(() => git('checkout', 'master'));

    Object.keys(BRANCH_REMOTES).forEach((branchName) => {
      const remoteName = BRANCH_REMOTES[branchName].split('/')[0];
      const remoteSlug = REMOTE_SLUGS[remoteName];
      if (!remoteSlug) {
        return;
      }

      it(`resolves ${remoteSlug} for ${branchName}`, () => {
        const checker = new GitStatusChecker({
          out: new stream.PassThrough(),
          err: new stream.PassThrough(),
        });
        return git('checkout', branchName)
          .then(() => checker.detectSlug())
          .then((slug) => {
            assert.strictEqual(slug, remoteSlug);
          });
      });
    });

    it('defaults to origin if branch has no remote', () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      return git('checkout', 'master')
        .then(() => checker.detectSlug())
        .then((slug) => {
          assert.strictEqual(slug, REMOTE_SLUGS.origin);
        });
    });

    it('defaults to origin if not on branch', () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      return git('checkout', 'HEAD^')
        .then(() => checker.detectSlug())
        .then((slug) => {
          assert.strictEqual(slug, REMOTE_SLUGS.origin);
        });
    });

    it('rejects with SlugDetectionError for remote with no URL', () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      return git('checkout', 'branchnourl')
        .then(() => checker.detectSlug())
        .then(
          sinon.mock().never(),
          (err) => {
            assert.strictEqual(err.name, 'SlugDetectionError');
            assert.match(err.message, /remote/i);
          },
        );
    });

    it('rejects with SlugDetectionError for remote without slug', () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      return git('checkout', 'branchnotslug')
        .then(() => checker.detectSlug())
        .then(
          sinon.mock().never(),
          (err) => {
            assert.strictEqual(err.name, 'SlugDetectionError');
            assert.match(err.message, /URL/i);
          },
        );
    });

    it('prompts for confirmation if interactive', () => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const checker = new GitStatusChecker({
        interactive: true,
        out: outStream,
        err: errStream,
      });
      const testSlug = 'prompt/slug';
      const mock = sinon.mock(checker);
      mock.expects('confirmSlug')
        .once().withExactArgs(REMOTE_SLUGS.origin).returns(testSlug);

      return git('checkout', 'master')
        .then(() => checker.detectSlug())
        .then((slug) => {
          assert.strictEqual(slug, testSlug);
          // Only output is from prompt (which is mocked)
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
        });
    });

    it('prints result without confirmation if not interactive', () => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        out: outStream,
        err: errStream,
      });
      const mock = sinon.mock(checker);
      mock.expects('confirmSlug').never();

      return git('checkout', 'master')
        .then(() => checker.detectSlug())
        .then((slug) => {
          assert.strictEqual(slug, REMOTE_SLUGS.origin);
          assert.strictEqual(outStream.read(), null);
          // From travis.rb
          const detectMsg = `detected repository as ${slug}\n`;
          assert.strictEqual(errStream.read(), detectMsg);
        });
    });
  });

  describe('#loadSlug()', () => {
    afterEach(unsetTravisSlug);

    it('loads slug set by #storeSlug()', () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      return checker.storeSlug(testSlug)
        .then(() => checker.loadSlug().then((slug) => {
          assert.strictEqual(slug, testSlug);
        }));
    });

    it('resolves null if slug is not set', () => {
      const checker = new GitStatusChecker();
      return checker.loadSlug().then((slug) => {
        assert.strictEqual(slug, null);
      });
    });
  });

  describe('#findSlug()', () => {
    it('uses #loadSlug() result if non-null', () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      const mock = sinon.mock(checker);
      mock.expects('loadSlug')
        .once().withExactArgs().returns(Promise.resolve(testSlug));
      mock.expects('detectSlug').never();
      return checker.findSlug().then((slug) => {
        assert.strictEqual(slug, testSlug);
      });
    });

    it('uses #detectSlug() result if #loadSlug() is null', () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      const mock = sinon.mock(checker);
      mock.expects('loadSlug')
        .once().withExactArgs().returns(Promise.resolve(null));
      mock.expects('detectSlug')
        .once().withExactArgs().returns(Promise.resolve(testSlug));
      return checker.findSlug().then((slug) => {
        assert.strictEqual(slug, testSlug);
      });
    });
  });
});
