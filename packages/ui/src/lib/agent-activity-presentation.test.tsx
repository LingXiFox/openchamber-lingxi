import { describe, expect, test } from 'bun:test';

import type { I18nKey } from './i18n';
import { resolveOrbState } from './agent-activity-orb';
import {
    AGENT_ACTIVITY_FALLBACK_GRACE_MS,
    AGENT_ACTIVITY_MAXIMUM_LAG_MS,
    AGENT_ACTIVITY_MINIMUM_VISIBLE_MS,
    createAgentActivityPresentationStabilizer,
    formatAgentActivityLabel,
    type AgentActivityPresentation,
} from './agent-activity-presentation';

const presentation = (
    activity: AgentActivityPresentation['activity'],
): AgentActivityPresentation => ({ activity });

const labelKey = (key: I18nKey): string => key;

const createClock = () => {
    let now = 0;
    let timer: { at: number; callback: () => void } | null = null;

    return {
        now: () => now,
        setTimer(callback: () => void, delay: number) {
            const scheduled = { at: now + delay, callback };
            timer = scheduled;
            return () => {
                if (timer === scheduled) timer = null;
            };
        },
        advance(milliseconds: number) {
            const target = now + milliseconds;
            while (timer && timer.at <= target) {
                now = timer.at;
                const callback = timer.callback;
                timer = null;
                callback();
            }
            now = target;
        },
        pendingTimerCount: () => (timer ? 1 : 0),
    };
};

const createHarness = (initial: AgentActivityPresentation) => {
    const clock = createClock();
    const changes: AgentActivityPresentation[] = [];
    const stabilizer = createAgentActivityPresentationStabilizer(initial, (next) => changes.push(next), clock);
    return { clock, changes, stabilizer };
};

