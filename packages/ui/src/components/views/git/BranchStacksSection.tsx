import type { GitPatchStacksResponse } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/useUIStore';
import { BranchHealthBadge } from './BranchHealthBadge';

interface BranchStacksSectionProps {
  stacks: GitPatchStacksResponse | null;
  healthByBranch: Map<string, import('@/lib/api/types').GitBranchComparison> | null;
  currentBranch?: string | null;
  onRebase?: (onto: string) => void;
}

const DEPTH_CLASS = ['ml-0', 'ml-3', 'ml-6', 'ml-9', 'ml-12'] as const;

export function BranchStacksSection({ stacks, healthByBranch, currentBranch, onRebase }: BranchStacksSectionProps) {
  const { t } = useI18n();
  const setNewWorktreeDialogOpen = useUIStore((s) => s.setNewWorktreeDialogOpen);
  const setNewWorktreeSourceBranchHint = useUIStore((s) => s.setNewWorktreeSourceBranchHint);
  if (!stacks?.groups.length) return null;
  const nowMs = Date.now();

  return (
    <section className="shrink-0 rounded-lg border border-border/60 bg-[var(--surface-elevated)] p-2">
      <h3 className="typography-ui-label px-1 pb-1 font-medium text-foreground">
        {t('gitView.stacks.title')}
      </h3>
      <div className="space-y-2">
        {stacks.groups.map((group) => {
          const entries = new Map(group.chains.map((entry) => [entry.branch, entry]));
          const depthFor = (branch: string) => {
            let depth = 0;
            let current = entries.get(branch)?.dependsOn ?? null;
            const seen = new Set<string>();
            while (current && entries.has(current) && !seen.has(current)) {
              seen.add(current);
              depth++;
              current = entries.get(current)?.dependsOn ?? null;
            }
            return depth;
          };

          return (
            <div key={group.id} className="border-t border-border/40 pt-1 first:border-t-0 first:pt-0">
              {group.name ? (
                <p className="typography-micro px-1 py-0.5 text-muted-foreground">{group.name}</p>
              ) : null}
              {group.chains.map((entry) => {
                const row = healthByBranch?.get(entry.branch);
                const depth = Math.min(depthFor(entry.branch), DEPTH_CLASS.length - 1);
                return (
                  <div key={entry.branch} className={`flex min-w-0 items-center gap-1.5 rounded px-1 py-1 ${DEPTH_CLASS[depth]}`}>
                    <Icon name="git-branch" className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="typography-meta min-w-0 flex-1 truncate text-foreground">{entry.branch}</span>
                    {row ? <BranchHealthBadge row={row} nowMs={nowMs} /> : null}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="shrink-0 px-1.5"
                      aria-label={t('gitView.stacks.createWorktreeAria', { branch: entry.branch })}
                      title={t('gitView.stacks.createWorktreeAria', { branch: entry.branch })}
                      onClick={() => {
                        setNewWorktreeSourceBranchHint(entry.branch);
                        setNewWorktreeDialogOpen(true);
                      }}
                    >
                      <Icon name="add" className="size-3.5" />
                    </Button>
                    {entry.branch === currentBranch && onRebase ? (
                      <Button variant="ghost" size="xs" onClick={() => onRebase(entry.dependsOn ?? stacks.base)}>
                        {t('gitView.operation.rebase')}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
