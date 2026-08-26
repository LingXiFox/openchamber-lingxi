import type { AgentActivity } from './agent-activity';
import type { I18nKey, I18nParams } from './i18n';

export const AGENT_ACTIVITY_MINIMUM_VISIBLE_MS = 500;
export const AGENT_ACTIVITY_FALLBACK_GRACE_MS = 175;
export const AGENT_ACTIVITY_MAXIMUM_LAG_MS = 750;

export interface AgentActivityPresentation {
    activity: AgentActivity;
}

type ActivityLabelTranslator = (key: I18nKey, params?: I18nParams) => string;
type ActivityWithPrimaryLabel = Exclude<AgentActivity, 'idle' | 'blocked'>;
type AgentActivityLabelKeys = Record<ActivityWithPrimaryLabel, I18nKey>;

const ACTIVITY_LABEL_KEYS = {
    connecting: 'chat.statusRow.activity.connecting',
    retrying: 'chat.statusRow.activity.retrying',
    listening: 'chat.statusRow.activity.listening',
    working: 'chat.statusRow.activity.working',
    searching: 'chat.statusRow.activity.searching',
    reasoning: 'chat.statusRow.activity.reasoning',
    composing: 'chat.statusRow.activity.composing',
    editing: 'chat.statusRow.activity.editing',
    orchestrating: 'chat.statusRow.activity.orchestrating',
} satisfies AgentActivityLabelKeys;

export const formatAgentActivityLabel = (
    activity: AgentActivity,
    t: ActivityLabelTranslator,
): string | null => {
    if (activity === 'idle' || activity === 'blocked') return null;
    return t(ACTIVITY_LABEL_KEYS[activity]);
};

interface PresentationClock {
    now: () => number;
    setTimer: (callback: () => void, delay: number) => () => void;
}

interface PendingPresentation {
    presentation: AgentActivityPresentation;
    startedAt: number;
    updatedAt: number;
}

const SYSTEM_CLOCK: PresentationClock = {
    now: Date.now,
    setTimer: (callback, delay) => {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
    },
};

const IMMEDIATE_ACTIVITIES: ReadonlySet<AgentActivity> = new Set([
    'idle',
    'blocked',
    'listening',
    'connecting',
    'retrying',
]);

const FOREGROUND_ACTIVITIES: ReadonlySet<AgentActivity> = new Set([
    'searching',
    'editing',
    'orchestrating',
]);

const samePresentation = (
    left: AgentActivityPresentation,
    right: AgentActivityPresentation,
): boolean => (
    left.activity === right.activity
);

export interface AgentActivityPresentationStabilizer {
    update: (presentation: AgentActivityPresentation) => void;
    dispose: () => void;
    getSnapshot: () => AgentActivityPresentation;
}

export const createAgentActivityPresentationStabilizer = (
    initial: AgentActivityPresentation,
    onChange: (presentation: AgentActivityPresentation) => void,
    clock: PresentationClock = SYSTEM_CLOCK,
): AgentActivityPresentationStabilizer => {
    let displayed = initial;
    let displayedSince = clock.now();
    let pending: PendingPresentation | null = null;
    let cancelTimer: (() => void) | null = null;
    let disposed = false;

    const clearTimer = () => {
        cancelTimer?.();
        cancelTimer = null;
    };

    const show = (presentation: AgentActivityPresentation, now: number) => {
        clearTimer();
        pending = null;
        displayed = presentation;
        displayedSince = now;
        onChange(presentation);
    };

    const deadline = (): number => {
        if (!pending) return displayedSince;

        const minimumVisibleAt = displayedSince + AGENT_ACTIVITY_MINIMUM_VISIBLE_MS;
        const fallbackGraceAt = FOREGROUND_ACTIVITIES.has(displayed.activity)
            && !FOREGROUND_ACTIVITIES.has(pending.presentation.activity)
            ? pending.updatedAt + AGENT_ACTIVITY_FALLBACK_GRACE_MS
            : 0;
        const desiredAt = Math.max(minimumVisibleAt, fallbackGraceAt);
        return Math.min(desiredAt, pending.startedAt + AGENT_ACTIVITY_MAXIMUM_LAG_MS);
    };

    const flush = () => {
        cancelTimer = null;
        if (disposed || !pending) return;

        const now = clock.now();
        const showAt = deadline();
        if (now < showAt) {
            cancelTimer = clock.setTimer(flush, showAt - now);
            return;
        }
        show(pending.presentation, now);
    };

    const schedule = () => {
        clearTimer();
        const delay = Math.max(0, deadline() - clock.now());
        cancelTimer = clock.setTimer(flush, delay);
    };

    return {
        update(presentation) {
            if (disposed) return;

            const now = clock.now();
            if (presentation.activity === displayed.activity) {
                clearTimer();
                pending = null;
                if (!samePresentation(displayed, presentation)) {
                    displayed = presentation;
                    onChange(presentation);
                }
                return;
            }

            if (IMMEDIATE_ACTIVITIES.has(presentation.activity)) {
                show(presentation, now);
                return;
            }

            const foregroundPreemptsFallback = FOREGROUND_ACTIVITIES.has(presentation.activity)
                && (
                    !FOREGROUND_ACTIVITIES.has(displayed.activity)
                    || (pending !== null && !FOREGROUND_ACTIVITIES.has(pending.presentation.activity))
                );
            if (foregroundPreemptsFallback) {
                show(presentation, now);
                return;
            }

            if (!pending) {
                pending = { presentation, startedAt: now, updatedAt: now };
            } else {
                if (pending.presentation.activity !== presentation.activity) {
                    pending.updatedAt = now;
                }
                pending.presentation = presentation;
            }
            schedule();
        },
        dispose() {
            disposed = true;
            pending = null;
            clearTimer();
        },
        getSnapshot() {
            return displayed;
        },
    };
};
