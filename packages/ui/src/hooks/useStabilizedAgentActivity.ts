import React from 'react';

import {
    createAgentActivityPresentationStabilizer,
    type AgentActivityPresentationStabilizer,
} from '@/lib/agent-activity-presentation';
import type { AgentActivity } from '@/lib/agent-activity';

export const useStabilizedAgentActivity = (
    incoming: AgentActivity,
): AgentActivity => {
    const [activity, setActivity] = React.useState(incoming);
    const stabilizerRef = React.useRef<AgentActivityPresentationStabilizer | null>(null);

    if (!stabilizerRef.current) {
        stabilizerRef.current = createAgentActivityPresentationStabilizer(
            { activity: incoming },
            (presentation) => setActivity(presentation.activity),
        );
    }
    const stabilizer = stabilizerRef.current;

    React.useLayoutEffect(() => {
        stabilizer.update({ activity: incoming });
    }, [incoming, stabilizer]);

    React.useEffect(() => () => stabilizer.dispose(), [stabilizer]);

    return activity;
};
