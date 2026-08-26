import type {
    Part,
    PermissionRequest,
    QuestionRequest,
    SessionStatus,
} from '@opencode-ai/sdk/v2/client';

import { isFullySyntheticMessage } from './messages/synthetic';

export type AgentActivity =
    | 'idle'
    | 'connecting'
    | 'retrying'
    | 'blocked'
    | 'listening'
    | 'working'
    | 'searching'
    | 'reasoning'
    | 'composing'
    | 'editing'
    | 'orchestrating';

export type AgentConnectionPhase = 'connecting' | 'connected' | 'reconnecting';

export type AgentDictationPhase = 'idle' | 'recording' | 'uploading' | 'failed';

export interface AgentActivityInput {
    sessionStatus?: SessionStatus | undefined;
    assistantParts?: Part[] | undefined;
    pendingPermissions?: PermissionRequest[] | undefined;
    pendingQuestions?: QuestionRequest[] | undefined;
    connectionPhase?: AgentConnectionPhase | undefined;
    dictation?: AgentDictationPhase | undefined;
}

type ActiveAssistantPart =
    | { kind: 'tool'; toolName: string }
    | { kind: 'reasoning' }
    | { kind: 'text' };

const SEARCHING_TOOLS: ReadonlySet<string> = new Set([
    'read',
    'grep',
    'glob',
    'list',
    'webfetch',
    'websearch',
    'codesearch',
]);

const EDITING_TOOLS: ReadonlySet<string> = new Set([
    'edit',
    'write',
    'multiedit',
    'apply_patch',
]);

const ORCHESTRATING_TOOLS: ReadonlySet<string> = new Set(['task']);

export const classifyAgentToolFamily = (
    toolName: string,
): Extract<AgentActivity, 'searching' | 'editing' | 'orchestrating' | 'working'> => {
    if (SEARCHING_TOOLS.has(toolName)) return 'searching';
    if (EDITING_TOOLS.has(toolName)) return 'editing';
    if (ORCHESTRATING_TOOLS.has(toolName)) return 'orchestrating';
    return 'working';
};

export const findLatestActiveAssistantPart = (
    parts: Part[] | undefined,
): ActiveAssistantPart | null => {
    if (!parts || parts.length === 0) return null;
    if (isFullySyntheticMessage(parts)) return null;

    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part) continue;

        if (part.type === 'tool') {
            const status = part.state?.status;
            if (status === 'running' || status === 'pending') {
                const toolName = part.tool.trim().length > 0 ? part.tool : 'tool';
                return { kind: 'tool', toolName };
            }
            continue;
        }

        if (part.type === 'reasoning') {
            if (part.time?.end === undefined) return { kind: 'reasoning' };
            continue;
        }

        if (part.type === 'text') {
            if (part.time?.end !== undefined) continue;
            if (part.text.trim().length > 0) return { kind: 'text' };
            continue;
        }
    }

    return null;
};

export const deriveAgentActivity = (input: AgentActivityInput = {}): AgentActivity => {
    if ((input.pendingQuestions?.length ?? 0) > 0) return 'blocked';
    if ((input.pendingPermissions?.length ?? 0) > 0) return 'blocked';
    if (input.dictation === 'recording' || input.dictation === 'uploading') return 'listening';
    if (input.connectionPhase !== undefined && input.connectionPhase !== 'connected') return 'connecting';
    if (input.sessionStatus?.type === 'retry') return 'retrying';

    if (input.sessionStatus?.type === 'busy') {
        const active = findLatestActiveAssistantPart(input.assistantParts);
        if (!active) return 'working';
        if (active.kind === 'reasoning') return 'reasoning';
        if (active.kind === 'text') return 'composing';
        return classifyAgentToolFamily(active.toolName);
    }

    return 'idle';
};
