// L1 Git Fixture Test Harness.
//
// Shared, reusable temporary Git environments for automated tests that must run
// real git commands. All destructive operations happen inside mkdtemp fixtures;
// tests must never target a real development or production repository.
//
// Guarantees:
// - fully offline: remotes are local bare repositories on disk
// - no global git identity dependency: every fixture sets its own user config
// - deterministic topology: fixed branch/tag/message naming per scenario
// - reliable cleanup: dispose() removes everything; callers register it in
//   afterAll/afterEach so cleanup also runs on failure.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURE_IDENTITY = {
  name: 'OpenChamber Fixture',
  email: 'fixture@openchamber.invalid',
};

// Class is module-private; tests go through createGitFixture().
class GitFixture {
  constructor(root) {
    this.root = root;
    this.repo = path.join(root, 'repo');
    this.originBare = path.join(root, 'origin.git');
    this.upstreamBare = path.join(root, 'upstream.git');
    this.disposed = false;
    this.counter = 0;

    fs.mkdirSync(this.repo, { recursive: true });
    this.git(['init', '--bare', this.originBare]);
    this.git(['init', '--bare', this.upstreamBare]);
    this.git(['init', '-b', 'main']);
    this.git(['config', 'user.name', FIXTURE_IDENTITY.name]);
    this.git(['config', 'user.email', FIXTURE_IDENTITY.email]);
    // Deterministic timestamps keep rev-list/topo output stable across runs.
    this.git(['config', 'commit.gpgsign', 'false']);
    this.remote('add', 'origin', this.originBare);
    this.remote('add', 'upstream', this.upstreamBare);
  }

