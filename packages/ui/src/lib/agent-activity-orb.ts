import type { OrbState } from 'thinking-orbs';

import type { AgentActivity } from './agent-activity';

export const REASONING_ORB_STATE: OrbState = 'breathing';

const AGENT_ACTIVITY_TO_ORB_STATE = {
    idle: null,
    working: 'working',
    searching: 'searching',
    reasoning: REASONING_ORB_STATE,
    composing: 'composing',
    listening: 'listening',
    connecting: 'connecting',
    editing: 'shaping',
    orchestrating: 'weaving',
    retrying: 'working',
    blocked: null,
} satisfies Record<AgentActivity, OrbState | null>;

export const resolveOrbState = (activity: AgentActivity | null | undefined): OrbState | null => {
    if (!activity) return null;
    return AGENT_ACTIVITY_TO_ORB_STATE[activity];
};
