import React from 'react';
import { describe, expect, mock, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThemeSystemProvider } from '@/contexts/ThemeSystemContext';
import { I18nProvider } from '@/lib/i18n';
import { ActivityIndicator } from './ActivityIndicator';

mock.module('@/hooks/useProviderLogo', () => ({
    useProviderLogo: () => ({ src: null, onError: () => {}, hasLogo: false }),
}));

const { WorkingPlaceholder } = await import('./WorkingPlaceholder');

const renderIndicator = (orbState: Parameters<typeof ActivityIndicator>[0]['orbState']): string => (
    renderToStaticMarkup(<ActivityIndicator orbState={orbState} />)
);

const renderPlaceholder = (props: React.ComponentProps<typeof WorkingPlaceholder>): string => (
    renderToStaticMarkup(
        <I18nProvider>
            <ThemeSystemProvider>
                <WorkingPlaceholder {...props} />
            </ThemeSystemProvider>
        </I18nProvider>,
    )
);

describe('ActivityIndicator', () => {
    test('renders the native 64px orb canvas carrying the library state label', () => {
        const markup = renderIndicator('searching');
        expect(markup).toContain('<canvas');
        expect(markup).toContain('aria-label="Searching…"');
        expect(markup).toContain('width:64px');
        expect(markup).toContain('height:64px');
        expect(markup).not.toContain('animate-busy-pulse');
    });

    test('maps each orb state to its own library aria label', () => {
        const expectedLabels: Array<[Parameters<typeof ActivityIndicator>[0]['orbState'], string]> = [
            ['working', 'Working…'],
            ['searching', 'Searching…'],
            ['breathing', 'Thinking…'],
            ['composing', 'Composing…'],
            ['listening', 'Listening…'],
            ['connecting', 'Connecting…'],
            ['shaping', 'Shaping…'],
            ['weaving', 'Weaving…'],
        ];
        for (const [state, label] of expectedLabels) {
            expect(renderIndicator(state)).toContain(`aria-label="${label}"`);
        }
    });

    test('null state falls back to the legacy BusyDots with no canvas and no second animation', () => {
        const markup = renderIndicator(null);
        expect(markup).not.toContain('<canvas');
        expect(markup).toContain('animate-busy-pulse');
    });
});

describe('BusyDots replacement scope', () => {
    test('only the transcript placeholder swaps dots for the orb; other surfaces keep BusyDots', async () => {
        const here = fileURLToPath(new URL('.', import.meta.url));

        const indicatorSource = await readFile(`${here}ActivityIndicator.tsx`, 'utf8');
        expect(indicatorSource).toContain("from 'thinking-orbs'");
        expect(indicatorSource).toContain('size={64}');
        expect(indicatorSource).toContain('<BusyDots />');

        const workingPlaceholderSource = await readFile(`${here}WorkingPlaceholder.tsx`, 'utf8');
        expect(workingPlaceholderSource).toContain('resolveOrbState');
        expect(workingPlaceholderSource).toContain('useStabilizedAgentActivity');
        expect(workingPlaceholderSource).toContain('<ActivityIndicator orbState={orbState} />');
        expect(workingPlaceholderSource).toContain('items-center gap-2');
        expect(workingPlaceholderSource).toContain('text-sm font-medium text-foreground');
        expect(workingPlaceholderSource).toContain('text-muted-foreground/70');

        const stabilizerHookSource = await readFile(`${here}../../../../hooks/useStabilizedAgentActivity.ts`, 'utf8');
        expect(stabilizerHookSource).toContain('React.useEffect(() => () => stabilizer.dispose()');

        const autoReviewBannerSource = await readFile(`${here}../../AutoReviewBanner.tsx`, 'utf8');
        expect(autoReviewBannerSource).toContain('BusyDots');

        const mobileAppSource = await readFile(`${here}../../../../apps/MobileApp.tsx`, 'utf8');
        expect(mobileAppSource).toContain('BusyDots');
    });
});

describe('WorkingPlaceholder placeholder lifecycle contract', () => {
    test('placeholder renders nothing when not working so no orb survives a settled turn', async () => {
        const source = await readFile(
            fileURLToPath(new URL('./WorkingPlaceholder.tsx', import.meta.url)),
            'utf8',
        );
        expect(source).toContain('if (!isWorking || !primaryLabel)');
        expect(source.indexOf('if (!isWorking || !primaryLabel)') < source.indexOf('<ActivityIndicator')).toBe(true);
    });
});

describe('WorkingPlaceholder activity authority', () => {
    test('renders the connecting primary label and orb from the same activity', () => {
        const markup = renderPlaceholder({
            isWorking: true,
            statusText: 'running command',
            activity: 'connecting',
        });

        expect(markup).toContain('aria-label="Connecting…"');
        expect(markup).toContain('>Connecting</span>');
        expect(markup).not.toContain('>Working</span>');
    });

    test('keeps retrying as the primary label when its orb falls back to working', () => {
        const markup = renderPlaceholder({
            isWorking: true,
            statusText: 'working',
            activity: 'retrying',
            retryInfo: { attempt: 2 },
        });

        expect(markup).toContain('aria-label="Working…"');
        expect(markup).toContain('>Retrying</span>');
    });

    test('renders live details without changing the primary semantic label', () => {
        const markup = renderPlaceholder({
            isWorking: true,
            statusText: 'running command',
            modelName: 'Example model',
            activity: 'working',
        });

        expect(markup).toContain('>Working</span>');
        expect(markup).toContain('>running command</span>');
        expect(markup).toContain('>Example model</span>');
    });

    test('renders no stale placeholder for blocked or idle activity', () => {
        expect(renderPlaceholder({
            isWorking: true,
            statusText: 'working',
            activity: 'blocked',
        })).toBe('');
        expect(renderPlaceholder({
            isWorking: true,
            statusText: 'working',
            activity: 'idle',
        })).toBe('');
    });
});
