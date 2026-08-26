import React from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';

import { BusyDots } from './BusyDots';

interface ActivityIndicatorProps {
  orbState: OrbState | null;
}

export const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({ orbState }) => {
  if (!orbState) {
    return <BusyDots />;
  }
  return (
    <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center" aria-hidden="true">
      <ThinkingOrb state={orbState} size={64} />
    </span>
  );
};
