import { describe, expect, test } from 'bun:test';
import type { ProviderResult } from '@/types';
import { getVisibleQuotaProviders } from '@/lib/quota';
import { fetchProviderQuotaResult } from './useQuotaStore';

const sub2ApiResult: ProviderResult = {
  providerId: 'sub2api',
  providerName: 'Sub2API',
  ok: true,
  configured: true,
  usage: {
    windows: {
      credits: {
        usedPercent: 26.58,
        remainingPercent: 73.42,
        windowSeconds: null,
        resetAfterSeconds: null,
        resetAt: null,
        resetAtFormatted: null,
        resetAfterFormatted: null,
        valueLabel: '$73.42 / $100.00',
      },
    },
  },
  fetchedAt: 1,
};

describe('quota store Sub2API routing', () => {
  test('uses local Electron IPC without requesting the active runtime', async () => {
    let runtimeFetchCalls = 0;
    let invokeDesktopCalls = 0;
    const runtimeFetch = async () => {
      runtimeFetchCalls += 1;
      throw new Error('remote runtime must not receive the JWT');
    };
    const invokeDesktop = async (command: string) => {
      invokeDesktopCalls += 1;
      expect(command).toBe('desktop_fetch_sub2api_quota');
      return sub2ApiResult;
    };

    const result = await fetchProviderQuotaResult('sub2api', {
      runtimeFetch,
      canUseElectronDesktopIPC: () => true,
      invokeDesktop,
    });

    expect(invokeDesktopCalls).toBe(1);
    expect(runtimeFetchCalls).toBe(0);
    expect(result).toEqual(sub2ApiResult);
  });

  test('uses the HTTP fallback outside Electron', async () => {
    let runtimeFetchPath = '';
    let invokeDesktopCalls = 0;
    const runtimeFetch = async (input: RequestInfo | URL) => {
      runtimeFetchPath = String(input);
      return new Response(JSON.stringify(sub2ApiResult), { status: 200 });
    };
    const invokeDesktop = async () => {
      invokeDesktopCalls += 1;
      return sub2ApiResult;
    };

    const result = await fetchProviderQuotaResult('sub2api', {
      runtimeFetch,
      canUseElectronDesktopIPC: () => false,
      invokeDesktop,
    });

    expect(invokeDesktopCalls).toBe(0);
    expect(runtimeFetchPath).toBe('/api/quota/sub2api');
    expect(result).toEqual(sub2ApiResult);
  });

  test('hides Sub2API in VS Code', () => {
    expect(getVisibleQuotaProviders(true).some((provider) => provider.id === 'sub2api')).toBe(false);
  });
});
