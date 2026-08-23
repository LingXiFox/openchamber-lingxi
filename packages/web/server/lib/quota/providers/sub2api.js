import { asObject, buildResult, formatMoney, toNumber, toUsageWindow } from '../utils/index.js';
import { normalizers } from '../credentials/providers.js';
import { readQuotaCredentialFile, writeQuotaCredential } from '../credentials/store.js';

export const providerId = 'sub2api';
export const providerName = 'Sub2API';
export const aliases = ['sub2api'];

const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const AUTHENTICATION_ERROR = 'Sub2API authentication expired or invalid';
const INVALID_RESPONSE_ERROR = 'Invalid response from provider';
const PERSIST_FAILED_ERROR = 'Failed to persist refreshed Sub2API credentials';
const NETWORK_ERROR = 'Could not reach the Sub2API panel';

// JSON parse failures are caught inside requestJson/refreshTokens, so a
// TypeError reaching errorResult is a fetch-level failure (DNS, connection
// refused, TLS) rather than a malformed payload.
const isNetworkFailure = (error) => error instanceof TypeError;

const normalizeAccountId = (value) => {
  let accountId;
  try {
    accountId = String(value ?? '');
  } catch {
    return null;
  }
  if (accountId !== value || accountId.length > 128 || /[\u0000-\u001f\u007f]/.test(accountId)) return null;
  const trimmed = accountId.trim();
  return trimmed && trimmed === accountId ? accountId : null;
};

const getConfiguration = (requestedAccountId) => {
  const accountId = normalizeAccountId(requestedAccountId);
  if (!accountId) throw new Error('Sub2API account ID is required');

  const stored = readQuotaCredentialFile(providerId);
  if (stored !== null) {
    const root = asObject(stored);
    if (!root) throw new Error('Invalid Sub2API quota configuration');
    const accounts = asObject(root.accounts);
    if (accounts) {
      if (!Object.prototype.hasOwnProperty.call(accounts, accountId)) return null;
      const configuration = normalizers.sub2api(accounts[accountId]);
      if (!configuration) {
        throw new Error(`Invalid Sub2API quota configuration for OpenCode provider "${accountId}"`);
      }
      return configuration;
    }

    const legacy = accountId === providerId ? normalizers.sub2api(root) : null;
    if (legacy) return legacy;
    throw new Error('Invalid Sub2API quota configuration');
  }

  return accountId === providerId ? normalizers.sub2api({
    baseUrl: process.env.SUB2API_BASE_URL,
    accessToken: process.env.SUB2API_ACCESS_TOKEN,
  }) : null;
};

const hasConfigurationSource = () => {
  try {
    if (readQuotaCredentialFile(providerId) !== null) return true;
  } catch {
    return true;
  }
  return Boolean(normalizers.sub2api({
    baseUrl: process.env.SUB2API_BASE_URL,
    accessToken: process.env.SUB2API_ACCESS_TOKEN,
  }));
};

const accountResult = (accountId, values) => ({ ...buildResult(values), accountId });

