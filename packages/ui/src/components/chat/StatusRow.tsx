import React from "react";
import { useSessionUIStore } from '@/sync/session-ui-store';
import { WorkingPlaceholder } from "./message/parts/WorkingPlaceholder";
import type { AgentActivity } from '@/lib/agent-activity';

// The floating assistant-status chip that hovers above the composer while the
// agent works ("Claude is working…"). ONLY that. The composer's
// own bar — pending changes, todos dropdown — is ComposerStatusBar: they used
// to share this component, and every restyle of this chip (glass, placement)
// silently dragged the composer bar and its dropdown along with it.

const STATUS_ROW_CONTAINER_STYLE = { containerType: "inline-size" as const, containerName: "status-row" };

interface StatusRowProps {
  isWorking?: boolean;
  statusText?: string | null;
  isWaitingForPermission?: boolean;
  abortActive?: boolean;
  retryInfo?: { attempt?: number; next?: number } | null;
  agentName?: string;
  modelName?: string | null;
  providerId?: string | null;
  activity?: AgentActivity | null;
}

export const StatusRow: React.FC<StatusRowProps> = ({
  isWorking = false,
  statusText = null,
  isWaitingForPermission,
  abortActive,
  retryInfo,
  agentName,
  modelName,
  providerId,
  activity,
}) => {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);

  const shouldRenderPlaceholder = !abortActive;
  const hasSemanticActivity = activity === undefined || (activity !== 'idle' && activity !== 'blocked');
  const hasContent = isWorking && hasSemanticActivity;

  if (!hasContent) {
    return null;
  }

  return (
    <div
      // The row renders inside the composer-anchored overlay, which owns the
      // distance to the input and the horizontal column (the same ones the
      // scroll-to-bottom pill uses).
      style={STATUS_ROW_CONTAINER_STYLE}
    >
      {/* The glass chip lives here, not on the container: the root above is
          an inline-size query container, whose width ignores its children —
          a shrink-to-fit wrapper around it always collapsed to zero. */}
      <div className="oc-glass-popover inline-flex min-h-16 w-max max-w-full items-center gap-2 whitespace-nowrap rounded-full [corner-shape:round] px-3">
        <div className="flex items-center min-w-0 gap-2 overflow-x-hidden">
          {shouldRenderPlaceholder ? (
            <WorkingPlaceholder
              key={currentSessionId ?? "no-session"}
              isWorking={isWorking}
              statusText={statusText}
              isWaitingForPermission={isWaitingForPermission}
              retryInfo={retryInfo}
              agentName={agentName}
              modelName={modelName}
              providerId={providerId}
              activity={activity}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
