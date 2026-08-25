import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Fixed-slot state transition for controls whose identity changes while the
 * element itself persists (Send↔Stop glyph, model/agent label). The current
 * value renders immediately and owns layout; the previous render is kept as a
 * non-interactive overlay only long enough to fade out through opacity and
 * subtle scale. Authority is never delayed: handlers, aria labels, and hit
 * targets switch synchronously with state.
 */

const SWAP_MS = 120;

type SwapExit = {
  key: string;
  node: React.ReactNode;
};

const useStateSwapExit = (swapKey: string, node: React.ReactNode): SwapExit | null => {
  const [exit, setExit] = React.useState<SwapExit | null>(null);
  const renderedRef = React.useRef<SwapExit>({ key: swapKey, node });

  React.useEffect(() => {
    const rendered = renderedRef.current;
    if (rendered.key === swapKey) {
      renderedRef.current = { key: swapKey, node };
      return;
    }

    setExit(rendered);
    renderedRef.current = { key: swapKey, node };
    const timer = window.setTimeout(() => setExit(null), SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [swapKey, node]);

  return exit;
};

export const StateSwap: React.FC<{
  /** Identity of the displayed value; changing it triggers the crossfade. */
  swapKey: string;
  className?: string;
  children: React.ReactNode;
}> = ({ swapKey, className, children }) => {
  const exit = useStateSwapExit(swapKey, children);

  return (
    <span className={cn('relative inline-flex min-w-0 max-w-full', className)}>
      <span key={swapKey} className="oc-motion-swap-in inline-flex min-w-0 max-w-full">
        {children}
      </span>
      {exit !== null && (
        <span
          aria-hidden="true"
          className="oc-motion-swap-out pointer-events-none absolute inset-0 inline-flex min-w-0 max-w-full items-center overflow-hidden"
        >
          {exit.node}
        </span>
      )}
    </span>
  );
};
