import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ContextSurfaceFallback } from './ContextSurfaceFallback';

describe('ContextSurfaceFallback', () => {
    test('renders a decorative stable shell with bounded pulse blocks', () => {
        const markup = renderToStaticMarkup(<ContextSurfaceFallback />);

        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('oc-motion-placeholder-pulse');
        expect(markup.split('oc-motion-placeholder-pulse').length - 1).toBe(3);
        expect(markup).not.toContain('<button');
    });
});
