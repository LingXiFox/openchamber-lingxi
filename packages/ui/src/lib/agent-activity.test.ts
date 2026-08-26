import { describe, expect, test } from 'bun:test';
import type {
    Part,
    PermissionRequest,
    QuestionRequest,
    ReasoningPart,
    SessionStatus,
    TextPart,
    ToolPart,
} from '@opencode-ai/sdk/v2/client';

import {
    classifyAgentToolFamily,
    deriveAgentActivity,
    findLatestActiveAssistantPart,
    type AgentActivityInput,
} from './agent-activity';

let nextPartId = 0;
const nextId = (prefix: string): string => {
    nextPartId += 1;
    return `${prefix}_${nextPartId}`;
};

const toolPart = (tool: string, status: ToolPart['state']['status']): ToolPart => {
    const base = {
        id: nextId('tool'),
        sessionID: 's1',
        messageID: 'm1',
        type: 'tool' as const,
        callID: nextId('call'),
        tool,
    };
    if (status === 'pending') return { ...base, state: { status: 'pending', input: {}, raw: '' } };
    if (status === 'running') return { ...base, state: { status: 'running', input: {}, time: { start: 1 } } };
    if (status === 'completed') {
        return { ...base, state: { status: 'completed', input: {}, output: '', title: '', metadata: {}, time: { start: 1, end: 2 } } };
    }
    return { ...base, state: { status: 'error', input: {}, error: 'boom', time: { start: 1, end: 2 } } };
};

const reasoningPart = (end?: number): ReasoningPart => ({
    id: nextId('reasoning'),
    sessionID: 's1',
    messageID: 'm1',
    type: 'reasoning',
    text: 'pondering',
    time: end === undefined ? { start: 1 } : { start: 1, end },
});

const textPart = (text: string, end?: number, synthetic?: boolean): TextPart => {
    const part: TextPart = {
        id: nextId('text'),
        sessionID: 's1',
        messageID: 'm1',
        type: 'text',
        text,
        time: end === undefined ? { start: 1 } : { start: 1, end },
    };
    if (synthetic) part.synthetic = true;
    return part;
};

const BUSY: SessionStatus = { type: 'busy' };
const RETRY: SessionStatus = { type: 'retry', attempt: 2, message: 'rate limited', next: 4_000 };

const permissionRequest = (): PermissionRequest => ({
    id: nextId('perm'),
    sessionID: 's1',
    permission: 'bash',
    patterns: [],
    metadata: {},
    always: [],
});

const questionRequest = (): QuestionRequest => ({
    id: nextId('question'),
    sessionID: 's1',
    questions: [{ question: 'Proceed?', header: 'Confirm', options: [{ label: 'Yes', description: 'go' }] }],
});

describe('deriveAgentActivity idle/working boundaries', () => {
    test('absence of every signal is idle', () => {
        expect(deriveAgentActivity()).toBe('idle');
        expect(deriveAgentActivity({})).toBe('idle');
        expect(deriveAgentActivity({ sessionStatus: { type: 'idle' }, assistantParts: [] })).toBe('idle');
        expect(deriveAgentActivity({ assistantParts: [toolPart('grep', 'running')] })).toBe('idle');
    });

    test('idle to working: busy status without any part signal is working', () => {
        expect(deriveAgentActivity({ sessionStatus: BUSY })).toBe('working');
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [] })).toBe('working');
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [textPart('done answer', 9), toolPart('grep', 'completed'), reasoningPart(8)],
        })).toBe('working');
    });
});

describe('part-level derivation while busy', () => {
    test('open reasoning part yields reasoning', () => {
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [reasoningPart()] })).toBe('reasoning');
    });

    test('searching falls back to reasoning when the tool closed and older reasoning is still open', () => {
        const parts: Part[] = [reasoningPart(), toolPart('grep', 'completed')];
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: parts })).toBe('reasoning');
    });

    test('searching falls back to working when the tool completed with nothing else open', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [toolPart('websearch', 'completed')],
        })).toBe('working');
    });

    test('errored tools are inactive like completed ones', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [toolPart('bash', 'error')],
        })).toBe('working');
    });

    test('pending tools count as active', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [toolPart('read', 'pending')],
        })).toBe('searching');
    });

    test('streaming non-empty text yields composing; empty streaming text is skipped', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [textPart('partial answer')],
        })).toBe('composing');
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [textPart('   ')],
        })).toBe('working');
    });

    test('fully synthetic messages produce no part-level activity', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [textPart('The plan at /tmp/plan.md', undefined, true)],
        })).toBe('working');
    });
});

describe('parallel active parts: latest active part wins', () => {
    test('newest running tool decides the family regardless of older running tools', () => {
        expect(findLatestActiveAssistantPart([
            toolPart('grep', 'running'),
            toolPart('bash', 'running'),
        ])).toEqual({ kind: 'tool', toolName: 'bash' });
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [toolPart('grep', 'running'), toolPart('bash', 'running')],
        })).toBe('working');
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [toolPart('bash', 'running'), toolPart('websearch', 'running')],
        })).toBe('searching');
    });

    test('recency beats category: a newer reasoning part outruns an older running tool', () => {
        const parts: Part[] = [toolPart('grep', 'running'), reasoningPart()];
        expect(findLatestActiveAssistantPart(parts)).toEqual({ kind: 'reasoning' });
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: parts })).toBe('reasoning');
    });

    test('a newer tool outruns an older open reasoning part', () => {
        const parts: Part[] = [reasoningPart(), toolPart('glob', 'running')];
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: parts })).toBe('searching');
    });
});

