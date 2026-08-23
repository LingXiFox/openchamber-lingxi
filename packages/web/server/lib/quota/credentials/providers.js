import { deleteQuotaCredential, readQuotaCredential, writeQuotaCredential } from './store.js';

const clean = (value) => typeof value === 'string' && !/[\r\n]/.test(value) ? value.trim() : '';
const WRITABLE_PROVIDERS = new Set(['ollama-cloud', 'cursor']);

const normalizeSub2ApiBaseUrl = (value) => {
  const baseUrl = clean(value);
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

export const normalizers = {
  'ollama-cloud': (value) => {
    const cookie = clean(value?.cookie);
    return cookie ? { cookie } : null;
  },
  cursor: (value) => {
    const accessToken = clean(value?.accessToken);
    const refreshToken = clean(value?.refreshToken);
    return accessToken || refreshToken ? { accessToken, refreshToken } : null;
  },
  sub2api: (value) => {
    const baseUrl = normalizeSub2ApiBaseUrl(value?.baseUrl);
    const accessToken = clean(value?.accessToken);
    const refreshToken = clean(value?.refreshToken);
    if (!baseUrl || (!accessToken && !refreshToken)) return null;
    return { baseUrl, accessToken, refreshToken };
  },
};

export const readManagedCredential = (providerId) => {
  const normalize = normalizers[providerId];
  return normalize ? readQuotaCredential(providerId, normalize) : null;
};

export const writeManagedCredential = (providerId, value) => {
  if (!WRITABLE_PROVIDERS.has(providerId)) throw new Error('Unsupported credential provider');
  const credential = normalizers[providerId]?.(value);
  if (!credential) throw new Error('Invalid credential');
  writeQuotaCredential(providerId, credential);
  return getManagedCredentialStatus(providerId);
};

export const getManagedCredentialStatus = (providerId) => {
  const credential = readManagedCredential(providerId);
  if (!credential) return { configured: false };
  if (providerId === 'cursor') return { configured: true, hasRefreshToken: Boolean(credential.refreshToken), secretMasked: '••••••••' };
  return { configured: true, secretMasked: '••••••••' };
};

export const deleteManagedCredential = (providerId) => {
  if (!WRITABLE_PROVIDERS.has(providerId)) throw new Error('Unsupported credential provider');
  deleteQuotaCredential(providerId);
};
