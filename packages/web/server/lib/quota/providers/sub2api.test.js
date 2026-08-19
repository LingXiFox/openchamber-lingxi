import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateNetRechargeTotal, calculateRemainingPercent, fetchQuota } from './sub2api.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const configureProvider = () => {
  vi.stubEnv('SUB2API_BASE_URL', 'https://sub2api.example/');
  vi.stubEnv('SUB2API_ACCESS_TOKEN', 'fake-panel-token');
};

const response = (data) => ({
  ok: true,
  status: 200,
  json: async () => ({ code: 0, data }),
});

describe('Sub2API recharge total', () => {
  it('counts completed balance orders', () => {
    expect(calculateNetRechargeTotal([{ order_type: 'balance', status: 'COMPLETED', amount: 100 }])).toBe(100);
  });

  it('subtracts partial refunds', () => {
    expect(calculateNetRechargeTotal([
      { order_type: 'balance', status: 'PARTIALLY_REFUNDED', amount: 100, refund_amount: 30 },
    ])).toBe(70);
  });

  it('excludes full refunds', () => {
    expect(calculateNetRechargeTotal([
      { order_type: 'balance', status: 'REFUNDED', amount: 100, refund_amount: 100 },
    ])).toBe(0);
  });

  it('sums mixed successful balance orders only', () => {
    expect(calculateNetRechargeTotal([
      { order_type: 'balance', status: 'COMPLETED', amount: 100 },
      { order_type: 'balance', status: 'COMPLETED', amount: 50 },
      { order_type: 'balance', status: 'PARTIALLY_REFUNDED', amount: 100, refund_amount: 40 },
      { order_type: 'balance', status: 'REFUNDED', amount: 30, refund_amount: 30 },
      { order_type: 'subscription', status: 'COMPLETED', amount: 500 },
      { order_type: 'balance', status: 'PENDING', amount: 500 },
      { order_type: 'balance', status: 'CANCELLED', amount: 500 },
    ])).toBe(210);
  });

  it('clamps remaining percent and leaves zero totals unavailable', () => {
    expect(calculateRemainingPercent(73.42, 100)).toBeCloseTo(73.42);
    expect(calculateRemainingPercent(120, 100)).toBe(100);
    expect(calculateRemainingPercent(0, 0)).toBeNull();
  });
});

describe('Sub2API quota provider', () => {
  it('uses profile balance and every orders page', async () => {
    configureProvider();
    const firstPage = Array.from({ length: 100 }, () => ({ order_type: 'balance', status: 'COMPLETED', amount: 1 }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ balance: 73.42 }))
      .mockResolvedValueOnce(response({ items: firstPage, total: 101, page: 1, page_size: 100 }))
      .mockResolvedValueOnce(response({ items: [{ order_type: 'balance', status: 'COMPLETED', amount: 1 }], total: 101, page: 2, page_size: 100 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuota();

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.remainingPercent).toBeCloseTo(73.42 / 101 * 100);
    expect(result.usage.windows.credits.valueLabel).toBe('$73.42 / $101.00');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://sub2api.example/api/v1/payment/orders/my?page=1&page_size=100', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://sub2api.example/api/v1/payment/orders/my?page=2&page_size=100', expect.any(Object));
  });

  it('keeps a positive balance with no payment orders explicitly unknown', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ balance: 20 }))
      .mockResolvedValueOnce(response({ items: [], total: 0, page: 1, page_size: 100 })));

    const result = await fetchQuota();

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.usedPercent).toBeNull();
    expect(result.usage.windows.credits.valueLabel).toBe('$20.00 / unknown');
  });

  it('returns an empty quota window for zero balance and zero total', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ balance: 0 }))
      .mockResolvedValueOnce(response({ items: [], total: 0, page: 1, page_size: 100 })));

    const result = await fetchQuota();

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits.remainingPercent).toBe(0);
    expect(result.usage.windows.credits.valueLabel).toBe('$0.00 / $0.00');
  });

  it('reports an expired or invalid panel JWT', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));

    const result = await fetchQuota();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Sub2API authentication expired or invalid');
  });

  it('handles malformed JSON and network failures without crashing', async () => {
    configureProvider();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('invalid JSON'); },
    }));

    expect((await fetchQuota()).error).toBe('Invalid response from provider');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    expect((await fetchQuota()).error).toBe('Invalid response from provider');
  });
});
