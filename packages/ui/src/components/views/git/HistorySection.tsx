import React from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Icon } from "@/components/icon/Icon";
import { HistoryCommitRow } from './HistoryCommitRow';
import type { GitLogEntry, CommitFileEntry, GitPatchStacksResponse } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { assignLanes, projectPatchGraph } from './gitGraph';
import type { LanedCommit } from './gitGraph';

const LOG_SIZE_OPTIONS = [
  { labelKey: 'gitView.history.logSize25', value: 25 },
  { labelKey: 'gitView.history.logSize50', value: 50 },
  { labelKey: 'gitView.history.logSize100', value: 100 },
];

interface HistoryHealthSummary {
  diverged: number;
  baseStale: number;
  dormant: number;
}

export type HistoryReleaseInfo =
  | { kind: 'stable'; tag: string; aheadFromStable: number; behindFromStable: number }
  | { kind: 'prerelease'; tag: string; stableTag: string | null }
  | { kind: 'snapshot' }
  | { kind: 'none' };

interface HistorySectionProps {
  mode?: 'history' | 'graph';
  log: { all: GitLogEntry[] } | null;
  isLogLoading: boolean;
  logMaxCount: number;
  onLogMaxCountChange: (count: number) => void;
  expandedCommitHashes: Set<string>;
  onToggleCommit: (hash: string) => void;
  commitFilesMap: Map<string, CommitFileEntry[]>;
  loadingCommitHashes: Set<string>;
  onCopyHash: (hash: string) => void;
  directory: string | undefined;
  showHeader?: boolean;
  contentMaxHeightClassName?: string;
  branchDivider?: {
    insertBeforeIndex: number;
    branchName: string;
    direction: 'up' | 'down';
  } | null;
  healthSummary?: HistoryHealthSummary | null;
  releaseInfo?: HistoryReleaseInfo | null;
  /** Trace mode: clicks set a trace root instead of expanding the row. */
  traceActive?: boolean;
  onSetTraceRoot?: (hash: string) => void;
  /** Hashes on the traced path; null = no trace selection yet. */
  highlightCommits?: Set<string> | null;
  onConflict?: (result: { conflict: boolean; conflictFiles?: string[]; operation: 'cherry-pick' | 'revert' | 'merge' | 'rebase' }) => void;
  onActionSuccess?: () => void;
  graphView?: 'raw' | 'patches';
  patchStacks?: GitPatchStacksResponse | null;
  patchMergeBaseHash?: string | null;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  mode = 'history',
  log,
  isLogLoading,
  logMaxCount,
  onLogMaxCountChange,
  expandedCommitHashes,
  onToggleCommit,
  commitFilesMap,
  loadingCommitHashes,
  onCopyHash,
  directory,
  showHeader = true,
  contentMaxHeightClassName = 'max-h-[50vh]',
  branchDivider = null,
  healthSummary = null,
  releaseInfo = null,
  traceActive = false,
  onSetTraceRoot,
  highlightCommits = null,
  onConflict,
  onActionSuccess,
  graphView = 'raw',
  patchStacks = null,
  patchMergeBaseHash = null,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = React.useState(true);
  const isGraphMode = mode === 'graph';
  const [expandedPatchNodes, setExpandedPatchNodes] = React.useState<Set<string>>(new Set());
  const releaseRef = releaseInfo?.kind === 'stable' || releaseInfo?.kind === 'prerelease' ? releaseInfo.tag : null;
  const patchNodes = React.useMemo(
    () => isGraphMode && graphView === 'patches' && log
      ? projectPatchGraph(log.all, { stacks: patchStacks, mergeBaseHash: patchMergeBaseHash, releaseRef })
      : null,
    [graphView, isGraphMode, log, patchMergeBaseHash, patchStacks, releaseRef]
  );
  const displayedEntries = patchNodes ? patchNodes.map((node) => node.entry) : log?.all ?? [];
  const patchNodeByHash = React.useMemo(
    () => new Map((patchNodes ?? []).map((node) => [node.entry.hash, node])),
    [patchNodes]
  );

