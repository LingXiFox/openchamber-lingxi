import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { registerSettingsUtilityRoutes } from './core-routes.js';
import { createThemeRuntime } from './theme-runtime.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const roots = [];

const theme = {
  metadata: { id: 'route-theme', name: 'Route', variant: 'dark', tags: [] },
  colors: {
    primary: { base: '#111111', foreground: '#ffffff' },
    surface: { background: '#111111', foreground: '#ffffff', muted: '#222222', mutedForeground: '#dddddd', elevated: '#333333', elevatedForeground: '#ffffff', subtle: '#444444' },
    interactive: { border: '#111111', selection: '#111111', selectionForeground: '#ffffff', focusRing: '#111111', hover: '#111111' },
    status: {
      error: '#111111', errorForeground: '#ffffff', errorBackground: '#111111', errorBorder: '#111111',
      warning: '#111111', warningForeground: '#ffffff', warningBackground: '#111111', warningBorder: '#111111',
      success: '#111111', successForeground: '#ffffff', successBackground: '#111111', successBorder: '#111111',
      info: '#111111', infoForeground: '#ffffff', infoBackground: '#111111', infoBorder: '#111111',
    },
    syntax: { base: { background: '#111111', foreground: '#ffffff', keyword: '#111111', string: '#111111', number: '#111111', function: '#111111', variable: '#111111', type: '#111111', comment: '#111111', operator: '#111111' }, highlights: { diffAdded: '#111111', diffRemoved: '#111111', lineNumber: '#111111' } },
  },
  appearance: { wallpaper: { asset: 'wallpaper.png' } },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('theme asset route', () => {
  it('serves only the registered wallpaper asset with explicit safe headers', async () => {
    const themesDir = await mkdtemp(path.join(os.tmpdir(), 'openchamber-theme-route-'));
    roots.push(themesDir);
    await mkdir(path.join(themesDir, 'route', 'assets'), { recursive: true });
    await writeFile(path.join(themesDir, 'route', 'theme.json'), JSON.stringify(theme));
    await writeFile(path.join(themesDir, 'route', 'assets', 'wallpaper.png'), PNG_HEADER);
    await writeFile(path.join(themesDir, 'route', 'assets', 'unregistered.png'), PNG_HEADER);

    const runtime = createThemeRuntime({
      fsPromises: await import('node:fs/promises'),
      path,
      themesDir,
      maxThemeJsonBytes: 512 * 1024,
      logger: { warn: () => {} },
    });
    const app = express();
    registerSettingsUtilityRoutes(app, {
      readCustomThemesFromDisk: runtime.readCustomThemesFromDisk,
      resolveThemeAsset: runtime.resolveThemeAsset,
      refreshOpenCodeAfterConfigChange: async () => ({ success: true }),
      clientReloadDelayMs: 0,
    });

    const themes = await request(app).get('/api/config/themes').expect(200);
    expect(themes.body.themes).toHaveLength(1);

    const asset = await request(app)
      .get('/api/config/themes/route-theme/assets/wallpaper.png')
      .expect(200);
    expect(asset.headers['content-type']).toMatch(/^image\/png/);
    expect(asset.headers['x-content-type-options']).toBe('nosniff');

    await request(app).get('/api/config/themes/route-theme/assets/unregistered.png').expect(404);
    await request(app).get('/api/config/themes/missing/assets/wallpaper.png').expect(404);
    await request(app).get('/api/config/themes/route-theme/assets/%252e%252e/secret.png').expect(404);
  });
});
