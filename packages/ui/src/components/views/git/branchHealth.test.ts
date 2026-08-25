import { describe, expect, test } from 'bun:test';
import {
  BRANCH_DORMANT_AFTER_DAYS,
  classifyBranchActivity,
  classifyBranchBase,
  classifyBranchTopology,
  pickBranchHealthBadge,
} from './branchHealth';
import type { GitBranchComparison } from '@/lib/api/types';

function makeRow(overrides: Partial<GitBranchComparison> = {}): GitBranchComparison {
  return {
    branch: 'feat/test',
    tip: 'a'.repeat(40),
    ahead: 0,
    behind: 0,
    mergeBase: 'b'.repeat(40),
    lastCommitUnix: 1_700_000_000,
    ...overrides,
  };
}

const NOW_MS = 1_700_000_000 * 1000;

describe('classifyBranchTopology', () => {
  test('current branch is current regardless of counts', () => {
    expect(classifyBranchTopology(makeRow({ isCurrent: true, ahead: 3, behind: 2 }))).toBe('current');
  });

  test('no common ancestor means unrelated history', () => {
    expect(classifyBranchTopology(makeRow({ mergeBase: null }))).toBe('unrelated');
  });

  test('ahead and behind both positive is diverged', () => {
    expect(classifyBranchTopology(makeRow({ ahead: 2, behind: 1 }))).toBe('diverged');
  });

  test('behind-only is behind', () => {
    expect(classifyBranchTopology(makeRow({ ahead: 0, behind: 4 }))).toBe('behind');
  });

  test('ahead-only is ahead', () => {
    expect(classifyBranchTopology(makeRow({ ahead: 5, behind: 0 }))).toBe('ahead');
  });

  test('identical to base but not checked out is merged (or is the base itself)', () => {
    expect(classifyBranchTopology(makeRow({}))).toBe('merged');
    expect(classifyBranchTopology(makeRow({ isBase: true }))).toBe('current');
  });
});

describe('classifyBranchBase', () => {
  test('base-stale when main advanced past the branch point', () => {
    expect(classifyBranchBase(makeRow({ behind: 2 }))).toBe('base-stale');
  });

  test('base-current when the branch includes the base tip', () => {
    expect(classifyBranchBase(makeRow({ behind: 0 }))).toBe('base-current');
    expect(classifyBranchBase(makeRow({ behind: 0, ahead: 7 }))).toBe('base-current');
  });

  test('the current checkout and the base itself are never base-stale', () => {
    expect(classifyBranchBase(makeRow({ behind: 9, isCurrent: true }))).toBe('base-current');
    expect(classifyBranchBase(makeRow({ behind: 9, isBase: true }))).toBe('base-current');
  });
});

describe('classifyBranchActivity', () => {
  test('dormant strictly after the threshold', () => {
    const lastCommitUnix = 1_700_000_000;
    const thresholdMs = BRANCH_DORMANT_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const lastCommitMs = lastCommitUnix * 1000;
    expect(classifyBranchActivity(lastCommitUnix, lastCommitMs + thresholdMs)).toBe('active');
    expect(classifyBranchActivity(lastCommitUnix, lastCommitMs + thresholdMs + 1000)).toBe('dormant');
  });

  test('unknown last-commit date stays active rather than guessing', () => {
    expect(classifyBranchActivity(null, NOW_MS)).toBe('active');
  });
});

describe('pickBranchHealthBadge', () => {
  test('diverged outranks everything; dormant only shows alone', () => {
    expect(pickBranchHealthBadge('diverged', 'base-stale', 'dormant')?.state).toBe('diverged');
    expect(pickBranchHealthBadge('behind', 'base-stale', 'active')?.state).toBe('base-stale');
    expect(pickBranchHealthBadge('ahead', 'base-current', 'dormant')?.state).toBe('dormant');
    expect(pickBranchHealthBadge('current', 'base-current', 'active')).toBeNull();
  });
});
