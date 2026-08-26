import React from 'react';
import type { Part } from '@opencode-ai/sdk/v2/client';

import { deriveAgentActivity, type AgentActivity } from '@/lib/agent-activity';
import { useConfigStore } from '@/stores/useConfigStore';
import {
    useDirectorySync,
    useSessionMessages,
    useSessionPermissions,
    useSessionQuestions,
    useSessionStatus,
} from '@/sync/sync-context';
import { useSessionUIStore } from '@/sync/session-ui-store';

import { getActiveAssistantContext } from './useAssistantStatus';

const NO_PARTS: Part[] | undefined = undefined;

export function useAgentActivity(): AgentActivity {
    const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
    const currentSessionDirectory = useSessionUIStore((state) => state.currentSessionDirectory);

    const sessionStatus = useSessionStatus(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const permissions = useSessionPermissions(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const questions = useSessionQuestions(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const connectionPhase = useConfigStore((state) => state.connectionPhase);
    const messages = useSessionMessages(currentSessionId ?? '', currentSessionDirectory ?? undefined);

    const lastAssistantId = React.useMemo(
        () => getActiveAssistantContext(messages).assistantId,
        [messages],
    );

    const assistantParts = useDirectorySync<Part[] | undefined>(
        React.useCallback(
            (state) => (lastAssistantId ? state.part[lastAssistantId] : NO_PARTS),
            [lastAssistantId],
        ),
        currentSessionDirectory ?? undefined,
    );

    return React.useMemo(
        () => deriveAgentActivity({
            sessionStatus,
            assistantParts,
            pendingPermissions: permissions,
            pendingQuestions: questions,
            connectionPhase,
        }),
        [sessionStatus, assistantParts, permissions, questions, connectionPhase],
    );
}