  /** Run a real git command inside the fixture working repo. */
  git(args, cwd = this.repo, extraEnv) {
    const options = {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    if (extraEnv) {
      options.env = { ...process.env, ...extraEnv };
    }
    return execFileSync('git', args, options);
  }

  remote(...args) {
    return this.git(['remote', ...args]);
  }

  checkout(branch, { create = false, startPoint } = {}) {
    return create
      ? this.git(['checkout', '-b', branch, ...(startPoint ? [startPoint] : [])])
      : this.git(['checkout', branch]);
  }

  /**
   * Write a file inside the repo and commit it. Returns the commit hash.
   * `at` pins author/committer dates (unix seconds) so sort orders stay
   * deterministic even when several commits land within the same second.
   */
  commit(message, { file, content, branch, at } = {}) {
    if (branch && this.currentBranch() !== branch) {
      this.checkout(branch);
    }
    if (file !== undefined) {
      this.writeFile(file, content ?? `${message}\n`);
    }
    this.git(['add', '-A']);
    const dateEnv = Number.isFinite(at)
      ? { GIT_AUTHOR_DATE: String(at), GIT_COMMITTER_DATE: String(at) }
      : undefined;
    if (dateEnv) {
      this.git(['commit', '-m', message], this.repo, dateEnv);
    } else {
      this.git(['commit', '-m', message]);
    }
    return this.git(['rev-parse', 'HEAD']).trim();
  }

  currentBranch() {
    return this.git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  }

  writeFile(relativePath, content) {
    const absolute = path.join(this.repo, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }

  /** `at` (unix seconds) pins the tag's creatordate for deterministic sorting. */
  tag(name, { annotated = false, message, startPoint = 'HEAD', at } = {}) {
    const dateEnv = Number.isFinite(at)
      ? { GIT_COMMITTER_DATE: String(at), GIT_AUTHOR_DATE: String(at) }
      : undefined;
    if (annotated) {
      return this.git(['tag', '-a', name, '-m', message ?? name, startPoint], this.repo, dateEnv);
    }
    return dateEnv
      ? this.git(['tag', name, startPoint], this.repo, dateEnv)
      : this.git(['tag', name, startPoint]);
  }

  push(remote, refspec) {
    this.git(['push', remote, refspec]);
  }

  fetch(remote) {
    this.git(['fetch', remote]);
  }

  addWorktree(name, branch, { create = true } = {}) {
    const worktreePath = path.join(this.root, 'worktrees', name);
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    this.git(['worktree', 'add', ...(create ? ['-b'] : []), ...(create ? [branch] : []), worktreePath, ...(create ? [] : [branch])]);
    return worktreePath;
  }

  dirtyWorkingTree({ staged = false } = {}) {
    this.writeFile('dirty.txt', 'uncommitted change\n');
    if (staged) {
      this.git(['add', 'dirty.txt']);
    }
    return 'dirty.txt';
  }

  startMergeInProgress(theirBranch) {
    try {
      this.git(['merge', '--no-commit', '--no-ff', theirBranch]);
    } catch {
      // Expected for conflicting merges: the merge stays in progress.
    }
    return this.mergeInProgress();
  }

  mergeInProgress() {
    return fs.existsSync(path.join(this.repo, '.git', 'MERGE_HEAD'));
  }

  abortMerge() {
    try {
      this.git(['merge', '--abort']);
    } catch {
      // Nothing to abort.
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

export function createGitFixture() {
  return new GitFixture(fs.mkdtempSync(path.join(os.tmpdir(), 'oc-git-fixture-')));
}

/**
 * Long-term regression scenario: an active patch still sitting on an old
 * release base while main has moved to a newer release. Guards the ability to
 * detect `base-stale` so "main advanced but the patch never rebased" can never
 * silently regress.
 *
 * Topology:
 *   main:    init ── rel ── next1 ── rel2        (tags v1.19.0, v1.20.0)
 *   patch-a: init ── pa1                          (created at the old release)
 */
export function buildStalePatchOnOldRelease(fixture, { patchBranch = 'feat/old-base-patch' } = {}) {
  const initHash = fixture.commit('init', { file: 'README.md', content: '# fixture\n' });
  fixture.tag('v1.19.0', { startPoint: initHash });

  fixture.checkout(patchBranch, { create: true, startPoint: initHash });
  const patchCommit = fixture.commit('patch-a work', { file: 'patch-a.txt' });

  fixture.checkout('main');
  fixture.commit('release work 1', { file: 'src/main-1.ts' });
  const newReleaseHash = fixture.commit('release work 2', { file: 'src/main-2.ts' });
  fixture.tag('v1.20.0', { startPoint: newReleaseHash });

  return { oldTag: 'v1.19.0', newTag: 'v1.20.0', patchBranch, patchCommit };
}

/** Progressive stack: main → A → B → C where each branch builds on the previous tip. */
export function buildStackChain(fixture, names = ['feat/a', 'feat/b', 'feat/c']) {
  fixture.commit('base', { file: 'README.md', content: '# stack\n' });
  const tips = [];
  let previous = 'main';
  for (const name of names) {
    fixture.checkout(name, { create: true, startPoint: previous });
    const hash = fixture.commit(`work on ${name}`, { file: `${name}.txt` });
    tips.push({ branch: name, hash });
    previous = name;
  }
  fixture.checkout('main');
  return tips;
}

/** Independent patches branching off the same main commit, main untouched afterwards. */
export function buildIndependentPatches(fixture, names = ['feat/x', 'feat/y']) {
  const baseHash = fixture.commit('base', { file: 'README.md', content: '# independent\n' });
  return names.map((name) => {
    fixture.checkout(name, { create: true, startPoint: baseHash });
    const hash = fixture.commit(`work on ${name}`, { file: `${name}.txt` });
    fixture.checkout('main');
    return { branch: name, hash };
  });
}

/** Branch and main both advance from a common point: ahead and behind > 0. */
export function buildDivergedBranch(fixture, branchName = 'feat/diverged') {
  const baseHash = fixture.commit('base', { file: 'README.md', content: '# diverged\n' });
  fixture.checkout(branchName, { create: true, startPoint: baseHash });
  const branchCommit = fixture.commit('branch-side work', { file: 'branch-side.txt' });
  fixture.checkout('main');
  const mainCommit = fixture.commit('main-side work', { file: 'main-side.txt' });
  return { branchCommit, mainCommit };
}

/**
 * Two branches editing the same line of one file so any merge between them is
 * a deterministic conflict.
 */
export function buildConflictingBranches(fixture, { branchName = 'feat/conflict', file = 'shared.txt' } = {}) {
  fixture.commit('base', { file, content: 'line: base\n' });
  const baseHash = fixture.git(['rev-parse', 'HEAD']).trim();

  fixture.checkout(branchName, { create: true, startPoint: baseHash });
  fixture.commit(`${branchName} edit`, { file, content: `line: ${branchName}\n` });

  fixture.checkout('main');
  fixture.commit('main edit', { file, content: 'line: main\n' });

  return { file, baseHash };
}
