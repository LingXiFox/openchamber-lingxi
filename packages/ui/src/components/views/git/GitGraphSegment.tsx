import React from 'react';
import type { LanedCommit } from './gitGraph';

const LANE_WIDTH = 8;

interface GitGraphSegmentProps {
  laned: LanedCommit;
  totalLanes: number;
  isExpanded: boolean;
  /** Trace mode: this row is OUTSIDE the traced path (dim it). */
  dimmed?: boolean;
  /** Trace mode: this row is part of the traced path (emphasize it). */
  highlighted?: boolean;
  compound?: boolean;
  nodeColor?: string;
  /** Merge commit: draw a second concentric outline around the dot. */
  isMerge?: boolean;
  /**
   * Ref decoration ring around the dot. Priority when several apply:
   * HEAD > tag > remote; a plain local branch keeps the bare dot.
   * Suppressed while trace-highlighted so the provenance emphasis wins.
   */
  refRing?: 'head' | 'tag' | 'remote' | null;
  /** Commit hashes in the selected trace. Connector edges are matched by endpoints. */
  traceCommits?: Set<string> | null;
}

/**
 * Renders the git graph lane column using an HTML Canvas element.
 *
 * Layout isolation pattern:
 *   A plain <div> (no replaced-element intrinsic sizing) owns all layout via
 *   `height: 100%` + self-stretch on the parent. The <canvas> is absolutely
 *   positioned inside it (`inset: 0`) so it fills the div without affecting
 *   the flex layout measurement. Canvas intrinsic height (default 150px) never
 *   leaks into the row height calculation.
 *
 *   useLayoutEffect reads the div's offsetHeight (stable, no replaced-element
 *   quirks) and sets the canvas drawing-buffer size + draws.
 */
