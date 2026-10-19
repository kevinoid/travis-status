/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { rejects: assertRejects } = require('node:assert');
const { rm } = require('node:fs/promises');
const path = require('node:path');
const stream = require('node:stream');

const { assert } = require('chai');
const { read } = require('promised-read');
const sinon = require('sinon');

const GitStatusChecker = require('../lib/git-status-checker.js');
const git = require('../lib/git.js');
const InvalidSlugError = require('../lib/invalid-slug-error.js');

const isWindows = /^win/i.test(process.platform);

// Global variables
let origCWD;

const defaultBranch = 'main';
const BRANCH_REMOTES = {
  branch1: `remote1/${defaultBranch}`,
  branch2: `remote2/${defaultBranch}`,
  branch3: `remote3/${defaultBranch}`,
  branchnourl: `nourl/${defaultBranch}`,
  branchnotslug: `notslug/${defaultBranch}`,
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

async function gitInit(repoPath) {
  try {
    // git-init(1) in 2.30.0 warns that default branch subject to change.
    // It may also have non-default global- or user-configuration.
    // Specify --initial-branch to avoid depending on default
    await git('init', '-q', `--initial-branch=${defaultBranch}`, repoPath);
  } catch {
    // git < 2.28.0 doesn't understand --initial-branch, default is master
    await git('init', '-q', repoPath);
    if (defaultBranch !== 'master') {
      /* eslint-disable
           @stylistic/function-call-argument-newline,
           @stylistic/function-paren-newline */
      await git(
        '-C', repoPath,
        'symbolic-ref',
        'HEAD',
        `refs/heads/${defaultBranch}`,
      );
      /* eslint-enable
           @stylistic/function-call-argument-newline,
           @stylistic/function-paren-newline */
    }
  }
}

// Put git arguments which are related on the same line for readability.
/* eslint-disable
     @stylistic/function-call-argument-newline,
     @stylistic/function-paren-newline */
before('setup test repository', async function() {
  // Some git versions can run slowly on Windows (especially on shared CI)
  this.timeout(isWindows ? 8000 : 4000);

  await rm(TEST_REPO_PATH, { force: true, recursive: true });
  await gitInit(TEST_REPO_PATH);
  // The user name and email must be configured for the later git commands
  // to work.  On Travis CI (and probably others) there is no global config
  await git(
    '-C', TEST_REPO_PATH,
    'config', 'user.name', 'Test User',
  );
  await git(
    '-C', TEST_REPO_PATH,
    'config', 'user.email', 'test@example.com',
  );
  await git(
    '-C', TEST_REPO_PATH,
    'commit',
    '-q',
    '-m', 'Initial Commit',
    '--allow-empty',
  );
  await git(
    '-C', TEST_REPO_PATH,
    'commit',
    '-q',
    '-m', 'Second Commit',
    '--allow-empty',
  );
  // Configure remotes/upstream sequentially
  // TODO: Can git handle concurrent config modification?
  /* eslint-disable no-await-in-loop */
  for (const [remoteName, remoteUrl] of Object.entries(REMOTES)) {
    await git(
      '-C', TEST_REPO_PATH,
      'remote', 'add', remoteName, remoteUrl,
    );
  }
  for (const [branchName, upstream] of Object.entries(BRANCH_REMOTES)) {
    await git('-C', TEST_REPO_PATH, 'branch', branchName);
    if (upstream) {
      // Note:  Can't use 'git branch -u' without fetching remote
      const upstreamParts = upstream.split('/');
      assert.strictEqual(upstreamParts.length, 2);
      const remoteName = upstreamParts[0];
      const remoteBranch = upstreamParts[1];
      const remoteRef = `refs/heads/${remoteBranch}`;
      const configBranch = `branch.${branchName}`;
      const configMerge = `${configBranch}.merge`;
      const configRemote = `${configBranch}.remote`;
      await git(
        '-C', TEST_REPO_PATH,
        'config', '--add', configRemote, remoteName,
      );
      await git(
        '-C', TEST_REPO_PATH,
        'config', '--add', configMerge, remoteRef,
      );
    }
  }
  /* eslint-enable no-await-in-loop */
});
/* eslint-enable
     @stylistic/function-call-argument-newline,
     @stylistic/function-paren-newline */

before('run from test repository', () => {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
  origCWD = process.cwd();
  process.chdir(TEST_REPO_PATH);
});

after('restore original working directory', () => {
  process.chdir(origCWD);
});

after('remove test repository', () => {
  return rm(TEST_REPO_PATH, { force: true, recursive: true });
});

async function unsetTravisSlug() {
  try {
    await git('config', '--unset-all', GitStatusChecker.SLUG_CONFIG_NAME);
  } catch (err) {
    if (err.code !== 5) {
      throw err;
    }
  }
}

describe('GitStatusChecker', function() {
  // Some git versions can run slowly on Windows (especially on shared CI)
  this.timeout(isWindows ? 4000 : 2000);

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
    for (const slug of GOOD_SLUGS) {
      it(`accepts "${slug}"`, () => {
        const result = GitStatusChecker.checkSlugFormat(slug);
        assert.strictEqual(result, slug);
      });
    }

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
    for (const slug of BAD_SLUGS) {
      it(`rejects "${slug}"`, () => {
        assert.throws(
          () => { GitStatusChecker.checkSlugFormat(slug); },
          InvalidSlugError,
        );
      });
    }
  });

  describe('#resolveHash()', () => {
    let headHash;
    it('can resolve the hash of HEAD', async () => {
      const checker = new GitStatusChecker();
      const hash = await checker.resolveHash('HEAD');
      assert.match(hash, /^[a-fA-F0-9]{40}$/);
      headHash = hash;
    });

    it('can resolve a hash to itself', async () => {
      const checker = new GitStatusChecker();
      const hash = await checker.resolveHash(headHash);
      assert.strictEqual(hash, headHash);
    });

    it('rejects with Error for unresolvable name', async () => {
      const checker = new GitStatusChecker();
      await assertRejects(
        checker.resolveHash('notabranch'),
        Error,
      );
    });
  });

  describe('#storeSlug()', () => {
    afterEach(unsetTravisSlug);

    it('can store a valid slug', async () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      const slug = await checker.storeSlug(testSlug);
      assert.strictEqual(slug, testSlug);

      const result =
        await git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME);
      const configSlug = result[0].trimEnd();
      assert.strictEqual(configSlug, testSlug);
    });

    it('returns Error for an invalid slug', async () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foobar';
      await assertRejects(
        checker.storeSlug(testSlug),
        InvalidSlugError,
      );

      let configSlug;
      try {
        configSlug =
          await git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME);
      } catch (errGit) {
        if (errGit.code === 1) {
          return;
        }

        throw errGit;
      }

      assert.fail(configSlug, null, 'slug should not be stored');
    });
  });

  describe('#tryStoreSlug()', () => {
    afterEach(unsetTravisSlug);

    it('can store a valid slug', async () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      const slug = await checker.tryStoreSlug(testSlug);
      assert.strictEqual(slug, testSlug);

      const result =
        await git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME);
      const configSlug = result[0].trimEnd();
      assert.strictEqual(configSlug, testSlug);
    });

    it('prints error message for an invalid slug', async () => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const checker = new GitStatusChecker({
        out: outStream,
        err: errStream,
      });
      const testSlug = 'foobar';
      const slug = await checker.tryStoreSlug(testSlug);
      assert.strictEqual(slug, testSlug);
      assert.strictEqual(outStream.read(), null);
      assert.match(String(errStream.read()), /error/i);

      let configSlug;
      try {
        configSlug =
          await git('config', '--get', GitStatusChecker.SLUG_CONFIG_NAME);
      } catch (errGit) {
        if (errGit.code === 1) {
          return;
        }

        throw errGit;
      }

      assert.fail(configSlug, null, 'slug should not be stored');
    });
  });

  describe('#confirmSlug()', () => {
    it('prompts user for confirmation', async () => {
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

      const promptMsg = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg, /correct/i);
      assert.include(promptMsg, testSlug);
      inStream.write('y\n');

      const slug = await confirmP;
      assert.strictEqual(slug, testSlug);
      assert.strictEqual(outStream.read(), null);
      assert.strictEqual(errStream.read(), null);
    });

    it('prompts user for slug if not confirmed', async () => {
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

      const promptMsg1 = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg1, /correct/i);
      assert.include(promptMsg1, testSlug1);
      inStream.write('n\n');

      const promptMsg2 = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg2, /repository/i);
      assert.include(promptMsg2, testSlug1);
      inStream.write(`${testSlug2}\n`);

      const slug = await confirmP;
      assert.strictEqual(slug, testSlug2);
      assert.strictEqual(outStream.read(), null);
      assert.strictEqual(errStream.read(), null);
    });

    it('re-prompts user if slug is invalid', async () => {
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

      const promptMsg1 = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg1, /correct/i);
      assert.include(promptMsg1, testSlug1);
      inStream.write('n\n');

      const promptMsg2 = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg2, /repository/i);
      assert.include(promptMsg2, testSlug1);
      inStream.write(`${testSlug2}\n`);

      const errorMsg = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(errorMsg, /invalid/i);

      // Prompt may be part of error message or not
      const promptMsg3 = errorMsg.includes(testSlug1) ? errorMsg
        : await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg3, /repository/i);
      assert.include(promptMsg3, testSlug1);
      inStream.write(`${testSlug3}\n`);

      const slug = await confirmP;
      assert.strictEqual(slug, testSlug3);
      assert.strictEqual(outStream.read(), null);
      assert.strictEqual(errStream.read(), null);
    });

    it('rejects with EOFError if input ends', async () => {
      const inStream = new stream.PassThrough();
      const outStream = new stream.PassThrough({ encoding: 'utf8' });
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        in: inStream,
        out: outStream,
        err: errStream,
      });

      const testSlug = 'foo/bar';
      const confirmP = assertRejects(
        checker.confirmSlug(testSlug),
        (err) => {
          assert.strictEqual(err.name, 'EOFError');
          // Same message as travis.rb
          assert.strictEqual(err.message, 'The input stream is exhausted.');
          // Doesn't print error message itself, but calling code will
          assert.strictEqual(outStream.read(), null);
          assert.strictEqual(errStream.read(), null);
          return true;
        },
      );

      const promptMsg = await read(errStream);
      assert.strictEqual(outStream.read(), null);
      assert.match(promptMsg, /correct/i);
      assert.include(promptMsg, testSlug);
      // End without newline (e.g. user hit ^D before return)
      inStream.end('y');

      await confirmP;
    });
  });

  describe('#detectBranch()', () => {
    after(() => git('checkout', defaultBranch));

    it(`resolves master on ${defaultBranch}`, async () => {
      const checker = new GitStatusChecker();
      await git('checkout', defaultBranch);
      const branch = await checker.detectBranch();
      assert.strictEqual(branch, defaultBranch);
    });

    it('resolves branch1 on branch1', async () => {
      const checker = new GitStatusChecker();
      await git('checkout', 'branch1');
      const branch = await checker.detectBranch();
      assert.strictEqual(branch, 'branch1');
    });

    it('rejects with Error not on branch', async () => {
      const checker = new GitStatusChecker();
      await git('checkout', 'HEAD^');
      await assertRejects(
        checker.detectBranch(),
        (err) => {
          assert.match(err.message, /branch/i);
          return true;
        },
      );
    });
  });

  describe('#detectSlug()', () => {
    after(() => git('checkout', defaultBranch));

    for (const [branchName, upstream] of Object.entries(BRANCH_REMOTES)) {
      const remoteName = upstream.split('/', 1)[0];
      const remoteSlug = REMOTE_SLUGS[remoteName];
      if (remoteSlug) {
        it(`resolves ${remoteSlug} for ${branchName}`, async () => {
          const checker = new GitStatusChecker({
            out: new stream.PassThrough(),
            err: new stream.PassThrough(),
          });
          await git('checkout', branchName);
          const slug = await checker.detectSlug();
          assert.strictEqual(slug, remoteSlug);
        });
      }
    }

    it('defaults to origin if branch has no remote', async () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      await git('checkout', defaultBranch);
      const slug = await checker.detectSlug();
      assert.strictEqual(slug, REMOTE_SLUGS.origin);
    });

    it('defaults to origin if not on branch', async () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      await git('checkout', 'HEAD^');
      const slug = await checker.detectSlug();
      assert.strictEqual(slug, REMOTE_SLUGS.origin);
    });

    it('rejects with SlugDetectionError for remote with no URL', async () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      await git('checkout', 'branchnourl');
      await assertRejects(
        checker.detectSlug(),
        (err) => {
          assert.strictEqual(err.name, 'SlugDetectionError');
          assert.match(err.message, /remote/i);
          return true;
        },
      );
    });

    it('rejects with SlugDetectionError for remote without slug', async () => {
      const checker = new GitStatusChecker({
        out: new stream.PassThrough(),
        err: new stream.PassThrough(),
      });
      await git('checkout', 'branchnotslug');
      await assertRejects(
        checker.detectSlug(),
        (err) => {
          assert.strictEqual(err.name, 'SlugDetectionError');
          assert.match(err.message, /URL/i);
          return true;
        },
      );
    });

    it('prompts for confirmation if interactive', async () => {
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

      await git('checkout', defaultBranch);
      const slug = await checker.detectSlug();
      assert.strictEqual(slug, testSlug);
      // Only output is from prompt (which is mocked)
      assert.strictEqual(outStream.read(), null);
      assert.strictEqual(errStream.read(), null);
    });

    it('prints result without confirmation if not interactive', async () => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough({ encoding: 'utf8' });
      const checker = new GitStatusChecker({
        out: outStream,
        err: errStream,
      });
      const mock = sinon.mock(checker);
      mock.expects('confirmSlug').never();

      await git('checkout', defaultBranch);
      const slug = await checker.detectSlug();
      assert.strictEqual(slug, REMOTE_SLUGS.origin);
      assert.strictEqual(outStream.read(), null);
      // From travis.rb
      const detectMsg = `detected repository as ${slug}\n`;
      assert.strictEqual(errStream.read(), detectMsg);
    });
  });

  describe('#loadSlug()', () => {
    afterEach(unsetTravisSlug);

    it('loads slug set by #storeSlug()', async () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      await checker.storeSlug(testSlug);
      const slug = await checker.loadSlug();
      assert.strictEqual(slug, testSlug);
    });

    it('resolves null if slug is not set', async () => {
      const checker = new GitStatusChecker();
      const slug = await checker.loadSlug();
      assert.strictEqual(slug, null);
    });
  });

  describe('#findSlug()', () => {
    it('uses #loadSlug() result if non-null', async () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      const mock = sinon.mock(checker);
      mock.expects('loadSlug')
        .once().withExactArgs().returns(Promise.resolve(testSlug));
      mock.expects('detectSlug').never();
      const slug = await checker.findSlug();
      assert.strictEqual(slug, testSlug);
    });

    it('uses #detectSlug() result if #loadSlug() is null', async () => {
      const checker = new GitStatusChecker();
      const testSlug = 'foo/bar';
      const mock = sinon.mock(checker);
      mock.expects('loadSlug')
        .once().withExactArgs().returns(Promise.resolve(null));
      mock.expects('detectSlug')
        .once().withExactArgs().returns(Promise.resolve(testSlug));
      const slug = await checker.findSlug();
      assert.strictEqual(slug, testSlug);
    });
  });
});
