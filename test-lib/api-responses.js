/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var apiResponses = {};

function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// The JSON is copied almost verbatim from the API responses.
/* eslint-disable max-len */

apiResponses.branch = function branch(opts) {
  opts = Object(opts);
  var sha = opts.sha || '692064aac95441e2dae7f1780fccc536143a0863';
  return cloneDeep({
    branch: {
      id: 109649462,
      repository_id: 7584951,
      commit_id: 31008785,
      number: opts.number || '5',
      config: {
        language: 'node_js',
        node_js: [
          'node',
          'iojs',
          4,
          0.12,
          0.1
        ],
        sudo: false,
        script: [
          'npm run test-cov'
        ],
        after_success: [
          'npm run upload-cov'
        ],
        group: 'stable',
        dist: 'precise'
      },
      state: opts.state || 'passed',
      started_at: '2016-02-16T16:48:30Z',
      finished_at: '2016-02-16T16:49:30Z',
      duration: 227,
      job_ids: [
        109649463,
        109649464,
        109649465,
        109649466,
        109649467
      ],
      pull_request: false
    },
    commit: {
      id: 31008785,
      sha: sha,
      branch: opts.branch || 'master',
      message: 'Skip verify hooks for postversion doc commit\n\nThis branch is just for hosting generated files.  There\'s no need to run\ncommit checks or sign off on the commits.\n\nSigned-off-by: Kevin Locke <kevin@kevinlocke.name>',
      committed_at: '2016-02-16T07:10:03Z',
      author_name: 'Kevin Locke',
      author_email: 'kevin@kevinlocke.name',
      committer_name: 'Kevin Locke',
      committer_email: 'kevin@kevinlocke.name',
      compare_url: 'https://github.com/' + (opts.slug || 'owner/repo') + '/compare/a73ca1cf3143...' + sha.slice(0, 12)
    }
  });
};

