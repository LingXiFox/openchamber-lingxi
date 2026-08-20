import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createThemeRuntime } from './theme-runtime.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const roots = [];

const createTheme = (id, appearance) => {
  const theme = {
    metadata: { id, name: id, variant: 'dark', tags: [] },
    colors: {
      primary: { base: '#111111', foreground: '#ffffff' },
      surface: {
        background: '#111111', foreground: '#ffffff', muted: '#222222', mutedForeground: '#dddddd',
        elevated: '#333333', elevatedForeground: '#ffffff', subtle: '#444444',
      },
      interactive: {
        border: '#111111', selection: '#111111', selectionForeground: '#ffffff', focusRing: '#111111', hover: '#111111',
      },
      status: {
        error: '#111111', errorForeground: '#ffffff', errorBackground: '#111111', errorBorder: '#111111',
        warning: '#111111', warningForeground: '#ffffff', warningBackground: '#111111', warningBorder: '#111111',
        success: '#111111', successForeground: '#ffffff', successBackground: '#111111', successBorder: '#111111',
        info: '#111111', infoForeground: '#ffffff', infoBackground: '#111111', infoBorder: '#111111',
      },
      syntax: {
        base: {
          background: '#111111', foreground: '#ffffff', keyword: '#111111', string: '#111111', number: '#111111',
          function: '#111111', variable: '#111111', type: '#111111', comment: '#111111', operator: '#111111',
        },
        highlights: { diffAdded: '#111111', diffRemoved: '#111111', lineNumber: '#111111' },
      },
    },
  };
  if (appearance) theme.appearance = appearance;
  return theme;
};

