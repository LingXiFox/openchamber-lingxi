import type { GitLogEntry, GitPatchStacksResponse } from '@/lib/api/types';

type LaneColor = string;

/**
 * Describes one visible line/curve in a commit row's SVG.
 * Each segment covers the FULL row height (y=0 to y=100%).
 *
 * Types:
 *  - 'passing'    : straight vertical line, lane active but this row is not its commit
 *  - 'commit-lane': straight vertical line for this commit's lane (has both incoming and outgoing)
 *  - 'top-stub'   : line from y=0 to dot-y only (branch HEAD — no child above)
 *  - 'bottom-stub': line from dot-y to y=100% only (root commit — nothing above)
 *  - 'branch-out' : bezier from (dot-x, dot-y) to (toLane-x, 100%) — new parent lane opens
 *  - 'merge-in'   : bezier from (fromLane-x, 0) to (dot-x, dot-y) — lane converges here
 */
interface ConnectorSegment {
  fromLane: number;
  toLane: number;
  color: LaneColor;
  type: 'passing' | 'commit-lane' | 'top-stub' | 'bottom-stub' | 'branch-out' | 'merge-in';
  topEdge?: CommitEdge;
  bottomEdge?: CommitEdge;
}

interface CommitEdge {
  childHash: string;
  parentHash: string;
}

export interface LanedCommit {
  commit: GitLogEntry;
  lane: number;
  color: LaneColor;
  /** All visible line segments in this row's height. */
  connectors: ConnectorSegment[];
}

export interface PatchGraphNode {
  entry: GitLogEntry;
  commits: GitLogEntry[];
  kind: 'commit' | 'sync' | 'stack';
  stackName?: string;
  color?: string;
  anchors: Array<'merge-base' | 'release'>;
}

interface PatchGraphOptions {
  stacks?: GitPatchStacksResponse | null;
  mergeBaseHash?: string | null;
  releaseRef?: string | null;
}

const LANE_COLORS: LaneColor[] = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--syntax-keyword)',
  'var(--syntax-string)',
  'var(--status-info)',
];

