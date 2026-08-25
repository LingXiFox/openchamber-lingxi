import type { GitBranchComparison } from '@/lib/api/types';

export type BranchTopologyState =
  | 'current'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'merged'
  | 'unrelated';

export type BranchBaseState = 'base-current' | 'base-stale';
export type BranchActivityState = 'active' | 'dormant';

/** Branches with no commit activity for longer than this are dormant. */
export const BRANCH_DORMANT_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Topology vs the base ref. One dimension of branch health — deliberately
 * separate from base freshness and activity so a badge never merges unrelated
 * semantics into one word.
 */
export function classifyBranchTopology(row: Pick<GitBranchComparison, 'ahead' | 'behind' | 'mergeBase'> & { isCurrent?: boolean; isBase?: boolean }): BranchTopologyState {
  if (row.isCurrent) return 'current';
  const ahead = row.ahead ?? 0;
  const behind = row.behind ?? 0;
  if (!row.mergeBase) return 'unrelated';
  if (ahead > 0 && behind > 0) return 'diverged';
  if (behind > 0) return 'behind';
  if (ahead === 0 && row.isBase) return 'current';
  if (ahead === 0) return 'merged';
  return 'ahead';
}

/**
 * Base freshness: has main moved past the point this branch grew from?
 * `base-stale` means the current patch chain still sits on an older main /
 * older release while the base has advanced.
 */
export function classifyBranchBase(row: Pick<GitBranchComparison, 'behind'> & { isCurrent?: boolean; isBase?: boolean }): BranchBaseState {
  if (row.isCurrent || row.isBase) return 'base-current';
  return (row.behind ?? 0) > 0 ? 'base-stale' : 'base-current';
}

/** Activity: no commits for a while, independent of topology. */
export function classifyBranchActivity(
  lastCommitUnix: number | null,
  nowMs: number,
  dormantAfterDays: number = BRANCH_DORMANT_AFTER_DAYS
): BranchActivityState {
  if (lastCommitUnix === null || !Number.isFinite(lastCommitUnix)) return 'active';
  return nowMs - lastCommitUnix * 1000 > dormantAfterDays * DAY_MS ? 'dormant' : 'active';
}

export type BranchHealthBadgeState =
  | 'diverged'
  | 'base-stale'
  | 'behind'
  | 'unrelated'
  | 'merged'
  | 'dormant';

/** The single worst-worthy badge to show per row (priority order matters). */
export function pickBranchHealthBadge(
  topology: BranchTopologyState,
  base: BranchBaseState,
  activity: BranchActivityState
): { kind: 'topology' | 'base' | 'activity'; state: BranchHealthBadgeState } | null {
  if (topology === 'diverged') return { kind: 'topology', state: 'diverged' };
  if (base === 'base-stale') return { kind: 'base', state: 'base-stale' };
  if (topology === 'behind') return { kind: 'topology', state: 'behind' };
  if (topology === 'unrelated') return { kind: 'topology', state: 'unrelated' };
  if (topology === 'merged') return { kind: 'topology', state: 'merged' };
  if (activity === 'dormant') return { kind: 'activity', state: 'dormant' };
  return null;
}
