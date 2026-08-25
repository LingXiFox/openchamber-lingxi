import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deleteQuotaCredential, readQuotaCredentialFile, writeQuotaCredential } from '../credentials/store.js';
import { fetchQuota, fetchQuotaWithCredential } from './sub2api.js';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-sub2api-'));
const previousDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = temporaryDirectory;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  deleteQuotaCredential('sub2api');
});

const configureProvider = () => {
  vi.stubEnv('SUB2API_BASE_URL', 'https://sub2api.example/');
  vi.stubEnv('SUB2API_ACCESS_TOKEN', 'fake-panel-token');
};

const okJson = (data) => ({
  ok: true,
  status: 200,
  json: async () => ({ code: 0, data }),
});

const httpStatus = (status) => ({
  ok: false,
  status,
  json: async () => ({}),
});

const rechargeAt = '2026-08-19T17:55:02.266519+08:00';

const orderPage = (orders) => okJson({ items: orders, total: orders.length, page: 1 });

const completedOrder = { order_type: 'balance', status: 'COMPLETED', amount: 50, completed_at: rechargeAt };

// Standard success sequence: profile -> orders -> single usage page.
const mockCycleSequence = (fetchMock, { balance = 32.79, records = [{ created_at: '2026-08-20T10:00:00+08:00', actual_cost: 17.1948 }] } = {}) => {
  fetchMock
    .mockResolvedValueOnce(okJson({ balance }))
    .mockResolvedValueOnce(orderPage([completedOrder]))
    .mockResolvedValueOnce(okJson({ items: records, total: records.length }));
};

