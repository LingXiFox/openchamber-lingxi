import type { GitBranchComparison } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { classifyBranchActivity, classifyBranchBase, classifyBranchTopology, pickBranchHealthBadge } from './branchHealth';

const HEALTH_BADGE_COLOR_CLASS = {
  diverged: 'text-status-warning',
  'base-stale': 'text-status-error',
  behind: 'text-status-info',
  unrelated: 'text-muted-foreground',
  merged: 'text-status-success',
  dormant: 'text-muted-foreground',
} as const;

const HEALTH_BADGE_KEY = {
  diverged: 'gitView.health.diverged',
  'base-stale': 'gitView.health.baseStale',
  behind: 'gitView.health.behind',
  unrelated: 'gitView.health.unrelated',
  merged: 'gitView.health.merged',
  dormant: 'gitView.health.dormant',
} as const;

interface ResolvedBranchHealthBadge {
  state: keyof typeof HEALTH_BADGE_COLOR_CLASS;
  className: string;
  labelKey: (typeof HEALTH_BADGE_KEY)[keyof typeof HEALTH_BADGE_KEY];
}

function resolveBranchHealthBadge(row: GitBranchComparison, nowMs: number): ResolvedBranchHealthBadge | null {
  const badge = pickBranchHealthBadge(
    classifyBranchTopology(row),
    classifyBranchBase(row),
    classifyBranchActivity(row.lastCommitUnix, nowMs),
  );
  if (!badge) return null;
  return {
    state: badge.state,
    className: HEALTH_BADGE_COLOR_CLASS[badge.state],
    labelKey: HEALTH_BADGE_KEY[badge.state],
  };
}

export function BranchHealthBadge({ row, nowMs }: { row: GitBranchComparison; nowMs: number }) {
  const { t } = useI18n();
  const badge = resolveBranchHealthBadge(row, nowMs);
  if (!badge) return null;
  return (
    <span className={`typography-micro shrink-0 ${badge.className}`}>
      {t(badge.labelKey)}
    </span>
  );
}