describe('agent activity presentation stabilization', () => {
    test('uses the configured timing bounds', () => {
        expect(AGENT_ACTIVITY_MINIMUM_VISIBLE_MS).toBe(500);
        expect(AGENT_ACTIVITY_FALLBACK_GRACE_MS).toBe(175);
        expect(AGENT_ACTIVITY_MAXIMUM_LAG_MS).toBe(750);
    });

    test('maps each foreground activity to a matching primary label and orb from one activity', () => {
        const cases: Array<[AgentActivityPresentation['activity'], string | null, ReturnType<typeof resolveOrbState>]> = [
            ['searching', 'chat.statusRow.activity.searching', 'searching'],
            ['reasoning', 'chat.statusRow.activity.reasoning', 'breathing'],
            ['editing', 'chat.statusRow.activity.editing', 'shaping'],
            ['composing', 'chat.statusRow.activity.composing', 'composing'],
        ];

        for (const [activity, label, orb] of cases) {
            expect(formatAgentActivityLabel(activity, labelKey)).toBe(label);
            expect(resolveOrbState(activity)).toBe(orb);
        }
    });

    test('reasoning -> searching -> working -> editing drops the transient working state', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('reasoning'));

        clock.advance(50);
        stabilizer.update(presentation('searching'));
        clock.advance(50);
        stabilizer.update(presentation('working'));
        clock.advance(100);
        stabilizer.update(presentation('editing'));

        expect(changes.map((change) => change.activity)).toEqual(['searching', 'editing']);
        expect(stabilizer.getSnapshot()).toEqual(presentation('editing'));
    });

    test('coalesces repeated searching without restarting its timer or canvas state', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('searching'));

        clock.advance(100);
        stabilizer.update(presentation('searching'));

        expect(changes).toEqual([]);
        expect(clock.pendingTimerCount()).toBe(0);
        expect(stabilizer.getSnapshot().activity).toBe('searching');
    });

    test('tool A -> 150ms fallback -> tool B never presents the fallback flash', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('searching'));

        clock.advance(500);
        stabilizer.update(presentation('reasoning'));
        clock.advance(150);
        stabilizer.update(presentation('searching'));

        expect(changes).toEqual([]);
        expect(clock.pendingTimerCount()).toBe(0);
    });

    test('blocked and listening immediately preempt a pending state', () => {
        const blockedHarness = createHarness(presentation('searching'));
        blockedHarness.stabilizer.update(presentation('reasoning'));
        blockedHarness.stabilizer.update({
            activity: 'blocked',
        });
        expect(blockedHarness.stabilizer.getSnapshot().activity).toBe('blocked');
        expect(blockedHarness.clock.pendingTimerCount()).toBe(0);

        const listeningHarness = createHarness(presentation('reasoning'));
        listeningHarness.stabilizer.update(presentation('composing'));
        listeningHarness.stabilizer.update(presentation('listening'));
        expect(listeningHarness.stabilizer.getSnapshot().activity).toBe('listening');
        expect(listeningHarness.clock.pendingTimerCount()).toBe(0);
    });

    test('keeps only the latest pending state', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('reasoning'));

        clock.advance(100);
        stabilizer.update(presentation('composing'));
        clock.advance(100);
        stabilizer.update(presentation('working'));
        clock.advance(300);

        expect(changes).toEqual([presentation('working')]);
    });

    test('caps continuously changing fallback states at maximum visual lag', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('searching'));

        clock.advance(500);
        stabilizer.update(presentation('reasoning'));
        clock.advance(150);
        stabilizer.update(presentation('composing'));
        clock.advance(150);
        stabilizer.update(presentation('working'));
        clock.advance(150);
        stabilizer.update(presentation('reasoning'));
        clock.advance(150);
        stabilizer.update(presentation('composing'));
        clock.advance(140);
        stabilizer.update(presentation('working'));
        clock.advance(10);

        expect(changes).toEqual([presentation('working')]);
        expect(clock.now()).toBe(500 + AGENT_ACTIVITY_MAXIMUM_LAG_MS);
    });

    test('idle settles immediately and clears pending work', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('searching'));

        stabilizer.update(presentation('reasoning'));
        stabilizer.update(presentation('idle'));
        clock.advance(1000);

        expect(changes).toEqual([presentation('idle')]);
        expect(clock.pendingTimerCount()).toBe(0);
    });

    test('dispose cancels the only timer and rejects stale callbacks', () => {
        const { clock, changes, stabilizer } = createHarness(presentation('reasoning'));

        stabilizer.update(presentation('composing'));
        expect(clock.pendingTimerCount()).toBe(1);
        stabilizer.dispose();
        clock.advance(1000);

        expect(changes).toEqual([]);
        expect(clock.pendingTimerCount()).toBe(0);
    });

    test('keeps the orb and primary label on the same stabilized activity during rapid changes', () => {
        const { clock, stabilizer } = createHarness(presentation('searching'));
        stabilizer.update(presentation('reasoning'));
        expect(stabilizer.getSnapshot()).toEqual(presentation('searching'));
        expect(resolveOrbState(stabilizer.getSnapshot().activity)).toBe('searching');
        expect(formatAgentActivityLabel(stabilizer.getSnapshot().activity, labelKey)).toBe('chat.statusRow.activity.searching');

        clock.advance(AGENT_ACTIVITY_MINIMUM_VISIBLE_MS);
        expect(stabilizer.getSnapshot()).toEqual(presentation('reasoning'));
        expect(resolveOrbState(stabilizer.getSnapshot().activity)).toBe('breathing');
        expect(formatAgentActivityLabel(stabilizer.getSnapshot().activity, labelKey)).toBe('chat.statusRow.activity.reasoning');
    });

    test('enters connecting immediately and returns to working through the shared activity snapshot', () => {
        const { clock, stabilizer } = createHarness(presentation('working'));
        stabilizer.update(presentation('connecting'));
        expect(stabilizer.getSnapshot()).toEqual(presentation('connecting'));
        expect(resolveOrbState(stabilizer.getSnapshot().activity)).toBe('connecting');
        expect(formatAgentActivityLabel(stabilizer.getSnapshot().activity, labelKey)).toBe('chat.statusRow.activity.connecting');

        clock.advance(AGENT_ACTIVITY_MINIMUM_VISIBLE_MS);
        stabilizer.update(presentation('working'));
        clock.advance(AGENT_ACTIVITY_MINIMUM_VISIBLE_MS);
        expect(stabilizer.getSnapshot()).toEqual(presentation('working'));
        expect(resolveOrbState(stabilizer.getSnapshot().activity)).toBe('working');
        expect(formatAgentActivityLabel(stabilizer.getSnapshot().activity, labelKey)).toBe('chat.statusRow.activity.working');
    });

    test('keeps retrying semantics when the orb uses the working fallback', () => {
        const { stabilizer } = createHarness(presentation('working'));
        stabilizer.update(presentation('retrying'));
        expect(stabilizer.getSnapshot()).toEqual(presentation('retrying'));
        expect(resolveOrbState(stabilizer.getSnapshot().activity)).toBe('working');
        expect(formatAgentActivityLabel(stabilizer.getSnapshot().activity, labelKey)).toBe('chat.statusRow.activity.retrying');
    });

    test('maps blocked and idle to no orb or primary label', () => {
        expect(resolveOrbState('blocked')).toBeNull();
        expect(formatAgentActivityLabel('blocked', labelKey)).toBeNull();
        expect(resolveOrbState('idle')).toBeNull();
        expect(formatAgentActivityLabel('idle', labelKey)).toBeNull();
    });
});