export const GitGraphSegment: React.FC<GitGraphSegmentProps> = ({
  laned,
  totalLanes,
  isExpanded,
  dimmed = false,
  highlighted = false,
  compound = false,
  nodeColor,
  isMerge = false,
  refRing = null,
  traceCommits = null,
}) => {
  const { lane, color, connectors } = laned;
  const effectiveLanes = Math.max(totalLanes, lane + 1);
  const w = effectiveLanes * LANE_WIDTH + LANE_WIDTH / 2;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const h = container.offsetHeight;
    if (h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const dotCy = h / 2;
    const dotCx = lane * LANE_WIDTH + LANE_WIDTH / 2;

    const styles = getComputedStyle(canvas);
    const fallbackColor = styles.getPropertyValue('--surface-muted-foreground').trim() || styles.color;

    const resolveColor = (value: string): string => {
      if (!value.startsWith('var(')) return value;
      const varName = value.slice(4, -1).trim();
      return styles.getPropertyValue(varName).trim() || fallbackColor;
    };

    // Straight lines first so bezier curves render on top
    const sorted = [...connectors].sort((a, b) => {
      const isBezier = (t: string) => t === 'branch-out' || t === 'merge-in';
      return (isBezier(a.type) ? 1 : 0) - (isBezier(b.type) ? 1 : 0);
    });

    for (const seg of sorted) {
      const x1 = seg.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
      const x2 = seg.toLane * LANE_WIDTH + LANE_WIDTH / 2;
      const lineAlpha = seg.type === 'passing'
        ? 0.72
        : seg.type === 'branch-out' || seg.type === 'merge-in'
          ? 0.95
          : 1;

      const edgeIsTraced = (edge: typeof seg.topEdge): boolean => Boolean(
        edge && traceCommits?.has(edge.childHash) && traceCommits.has(edge.parentHash)
      );
      const draw = (drawPath: () => void, traced: boolean) => {
        ctx.beginPath();
        ctx.strokeStyle = resolveColor(seg.color);
        ctx.globalAlpha = traceCommits ? (traced ? 1 : lineAlpha * 0.15) : dimmed ? lineAlpha * 0.15 : highlighted ? 1 : lineAlpha;
        ctx.lineWidth = traced || (highlighted && !dimmed && !traceCommits) ? 1.9 : 1.25;
        ctx.lineCap = 'round';
        drawPath();
        ctx.stroke();
        ctx.globalAlpha = 1;
      };

      switch (seg.type) {
        case 'passing':
        case 'commit-lane': {
          draw(() => {
            ctx.moveTo(x1, 0);
            ctx.lineTo(x1, dotCy);
          }, edgeIsTraced(seg.topEdge));
          draw(() => {
            ctx.moveTo(x1, dotCy);
            ctx.lineTo(x1, h);
          }, edgeIsTraced(seg.bottomEdge));
          break;
        }
        case 'top-stub':
          draw(() => {
            ctx.moveTo(x1, 0);
            ctx.lineTo(x1, dotCy);
          }, edgeIsTraced(seg.topEdge));
          break;
        case 'bottom-stub':
          draw(() => {
            ctx.moveTo(x1, dotCy);
            ctx.lineTo(x1, h);
          }, edgeIsTraced(seg.bottomEdge));
          break;
        case 'branch-out': {
          const mid = (dotCy + h) / 2;
          draw(() => {
            ctx.moveTo(dotCx, dotCy);
            ctx.bezierCurveTo(dotCx, mid, x2, mid, x2, h);
          }, edgeIsTraced(seg.bottomEdge));
          break;
        }
        case 'merge-in': {
          const mid = dotCy / 2;
          draw(() => {
            ctx.moveTo(x1, 0);
            ctx.bezierCurveTo(x1, mid, dotCx, mid, dotCx, dotCy);
          }, edgeIsTraced(seg.topEdge));
          break;
        }
        default:
          continue;
      }
    }

    // Dot — drawn last, always on top. Trace-highlighted dots get a ring;
    // dimmed dots fade so unrelated history recedes. Merge commits add a
    // second concentric outline; ref decorations draw the outermost ring
    // (HEAD solid primary, tag solid info, remote dashed muted) unless the
    // trace emphasis is active on this row.
    const bg = styles.getPropertyValue('--background').trim() || styles.getPropertyValue('--surface-background').trim();
    ctx.globalAlpha = dimmed ? 0.25 : 1;

    const dotColor = resolveColor(nodeColor ?? color);
    if (isMerge && !compound) {
      ctx.beginPath();
      ctx.arc(dotCx, dotCy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = dotColor;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    if (refRing && !highlighted) {
      const rawRingColor = refRing === 'head'
        ? styles.getPropertyValue('--primary').trim()
        : refRing === 'tag'
          ? styles.getPropertyValue('--status-info').trim()
          : styles.getPropertyValue('--surface-muted-foreground').trim() || fallbackColor;
      if (rawRingColor) {
        ctx.beginPath();
        ctx.arc(dotCx, dotCy, 7.25, 0, Math.PI * 2);
        ctx.strokeStyle = resolveColor(rawRingColor);
        ctx.lineWidth = 1.5;
        if (refRing === 'remote') ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.beginPath();
    if (compound) ctx.roundRect(dotCx - 6, dotCy - 4.5, 12, 9, 2.5);
    else ctx.arc(dotCx, dotCy, highlighted ? 4.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    if (highlighted) {
      ctx.beginPath();
      if (compound) ctx.roundRect(dotCx - 8, dotCy - 6.5, 16, 13, 3.5);
      else ctx.arc(dotCx, dotCy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = resolveColor(nodeColor ?? color);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    if (compound) ctx.roundRect(dotCx - 7, dotCy - 5.5, 14, 11, 3);
    else ctx.arc(dotCx, dotCy, highlighted ? 5.5 : 5, 0, Math.PI * 2);
    ctx.strokeStyle = bg || fallbackColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [laned, lane, color, connectors, totalLanes, isExpanded, w, dimmed, highlighted, compound, nodeColor, isMerge, refRing, traceCommits]);

  return (
    // This div owns the layout: height: 100% fills the self-stretch parent,
    // width is fixed to the lane count. No replaced-element intrinsic sizing.
    <div
      ref={containerRef}
      style={{ width: w, height: '100%', position: 'relative', flexShrink: 0, overflow: 'hidden' }}
    >
      {/* Canvas is absolutely inset so it matches the div exactly and never
          contributes its own intrinsic height (150px default) to flex layout. */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};
