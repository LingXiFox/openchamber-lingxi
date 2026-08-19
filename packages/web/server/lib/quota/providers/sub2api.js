import { asNonEmptyString, asObject, buildResult, formatMoney, toNumber, toUsageWindow } from '../utils/index.js';

export const providerId = 'sub2api';
export const providerName = 'Sub2API';
export const aliases = ['sub2api'];

const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const AUTHENTICATION_ERROR = 'Sub2API authentication expired or invalid';
const INVALID_RESPONSE_ERROR = 'Invalid response from provider';

const normalizeBaseUrl = (raw) => {
  const value = asNonEmptyString(raw);
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

const getConfiguration = () => {
  const baseUrl = normalizeBaseUrl(process.env.SUB2API_BASE_URL);
  const accessToken = asNonEmptyString(process.env.SUB2API_ACCESS_TOKEN);
  return baseUrl && accessToken ? { baseUrl, accessToken } : null;
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

export const calculateNetRechargeTotal = (orders) => {
  if (!Array.isArray(orders)) return 0;

  let total = 0;
  for (const entry of orders) {
    const order = asObject(entry);
    if (order?.order_type !== 'balance') continue;

    const amount = toNumber(order.amount);
    if (amount === null || amount < 0) continue;

    if (order.status === 'COMPLETED') {
      const nextTotal = total + amount;
      if (Number.isFinite(nextTotal)) total = nextTotal;
      continue;
    }
    if (order.status === 'PARTIALLY_REFUNDED') {
      const refundAmount = toNumber(order.refund_amount);
      if (refundAmount === null || refundAmount < 0) continue;
      const nextTotal = total + Math.max(amount - refundAmount, 0);
      if (Number.isFinite(nextTotal)) total = nextTotal;
    }
  }
  return total;
};

export const calculateRemainingPercent = (balance, total) => {
  if (!Number.isFinite(balance) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, balance / total * 100));
};

const getBalance = (payload) => {
  const balance = toNumber(getResponseData(payload)?.balance);
  if (balance === null) throw new Error(INVALID_RESPONSE_ERROR);
  return balance;
};

const getOrderPage = (payload) => {
  const data = getResponseData(payload);
  const total = toNumber(data?.total);
  if (!Array.isArray(data?.items) || total === null || total < 0 || !Number.isInteger(total)) {
    throw new Error(INVALID_RESPONSE_ERROR);
  }
  return { items: data.items, total };
};

const fetchOrders = async (baseUrl, accessToken, fetchImpl) => {
  const orders = [];
  let total = null;
  let page = 1;

  while (total === null || orders.length < total) {
    const payload = await requestJson(
      `${baseUrl}/api/v1/payment/orders/my?page=${page}&page_size=${PAGE_SIZE}`,
      accessToken,
      fetchImpl,
    );
    const result = getOrderPage(payload);
    orders.push(...result.items);
    total = result.total;
    if (orders.length >= total) break;
    if (result.items.length === 0) throw new Error('Sub2API orders pagination is incomplete');
    page += 1;
  }

  return orders;
};

const formatAmount = (value) => `$${formatMoney(value)}`;

const toBalanceWindow = (balance, total) => {
  const remainingPercent = calculateRemainingPercent(balance, total);
  if (remainingPercent === null && balance > 0) {
    return toUsageWindow({
      usedPercent: null,
      windowSeconds: null,
      resetAt: null,
      valueLabel: `${formatAmount(balance)} / unknown`,
    });
  }

  return toUsageWindow({
    usedPercent: remainingPercent === null ? 100 : 100 - remainingPercent,
    windowSeconds: null,
    resetAt: null,
    valueLabel: `${formatAmount(balance)} / ${formatAmount(total)}`,
  });
};

const fetchSub2ApiQuota = async (baseUrl, accessToken, fetchImpl = fetch) => {
  const profile = await requestJson(`${baseUrl}/api/v1/user/profile`, accessToken, fetchImpl);
  const balance = getBalance(profile);
  const orders = await fetchOrders(baseUrl, accessToken, fetchImpl);
  const total = calculateNetRechargeTotal(orders);
  return { windows: { credits: toBalanceWindow(balance, total) } };
};

export const isConfigured = () => Boolean(getConfiguration());

export const fetchQuota = async () => {
  const configuration = getConfiguration();
  if (!configuration) {
    return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
  }

  try {
    const usage = await fetchSub2ApiQuota(configuration.baseUrl, configuration.accessToken);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage });
  } catch (error) {
    const isTimeout = error instanceof DOMException && (
      error.name === 'TimeoutError' || error.name === 'AbortError'
    );
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: isTimeout
        ? 'Request timed out'
        : error instanceof Error && error.message === AUTHENTICATION_ERROR
          ? AUTHENTICATION_ERROR
          : error instanceof Error && error.message.startsWith('Sub2API quota API returned HTTP')
            ? error.message
            : INVALID_RESPONSE_ERROR,
    });
  }
};