function laneColor(lane: number): LaneColor {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

const SYNC_MESSAGE = /^(sync\b|merge remote-tracking branch\b|merge branch .+ into\b)/i;

const commitRefs = (commit: GitLogEntry): string[] => commit.refs
  .split(',')
  .map((ref) => ref.trim().replace(/^HEAD -> /, '').replace(/^tag: /, ''))
  .filter(Boolean);

export function projectPatchGraph(commits: GitLogEntry[], options: PatchGraphOptions = {}): PatchGraphNode[] {
  const stackTipByHash = new Map<string, { branch: string; dependsOn: string | null; groupId: string; name?: string; color: string }>();
  for (const [groupIndex, group] of (options.stacks?.groups ?? []).entries()) {
    for (const stackEntry of group.chains) {
      const tip = commits.find((commit) => commitRefs(commit).includes(stackEntry.branch));
      if (!tip) continue;
      stackTipByHash.set(tip.hash, {
        branch: stackEntry.branch,
        dependsOn: stackEntry.dependsOn,
        groupId: group.id,
        name: group.name,
        color: LANE_COLORS[groupIndex % LANE_COLORS.length],
      });
    }
  }

  const anchorByHash = new Map<string, Array<'merge-base' | 'release'>>();
  if (options.mergeBaseHash) anchorByHash.set(options.mergeBaseHash, ['merge-base']);
  if (options.releaseRef) {
    const release = commits.find((commit) => commitRefs(commit).includes(options.releaseRef ?? ''));
    if (release) anchorByHash.set(release.hash, [...(anchorByHash.get(release.hash) ?? []), 'release']);
  }

  const nodes: PatchGraphNode[] = [];
  for (let index = 0; index < commits.length;) {
    const first = commits[index];
    const stackTip = stackTipByHash.get(first.hash);
    const grouped = [first];
    let kind: PatchGraphNode['kind'] = 'commit';
    let stackName: string | undefined;
    let color: string | undefined;

    if (!anchorByHash.has(first.hash) && stackTip) {
      let childTip = stackTip;
      while (index + grouped.length < commits.length) {
        const next = commits[index + grouped.length];
        const nextTip = stackTipByHash.get(next.hash);
        const childCommit = grouped[grouped.length - 1];
        if (
          anchorByHash.has(next.hash)
          || !nextTip
          || nextTip.groupId !== stackTip.groupId
          || childTip.dependsOn !== nextTip.branch
          || !childCommit.parents.includes(next.hash)
        ) break;
        grouped.push(next);
        childTip = nextTip;
      }
      kind = 'stack';
      stackName = stackTip.name;
      color = stackTip.color;
    } else if (!anchorByHash.has(first.hash) && SYNC_MESSAGE.test(first.message)) {
      while (index + grouped.length < commits.length) {
        const previous = grouped[grouped.length - 1];
        const next = commits[index + grouped.length];
        if (anchorByHash.has(next.hash) || !SYNC_MESSAGE.test(next.message) || next.author_email !== first.author_email) break;
        if (!previous.parents.includes(next.hash)) break;
        grouped.push(next);
      }
      if (grouped.length > 1) {
        kind = 'sync';
        color = 'var(--status-info)';
      }
    }

    nodes.push({ entry: first, commits: grouped, kind, stackName, color, anchors: anchorByHash.get(first.hash) ?? [] });
    index += grouped.length;
  }

  const representativeByHash = new Map<string, string>();
  for (const node of nodes) {
    for (const commit of node.commits) representativeByHash.set(commit.hash, node.entry.hash);
  }
  for (const node of nodes) {
    const ownHashes = new Set(node.commits.map((commit) => commit.hash));
    const parents = new Set<string>();
    for (const commit of node.commits) {
      for (const parent of commit.parents) {
        if (ownHashes.has(parent)) continue;
        parents.add(representativeByHash.get(parent) ?? parent);
      }
    }
    node.entry = {
      ...node.entry,
      parents: [...parents],
      refs: [...new Set(node.commits.flatMap(commitRefs))].join(', '),
      filesChanged: node.commits.reduce((total, commit) => total + commit.filesChanged, 0),
      insertions: node.commits.reduce((total, commit) => total + commit.insertions, 0),
      deletions: node.commits.reduce((total, commit) => total + commit.deletions, 0),
    };
  }
  return nodes;
}

/**
 * Assigns visual lanes to a list of commits (newest-first order).
 *
 * Greedy lane assignment algorithm (O(n × lanes) where lanes = max concurrent active branches):
 * - activeLanes[i] holds the hash expected next on lane i (or null if free)
 * - Each commit takes the lane that was waiting for it, or the next free lane
 * - Merge commits open new lanes for additional parents
 * - Connectors describe ALL visible lines in each row (both above and below the dot)
 */
export function assignLanes(commits: GitLogEntry[]): LanedCommit[] {
  if (commits.length === 0) return [];

  // activeLanes[i] = hash of the next commit expected on lane i, or null if free
  const activeLanes: Array<string | null> = [];
  const activeEdges: Array<CommitEdge | null> = [];

  const result: LanedCommit[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];

    // Find all lanes waiting for this commit
    const waitingLanes: number[] = [];
    for (let li = 0; li < activeLanes.length; li++) {
      if (activeLanes[li] === commit.hash) {
        waitingLanes.push(li);
      }
    }

    // Use the first waiting lane as the commit's lane
    let assignedLane = waitingLanes.length > 0 ? waitingLanes[0] : -1;
    if (assignedLane === -1) {
      // No existing lane claimed this commit; take the first free lane
      const freeLane = activeLanes.indexOf(null);
      if (freeLane !== -1) {
        assignedLane = freeLane;
      } else {
        assignedLane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    // Mark other waiting lanes as converging here (will emit merge-in connectors)
    const convergingLanes = waitingLanes.slice(1);
    const incomingEdge = activeEdges[assignedLane] ?? undefined;
    const convergingEdges = new Map(convergingLanes.map((lane) => [lane, activeEdges[lane] ?? undefined]));

    const color = laneColor(assignedLane);
    const hasIncoming = activeLanes[assignedLane] === commit.hash;
    const hasParent = commit.parents.length > 0;

    // Update this commit's lane to point at its first parent
    if (hasParent) {
      activeLanes[assignedLane] = commit.parents[0];
      activeEdges[assignedLane] = { childHash: commit.hash, parentHash: commit.parents[0] };
    } else {
      activeLanes[assignedLane] = null;
      activeEdges[assignedLane] = null;
    }
    const outgoingEdge = activeEdges[assignedLane] ?? undefined;

    // Open new lanes for additional parents (merge commits)
    const extraParents: Array<{ lane: number; parentHash: string }> = [];
    for (let p = 1; p < commit.parents.length; p++) {
      const parentHash = commit.parents[p];
      // Check if another lane is already waiting for this parent
      const existingLane = activeLanes.indexOf(parentHash);
      if (existingLane !== -1) {
        extraParents.push({ lane: existingLane, parentHash });
      } else {
        const freeLane = activeLanes.indexOf(null);
        const newLane = freeLane !== -1 ? freeLane : activeLanes.length;
        activeLanes[newLane] = parentHash;
        activeEdges[newLane] = { childHash: commit.hash, parentHash };
        if (newLane === activeLanes.length) activeLanes.push(parentHash);
        extraParents.push({ lane: newLane, parentHash });
      }
    }

    // Build connectors: ALL visible line segments in this row
    const connectors: ConnectorSegment[] = [];

    // This commit's own lane segment
    if (hasIncoming && hasParent) {
      connectors.push({ fromLane: assignedLane, toLane: assignedLane, color, type: 'commit-lane', topEdge: incomingEdge, bottomEdge: outgoingEdge });
    } else if (hasIncoming && !hasParent) {
      connectors.push({ fromLane: assignedLane, toLane: assignedLane, color, type: 'top-stub', topEdge: incomingEdge });
    } else if (!hasIncoming && hasParent) {
      connectors.push({ fromLane: assignedLane, toLane: assignedLane, color, type: 'bottom-stub', bottomEdge: outgoingEdge });
    }
    // else: orphan with no parent and no child — just the dot, no lines

    // Merge-in connectors for converging lanes
    for (const convergingLane of convergingLanes) {
      connectors.push({
        fromLane: convergingLane,
        toLane: assignedLane,
        color: laneColor(convergingLane),
        type: 'merge-in',
        topEdge: convergingEdges.get(convergingLane),
      });
      // Clear the converging lane
      activeLanes[convergingLane] = null;
      activeEdges[convergingLane] = null;
    }

    // Branch-out segments for merge commit's extra parents
    for (const { lane: extraLane, parentHash } of extraParents) {
      connectors.push({
        fromLane: assignedLane,
        toLane: extraLane,
        color: laneColor(extraLane),
        type: 'branch-out',
        bottomEdge: { childHash: commit.hash, parentHash },
      });
    }

    // Passing-through lanes (active but not this commit's lane or extra parent lanes)
    for (let lane = 0; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] === null) continue;
      if (lane === assignedLane) continue;
      if (extraParents.some((parent) => parent.lane === lane)) continue;
      connectors.push({
        fromLane: lane,
        toLane: lane,
        color: laneColor(lane),
        type: 'passing',
        topEdge: activeEdges[lane] ?? undefined,
        bottomEdge: activeEdges[lane] ?? undefined,
      });
    }

    result.push({ commit, lane: assignedLane, color, connectors });
  }

  return result;
}