  const laned: LanedCommit[] = React.useMemo(
    () => (isGraphMode ? assignLanes(displayedEntries) : []),
    [displayedEntries, isGraphMode]
  );

  const maxLanes = React.useMemo(
    () => Math.max(1, ...laned.map((l) => l.lane + 1)),
    [laned]
  );

  const lanedByHash = React.useMemo(
    () => new Map(laned.map((l) => [l.commit.hash, l])),
    [laned]
  );

  // Early return AFTER all hooks
  if (!log) {
    return null;
  }

  const hasDivider =
    branchDivider !== null &&
    branchDivider.insertBeforeIndex > 0 &&
    branchDivider.insertBeforeIndex < log.all.length;
  const hasDividerBelowLoaded = branchDivider !== null && branchDivider.insertBeforeIndex === log.all.length;
  const hasSplitHistory = hasDivider || hasDividerBelowLoaded;

  const topEntries = hasDivider
    ? log.all.slice(0, branchDivider.insertBeforeIndex)
    : hasDividerBelowLoaded
      ? log.all
      : [];
  const bottomEntries = hasDivider ? log.all.slice(branchDivider.insertBeforeIndex) : [];

  const dividerIcon = branchDivider?.direction === 'down'
    ? <Icon name="arrow-down-s" className="size-3.5" />
    : <Icon name="arrow-up" className="size-3.5" />;

