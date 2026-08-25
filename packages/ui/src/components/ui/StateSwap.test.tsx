import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { StateSwap } from './StateSwap';

describe('StateSwap', () => {
    test('initial render shows only the current value with no exit layer', () => {
        const markup = renderToStaticMarkup(<StateSwap swapKey="alpha">Alpha</StateSwap>);

        expect(markup).toContain('Alpha');
        expect(markup).toContain('oc-motion-swap-in');
        expect(markup).not.toContain('oc-motion-swap-out');
    });

    test('the current layer owns layout and no exit layer exists before a swap', () => {
        const markup = renderToStaticMarkup(
            <div>
                <StateSwap swapKey="k">value</StateSwap>
            </div>,
        );

        expect(markup).toContain('relative');
        expect(markup).not.toContain('oc-motion-swap-out');
    });
});
