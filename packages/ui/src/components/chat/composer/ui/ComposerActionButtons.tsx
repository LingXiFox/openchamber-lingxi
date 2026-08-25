/**
 * The composer's send / queue / stop control.
 *
 * Idle renders the send action; a busy session swaps the same button to stop
 * (queue stays a separate affordance above). The button element itself never
 * remounts across that swap: only the two stacked glyphs crossfade inside one
 * fixed slot, so the hit target, focus, and form semantics stay put while the
 * authoritative action switches synchronously.
 */

import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { StopIcon } from '@/components/icons/StopIcon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type ComposerActionButtonsProps = {
    isMobile: boolean;
    footerIconButtonClass: string;
    sendIconSizeClass: string;
    stopIconSizeClass: string;
    canSend: boolean;
    canAbort: boolean;
    hasContent: boolean;
    currentSessionId: string | null;
    newSessionDraftOpen: boolean;
    onPrimaryAction: () => void;
    onQueueMessage: () => void;
    onAbort: () => void;
};

export const ComposerActionButtons = React.memo(function ComposerActionButtons(props: ComposerActionButtonsProps) {
    const {
        isMobile,
        footerIconButtonClass,
        sendIconSizeClass,
        stopIconSizeClass,
        canSend,
        canAbort,
        hasContent,
        currentSessionId,
        newSessionDraftOpen,
        onPrimaryAction,
        onQueueMessage,
        onAbort,
    } = props;
    const { t } = useI18n();

    const sendEnabled = canSend && (currentSessionId || newSessionDraftOpen);

    const primaryButton = (
        <button
            type={canAbort || isMobile ? 'button' : 'submit'}
            disabled={!canAbort && !sendEnabled}
            onClick={(event) => {
                if (canAbort) {
                    if (isMobile) {
                        event.preventDefault();
                    }
                    onAbort();
                    return;
                }
                if (!isMobile) {
                    return;
                }
                event.preventDefault();
                onPrimaryAction();
            }}
            className={cn(
                footerIconButtonClass,
                'relative',
                canAbort
                    ? 'text-[var(--status-error)] hover:text-[var(--status-error)]'
                    : sendEnabled
                        ? 'text-primary hover:text-primary'
                        : 'opacity-30'
            )}
            aria-label={t(canAbort
                ? 'chat.chatInput.actions.stopGeneratingAria'
                : 'chat.chatInput.actions.sendMessageAria')}
        >
            <Icon
                name="send-plane-2"
                aria-hidden="true"
                className={cn(
                    sendIconSizeClass,
                    'oc-motion-state-icon absolute inset-0 m-auto',
                    canAbort && 'pointer-events-none scale-[var(--motion-scale-icon)] opacity-0',
                )}
            />
            <StopIcon
                aria-hidden="true"
                className={cn(
                    stopIconSizeClass,
                    'oc-motion-state-icon absolute inset-0 m-auto',
                    !canAbort && 'pointer-events-none scale-[var(--motion-scale-icon)] opacity-0',
                )}
            />
        </button>
    );

    if (!canAbort) {
        return primaryButton;
    }

    return (
        <div className="relative">
            {hasContent ? (
                <button
                    type="button"
                    disabled={!currentSessionId}
                    onClick={(event) => {
                        if (isMobile) {
                            event.preventDefault();
                        }
                        onQueueMessage();
                    }}
                    className={cn(
                        footerIconButtonClass,
                        'absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1',
                        currentSessionId ? 'text-primary hover:text-primary' : 'opacity-30'
                    )}
                    aria-label={t('chat.chatInput.actions.queueMessageAria')}
                >
                    <Icon name="send-plane-2" className={cn(sendIconSizeClass, '-rotate-90')} />
                </button>
            ) : null}
            {primaryButton}
        </div>
    );
}, (prev, next) => (
    prev.isMobile === next.isMobile
    && prev.footerIconButtonClass === next.footerIconButtonClass
    && prev.sendIconSizeClass === next.sendIconSizeClass
    && prev.stopIconSizeClass === next.stopIconSizeClass
    && prev.canSend === next.canSend
    && prev.canAbort === next.canAbort
    && prev.hasContent === next.hasContent
    && prev.currentSessionId === next.currentSessionId
    && prev.newSessionDraftOpen === next.newSessionDraftOpen
    && prev.onPrimaryAction === next.onPrimaryAction
    && prev.onQueueMessage === next.onQueueMessage
    && prev.onAbort === next.onAbort
));