apiResponses.build = function build(opts) {
  opts = Object(opts);
  var buildId = opts.buildId || 109649462;
  var sha = opts.sha || '692064aac95441e2dae7f1780fccc536143a0863';
  return cloneDeep({
    build: {
      id: buildId,
      repository_id: 7584951,
      commit_id: 31008785,
      number: opts.number || '5',
      event_type: 'push',
      pull_request: false,
      pull_request_title: null,
      pull_request_number: null,
      config: {
        language: 'node_js',
        node_js: [
          'node',
          'iojs',
          4,
          0.12,
          0.1
        ],
        sudo: false,
        script: [
          'npm run test-cov'
        ],
        after_success: [
          'npm run upload-cov'
        ],
        group: 'stable',
        dist: 'precise'
      },
      state: opts.state || 'passed',
      started_at: '2016-02-16T16:48:30Z',
      finished_at: '2016-02-16T16:49:30Z',
      duration: 227,
      job_ids: [
        109649463,
        109649464,
        109649465,
        109649466,
        109649467
      ]
    },
    commit: {
      id: 31008785,
      sha: sha,
      branch: opts.branch || 'master',
      branch_is_default: true,
      message: 'Skip verify hooks for postversion doc commit\n\nThis branch is just for hosting generated files.  There\'s no need to run\ncommit checks or sign off on the commits.\n\nSigned-off-by: Kevin Locke <kevin@kevinlocke.name>',
      committed_at: '2016-02-16T07:10:03Z',
      author_name: 'Kevin Locke',
      author_email: 'kevin@kevinlocke.name',
      committer_name: 'Kevin Locke',
      committer_email: 'kevin@kevinlocke.name',
      compare_url: 'https://github.com/' + (opts.slug || 'owner/repo') + '/compare/a73ca1cf3143...' + sha.slice(0, 12)
    },
    jobs: [
      {
        id: 109649463,
        repository_id: 7584951,
        build_id: buildId,
        commit_id: 31008785,
        log_id: 78896929,
        state: opts.state || 'passed',
        number: '1.1',
        config: {
          language: 'node_js',
          node_js: 'node',
          sudo: false,
          script: [
            'npm run test-cov'
          ],
          after_success: [
            'npm run upload-cov'
          ],
          group: 'stable',
          dist: 'precise',
          os: 'linux'
        },
        started_at: '2016-02-16T16:48:30Z',
        finished_at: '2016-02-16T16:49:16Z',
        queue: 'builds.docker',
        allow_failure: false,
        tags: null,
        annotation_ids: []
      },
      {
        id: 109649464,
        repository_id: 7584951,
        build_id: buildId,
        commit_id: 31008785,
        log_id: 78896930,
        state: opts.state || 'passed',
        number: '1.2',
        config: {
          language: 'node_js',
          node_js: 'iojs',
          sudo: false,
          script: [
            'npm run test-cov'
          ],
          after_success: [
            'npm run upload-cov'
          ],
          group: 'stable',
          dist: 'precise',
          os: 'linux'
        },
        started_at: '2016-02-16T16:48:31Z',
        finished_at: '2016-02-16T16:49:16Z',
        queue: 'builds.docker',
        allow_failure: false,
        tags: null,
        annotation_ids: []
      },
      {
        id: 109649465,
        repository_id: 7584951,
        build_id: buildId,
        commit_id: 31008785,
        log_id: 78896931,
        state: opts.state || 'passed',
        number: '1.3',
        config: {
          language: 'node_js',
          node_js: 4,
          sudo: false,
          script: [
            'npm run test-cov'
          ],
          after_success: [
            'npm run upload-cov'
          ],
          group: 'stable',
          dist: 'precise',
          os: 'linux'
        },
        started_at: '2016-02-16T16:48:39Z',
        finished_at: '2016-02-16T16:49:28Z',
        queue: 'builds.docker',
        allow_failure: false,
        tags: null,
        annotation_ids: []
      },
      {
        id: 109649466,
        repository_id: 7584951,
        build_id: buildId,
        commit_id: 31008785,
        log_id: 78896932,
        state: opts.state || 'passed',
        number: '1.4',
        config: {
          language: 'node_js',
          node_js: 0.12,
          sudo: false,
          script: [
            'npm run test-cov'
          ],
          after_success: [
            'npm run upload-cov'
          ],
          group: 'stable',
          dist: 'precise',
          os: 'linux'
        },
        started_at: '2016-02-16T16:48:32Z',
        finished_at: '2016-02-16T16:49:30Z',
        queue: 'builds.docker',
        allow_failure: false,
        tags: null,
        annotation_ids: []
      },
      {
        id: 109649467,
        repository_id: 7584951,
        build_id: buildId,
        commit_id: 31008785,
        log_id: 78896933,
        state: opts.state || 'passed',
        number: '1.5',
        config: {
          language: 'node_js',
          node_js: 0.1,
          sudo: false,
          script: [
            'npm run test-cov'
          ],
          after_success: [
            'npm run upload-cov'
          ],
          group: 'stable',
          dist: 'precise',
          os: 'linux'
        },
        started_at: '2016-02-16T16:48:31Z',
        finished_at: '2016-02-16T16:49:00Z',
        queue: 'builds.docker',
        allow_failure: false,
        tags: null,
        annotation_ids: []
      }
    ],
    annotations: []
  });
};

apiResponses.repo = function repo(opts) {
  opts = Object(opts);
  return cloneDeep({
    repo: {
      id: 7584951,
      slug: opts.slug || 'owner/repo',
      active: true,
      description: 'An implementation of the status subcommand of The Travis Client in Node.js, with a few extra features.',
      last_build_id: opts.buildId || 109649462,
      last_build_number: opts.number || '5',
      last_build_state: opts.state || 'passed',
      last_build_duration: 227,
      last_build_language: null,
      last_build_started_at: '2016-02-16T16:48:30Z',
      last_build_finished_at: '2016-02-16T16:49:30Z',
      github_language: 'JavaScript'
    }
  });
};

module.exports = apiResponses;
