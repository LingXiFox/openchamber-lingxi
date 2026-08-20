const MAX_THEME_ASSET_BYTES = 12 * 1024 * 1024;
const ASSET_MIME_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);
const APPEARANCE_SURFACES = new Set(['main', 'header', 'sidebar', 'chat', 'composer', 'contextPanel']);
const WALLPAPER_FITS = new Set(['cover', 'contain']);
const WALLPAPER_POSITIONS = new Set(['center', 'top', 'bottom', 'left', 'right']);

const isString = (value) => Object.prototype.toString.call(value) === '[object String]';
const isObject = (value) => Object.prototype.toString.call(value) === '[object Object]';
const isNonEmptyString = (value) => isString(value) && value.trim().length > 0;
const isAlpha = (value) => Object.prototype.toString.call(value) === '[object Number]'
  && Number.isFinite(value)
  && value >= 0
  && value <= 1;

const diagnostic = (severity, code, message, themeId) => {
  const result = { severity, code, message };
  if (themeId) result.themeId = themeId;
  return result;
};

const hasUnsafePathSyntax = (value) => (
  !value
  || value.includes('\0')
  || value.includes('\\')
  || value.includes('%')
  || value.startsWith('/')
  || value.startsWith('~')
  || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
  || /^[a-zA-Z]:/.test(value)
  || value.includes('//')
  || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
);

