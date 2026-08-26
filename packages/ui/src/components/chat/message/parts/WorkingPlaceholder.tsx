import React from 'react';
import { ActivityIndicator } from './ActivityIndicator';
import { useI18n } from '@/lib/i18n';
import { useProviderLogo } from '@/hooks/useProviderLogo';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { resolveOrbState } from '@/lib/agent-activity-orb';
import type { AgentActivity } from '@/lib/agent-activity';
import { formatAgentActivityLabel } from '@/lib/agent-activity-presentation';
import { useStabilizedAgentActivity } from '@/hooks/useStabilizedAgentActivity';

interface WorkingPlaceholderProps {
  isWorking: boolean;
  statusText: string | null;
  isWaitingForPermission?: boolean;
  retryInfo?: { attempt?: number; next?: number } | null;
  agentName?: string;
  modelName?: string | null;
  providerId?: string | null;
  activity?: AgentActivity | null;
}

const EPOCH_SECONDS_THRESHOLD = 1_000_000_000;
const EPOCH_MILLISECONDS_THRESHOLD = 1_000_000_000_000;

const toRetryTargetTimestamp = (next: number): number => {
  if (next >= EPOCH_MILLISECONDS_THRESHOLD) {
    return next;
  }
  if (next >= EPOCH_SECONDS_THRESHOLD) {
    return next * 1000;
  }
  return Date.now() + next;
};

const formatRetryCountdown = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = seconds % 60;
    return remainderSeconds > 0 ? `${minutes}m ${remainderSeconds}s` : `${minutes}m`;
  }

  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const remainderMinutes = Math.floor((seconds % 3600) / 60);
    return remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(seconds / 86400);
  const remainderHours = Math.floor((seconds % 86400) / 3600);
  if (remainderHours > 0) {
    return `${days}d ${remainderHours}h`;
  }

  return `${days}d`;

};

export function WorkingPlaceholder({
  isWorking,
  statusText,
  isWaitingForPermission,
  retryInfo,
  modelName,
  providerId,
  activity,
}: WorkingPlaceholderProps) {
  const { t } = useI18n();
  const { src: providerLogoSrc, onError: handleProviderLogoError, hasLogo: hasProviderLogo } = useProviderLogo(providerId ?? null);
  const { currentTheme } = useThemeSystem();
  const isDarkTheme = currentTheme?.metadata.variant === 'dark';
  const stabilizedActivity = useStabilizedAgentActivity(activity ?? 'idle');
  const primaryLabel = formatAgentActivityLabel(stabilizedActivity, t);
  const orbState = resolveOrbState(stabilizedActivity);

  // Countdown state for retry mode
  const [retryCountdown, setRetryCountdown] = React.useState<number | null>(null);

  React.useEffect(() => {
    const rawNext = retryInfo?.next;
    if (!rawNext || rawNext <= 0) {
      setRetryCountdown(null);
      return;
    }

    const retryTargetAt = toRetryTargetTimestamp(rawNext);

    const update = () => {
      const remaining = Math.max(0, retryTargetAt - Date.now());
      setRetryCountdown(Math.ceil(remaining / 1000));
    };

    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [retryInfo?.next, retryInfo?.attempt]);

  if (!isWorking || !primaryLabel) {
    return null;
  }

  const activityIndicator = (
    <ActivityIndicator orbState={orbState} />
  );

  const trimmedModelName = modelName?.trim() ?? '';
  let activityDetail = statusText;
  if (retryInfo) {
    const attemptLabel = retryInfo.attempt && retryInfo.attempt > 1 ? ` (attempt ${retryInfo.attempt})` : '';
    const countdownLabel = retryCountdown !== null && retryCountdown > 0
      ? ` in ${formatRetryCountdown(retryCountdown)}`
      : '';
    activityDetail = `Retry${countdownLabel}${attemptLabel}`;
  }
  const label = trimmedModelName.length > 0
    ? t('chat.statusRow.modelStatus', { model: trimmedModelName, status: primaryLabel })
    : primaryLabel;
  const accessibleLabel = activityDetail ? `${label}: ${activityDetail}` : label;

  return (
    <div
      className="flex min-h-16 min-w-0 items-center gap-2"
      role="status"
      aria-live={isWaitingForPermission ? 'assertive' : 'polite'}
      aria-label={accessibleLabel}
      data-waiting={isWaitingForPermission ? 'true' : undefined}
    >
      {activityIndicator}
      <div className="flex h-16 min-w-0 flex-col justify-center pt-4">
        <span className="truncate text-sm font-medium text-foreground">{primaryLabel}</span>
        {trimmedModelName || activityDetail ? (
          <span className="flex min-w-0 items-center gap-1 truncate typography-meta text-muted-foreground/70">
            {hasProviderLogo && providerLogoSrc ? (
              <img
                src={providerLogoSrc}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 opacity-70"
                style={{
                  filter: isDarkTheme ? 'brightness(0.9) contrast(1.1) invert(1)' : 'brightness(0.9) contrast(1.1)',
                }}
                onError={handleProviderLogoError}
              />
            ) : null}
            {trimmedModelName ? <span className="truncate">{trimmedModelName}</span> : null}
            {trimmedModelName && activityDetail ? <span aria-hidden="true">·</span> : null}
            {activityDetail ? <span className="truncate">{activityDetail}</span> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