const createFixture = async () => {
  const themesDir = await mkdtemp(path.join(os.tmpdir(), 'openchamber-themes-'));
  roots.push(themesDir);
  return {
    themesDir,
    runtime: createThemeRuntime({
      fsPromises: await import('node:fs/promises'),
      path,
      themesDir,
      maxThemeJsonBytes: 512 * 1024,
      logger: { warn: () => {} },
    }),
  };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('theme runtime', () => {
  it('loads legacy themes and directory themes without appearance changes', async () => {
    const { themesDir, runtime } = await createFixture();
    await writeFile(path.join(themesDir, 'legacy.json'), JSON.stringify(createTheme('legacy')));
    await mkdir(path.join(themesDir, 'directory', 'assets'), { recursive: true });
    await writeFile(path.join(themesDir, 'directory', 'theme.json'), JSON.stringify(createTheme('directory')));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes.map((theme) => theme.metadata.id)).toEqual(['legacy', 'directory']);
    expect(result.themes.every((theme) => theme.appearance === undefined)).toBe(true);
  });

  it('keeps valid surface appearance when wallpaper asset is rejected', async () => {
    const { themesDir, runtime } = await createFixture();
    await mkdir(path.join(themesDir, 'partial', 'assets'), { recursive: true });
    await writeFile(path.join(themesDir, 'partial', 'theme.json'), JSON.stringify(createTheme('partial', {
      wallpaper: { asset: '../secret.png', opacity: 0.5 },
      surfaces: { chat: 0.85 },
    })));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].appearance).toEqual({ surfaces: { chat: 0.85 } });
    expect(result.diagnostics.some((item) => item.code === 'asset-rejected')).toBe(true);
  });

  it('drops an entirely invalid appearance from the normalized theme', async () => {
    const { themesDir, runtime } = await createFixture();
    await writeFile(path.join(themesDir, 'invalid.json'), JSON.stringify(createTheme('invalid', 'invalid')));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes[0].appearance).toBeUndefined();
    expect(result.diagnostics.some((item) => item.code === 'appearance-invalid')).toBe(true);
  });

  it('rejects unsafe asset paths and unsupported asset formats', async () => {
    const { themesDir, runtime } = await createFixture();
    await mkdir(path.join(themesDir, 'unsafe', 'assets'), { recursive: true });
    await writeFile(path.join(themesDir, 'unsafe', 'assets', 'wallpaper.gif'), PNG_HEADER);
    await writeFile(path.join(themesDir, 'unsafe', 'theme.json'), JSON.stringify(createTheme('unsafe', {
      wallpaper: { asset: 'wallpaper.gif' },
      surfaces: { main: 0.9 },
    })));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes[0].appearance).toEqual({ surfaces: { main: 0.9 } });
    expect(result.diagnostics.some((item) => item.code === 'asset-unsupported')).toBe(true);
    expect(await runtime.resolveThemeAsset('unsafe', '%252e%252e/secret.png')).toMatchObject({ ok: false });
  });

  it('fails soft for missing, oversized, and mislabeled wallpaper assets', async () => {
    const { themesDir, runtime } = await createFixture();
    const cases = [
      { name: 'missing', asset: 'missing.png' },
      { name: 'oversized', asset: 'wallpaper.png', content: Buffer.alloc(12 * 1024 * 1024 + 1) },
      { name: 'mislabeled', asset: 'wallpaper.png', content: Buffer.from('<html>not an image</html>') },
    ];

    for (const item of cases) {
      await mkdir(path.join(themesDir, item.name, 'assets'), { recursive: true });
      await writeFile(path.join(themesDir, item.name, 'theme.json'), JSON.stringify(createTheme(item.name, {
        wallpaper: { asset: item.asset },
      })));
      if (item.content) {
        await writeFile(path.join(themesDir, item.name, 'assets', item.asset), item.content);
      }
    }

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes).toHaveLength(3);
    expect(result.themes.every((theme) => theme.appearance === undefined)).toBe(true);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'asset-missing',
      'asset-too-large',
      'asset-rejected',
    ]));
  });

  it('does not let a bad theme prevent a valid theme from loading', async () => {
    const { themesDir, runtime } = await createFixture();
    await writeFile(path.join(themesDir, 'bad.json'), '{');
    await writeFile(path.join(themesDir, 'good.json'), JSON.stringify(createTheme('good')));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes.map((theme) => theme.metadata.id)).toEqual(['good']);
    expect(result.diagnostics.some((item) => item.code === 'theme-invalid')).toBe(true);
  });

  it('uses sorted legacy themes before directory themes for duplicate ids', async () => {
    const { themesDir, runtime } = await createFixture();
    const legacy = createTheme('same');
    legacy.metadata.name = 'Legacy';
    await writeFile(path.join(themesDir, 'legacy.json'), JSON.stringify(legacy));
    await mkdir(path.join(themesDir, 'directory', 'assets'), { recursive: true });
    const directory = createTheme('same');
    directory.metadata.name = 'Directory';
    await writeFile(path.join(themesDir, 'directory', 'theme.json'), JSON.stringify(directory));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].metadata.name).toBe('Legacy');
    expect(result.diagnostics.some((item) => item.code === 'duplicate-theme-id')).toBe(true);
  });

  it('rejects symlinks that escape a registered theme asset directory', async () => {
    const { themesDir, runtime } = await createFixture();
    const outside = path.join(themesDir, 'outside.png');
    await writeFile(outside, PNG_HEADER);
    await mkdir(path.join(themesDir, 'symlink', 'assets'), { recursive: true });
    await symlink(outside, path.join(themesDir, 'symlink', 'assets', 'wallpaper.png'));
    await writeFile(path.join(themesDir, 'symlink', 'theme.json'), JSON.stringify(createTheme('symlink', {
      wallpaper: { asset: 'wallpaper.png' },
    })));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes[0].appearance).toBeUndefined();
    expect(result.diagnostics.some((item) => item.code === 'asset-rejected')).toBe(true);
  });

  it('rejects an assets directory symlink that escapes its theme directory', async () => {
    const { themesDir, runtime } = await createFixture();
    const outsideAssets = path.join(themesDir, 'outside-assets');
    await mkdir(outsideAssets, { recursive: true });
    await writeFile(path.join(outsideAssets, 'wallpaper.png'), PNG_HEADER);
    await mkdir(path.join(themesDir, 'directory-symlink'), { recursive: true });
    await symlink(outsideAssets, path.join(themesDir, 'directory-symlink', 'assets'));
    await writeFile(path.join(themesDir, 'directory-symlink', 'theme.json'), JSON.stringify(createTheme('directory-symlink', {
      wallpaper: { asset: 'wallpaper.png' },
    })));

    const result = await runtime.readCustomThemesFromDisk();

    expect(result.themes[0].appearance).toBeUndefined();
    expect(result.diagnostics.some((item) => item.code === 'asset-rejected')).toBe(true);
  });
});