const hasExpectedImageSignature = (content, mime) => (
  (mime === 'image/png'
    && content.length >= 8
    && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
  || (mime === 'image/jpeg'
    && content.length >= 3
    && content[0] === 0xff
    && content[1] === 0xd8
    && content[2] === 0xff)
);

const isValidThemeAssetPath = (value) => (
  isString(value)
  && value.length <= 512
  && !hasUnsafePathSyntax(value.trim())
);

const sanitizeAppearance = (raw, themeId) => {
  const diagnostics = [];
  if (!isObject(raw)) {
    return {
      appearance: undefined,
      diagnostics: [diagnostic('warning', 'appearance-invalid', 'appearance must be an object', themeId)],
    };
  }

  const input = raw;
  const appearance = {};

  if (input.wallpaper !== undefined) {
    if (!isObject(input.wallpaper)) {
      diagnostics.push(diagnostic('warning', 'appearance-invalid', 'appearance.wallpaper must be an object', themeId));
    } else {
      const wallpaper = input.wallpaper;
      // A wallpaper without a valid asset cannot be rendered, so discard it as a unit.
      if (isValidThemeAssetPath(wallpaper.asset)) {
        const result = { asset: wallpaper.asset.trim() };
        if (wallpaper.fit !== undefined) {
          if (WALLPAPER_FITS.has(wallpaper.fit)) result.fit = wallpaper.fit;
          else diagnostics.push(diagnostic('warning', 'appearance-invalid', 'wallpaper fit must be cover or contain', themeId));
        }
        if (wallpaper.position !== undefined) {
          if (WALLPAPER_POSITIONS.has(wallpaper.position)) result.position = wallpaper.position;
          else diagnostics.push(diagnostic('warning', 'appearance-invalid', 'wallpaper position is invalid', themeId));
        }
        if (wallpaper.opacity !== undefined) {
          if (isAlpha(wallpaper.opacity)) result.opacity = wallpaper.opacity;
          else diagnostics.push(diagnostic('warning', 'appearance-invalid', 'wallpaper opacity must be between 0 and 1', themeId));
        }
        appearance.wallpaper = result;
      } else {
        diagnostics.push(diagnostic('warning', 'asset-rejected', 'wallpaper asset must be a safe relative path', themeId));
      }
    }
  }

  if (input.surfaces !== undefined) {
    if (!isObject(input.surfaces)) {
      diagnostics.push(diagnostic('warning', 'appearance-invalid', 'appearance.surfaces must be an object', themeId));
    } else {
      const surfaces = {};
      for (const [name, alpha] of Object.entries(input.surfaces)) {
        if (!APPEARANCE_SURFACES.has(name)) {
          diagnostics.push(diagnostic('warning', 'appearance-invalid', `unknown surface: ${name}`, themeId));
        } else if (isAlpha(alpha)) {
          surfaces[name] = alpha;
        } else {
          diagnostics.push(diagnostic('warning', 'appearance-invalid', `surface ${name} must be between 0 and 1`, themeId));
        }
      }
      if (Object.keys(surfaces).length > 0) appearance.surfaces = surfaces;
    }
  }

  for (const name of Object.keys(input)) {
    if (name !== 'wallpaper' && name !== 'surfaces') {
      diagnostics.push(diagnostic('warning', 'appearance-invalid', `unknown appearance field: ${name}`, themeId));
    }
  }

  return {
    appearance: Object.keys(appearance).length > 0 ? appearance : undefined,
    diagnostics,
  };
};

const withoutWallpaper = (theme) => {
  if (!theme.appearance?.wallpaper) return theme;
  const { wallpaper: _wallpaper, ...appearance } = theme.appearance;
  if (Object.keys(appearance).length === 0) {
    const { appearance: _appearance, ...rest } = theme;
    return rest;
  }
  return { ...theme, appearance };
};

export const createThemeRuntime = ({ fsPromises, path, themesDir, maxThemeJsonBytes, logger }) => {
  const themeRegistry = new Map();

  const normalizeThemeJson = (raw) => {
    if (!isObject(raw)) return null;

    const { metadata, colors } = raw;
    if (!isObject(metadata) || !isObject(colors)) return null;

    const { id, name, variant } = metadata;
    if (!isNonEmptyString(id) || !isNonEmptyString(name) || (variant !== 'light' && variant !== 'dark')) return null;

    const { primary, surface, interactive, status, syntax } = colors;
    const syntaxBase = isObject(syntax) ? syntax.base : null;
    const syntaxHighlights = isObject(syntax) ? syntax.highlights : null;
    if (!primary || !surface || !interactive || !status || !syntaxBase || !syntaxHighlights) return null;

    const required = [
      primary.base, primary.foreground,
      surface.background, surface.foreground, surface.muted, surface.mutedForeground,
      surface.elevated, surface.elevatedForeground, surface.subtle,
      interactive.border, interactive.selection, interactive.selectionForeground, interactive.focusRing, interactive.hover,
      status.error, status.errorForeground, status.errorBackground, status.errorBorder,
      status.warning, status.warningForeground, status.warningBackground, status.warningBorder,
      status.success, status.successForeground, status.successBackground, status.successBorder,
      status.info, status.infoForeground, status.infoBackground, status.infoBorder,
      syntaxBase.background, syntaxBase.foreground, syntaxBase.keyword, syntaxBase.string,
      syntaxBase.number, syntaxBase.function, syntaxBase.variable, syntaxBase.type,
      syntaxBase.comment, syntaxBase.operator,
      syntaxHighlights.diffAdded, syntaxHighlights.diffRemoved, syntaxHighlights.lineNumber,
    ];
    if (!required.every(isNonEmptyString)) return null;

    const theme = {
      ...raw,
      metadata: {
        ...metadata,
        id: id.trim(),
        name: name.trim(),
        description: isString(metadata.description) ? metadata.description : '',
        version: isNonEmptyString(metadata.version) ? metadata.version.trim() : '1.0.0',
        variant,
        tags: Array.isArray(metadata.tags)
          ? metadata.tags.filter((tag) => isNonEmptyString(tag))
          : [],
      },
    };

    if (raw.appearance === undefined) return { theme, diagnostics: [] };
    const { appearance, diagnostics } = sanitizeAppearance(raw.appearance, theme.metadata.id);
    return {
      theme: appearance ? { ...theme, appearance } : theme,
      diagnostics,
    };
  };

  const validateAsset = async (assetsRoot, assetPath) => {
    if (!isValidThemeAssetPath(assetPath)) {
      return { ok: false, code: 'asset-rejected', message: 'asset path rejected' };
    }

    const mime = ASSET_MIME_TYPES.get(path.extname(assetPath).toLowerCase());
    if (!mime) return { ok: false, code: 'asset-unsupported', message: 'only PNG and JPEG assets are supported' };

    let realAssetsRoot;
    try {
      realAssetsRoot = await fsPromises.realpath(assetsRoot);
    } catch {
      return { ok: false, code: 'asset-missing', message: 'assets directory unavailable' };
    }

    const candidate = path.resolve(realAssetsRoot, assetPath);
    if (!candidate.startsWith(`${realAssetsRoot}${path.sep}`)) {
      return { ok: false, code: 'asset-rejected', message: 'asset escapes assets directory' };
    }

    let realAsset;
    let stat;
    try {
      realAsset = await fsPromises.realpath(candidate);
      stat = await fsPromises.stat(realAsset);
    } catch {
      return { ok: false, code: 'asset-missing', message: 'asset not found' };
    }

    if (!realAsset.startsWith(`${realAssetsRoot}${path.sep}`)) {
      return { ok: false, code: 'asset-rejected', message: 'asset symlink escapes assets directory' };
    }
    if (!stat.isFile()) return { ok: false, code: 'asset-rejected', message: 'asset is not a file' };
    if (stat.size > MAX_THEME_ASSET_BYTES) {
      return { ok: false, code: 'asset-too-large', message: 'asset exceeds 12 MiB limit' };
    }

    try {
      const handle = await fsPromises.open(realAsset, 'r');
      const header = Buffer.alloc(8);
      await handle.read(header, 0, header.length, 0);
      await handle.close();
      if (!hasExpectedImageSignature(header, mime)) {
        return { ok: false, code: 'asset-rejected', message: 'asset content does not match its image format' };
      }
    } catch {
      return { ok: false, code: 'asset-rejected', message: 'asset could not be read safely' };
    }

    return { ok: true, absolutePath: realAsset, mime };
  };

  const readTheme = async (candidate) => {
    const { filePath, source, assetsRoot } = candidate;
    try {
      const stat = await fsPromises.stat(filePath);
      if (!stat.isFile()) return { diagnostics: [] };
      if (stat.size > maxThemeJsonBytes) {
        return { diagnostics: [diagnostic('warning', 'theme-invalid', `${source} exceeds the theme JSON size limit`)] };
      }

      const raw = JSON.parse(await fsPromises.readFile(filePath, 'utf8'));
      const normalized = normalizeThemeJson(raw);
      if (!normalized) {
        const themeId = isNonEmptyString(raw?.metadata?.id) ? raw.metadata.id.trim() : undefined;
        return { diagnostics: [diagnostic('warning', 'theme-invalid', `${source} has invalid required theme fields`, themeId)] };
      }

      let theme = normalized.theme;
      const diagnostics = normalized.diagnostics;
      if (theme.appearance?.wallpaper?.asset) {
        if (!assetsRoot) {
          diagnostics.push(diagnostic('warning', 'asset-rejected', 'legacy themes cannot contain wallpaper assets', theme.metadata.id));
          theme = withoutWallpaper(theme);
        } else {
          const asset = await validateAsset(assetsRoot, theme.appearance.wallpaper.asset);
          if (!asset.ok) {
            diagnostics.push(diagnostic('warning', asset.code, asset.message, theme.metadata.id));
            theme = withoutWallpaper(theme);
          }
        }
      }

      return { theme, diagnostics };
    } catch (error) {
      if (error?.code === 'ENOENT') return { diagnostics: [] };
      return {
        diagnostics: [diagnostic('warning', 'theme-invalid', `${source} could not be loaded`)],
        error,
      };
    }
  };

  const readCustomThemesFromDisk = async () => {
    let entries;
    try {
      entries = await fsPromises.readdir(themesDir, { withFileTypes: true });
    } catch (error) {
      themeRegistry.clear();
      if (error?.code !== 'ENOENT') logger.warn('[themes] Failed to list custom themes:', error);
      return { themes: [], diagnostics: [] };
    }

    const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name));
    const candidates = [
      ...sortedEntries.flatMap((entry) => {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
          return [{
            filePath: path.join(themesDir, entry.name),
            source: `legacy theme ${entry.name}`,
            assetsRoot: null,
          }];
        }
        return [];
      }),
      ...sortedEntries.flatMap((entry) => {
        if (!entry.isDirectory()) return [];
        return [{
          filePath: path.join(themesDir, entry.name, 'theme.json'),
          source: `directory theme ${entry.name}`,
          assetsRoot: path.join(themesDir, entry.name, 'assets'),
        }];
      }),
    ];

    const loaded = await Promise.all(candidates.map(readTheme));
    const themes = [];
    const diagnostics = [];
    const registry = new Map();
    const seen = new Set();

    for (const [index, { theme, diagnostics: itemDiagnostics, error }] of loaded.entries()) {
      diagnostics.push(...itemDiagnostics);
      if (error) logger.warn('[themes] Theme load failed:', error);
      if (!theme) continue;
      if (seen.has(theme.metadata.id)) {
        diagnostics.push(diagnostic('warning', 'duplicate-theme-id', 'duplicate custom theme id ignored', theme.metadata.id));
        continue;
      }
      seen.add(theme.metadata.id);
      themes.push(theme);
      const candidate = candidates[index];
      if (candidate?.assetsRoot && theme.appearance?.wallpaper?.asset) {
        registry.set(theme.metadata.id, {
          assetsRoot: candidate.assetsRoot,
          assetPath: theme.appearance.wallpaper.asset,
        });
      }
    }

    themeRegistry.clear();
    for (const [themeId, assetsRoot] of registry) themeRegistry.set(themeId, assetsRoot);
    return { themes, diagnostics };
  };

  const resolveThemeAsset = async (themeId, assetPath) => {
    const entry = themeRegistry.get(themeId);
    if (!entry || entry.assetPath !== assetPath) {
      return { ok: false, status: 404, code: 'asset-missing', message: 'theme asset not found' };
    }

    const asset = await validateAsset(entry.assetsRoot, assetPath);
    if (asset.ok) return asset;

    const statuses = {
      'asset-missing': 404,
      'asset-rejected': 400,
      'asset-unsupported': 415,
      'asset-too-large': 413,
    };
    return { ...asset, status: statuses[asset.code] };
  };

  return {
    normalizeThemeJson: (raw) => normalizeThemeJson(raw)?.theme ?? null,
    readCustomThemesFromDisk,
    resolveThemeAsset,
  };
};
