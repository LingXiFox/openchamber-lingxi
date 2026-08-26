import { describe, expect, test } from 'bun:test';
import type { OrbState } from 'thinking-orbs';

import { REASONING_ORB_STATE, resolveOrbState } from './agent-activity-orb';

describe('resolveOrbState', () => {
    test('maps the eight high-confidence activities to their orb states', () => {
        const expected: Array<[Parameters<typeof resolveOrbState>[0], OrbState]> = [
            ['working', 'working'],
            ['searching', 'searching'],
            ['reasoning', 'breathing'],
            ['composing', 'composing'],
            ['listening', 'listening'],
            ['connecting', 'connecting'],
            ['editing', 'shaping'],
            ['orchestrating', 'weaving'],
        ];
        for (const [activity, orbState] of expected) {
            expect(resolveOrbState(activity)).toBe(orbState);
        }
    });

    test('retrying falls back to the generic working orb while the countdown text carries detail', () => {
        expect(resolveOrbState('retrying')).toBe('working');
    });

    test('shares the breathing mapping with the contextual reasoning orb', () => {
        expect(REASONING_ORB_STATE).toBe('breathing');
        expect(resolveOrbState('reasoning')).toBe(REASONING_ORB_STATE);
    });

    test('idle and blocked produce no animated orb', () => {
        expect(resolveOrbState('idle')).toBeNull();
        expect(resolveOrbState('blocked')).toBeNull();
    });

    test('missing activity produces no animated orb', () => {
        expect(resolveOrbState(undefined)).toBeNull();
        expect(resolveOrbState(null)).toBeNull();
    });

    test('never returns an unmapped orb state for any known activity', () => {
        const knownActivities = [
            'idle',
            'connecting',
            'retrying',
            'blocked',
            'listening',
            'working',
            'searching',
            'reasoning',
            'composing',
            'editing',
            'orchestrating',
        ] as const;
        const solvedState = 'solving';
        for (const activity of knownActivities) {
            const state = resolveOrbState(activity);
            if (state !== null) {
                expect(state).not.toBe(solvedState);
            }
        }
    });
});
