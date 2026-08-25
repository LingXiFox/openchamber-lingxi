import { describe, expect, test } from 'bun:test';
import { assignLanes, projectPatchGraph } from './gitGraph';
import type { GitLogEntry } from '@/lib/api/types';

function makeCommit(hash: string, parents: string[], refs = ''): GitLogEntry {
  return {
    hash,
    parents,
    date: '2024-01-01T00:00:00Z',
    message: `commit ${hash}`,
    refs,
    body: '',
    author_name: 'Test',
    author_email: 'test@test.com',
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
  };
}

describe('assignLanes', () => {
  test('returns empty array for empty input', () => {
    expect(assignLanes([])).toEqual([]);
  });

  test('assigns lane 0 to all commits in a linear history', () => {
    const commits = [
      makeCommit('c', ['b']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    const result = assignLanes(commits);
    expect(result.every((r) => r.lane === 0)).toBe(true);
    expect(result).toHaveLength(3);
  });

  test('assigns a color to every commit', () => {
    const commits = [makeCommit('a', [])];
    const result = assignLanes(commits);
    expect(result[0].color).toBeTruthy();
    expect(result[0].color).toContain('var(--');
  });

  test('assigns separate lanes to two diverging branches', () => {
    // main: c -> a; feat: b -> a; order newest first: c, b, a
    const commits = [
      makeCommit('c', ['a']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    const result = assignLanes(commits);
    const cLane = result.find((r) => r.commit.hash === 'c')!.lane;
    const bLane = result.find((r) => r.commit.hash === 'b')!.lane;
    expect(cLane).not.toEqual(bLane);
    // convergence commit 'a' should be on the lower lane
    const aLane = result.find((r) => r.commit.hash === 'a')!.lane;
    expect(aLane <= Math.min(cLane, bLane)).toBe(true);
  });

  test('handles a merge commit (2 parents)', () => {
    const commits = [
      makeCommit('m', ['b', 'a']),
      makeCommit('b', ['base']),
      makeCommit('a', ['base']),
      makeCommit('base', []),
    ];
    const result = assignLanes(commits);
    expect(result).toHaveLength(4);
    result.forEach((r) => expect(r.lane >= 0).toBe(true));
    const baseResult = result.find((r) => r.commit.hash === 'base')!;
    expect(baseResult.lane).toBe(0);
  });

  test('handles an octopus merge (3 parents)', () => {
    const commits = [
      makeCommit('oct', ['p1', 'p2', 'p3']),
      makeCommit('p1', ['base']),
      makeCommit('p2', ['base']),
      makeCommit('p3', ['base']),
      makeCommit('base', []),
    ];
    const result = assignLanes(commits);
    expect(result).toHaveLength(5);
    result.forEach((r) => expect(r.lane >= 0).toBe(true));
  });

  test('root commit gets a top-stub connector', () => {
    const commits = [
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    const result = assignLanes(commits);
    const aResult = result.find((r) => r.commit.hash === 'a')!;
    const topStub = aResult.connectors.find((c) => c.type === 'top-stub');
    expect(topStub).not.toBeNull();
  });

  test('commit with both parent and child gets a commit-lane connector', () => {
    const commits = [
      makeCommit('c', ['b']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    const result = assignLanes(commits);
    const bResult = result.find((r) => r.commit.hash === 'b')!;
    const commitLane = bResult.connectors.find((c) => c.type === 'commit-lane');
    expect(commitLane).not.toBeNull();
  });

  test('merge commit produces branch-out connectors for extra parents', () => {
    const commits = [
      makeCommit('m', ['main', 'feat']),
      makeCommit('main', ['base']),
      makeCommit('feat', ['base']),
      makeCommit('base', []),
    ];
    const result = assignLanes(commits);
    const mResult = result.find((r) => r.commit.hash === 'm')!;
    const branchOut = mResult.connectors.filter((c) => c.type === 'branch-out');
    expect(branchOut.length).toBeGreaterThan(0);
  });

  test('converges two branches cleanly with merge-in connectors', () => {
    const commits = [
      makeCommit('c', ['a']),
      makeCommit('b', ['a']),
      makeCommit('a', ['base']),
      makeCommit('base', []),
    ];
    const result = assignLanes(commits);

    // 'a' should be where the two lanes converge
    const aResult = result.find((r) => r.commit.hash === 'a')!;
    const mergeIns = aResult.connectors.filter((c) => c.type === 'merge-in');
    expect(mergeIns.length).toBeGreaterThan(0);

    // 'base' should only have one lane (the merged one)
    const baseResult = result.find((r) => r.commit.hash === 'base')!;
    const passingThroughBase = baseResult.connectors.filter((c) => c.type === 'passing');
    expect(passingThroughBase.length).toBe(0);
  });

  test('produces passing connectors for unrelated active lanes', () => {
    const commits = [
      makeCommit('c', ['a']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    const result = assignLanes(commits);
    // While processing 'b', lane 0 (from c) is still active — should be 'passing'
    const bResult = result.find((r) => r.commit.hash === 'b')!;
    const passing = bResult.connectors.filter((c) => c.type === 'passing');
    expect(passing.length).toBeGreaterThan(0);
  });

  test('keeps real edge identity while a trace path passes an unrelated commit', () => {
    const commits = [
      makeCommit('selected', ['base']),
      makeCommit('sibling', ['base']),
      makeCommit('base', []),
    ];
    const result = assignLanes(commits);
    const siblingRow = result.find((r) => r.commit.hash === 'sibling')!;
    const passing = siblingRow.connectors.find((connector) => connector.type === 'passing')!;
    const siblingEdge = siblingRow.connectors.find((connector) => connector.type === 'bottom-stub')!;

    expect(passing.topEdge).toEqual({ childHash: 'selected', parentHash: 'base' });
    expect(passing.bottomEdge).toEqual(passing.topEdge);
    expect(siblingEdge.bottomEdge).toEqual({ childHash: 'sibling', parentHash: 'base' });
  });

  test('keeps incoming and outgoing edge identities separate at a traced commit', () => {
    const result = assignLanes([
      makeCommit('child', ['middle']),
      makeCommit('middle', ['base']),
      makeCommit('base', []),
    ]);
    const middle = result.find((r) => r.commit.hash === 'middle')!;
    const connector = middle.connectors.find((segment) => segment.type === 'commit-lane')!;

    expect(connector.topEdge).toEqual({ childHash: 'child', parentHash: 'middle' });
    expect(connector.bottomEdge).toEqual({ childHash: 'middle', parentHash: 'base' });
  });

  test('produces a bottom-stub connector when a new branch starts', () => {
    const commits = [
      makeCommit('c', ['a']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    const result = assignLanes(commits);
    // 'c' is the first commit processed — no child above claims it.
    // Its lane has a parent ('a') but no incoming.
    const cResult = result.find((r) => r.commit.hash === 'c')!;
    const bottomStub = cResult.connectors.find((c) => c.type === 'bottom-stub');
    expect(bottomStub).toBeTruthy();
  });
});

describe('projectPatchGraph', () => {
  test('collapses adjacent same-author sync noise', () => {
    const commits = [
      makeCommit('c', ['b']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ];
    commits[0].message = 'Sync generated files';
    commits[1].message = 'Merge remote-tracking branch origin/main';

    const result = projectPatchGraph(commits);

    expect(result[0].kind).toBe('sync');
    expect(result[0].commits.map((commit) => commit.hash)).toEqual(['c', 'b']);
    expect(result[0].entry.parents).toEqual(['a']);
  });

  test('collapses a directly linked stack tip chain', () => {
    const commits = [
      makeCommit('c', ['b'], 'feat/c'),
      makeCommit('b', ['a'], 'feat/b'),
      makeCommit('a', ['main'], 'feat/a'),
      makeCommit('main', []),
    ];
    const result = projectPatchGraph(commits, {
      mergeBaseHash: 'a',
      stacks: {
        base: 'main',
        groups: [{
          id: 'stack-1',
          name: 'feature',
          source: 'inferred',
          chains: [
            { branch: 'feat/a', dependsOn: null },
            { branch: 'feat/b', dependsOn: 'feat/a' },
            { branch: 'feat/c', dependsOn: 'feat/b' },
          ],
        }],
        ungrouped: [],
        truncated: false,
      },
    });

    expect(result[0].kind).toBe('stack');
    expect(result[0].stackName).toBe('feature');
    expect(result[0].commits.map((commit) => commit.hash)).toEqual(['c', 'b']);
    expect(result[0].entry.parents).toEqual(['a']);
    expect(result[1].anchors).toEqual(['merge-base']);
  });

  test('preserves sibling branches when stack metadata contradicts the DAG', () => {
    const commits = [
      makeCommit('c', ['main'], 'feat/c'),
      makeCommit('b', ['main'], 'feat/b'),
      makeCommit('a', ['main'], 'feat/a'),
      makeCommit('main', []),
    ];
    const result = projectPatchGraph(commits, {
      stacks: {
        base: 'main',
        groups: [{
          id: 'stack-1',
          source: 'config',
          chains: [
            { branch: 'feat/a', dependsOn: null },
            { branch: 'feat/b', dependsOn: 'feat/a' },
            { branch: 'feat/c', dependsOn: 'feat/b' },
          ],
        }],
        ungrouped: [],
        truncated: false,
      },
    });

    expect(result.map((node) => node.entry.hash)).toEqual(['c', 'b', 'a', 'main']);
    expect(result.slice(0, 3).every((node) => node.entry.parents[0] === 'main')).toBe(true);
    expect(new Set(assignLanes(commits).slice(0, 3).map((node) => node.lane)).size).toBe(3);
    const laned = assignLanes(result.map((node) => node.entry));
    expect(new Set(laned.slice(0, 3).map((node) => node.lane)).size).toBe(3);
  });

  test('keeps merge-base and release anchors visible', () => {
    const commits = [
      makeCommit('b', ['a']),
      makeCommit('a', [], 'tag: v1.0.0'),
    ];
    commits[0].message = 'Sync generated files';
    commits[1].message = 'Sync release files';

    const result = projectPatchGraph(commits, { mergeBaseHash: 'a', releaseRef: 'v1.0.0' });

    expect(result).toHaveLength(2);
    expect(result[1].anchors).toEqual(['merge-base', 'release']);
  });
});