  const renderCommitList = (entries: GitLogEntry[]) => (
    <ul className="divide-y divide-border/60">
      {entries.map((entry) => {
        const semanticNode = patchNodeByHash.get(entry.hash);
        const isCompound = (semanticNode?.commits.length ?? 0) > 1;
        const compoundExpanded = isCompound && expandedPatchNodes.has(entry.hash);
        const traceHighlighted = semanticNode && highlightCommits
          ? semanticNode.commits.some((commit) => highlightCommits.has(commit.hash))
          : highlightCommits?.has(entry.hash);
        return (
          <React.Fragment key={entry.hash}>
            <HistoryCommitRow
              entry={entry}
              mode={mode}
              laned={isGraphMode ? lanedByHash.get(entry.hash) : undefined}
              totalLanes={isGraphMode ? maxLanes : undefined}
              isExpanded={isCompound ? false : expandedCommitHashes.has(entry.hash)}
              onToggle={() => {
                if (!isCompound) {
                  onToggleCommit(entry.hash);
                  return;
                }
                setExpandedPatchNodes((current) => {
                  const next = new Set(current);
                  if (next.has(entry.hash)) next.delete(entry.hash);
                  else next.add(entry.hash);
                  return next;
                });
              }}
              files={commitFilesMap.get(entry.hash) ?? []}
              isLoadingFiles={loadingCommitHashes.has(entry.hash)}
              onCopyHash={onCopyHash}
              directory={directory}
              traceActive={traceActive && isGraphMode}
              onSetTraceRoot={onSetTraceRoot}
              isTraceHighlighted={highlightCommits ? traceHighlighted : undefined}
              traceCommits={highlightCommits}
              onConflict={onConflict}
              onActionSuccess={onActionSuccess}
              semanticNode={semanticNode}
            />
            {compoundExpanded && semanticNode ? (
              <li className="border-t border-border/40 bg-muted/20 px-10 py-2">
                <ul className="space-y-1.5">
                  {semanticNode.commits.map((commit) => (
                    <li key={commit.hash} className="flex min-w-0 items-center gap-2 typography-micro">
                      <code className="shrink-0 font-mono text-muted-foreground">{commit.hash.slice(0, 8)}</code>
                      <span className="truncate text-foreground">{commit.message}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">{commit.author_name}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
          </React.Fragment>
        );
      })}
    </ul>
  );

  const loadMoreButton = log.all.length >= logMaxCount ? (
    <div className="flex justify-center py-2 border-t border-border/40">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => onLogMaxCountChange(logMaxCount + 25)}
        disabled={isLogLoading}
        className="px-3 text-muted-foreground hover:text-foreground"
      >
        {isLogLoading ? (
          <span className="flex items-center gap-1">
            <Icon name="loader-4" className="size-3 animate-spin" />
            {t('gitView.history.loadingMore')}
          </span>
        ) : (
          t('gitView.history.loadMore')
        )}
      </Button>
    </div>
  ) : null;

  const content = (
    <ScrollableOverlay outerClassName={`min-h-0 ${contentMaxHeightClassName}`} className="h-full w-full">
      {displayedEntries.length === 0 ? (
        <div className="flex h-full items-center justify-center p-4">
          <p className="typography-ui-label text-muted-foreground">
            {t('gitView.history.noCommits')}
          </p>
        </div>
      ) : hasSplitHistory && branchDivider ? (
        <>
          <div className="flex flex-col gap-0">
            {topEntries.length > 0 ? (
              <div className="rounded-xl border border-border/60 bg-background/70 overflow-hidden">
                {renderCommitList(topEntries)}
              </div>
            ) : null}

            <div className="flex items-center gap-2 px-3 py-1.5" aria-hidden>
              <span className="h-px flex-1 bg-border/60" />
              <span className="inline-flex max-w-[80%] items-center gap-1 typography-micro text-muted-foreground">
                <span className="truncate" title={branchDivider.branchName}>{branchDivider.branchName}</span>
                {dividerIcon}
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            {bottomEntries.length > 0 ? (
              <div className="rounded-xl border border-border/60 bg-background/70 overflow-hidden">
                {renderCommitList(bottomEntries)}
              </div>
            ) : null}
          </div>
          {loadMoreButton}
        </>
      ) : (
        <>
          {renderCommitList(displayedEntries)}
          {loadMoreButton}
        </>
      )}
    </ScrollableOverlay>
  );

  if (!showHeader) {
    if (hasSplitHistory) {
      return <section className="h-full min-h-0">{content}</section>;
    }
    return (
      <section className="h-full min-h-0 rounded-xl border border-border/60 bg-background/70 overflow-hidden">
        {content}
      </section>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-xl border border-border/60 bg-background/70 overflow-hidden"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 h-10 hover:bg-transparent">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">{t('gitView.history.title')}</h3>
          {releaseInfo ? (
            <span className={`typography-micro truncate ${releaseInfo.kind === 'prerelease' ? 'text-status-warning' : 'text-muted-foreground'}`}>
              {releaseInfo.kind === 'stable'
                ? t('gitView.release.stableLine', {
                    tag: releaseInfo.tag,
                    ahead: releaseInfo.aheadFromStable,
                    behind: releaseInfo.behindFromStable,
                  })
                : releaseInfo.kind === 'prerelease'
                  ? t(releaseInfo.stableTag ? 'gitView.release.prereleaseWithStable' : 'gitView.release.prereleaseLine', {
                      tag: releaseInfo.tag,
                      stableTag: releaseInfo.stableTag ?? '',
                    })
                  : releaseInfo.kind === 'snapshot'
                    ? t('gitView.release.snapshot')
                    : null}
            </span>
          ) : null}
          {healthSummary && (healthSummary.diverged > 0 || healthSummary.baseStale > 0 || healthSummary.dormant > 0) ? (
            <span className="typography-micro shrink-0 text-muted-foreground">
              {t('gitView.health.summary', { ...healthSummary })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Select
                value={String(logMaxCount)}
                onValueChange={(value) => onLogMaxCountChange(Number(value))}
                disabled={isLogLoading}
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto"
                  disabled={isLogLoading}
                >
                  <SelectValue placeholder={t('gitView.history.commitsPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {LOG_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {t(option.labelKey as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isOpen ? (
            <Icon name="arrow-up-s" className="size-4 text-muted-foreground" />
          ) : (
            <Icon name="arrow-down-s" className="size-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>{content}</CollapsibleContent>
    </Collapsible>
  );
};
