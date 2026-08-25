import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '@/lib/i18n';

import { ComposerActionButtons } from './ComposerActionButtons';

const baseProps = {
    isMobile: false,
    footerIconButtonClass: 'footer-icon-button',
    sendIconSizeClass: 'send-icon-size',
    stopIconSizeClass: 'stop-icon-size',
    hasContent: true,
    currentSessionId: 'session-1',
    newSessionDraftOpen: false,
    onPrimaryAction: () => {},
    onQueueMessage: () => {},
    onAbort: () => {},
};

describe('ComposerActionButtons fixed slot', () => {
    test('idle renders exactly one button whose action authority is immediate', () => {
        const markup = renderToStaticMarkup(
            <I18nProvider>
                <ComposerActionButtons {...baseProps} canSend={true} canAbort={false} />
            </I18nProvider>,
        );

        expect(markup.split('<button').length - 1).toBe(1);
        expect(markup).toContain('type="submit"');
        expect(markup).toContain('Send message');
        expect(markup).not.toContain('Stop generating');
        expect(markup).not.toContain('disabled');
    });

    test('busy renders the same primary button as stop plus the queue affordance', () => {
        const markup = renderToStaticMarkup(
            <I18nProvider>
                <ComposerActionButtons {...baseProps} canSend={true} canAbort={true} />
            </I18nProvider>,
        );

        expect(markup.split('<button').length - 1).toBe(2);
        expect(markup).toContain('type="button"');
        expect(markup).toContain('Stop generating');
        expect(markup).toContain('Queue message');
        expect(markup).not.toContain('Send message');
        expect(markup).not.toContain('disabled');
    });

    test('both glyphs stay mounted in one slot across the swap', () => {
        const idle = renderToStaticMarkup(
            <I18nProvider>
                <ComposerActionButtons {...baseProps} canSend={true} canAbort={false} />
            </I18nProvider>,
        );
        const busy = renderToStaticMarkup(
            <I18nProvider>
                <ComposerActionButtons {...baseProps} canSend={true} canAbort={true} />
            </I18nProvider>,
        );

        for (const markup of [idle, busy]) {
            expect(markup).toContain('send-icon-size');
            expect(markup).toContain('stop-icon-size');
            expect(markup).toContain('oc-motion-state-icon');
        }
    });

    test('readiness disables synchronously without animation delay', () => {
        const markup = renderToStaticMarkup(
            <I18nProvider>
                <ComposerActionButtons {...baseProps} canSend={false} canAbort={false} currentSessionId={null} newSessionDraftOpen={false} />
            </I18nProvider>,
        );

        expect(markup).toContain('disabled');
        expect(markup).toContain('opacity-30');
    });
});