// Rotates a one-time refresh token for a fresh access/refresh pair. The panel
// access JWT only lives ~24h; the refresh token is the durable credential.
const refreshTokens = async (baseUrl, refreshToken, fetchImpl) => {
  const response = await fetchImpl(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OpenChamber quota provider',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(AUTHENTICATION_ERROR);
  const data = getResponseData(await response.json().catch(() => null));
  const accessToken = typeof data?.access_token === 'string' && data.access_token ? data.access_token : '';
  const nextRefreshToken = typeof data?.refresh_token === 'string' && data.refresh_token ? data.refresh_token : '';
  if (!accessToken || !nextRefreshToken) throw new Error(AUTHENTICATION_ERROR);
  return { accessToken, refreshToken: nextRefreshToken };
};

// Writes rotated tokens back into the account map. The panel rotates refresh
// tokens on every use, so an unpersisted pair would be unrecoverable: any
// failure here must surface instead of being swallowed.
const persistRefreshedTokens = (accountId, configuration, tokens) => {
  try {
    const stored = readQuotaCredentialFile(providerId);
    const root = asObject(stored);
    const accounts = asObject(root?.accounts);
    const entry = accounts && Object.prototype.hasOwnProperty.call(accounts, accountId)
      ? asObject(accounts[accountId])
      : null;
    if (!entry) throw new Error('account entry missing from quota/sub2api.json');
    accounts[accountId] = {
      ...entry,
      baseUrl: configuration.baseUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    writeQuotaCredential(providerId, root);
  } catch (error) {
    console.warn(`Failed to persist refreshed Sub2API credentials: ${error instanceof Error ? error.message : error}`);
    throw new Error(PERSIST_FAILED_ERROR);
  }
};

const getResponseData = (payload) => {
  const root = asObject(payload);
  if (!root) return null;
  const code = toNumber(root.code);
  if (code !== null && code !== 0) return null;
  return asObject(root.data);
};

const requestJson = async (url, accessToken, fetchImpl) => {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'OpenChamber quota provider',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(AUTHENTICATION_ERROR);
  }
  if (!response.ok) {
    throw new Error(`Sub2API quota API returned HTTP ${response.status}`);
  }
  const payload = await response.json().catch(() => null);
  if (!asObject(payload)) {
    throw new Error(INVALID_RESPONSE_ERROR);
  }
  return payload;
};

const formatAmount = (value) => `$${formatMoney(value)}`;

// Latest completed balance recharge marks the start of the current spending
// cycle. ponytail: inspect the newest 100 orders; paginate if an account
// exceeds that recharge frequency.
const findLatestRecharge = async (baseUrl, accessToken, fetchImpl) => {
  const payload = await requestJson(
    `${baseUrl}/api/v1/payment/orders/my?page=1&page_size=${PAGE_SIZE}`,
    accessToken,
    fetchImpl,
  );
  const data = getResponseData(payload);
  if (!Array.isArray(data?.items)) throw new Error(INVALID_RESPONSE_ERROR);
  const items = data.items;
  let latest = null;
  for (const entry of items) {
    const order = asObject(entry);
    if (order?.order_type !== 'balance') continue;
    if (order.status !== 'COMPLETED' && order.status !== 'PARTIALLY_REFUNDED') continue;
    const completedAt = typeof order.completed_at === 'string' ? order.completed_at : '';
    if (!completedAt) continue;
    if (!latest || completedAt > latest) latest = completedAt;
  }
  return latest;
};

// Sums actual paid cost since an ISO timestamp. ISO strings from this panel
// share one timezone offset, so lexicographic compare equals time compare.
const fetchConsumedSince = async (baseUrl, accessToken, sinceIso, fetchImpl) => {
  const startDate = sinceIso.slice(0, 10);
  let consumed = 0;
  let page = 1;

  while (true) {
    const payload = await requestJson(
      `${baseUrl}/api/v1/usage?start_date=${startDate}&sort_by=created_at&sort_order=desc&page=${page}&page_size=${PAGE_SIZE}`,
      accessToken,
      fetchImpl,
    );
    const items = Array.isArray(getResponseData(payload)?.items) ? getResponseData(payload).items : null;
    if (!items) throw new Error(INVALID_RESPONSE_ERROR);

    let reachedStart = false;
    for (const item of items) {
      const record = asObject(item);
      const createdAt = typeof record?.created_at === 'string' ? record.created_at : '';
      if (createdAt && createdAt < sinceIso) {
        reachedStart = true;
        break;
      }
      const cost = toNumber(record?.actual_cost) ?? toNumber(record?.cost) ?? 0;
      if (cost < 0) continue;
      const next = consumed + cost;
      if (!Number.isFinite(next)) throw new Error(INVALID_RESPONSE_ERROR);
      consumed = next;
    }
    if (reachedStart || items.length < PAGE_SIZE) break;
    page += 1;
  }

  return consumed;
};

const getBalance = (payload) => {
  const balance = toNumber(getResponseData(payload)?.balance);
  if (balance === null) throw new Error(INVALID_RESPONSE_ERROR);
  // Overdrawn wallets report a negative balance; clamp to zero so labels and
  // percents never see a negative amount. A spent-past-zero cycle then reads
  // as 100% used.
  return Math.max(0, balance);
};

// Wallet model: without a recharge history there is no honest denominator, so
// report the absolute balance only. After a recharge the denominator is the
// wallet level at that moment (consumed-since + current balance), which resets
// on every recharge instead of growing forever.
const fetchSub2ApiUsage = async (baseUrl, accessToken, fetchImpl = fetch) => {
  const profile = await requestJson(`${baseUrl}/api/v1/user/profile`, accessToken, fetchImpl);
  const balance = getBalance(profile);

  const rechargeAt = await findLatestRecharge(baseUrl, accessToken, fetchImpl);
  if (!rechargeAt) {
    return { windows: { credits: toUsageWindow({
      usedPercent: null,
      windowSeconds: null,
      resetAt: null,
      valueLabel: formatAmount(balance),
    }) } };
  }

  const consumed = await fetchConsumedSince(baseUrl, accessToken, rechargeAt, fetchImpl);
  const total = consumed + balance;
  if (!Number.isFinite(total) || total <= 0 || consumed < 0) {
    return { windows: { credits: toUsageWindow({
      usedPercent: null,
      windowSeconds: null,
      resetAt: null,
      valueLabel: `${formatAmount(consumed)} / unknown`,
    }) } };
  }

  return { windows: { credits: toUsageWindow({
    usedPercent: Math.max(0, Math.min(100, consumed / total * 100)),
    windowSeconds: null,
    resetAt: null,
    valueLabel: `${formatAmount(consumed)} / ${formatAmount(total)}`,
  }) } };
};

export const isConfigured = () => {
  const stored = readQuotaCredentialFile(providerId);
  if (stored !== null) {
    const root = asObject(stored);
    if (!root) throw new Error('Invalid Sub2API quota configuration');
    const accounts = asObject(root.accounts);
    if (accounts) return Object.values(accounts).some((entry) => Boolean(normalizers.sub2api(entry)));
    return Boolean(normalizers.sub2api(root));
  }
  return Boolean(normalizers.sub2api({
    baseUrl: process.env.SUB2API_BASE_URL,
    accessToken: process.env.SUB2API_ACCESS_TOKEN,
  }));
};

const errorResult = (accountId, error) => {
  const isTimeout = error instanceof DOMException && (
    error.name === 'TimeoutError' || error.name === 'AbortError'
  );
  return accountResult(accountId, {
    providerId,
    providerName,
    ok: false,
    configured: true,
    error: isTimeout
      ? 'Request timed out'
      : isNetworkFailure(error)
        ? NETWORK_ERROR
        : error instanceof Error && error.message === AUTHENTICATION_ERROR
          ? AUTHENTICATION_ERROR
          : error instanceof Error && error.message.startsWith('Sub2API quota API returned HTTP')
            ? error.message
            : INVALID_RESPONSE_ERROR,
  });
};

export const fetchQuotaWithCredential = async (credential, fetchImpl = fetch, accountId = providerId) => {
  const configuration = normalizers.sub2api(credential);
  if (!configuration) {
    return accountResult(accountId, { providerId, providerName, ok: false, configured: false, error: 'Not configured' });
  }

  try {
    const usage = await fetchSub2ApiUsage(configuration.baseUrl, configuration.accessToken, fetchImpl);
    return accountResult(accountId, { providerId, providerName, ok: true, configured: true, usage });
  } catch (error) {
    if (error instanceof Error && error.message === AUTHENTICATION_ERROR && configuration.refreshToken) {
      try {
        const tokens = await refreshTokens(configuration.baseUrl, configuration.refreshToken, fetchImpl);
        persistRefreshedTokens(accountId, configuration, tokens);
        const usage = await fetchSub2ApiUsage(configuration.baseUrl, tokens.accessToken, fetchImpl);
        return accountResult(accountId, { providerId, providerName, ok: true, configured: true, usage });
      } catch (refreshError) {
        if (refreshError instanceof Error && refreshError.message === PERSIST_FAILED_ERROR) {
          // The fresh pair is valid in memory but lost after this request; the
          // stored refresh token was already rotated and is dead. Surface it.
          return accountResult(accountId, { providerId, providerName, ok: false, configured: true, error: PERSIST_FAILED_ERROR });
        }
        // Classify the refresh failure through errorResult so timeouts and
        // network outages keep their specific messages.
        return errorResult(accountId, refreshError);
      }
    }
    return errorResult(accountId, error);
  }
};

export const fetchQuota = async (requestedAccountId) => {
  const accountId = normalizeAccountId(requestedAccountId) ?? '';
  try {
    const configuration = getConfiguration(accountId);
    if (!configuration) {
      // Unmapped account: not a fault. Passive surfaces hide it via
      // configured:false; the Usage detail page still shows the error text.
      return accountResult(accountId, {
        providerId,
        providerName,
        ok: false,
        configured: false,
        error: hasConfigurationSource()
          ? `No Sub2API quota account configured for OpenCode provider "${accountId}"`
          : 'Not configured',
      });
    }
    return fetchQuotaWithCredential(configuration, fetch, accountId);
  } catch (error) {
    // Broken config file or malformed entry: a real fault worth surfacing.
    return accountResult(accountId, {
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Invalid Sub2API quota configuration',
    });
  }
};