describe('tool family classifier', () => {
    test('information-retrieval tools map to searching', () => {
        for (const tool of ['read', 'grep', 'glob', 'list', 'webfetch', 'websearch', 'codesearch']) {
            expect(classifyAgentToolFamily(tool)).toBe('searching');
            expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [toolPart(tool, 'running')] })).toBe('searching');
        }
    });

    test('editing tools map to editing', () => {
        for (const tool of ['edit', 'write', 'multiedit', 'apply_patch']) {
            expect(classifyAgentToolFamily(tool)).toBe('editing');
            expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [toolPart(tool, 'running')] })).toBe('editing');
        }
    });

    test('task maps to orchestrating', () => {
        expect(classifyAgentToolFamily('task')).toBe('orchestrating');
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [toolPart('task', 'running')] })).toBe('orchestrating');
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [toolPart('task', 'pending')] })).toBe('orchestrating');
    });

    test('unknown and unmapped tools fall back to working instead of being guessed', () => {
        for (const tool of ['bash', 'todowrite', 'todoread', 'skill', 'question', 'plan_enter', 'plan_exit', 'my_custom_mcp_tool', '']) {
            expect(classifyAgentToolFamily(tool)).toBe('working');
            expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [toolPart(tool, 'running')] })).toBe('working');
        }
    });
});

describe('cross-domain precedence', () => {
    const busySearching: AgentActivityInput = {
        sessionStatus: { type: 'busy' },
        assistantParts: [toolPart('grep', 'running')],
    };

    test('blocked beats foreground tool activity', () => {
        expect(deriveAgentActivity({ ...busySearching, pendingPermissions: [permissionRequest()] })).toBe('blocked');
        expect(deriveAgentActivity({ ...busySearching, pendingQuestions: [questionRequest()] })).toBe('blocked');
    });

    test('question and permission both pending are one blocked state', () => {
        expect(deriveAgentActivity({
            ...busySearching,
            pendingPermissions: [permissionRequest()],
            pendingQuestions: [questionRequest()],
        })).toBe('blocked');
    });

    test('blocked beats listening', () => {
        expect(deriveAgentActivity({
            ...busySearching,
            dictation: 'recording',
            pendingPermissions: [permissionRequest()],
        })).toBe('blocked');
    });

    test('listening overrides agent activity for recording and uploading, not failed or idle', () => {
        expect(deriveAgentActivity({ ...busySearching, dictation: 'recording' })).toBe('listening');
        expect(deriveAgentActivity({ ...busySearching, dictation: 'uploading' })).toBe('listening');
        expect(deriveAgentActivity({ ...busySearching, dictation: 'failed' })).toBe('searching');
        expect(deriveAgentActivity({ ...busySearching, dictation: 'idle' })).toBe('searching');
    });

    test('connecting overrides foreground activity only while actually connecting or reconnecting', () => {
        expect(deriveAgentActivity({ ...busySearching, connectionPhase: 'connecting' })).toBe('connecting');
        expect(deriveAgentActivity({ ...busySearching, connectionPhase: 'reconnecting' })).toBe('connecting');
        expect(deriveAgentActivity({ ...busySearching, connectionPhase: 'connected' })).toBe('searching');
    });

    test('retrying overrides part-level detail but yields to blocked, listening, and connecting', () => {
        expect(deriveAgentActivity({ sessionStatus: RETRY, assistantParts: busySearching.assistantParts })).toBe('retrying');
        expect(deriveAgentActivity({
            sessionStatus: RETRY,
            assistantParts: busySearching.assistantParts,
            pendingPermissions: [permissionRequest()],
        })).toBe('blocked');
        expect(deriveAgentActivity({
            sessionStatus: RETRY,
            assistantParts: busySearching.assistantParts,
            dictation: 'recording',
        })).toBe('listening');
        expect(deriveAgentActivity({
            sessionStatus: RETRY,
            assistantParts: busySearching.assistantParts,
            connectionPhase: 'reconnecting',
        })).toBe('connecting');
    });
});

describe('subagent ownership', () => {
    test('parent orchestrating derives from its own task part, never from child session state', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [textPart('spawning worker', undefined, false), toolPart('task', 'running')],
        })).toBe('orchestrating');
    });

    test('an idle parent stays idle no matter what its subagents are doing elsewhere', () => {
        expect(deriveAgentActivity({ sessionStatus: { type: 'idle' }, assistantParts: [] })).toBe('idle');
    });

    test('child tool output inside parent transcript summaries does not fabricate parent detail', () => {
        expect(deriveAgentActivity({
            sessionStatus: BUSY,
            assistantParts: [toolPart('task', 'completed'), textPart('worker finished grep results')],
        })).toBe('composing');
    });
});

describe('authoritative fields beat display strings', () => {
    test('family classification reads part.tool only, never titles or metadata phrases', () => {
        const bashClaimingSearch: Part = {
            ...toolPart('bash', 'running'),
            state: { status: 'running', input: {}, title: 'Searching repository files', time: { start: 1 } },
        };
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [bashClaimingSearch] })).toBe('working');

        const readWithNoiseMetadata: Part = {
            ...toolPart('read', 'running'),
            metadata: { displayName: 'super-editor' },
        };
        expect(deriveAgentActivity({ sessionStatus: BUSY, assistantParts: [readWithNoiseMetadata] })).toBe('searching');
    });
});
