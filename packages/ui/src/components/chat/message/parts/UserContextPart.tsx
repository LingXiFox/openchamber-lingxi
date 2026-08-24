import React from 'react';

import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import type { ContextPartPayload } from '@/lib/messages/contextParts';

/**
 * A context item attached to a user message: an inline code comment, a
 * terminal selection, a browser annotation, or GitHub PR context.
 *
 * Each item renders as one card so the user's comment reads as part of the
 * annotation, not as more message text: a header naming the source (with an
 * expand affordance when captured code/output exists), and the comment text
 * below it inside the same card. A header with nothing to reveal renders
 * without the expand affordance.
 */

const ContextCard: React.FC<{
    icon: IconName;
    summary: string;
    /** Full untruncated context, shown on hover. */
    title?: string;
    body: string;
    text: string;
}> = ({ icon, summary, title, body, text }) => {
    const hasBody = body.trim().length > 0;
    const hasText = text.trim().length > 0;

    const header = hasBody ? (
        <details className="min-w-0">
            <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--surface-mutedForeground)] hover:text-[var(--surface-foreground)] [&::-webkit-details-marker]:hidden" title={title}>
                <Icon name="arrow-right-s" className="h-3.5 w-3.5 shrink-0 transition-transform [details[open]_&]:rotate-90" />
                <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{summary}</span>
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-[var(--interactive-border)] bg-[var(--surface-background)] px-2.5 py-2 font-mono text-xs text-[var(--surface-foreground)]">{body}</pre>
        </details>
    ) : (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--surface-mutedForeground)]" title={title}>
            <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{summary}</span>
        </div>
    );

    return (
        <div className="my-1 max-w-full overflow-hidden rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)]">
            {header}
            {hasText ? (
                <div className="whitespace-pre-wrap break-words border-t border-[var(--interactive-border)] px-2.5 py-2 font-sans text-sm text-[var(--surface-foreground)]">{text}</div>
            ) : null}
        </div>
    );
};

const basename = (path: string): string => {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? path;
};

const UserContextPart: React.FC<{ payload: ContextPartPayload }> = ({ payload }) => {
    const { t } = useI18n();

    switch (payload.kind) {
        case 'code-comment': {
            const file = basename(payload.fileLabel);
            const summary = payload.startLine === payload.endLine
                ? t('chat.message.context.codeCommentLine', { file, line: payload.startLine })
                : t('chat.message.context.codeComment', { file, start: payload.startLine, end: payload.endLine });
            const fullTitle = payload.startLine === payload.endLine
                ? t('chat.message.context.codeCommentLine', { file: payload.fileLabel, line: payload.startLine })
                : t('chat.message.context.codeComment', { file: payload.fileLabel, start: payload.startLine, end: payload.endLine });
            return <ContextCard icon="chat-1" summary={summary} title={fullTitle} body={payload.code} text={payload.text} />;
        }
        case 'terminal':
            return (
                <ContextCard
                    icon="terminal"
                    summary={t('chat.message.terminalContext', {
                        terminal: payload.terminalLabel,
                        start: payload.startLine,
                        end: payload.endLine,
                    })}
                    body={payload.output}
                    text=""
                />
            );
        case 'browser-annotation':
            return (
                <ContextCard
                    icon="global"
                    summary={t('chat.message.context.browserAnnotation', { page: payload.pageUrl })}
                    title={payload.pageUrl}
                    body={payload.prompt}
                    text={payload.text}
                />
            );
        case 'pr-comment':
            return (
                <ContextCard
                    icon="git-pull-request"
                    summary={t('chat.message.context.prComment', { label: payload.label })}
                    body={payload.body}
                    text={payload.text}
                />
            );
        case 'pr-check':
            return (
                <ContextCard
                    icon="close-circle"
                    summary={t('chat.message.context.prCheck', { label: payload.label })}
                    body={payload.output}
                    text={payload.text}
                />
            );
        case 'file-quote': {
            const file = basename(payload.fileLabel);
            const summary = payload.startLine != null && payload.endLine != null
                ? (payload.startLine === payload.endLine
                    ? t('chat.message.context.codeCommentLine', { file, line: payload.startLine })
                    : t('chat.message.context.codeComment', { file, start: payload.startLine, end: payload.endLine }))
                : t('chat.message.context.fileQuote', { file });
            return <ContextCard icon="chat-1" summary={summary} title={payload.fileLabel} body={payload.quote} text={payload.text} />;
        }
        case 'chat-quote':
            return (
                <ContextCard
                    icon="chat-1"
                    summary={t('chat.message.context.chatQuote')}
                    body={payload.quote}
                    text={payload.text}
                />
            );
        case 'github-issue':
        case 'github-pr':
            // Rendered as link attachments by normalizeUserDisplayParts.
            return null;
    }
};

export default React.memo(UserContextPart);
