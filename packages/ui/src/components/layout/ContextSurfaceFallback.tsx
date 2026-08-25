import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Stable shell shown only while a lazily code-split Context surface loads its
 * chunk for the first time. Suspense guarantees the lifetime: once the module
 * is cached the boundary never falls back again, so keep-alive reopens and
 * data refreshes never show this. Purely decorative — hidden from assistive
 * tech, non-interactive, and it reserves the panel's geometry so the real
 * surface swaps in without a layout jump.
 */

export const ContextSurfaceFallback: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden="true"
    className={cn('flex h-full min-h-0 w-full flex-col gap-3 p-4', className)}
  >
    <div className="oc-motion-placeholder-pulse h-5 w-2/5 shrink-0 rounded-md bg-[var(--surface-muted)]" />
    <div className="oc-motion-placeholder-pulse h-3 w-3/4 shrink-0 rounded bg-[var(--surface-muted)] [animation-delay:150ms]" />
    <div className="oc-motion-placeholder-pulse h-24 w-full shrink-0 rounded-lg border border-border/50 bg-[var(--surface-muted)]/60 [animation-delay:300ms]" />
  </div>
);
