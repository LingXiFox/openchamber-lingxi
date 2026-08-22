const BACKGROUND_APPEARANCE_KEY = 'desktopBackgroundAppearances';

export const DEFAULT_BACKGROUND_APPEARANCE = Object.freeze({
  panelOpacity: 0.84,
  readability: 'standard',
  blur: false,
  fit: 'cover',
  position: 'center',
});

export const normalizeBackgroundScope = (raw = {}) => {
  const runtimeKey = typeof raw.runtimeKey === 'string' ? raw.runtimeKey.trim() : '';
  const directory = typeof raw.directory === 'string'
    ? raw.directory.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    : '';
  if (!runtimeKey || !directory || runtimeKey.length > 2048 || directory.length > 4096) {
    throw new Error('A runtime and workspace directory are required');
  }
  return { runtimeKey, directory, key: JSON.stringify([runtimeKey, directory]) };
};

export const isBackgroundAssetId = (value) =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(value);

export const detectBackgroundImageType = (bytes) => {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return null;
};

export const sanitizeBackgroundAppearance = (raw) => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const panelOpacity = Number.isFinite(source.panelOpacity)
    ? Math.min(1, Math.max(0.7, source.panelOpacity))
    : DEFAULT_BACKGROUND_APPEARANCE.panelOpacity;
  const readability = ['weak', 'standard', 'strong'].includes(source.readability)
    ? source.readability
    : DEFAULT_BACKGROUND_APPEARANCE.readability;
  const fit = source.fit === 'contain' ? 'contain' : DEFAULT_BACKGROUND_APPEARANCE.fit;
  const position = ['center', 'top', 'bottom', 'left', 'right'].includes(source.position)
    ? source.position
    : DEFAULT_BACKGROUND_APPEARANCE.position;
  const assetId = isBackgroundAssetId(source.assetId) ? source.assetId : undefined;
  const fileName = assetId && typeof source.fileName === 'string'
    ? source.fileName.trim().slice(0, 200)
    : undefined;
  const width = assetId && Number.isInteger(source.width) && source.width > 0 ? source.width : undefined;
  const height = assetId && Number.isInteger(source.height) && source.height > 0 ? source.height : undefined;

  return {
    panelOpacity,
    readability,
    blur: source.blur === true,
    fit,
    position,
    ...(assetId ? { assetId, fileName, width, height } : {}),
  };
};

const readEntries = (root) => Array.isArray(root?.[BACKGROUND_APPEARANCE_KEY])
  ? root[BACKGROUND_APPEARANCE_KEY]
  : [];

export const readBackgroundAppearance = (root, rawScope) => {
  const scope = normalizeBackgroundScope(rawScope);
  const entry = readEntries(root).find((candidate) => candidate?.workspaceKey === scope.key);
  return sanitizeBackgroundAppearance(entry);
};

export const writeBackgroundAppearance = (root, rawScope, rawAppearance) => {
  const scope = normalizeBackgroundScope(rawScope);
  const entries = readEntries(root).filter((candidate) => candidate?.workspaceKey !== scope.key);
  root[BACKGROUND_APPEARANCE_KEY] = [
    ...entries,
    { workspaceKey: scope.key, ...sanitizeBackgroundAppearance(rawAppearance) },
  ];
  return root;
};

export const isBackgroundAssetReferenced = (root, assetId) =>
  isBackgroundAssetId(assetId)
  && readEntries(root).some((entry) => sanitizeBackgroundAppearance(entry).assetId === assetId);