describe('Sub2API recharge-cycle quota window', () => {
  it('uses consumed-since-last-recharge over the wallet level at that moment', async () => {
    configureProvider();
    const fetchMock = vi.fn();
    mockCycleSequence(fetchMock);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('sub2api');

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.valueLabel).toBe('$17.19 / $49.98');
    expect(result.usage.windows.credits.usedPercent).toBeCloseTo(34.39, 1);
    const usageUrl = String(fetchMock.mock.calls[2][0]);
    expect(usageUrl).toContain('/api/v1/usage?start_date=2026-08-19');
    expect(usageUrl).toContain('sort_order=desc');
  });

  it('stops summing usage at the recharge moment on a later page', async () => {
    configureProvider();
    const fullPage = Array.from({ length: 100 }, () => ({
      created_at: '2026-08-20T10:00:00+08:00',
      actual_cost: 1,
    }));
    const olderRecord = { created_at: '2026-08-19T10:00:00+08:00', actual_cost: 999 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson({ balance: 5 }))
      .mockResolvedValueOnce(orderPage([completedOrder]))
      .mockResolvedValueOnce(okJson({ items: fullPage, total: 101 }))
      .mockResolvedValueOnce(okJson({ items: [olderRecord], total: 101 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('sub2api');

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.valueLabel).toBe('$100.00 / $105.00');
    expect(String(fetchMock.mock.calls[3][0])).toContain('page=2');
  });

  it('clamps a negative (overdrawn) balance to zero and reports 100% used', async () => {
    configureProvider();
    const fetchMock = vi.fn();
    mockCycleSequence(fetchMock, { balance: -3.5 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('sub2api');

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('-');
    expect(result.usage.windows.credits.valueLabel).toBe('$17.19 / $17.19');
    expect(result.usage.windows.credits.usedPercent).toBe(100);
  });

  it('shows the absolute balance without a percent when no recharge exists', async () => {
    configureProvider();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson({ balance: 20 }))
      .mockResolvedValueOnce(orderPage([{ order_type: 'subscription', status: 'COMPLETED', completed_at: rechargeAt }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('sub2api');

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.valueLabel).toBe('$20.00');
    expect(result.usage.windows.credits.usedPercent).toBeNull();
  });

  it('reports a clamped zero balance when an account without recharges is overdrawn', async () => {
    configureProvider();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson({ balance: -7 }))
      .mockResolvedValueOnce(orderPage([]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('sub2api');

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.valueLabel).toBe('$0.00');
    expect(result.usage.windows.credits.usedPercent).toBeNull();
  });
});

describe('Sub2API token refresh', () => {
  it('rotates the token pair on authentication failure and persists it', async () => {
    writeQuotaCredential('sub2api', {
      accounts: {
        HappyCode: {
          baseUrl: 'https://local-sub2api.example',
          accessToken: 'stale-jwt',
          refreshToken: 'rt-current',
        },
      },
    });
    const fetchMock = vi.fn()
      // First profile call uses the stale access token.
      .mockResolvedValueOnce(httpStatus(401))
      .mockImplementationOnce(async (url, init) => ({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: { access_token: 'fresh-jwt', refresh_token: 'rt-next', expires_in: 86400 },
          requestedUrl: String(url),
          sentBody: JSON.parse(init.body),
        }),
      }))
      .mockResolvedValueOnce(okJson({ balance: 32.79 }))
      .mockResolvedValueOnce(orderPage([completedOrder]))
      .mockResolvedValueOnce(okJson({ items: [], total: 0 }));

    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchQuota('HappyCode');

    expect(result.ok).toBe(true);
    const refreshCall = fetchMock.mock.calls[1];
    expect(String(refreshCall[0])).toContain('/api/v1/auth/refresh');
    expect(refreshCall[1].method).toBe('POST');
    expect(refreshCall[1].headers.Authorization).toBeUndefined();

    const stored = readQuotaCredentialFile('sub2api');
    expect(stored.accounts.HappyCode.accessToken).toBe('fresh-jwt');
    expect(stored.accounts.HappyCode.refreshToken).toBe('rt-next');
    expect(stored.accounts.HappyCode.baseUrl).toBe('https://local-sub2api.example');
  });

  it('reports an explicit error when the refresh token is rejected', async () => {
    writeQuotaCredential('sub2api', {
      accounts: {
        HappyCode: { baseUrl: 'https://local-sub2api.example', accessToken: 'stale-jwt', refreshToken: 'rt-dead' },
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpStatus(401))
      .mockResolvedValueOnce(httpStatus(400));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('HappyCode');

    expect(result).toMatchObject({ accountId: 'HappyCode', ok: false, configured: true });
    expect(result.error).toBe('Sub2API authentication expired or invalid');
    expect(readQuotaCredentialFile('sub2api').accounts.HappyCode.refreshToken).toBe('rt-dead');
  });

  it('surfaces a persist failure instead of losing the rotated pair silently', async () => {
    // Legacy single-account shape has no accounts map to rotate into.
    writeQuotaCredential('sub2api', {
      baseUrl: 'https://legacy-sub2api.example',
      accessToken: 'stale-jwt',
      refreshToken: 'rt-current',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpStatus(401))
      .mockResolvedValueOnce(okJson({ access_token: 'fresh-jwt', refresh_token: 'rt-next', expires_in: 86400 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('sub2api');

    expect(result).toMatchObject({ accountId: 'sub2api', ok: false, configured: true });
    expect(result.error).toBe('Failed to persist refreshed Sub2API credentials');
    expect(readQuotaCredentialFile('sub2api')).toMatchObject({ refreshToken: 'rt-current' });
  });
});

describe('Sub2API account mapping and failures', () => {
  it('selects the account matching the OpenCode provider key', async () => {
    configureProvider();
    writeQuotaCredential('sub2api', {
      accounts: {
        HappyCode: { baseUrl: 'https://local-sub2api.example/', accessToken: 'local-panel-jwt' },
        OtherCode: { baseUrl: 'https://other-sub2api.example/', accessToken: 'other-panel-jwt' },
      },
    });
    const fetchMock = vi.fn();
    mockCycleSequence(fetchMock, { balance: 73.42, records: [{ created_at: '2026-08-20T10:00:00+08:00', actual_cost: 10 }] });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('HappyCode');

    expect(result.accountId).toBe('HappyCode');
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://local-sub2api.example/api/v1/user/profile', expect.any(Object));
  });

  it('reports a missing OpenCode provider mapping without making a request', async () => {
    configureProvider();
    writeQuotaCredential('sub2api', {
      accounts: { OtherCode: { baseUrl: 'https://other-sub2api.example/', accessToken: 'other-panel-jwt' } },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota('HappyCode');

    expect(result).toMatchObject({ accountId: 'HappyCode', ok: false, configured: false });
    expect(result.error).toContain('HappyCode');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays hidden when no Sub2API configuration source exists', async () => {
    const result = await fetchQuota('HappyCode');

    expect(result).toMatchObject({ accountId: 'HappyCode', ok: false, configured: false, error: 'Not configured' });
  });

  it('reports an expired or invalid panel JWT', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpStatus(401)));

    const result = await fetchQuota('sub2api');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Sub2API authentication expired or invalid');
  });

  it('rejects a successful HTTP response with an API error code', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(okJson({ balance: 20 }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ code: 500, message: 'failed' }) }));

    const result = await fetchQuota('sub2api');

    expect(result).toMatchObject({ ok: false, configured: true, error: 'Invalid response from provider' });
  });

  it('handles malformed JSON without crashing', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('invalid JSON'); },
    }));

    expect((await fetchQuota('sub2api')).error).toBe('Invalid response from provider');
  });

  it('classifies fetch-level network failures distinctly from bad payloads', async () => {
    configureProvider();
    const dnsFailure = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo sub2api.example not found'), { code: 'ENOTFOUND' }),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(dnsFailure));

    expect((await fetchQuota('sub2api')).error).toBe('Could not reach the Sub2API panel');

    // Unclassified errors keep the generic payload message.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    expect((await fetchQuota('sub2api')).error).toBe('Invalid response from provider');
  });

  it('keeps the network error classification when the refresh call itself cannot connect', async () => {
    writeQuotaCredential('sub2api', {
      accounts: {
        HappyCode: { baseUrl: 'https://local-sub2api.example', accessToken: 'stale-jwt', refreshToken: 'rt-current' },
      },
    });
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(httpStatus(401))
      .mockRejectedValue(refused));

    const result = await fetchQuota('HappyCode');

    expect(result).toMatchObject({ accountId: 'HappyCode', ok: false, configured: true, error: 'Could not reach the Sub2API panel' });
    // The dead access token was never rotated, so the stored pair is untouched.
    expect(readQuotaCredentialFile('sub2api').accounts.HappyCode.refreshToken).toBe('rt-current');
  });

  it('returns a redacted result for a supplied panel credential', async () => {
    const fetchMock = vi.fn();
    mockCycleSequence(fetchMock, { balance: 73.42, records: [{ created_at: '2026-08-20T10:00:00+08:00', actual_cost: 26.58 }] });

    const result = await fetchQuotaWithCredential({
      baseUrl: 'https://sub2api.example/',
      accessToken: 'panel-jwt',
    }, fetchMock);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('panel-jwt');
  });
});

afterAll(() => {
  if (previousDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = previousDataDirectory;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});
