import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildConflictingBranches,
  buildDivergedBranch,
  buildIndependentPatches,
  buildStackChain,
  buildStalePatchOnOldRelease,
  createGitFixture,
} from './testing/gitFixture.js';
import { compareBranches, getPatchStacks, getTags, parseLegacyMergeTreeConflicts, planRebase, precheckMerge, traceCommit } from './service.js';

const canRunGit = () => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const fixtures = [];
afterAll(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.dispose();
  }
});

const makeFixture = () => {
  const fixture = createGitFixture();
  fixtures.push(fixture);
  return fixture;
};

describe.runIf(canRunGit())('compareBranches', () => {
  it('detects a patch still sitting on an old release base as strictly behind (long-term regression guard)', async () => {
    const fixture = makeFixture();
    const { patchBranch } = buildStalePatchOnOldRelease(fixture);

    // Current branch is main after the scenario; compare the stale patch against it.
    const result = await compareBranches(fixture.repo, { base: 'main' });
    const row = result.comparisons.find((entry) => entry.branch === patchBranch);

    expect(row).toBeDefined();
    expect(row.ahead).toBe(1);
    expect(row.behind).toBe(2);
    expect(row.mergeBase).not.toBeNull();
    expect(result.base).toBe('main');
    expect(result.current).toBe('main');
  });

  it('reports progressive stack chains with per-link ahead/behind counts', async () => {
    const fixture = makeFixture();
    const [a, b, c] = buildStackChain(fixture);

    // Each link's history contains every earlier patch commit, so ahead
    // accumulates (A: +1, B: +2, C: +3) while main has not moved.
    const result = await compareBranches(fixture.repo, { base: 'main' });
    const byBranch = new Map(result.comparisons.map((row) => [row.branch, row]));

    expect(byBranch.get(a.branch)).toMatchObject({ ahead: 1, behind: 0 });
    expect(byBranch.get(b.branch)).toMatchObject({ ahead: 2, behind: 0 });
    expect(byBranch.get(c.branch)).toMatchObject({ ahead: 3, behind: 0 });
  });

  it('marks the base branch and current branch rows', async () => {
    const fixture = makeFixture();
    buildIndependentPatches(fixture);

    const result = await compareBranches(fixture.repo, { base: 'main' });
    const baseRow = result.comparisons.find((row) => row.branch === 'main');

    expect(baseRow?.isBase).toBe(true);
    expect(baseRow?.isCurrent).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('flags diverged branches with both ahead and behind counts', async () => {
    const fixture = makeFixture();
    buildDivergedBranch(fixture);

    const result = await compareBranches(fixture.repo, { base: 'main' });
    const row = result.comparisons.find((entry) => entry.branch === 'feat/diverged');

    expect(row).toMatchObject({ ahead: 1, behind: 1 });
  });

  it('truncates comparisons beyond thirty local branches', async () => {
    const fixture = makeFixture();
    fixture.commit('base', { file: 'README.md' });
    for (let i = 0; i < 31; i++) {
      fixture.checkout(`branch-${String(i).padStart(2, '0')}`, { create: true });
      fixture.checkout('main');
    }

    const result = await compareBranches(fixture.repo, { base: 'main' });

    expect(result.truncated).toBe(true);
    expect(result.comparisons).toHaveLength(30);
  });

  it('throws a clear error when the requested base does not exist', async () => {
    const fixture = makeFixture();
    fixture.commit('init', { file: 'README.md' });

    await expect(compareBranches(fixture.repo, { base: 'nope' })).rejects.toThrow('Base branch not found: nope');
  });
});

describe.runIf(canRunGit())('getTags', () => {
  it('lists tags newest-first with object metadata, distinguishing stable from prerelease names', async () => {
    const fixture = makeFixture();
    const first = fixture.commit('first', { file: 'a.txt', at: 1_700_000_000 });
    fixture.tag('v1.19.0', { startPoint: first });
    const second = fixture.commit('second', { file: 'b.txt', at: 1_700_000_100 });
    fixture.tag('v1.20.0-rc.1', { annotated: true, message: 'rc', startPoint: second, at: 1_700_000_200 });

    const result = await getTags(fixture.repo);

    expect(result.tags.map((tag) => tag.name)).toEqual(['v1.20.0-rc.1', 'v1.19.0']);
    expect(result.tags[0].objectType).toBe('tag');
    expect(result.tags[0].creatordateUnix).toBe(1_700_000_200);
    expect(result.tags[1].objectType).toBe('commit');
    expect(result.tags.every((tag) => /^[0-9a-f]{40}$/.test(tag.hash))).toBe(true);
  });

  it('returns an empty list for a repository without tags', async () => {
    const fixture = makeFixture();
    fixture.commit('only', { file: 'a.txt' });

    const result = await getTags(fixture.repo);

    expect(result.tags).toEqual([]);
  });
});

describe.runIf(canRunGit())('getPatchStacks', () => {
  it('reduces a progressive A to B to C stack to direct parent edges', async () => {
    const fixture = makeFixture();
    const [a, b, c] = buildStackChain(fixture);

    const result = await getPatchStacks(fixture.repo, { base: 'main' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      source: 'inferred',
      chains: [
        { branch: a.branch, dependsOn: null },
        { branch: b.branch, dependsOn: a.branch },
        { branch: c.branch, dependsOn: b.branch },
      ],
    });
  });

  it('does not invent dependencies between independent patches', async () => {
    const fixture = makeFixture();
    const patches = buildIndependentPatches(fixture, ['topic/a', 'topic/b', 'topic/c']);

    const result = await getPatchStacks(fixture.repo, { base: 'main' });

    expect(result.groups).toEqual([]);
    expect(result.ungrouped).toEqual(patches.map((patch) => patch.branch));
  });

  it('leaves a patch on an old base ungrouped', async () => {
    const fixture = makeFixture();
    const { patchBranch } = buildStalePatchOnOldRelease(fixture);

    const result = await getPatchStacks(fixture.repo, { base: 'main' });

    expect(result.groups).toEqual([]);
    expect(result.ungrouped).toEqual([patchBranch]);
  });

  it('lets explicit config override automatic inference', async () => {
    const fixture = makeFixture();
    const [a, b, c] = buildIndependentPatches(fixture, ['feat/a', 'feat/b', 'feat/c']);
    fixture.writeFile('.openchamber-stacks.json', JSON.stringify({
      stacks: [{ name: 'explicit', branches: [c.branch, a.branch, b.branch] }],
    }));

    const result = await getPatchStacks(fixture.repo, { base: 'main' });

    expect(result.groups).toEqual([{
      id: 'config:explicit',
      name: 'explicit',
      source: 'config',
      chains: [
        { branch: c.branch, dependsOn: null },
        { branch: a.branch, dependsOn: c.branch },
        { branch: b.branch, dependsOn: a.branch },
      ],
    }]);
    expect(result.ungrouped).toEqual([]);
  });
});

describe.runIf(canRunGit())('planRebase', () => {
  it('reports downstream patches affected when rebasing a parent patch', async () => {
    const fixture = makeFixture();
    const [a, b] = buildStackChain(fixture, ['feat/a', 'feat/b']);
    fixture.commit('new main work', { file: 'main-new.txt' });

    const result = await planRebase(fixture.repo, { branch: a.branch, onto: 'main' });

    expect(result.commitsOnBranch.map((commit) => commit.hash)).toEqual([a.hash]);
    expect(result.downstream).toEqual([{ branch: b.branch, why: a.branch }]);
    expect(result.warnings).toContain('downstream-history-rewrite');
  });
});

describe.runIf(canRunGit())('traceCommit', () => {
  it('returns the full ancestor set, containment, and HEAD relation for a stacked tip', async () => {
    const fixture = makeFixture();
    const [a, , c] = buildStackChain(fixture);

    const result = await traceCommit(fixture.repo, { hash: c.hash });

    expect(result.hash).toBe(c.hash);
    expect(result.ancestors.total).toBe(4); // base + a + b + c
    expect(result.ancestors.truncated).toBe(false);
    const ancestorHashes = new Set(result.ancestors.commits.map((entry) => entry.hash));
    expect(ancestorHashes.has(a.hash)).toBe(true);
    // Only branches whose history reaches c's commit contain it — a and b do not.
    expect(result.containedBy.branches).toEqual([c.branch]);
    expect(result.mergeBaseWithHead).not.toBeNull();
  });

  it('reports which branches contain a commit that only exists on its own branch', async () => {
    const fixture = makeFixture();
    const [solo] = buildIndependentPatches(fixture, ['feat/solo']);

    const result = await traceCommit(fixture.repo, { hash: solo.hash });

    expect(result.containedBy.branches).toEqual(['feat/solo']);
    expect(result.isAncestorOfHead).toBe(false);
  });

  it('marks commits on the current branch as ancestors of HEAD', async () => {
    const fixture = makeFixture();
    fixture.commit('root', { file: 'README.md' });
    const headHash = fixture.git(['rev-parse', 'HEAD']).trim();

    const result = await traceCommit(fixture.repo, { hash: headHash });

    expect(result.isAncestorOfHead).toBe(true);
    expect(result.ancestors.total).toBe(1);
  });

  it('honours the limit and flags truncation', async () => {
    const fixture = makeFixture();
    fixture.commit('c0', { file: 'f.txt', content: '0\n' });
    for (let i = 1; i <= 5; i++) {
      fixture.commit(`c${i}`, { file: 'f.txt', content: `${i}\n` });
    }
    const headHash = fixture.git(['rev-parse', 'HEAD']).trim();

    const result = await traceCommit(fixture.repo, { hash: headHash, limit: 3 });

    expect(result.ancestors.commits).toHaveLength(3);
    expect(result.ancestors.total).toBe(6);
    expect(result.ancestors.truncated).toBe(true);
  });

  it('rejects malformed hashes', async () => {
    const fixture = makeFixture();
    fixture.commit('init', { file: 'README.md' });

    await expect(traceCommit(fixture.repo, { hash: '../etc/passwd' })).rejects.toThrow('Invalid commit hash');
    await expect(traceCommit(fixture.repo, { hash: 'zzzz' })).rejects.toThrow();
  });
});

describe.runIf(canRunGit())('fixture scenarios used by conflict pre-checks', () => {
  it('builds two branches whose merge is a deterministic conflict', async () => {
    const fixture = makeFixture();
    const { file } = buildConflictingBranches(fixture);

    const inProgress = fixture.startMergeInProgress('feat/conflict');
    expect(inProgress).toBe(true);
    fixture.abortMerge();
    expect(fixture.mergeInProgress()).toBe(false);

    const content = fs.readFileSync(`${fixture.repo}/${file}`, 'utf8').trim();
    expect(content.startsWith('line: main')).toBe(true);
  });
});

describe.runIf(canRunGit())('precheckMerge', () => {
  it('reports clean for branches that touch disjoint files', async () => {
    const fixture = makeFixture();
    buildIndependentPatches(fixture, ['feat/clean']);

    const result = await precheckMerge(fixture.repo, { source: 'feat/clean', target: 'main' });

    expect(result.clean).toBe(true);
    expect(result.conflictedFiles).toEqual([]);
    expect(result.engine).toBe('modern');
  });

  it('lists the deterministic conflict file for same-region edits', async () => {
    const fixture = makeFixture();
    const { file } = buildConflictingBranches(fixture);

    const result = await precheckMerge(fixture.repo, { source: 'feat/conflict', target: 'main' });

    expect(result.clean).toBe(false);
    expect(result.conflictedFiles).toEqual([file]);
    expect(result.engine).toBe('modern');
  });

  it('answers a rebase-shaped check (target=onto) with the same conflict set', async () => {
    const fixture = makeFixture();
    const { file } = buildConflictingBranches(fixture);

    // Rebasing main onto feat/conflict replays the conflicting main edit.
    const result = await precheckMerge(fixture.repo, { source: 'main', target: 'feat/conflict' });

    expect(result.clean).toBe(false);
    expect(result.conflictedFiles).toEqual([file]);
  });

  it('runs the legacy engine path against a real repo when forced', async () => {
    const conflicting = makeFixture();
    buildConflictingBranches(conflicting);
    const conflictResult = await precheckMerge(
      conflicting.repo,
      { source: 'feat/conflict', target: 'main', engine: 'legacy' },
    );
    expect(conflictResult.engine).toBe('legacy');
    expect(conflictResult.clean).toBe(false);
    expect(conflictResult.conflictedFiles).toEqual(['shared.txt']);

    const disjoint = makeFixture();
    buildIndependentPatches(disjoint, ['feat/legacy-clean']);
    const cleanResult = await precheckMerge(
      disjoint.repo,
      { source: 'feat/legacy-clean', target: 'main', engine: 'legacy' },
    );
    expect(cleanResult.engine).toBe('legacy');
    expect(cleanResult.clean).toBe(true);
    expect(cleanResult.conflictedFiles).toEqual([]);
  });
});

describe('parseLegacyMergeTreeConflicts', () => {
  it('extracts conflicted paths from injected legacy stdout (no real legacy git needed)', () => {
    const fakeStdout = [
      'added in remote',
      '  their  100644 4444444 solo-new.txt',
      '@@ -0,0 +1 @@',
      '+work',
      'changed in both',
      '  base   100644 abc1234 shared.txt',
      '  our    100644 def5678 shared.txt',
      '  their  100644 9abcdef shared.txt',
      '@@ -1,1 +1,5 @@',
      '+<<<<<<< .our',
      ' main',
      '+=======',
      '+feat',
      '+>>>>>>> .their',
      'added in both',
      '  base   0000000 1111111 nested/dir/new.txt',
      '  our    100644 2222222 nested/dir/new.txt',
      '  their  100644 3333333 nested/dir/new.txt',
      '@@ -0,0 +1,1 @@',
      '+<<<<<<< .our',
    ].join('\n');

    // solo-new.txt is auto-resolvable ("added in remote") and must be excluded.
    expect(parseLegacyMergeTreeConflicts(fakeStdout)).toEqual(['shared.txt', 'nested/dir/new.txt']);
  });

  it('returns no files for clean legacy output', () => {
    expect(parseLegacyMergeTreeConflicts('')).toEqual([]);
  });
});
