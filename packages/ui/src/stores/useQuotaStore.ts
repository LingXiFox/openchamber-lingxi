import React from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ProviderResult, QuotaProviderId } from '@/types';
import { getVisibleQuotaProviders } from '@/lib/quota';
import { canUseElectronDesktopIPC, invokeDesktop, isVSCodeRuntime } from '@/lib/desktop';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { getDefaultModels } from '@/lib/quota/model-families';
import { updateDesktopSettings } from '@/lib/persistence';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useConfigStore } from '@/stores/useConfigStore';

const QUOTA_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
let quotaAutoRefreshConsumers = 0;
let quotaAutoRefreshInterval: number | null = null;

type QuotaFetchDependencies = {
  runtimeFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  canUseElectronDesktopIPC: () => boolean;
  invokeDesktop: (command: string, args?: Parameters<typeof invokeDesktop>[1]) => Promise<ProviderResult | null>;
};

const quotaFetchDependencies: QuotaFetchDependencies = {
  runtimeFetch,
  canUseElectronDesktopIPC,
  invokeDesktop: (command, args) => invokeDesktop<ProviderResult>(command, args),
};

export const findQuotaResult = (
  results: readonly ProviderResult[],
  providerId: QuotaProviderId,
  accountId?: string | null,
): ProviderResult | undefined => results.find((result) => (
  result.providerId === providerId
    && (providerId !== 'sub2api' || result.accountId === accountId)
));

export const fetchProviderQuotaResult = async (
  providerId: QuotaProviderId,
  accountId?: string,
  dependencies = quotaFetchDependencies,
): Promise<ProviderResult> => {
  if (providerId === 'sub2api' && !accountId) {
    throw new Error('Select an OpenCode provider before fetching Sub2API quota');
  }

  if (providerId === 'sub2api' && dependencies.canUseElectronDesktopIPC()) {
    const payload = await dependencies.invokeDesktop('desktop_fetch_sub2api_quota', { accountId });
    if (!payload) throw new Error('Desktop IPC unavailable');
    return payload;
  }

  const query = providerId === 'sub2api' ? `?accountId=${encodeURIComponent(accountId ?? '')}` : '';
  const response = await dependencies.runtimeFetch(`/api/quota/${encodeURIComponent(providerId)}${query}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Failed to fetch quota');
  return payload;
};

interface QuotaSettingsState {
  displayMode: 'usage' | 'remaining';
  dropdownProviderIds: QuotaProviderId[];
  selectedModels: Record<string, string[]>;  // Map of providerId -> selected model names
  expandedFamilies: Record<string, string[]>;  // Map of providerId -> EXPANDED family IDs (header dropdown - inverted)
}

interface QuotaStore extends QuotaSettingsState {
  results: ProviderResult[];
  selectedProviderId: QuotaProviderId | null;
  isLoading: boolean;
  isFetchingProvider: Record<string, boolean>;
  lastUpdated: number | null;
  error: string | null;

  loadSettings: () => Promise<void>;
  fetchAllQuotas: () => Promise<void>;
  fetchQuotas: (providerIds: QuotaProviderId[]) => Promise<void>;
  fetchProviderQuota: (providerId: QuotaProviderId, accountId?: string) => Promise<void>;
  setSelectedProvider: (providerId: QuotaProviderId | null) => void;
  setDisplayMode: (mode: 'usage' | 'remaining') => void;
  setDropdownProviderIds: (providerIds: QuotaProviderId[]) => void;
  setSelectedModels: (providerId: string, modelNames: string[]) => void;
  toggleModelSelected: (providerId: string, modelName: string) => void;
  setExpandedFamilies: (providerId: string, familyIds: string[]) => void;
  toggleFamilyExpanded: (providerId: string, familyId: string) => void;
  applyDefaultSelections: (providerId: string, availableModels: string[]) => void;
}

const parseSettings = (data: Record<string, unknown> | null): QuotaSettingsState => {
  const allProviderIds = getVisibleQuotaProviders().map((provider) => provider.id);
  const displayMode = data?.usageDisplayMode === 'remaining' ? 'remaining' : 'usage';
  const rawDropdownProviders = Array.isArray(data?.usageDropdownProviders)
    ? data?.usageDropdownProviders
    : null;
  const dropdownProviderIds = rawDropdownProviders
    ? rawDropdownProviders.filter((entry): entry is QuotaProviderId =>
        typeof entry === 'string' && allProviderIds.includes(entry as QuotaProviderId)
      )
    : allProviderIds;

  // Parse selected models (providerId -> array of model names)
  const selectedModels: Record<string, string[]> = {};
  const rawSelectedModels = data?.usageSelectedModels;
  if (rawSelectedModels && typeof rawSelectedModels === 'object') {
    for (const [providerId, models] of Object.entries(rawSelectedModels)) {
      if (Array.isArray(models)) {
        selectedModels[providerId] = models.filter((m): m is string => typeof m === 'string');
      }
    }
  }

  // Parse expanded families (inverted collapsed logic for header dropdown)
  const expandedFamilies: Record<string, string[]> = {};
  const rawExpandedFamilies = data?.usageExpandedFamilies;
  if (rawExpandedFamilies && typeof rawExpandedFamilies === 'object') {
    for (const [providerId, families] of Object.entries(rawExpandedFamilies)) {
      if (Array.isArray(families)) {
        expandedFamilies[providerId] = families.filter((f): f is string => typeof f === 'string');
      }
    }
  }

  return {
    displayMode,
    dropdownProviderIds,
    selectedModels,
    expandedFamilies,
  };
};

const loadSettingsFromRuntime = async (): Promise<QuotaSettingsState> => {
  const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
  if (runtimeSettings) {
    try {
      const result = await runtimeSettings.load();
      const settings = result?.settings as Record<string, unknown> | undefined;
      return parseSettings(settings ?? null);
    } catch {
      // fall through
    }
  }

  if (!isVSCodeRuntime()) {
    const response = await runtimeFetch('/api/config/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      return parseSettings(data as Record<string, unknown> | null);
    }
  }

  return {
    displayMode: 'usage',
    dropdownProviderIds: getVisibleQuotaProviders().map((provider) => provider.id),
    selectedModels: {},
    expandedFamilies: {},
  };
};

export const useQuotaStore = create<QuotaStore>()(
  devtools(
    (set, get) => ({
      results: [],
      selectedProviderId: null,
      isLoading: false,
      isFetchingProvider: {},
      lastUpdated: null,
      error: null,
      displayMode: 'usage',
      dropdownProviderIds: getVisibleQuotaProviders().map((provider) => provider.id),
      selectedModels: {},
      expandedFamilies: {},

      loadSettings: async () => {
        try {
          const settings = await loadSettingsFromRuntime();
          set(settings);
        } catch (error) {
          console.warn('Failed to load usage settings:', error);
        }
      },

      fetchQuotas: async (providerIds) => {
        set({ isLoading: true, error: null });
        const accountId = useConfigStore.getState().currentProviderId;
        try {
          await Promise.all(
            providerIds.map((providerId) => get().fetchProviderQuota(providerId, accountId))
          );
          set({
            isLoading: false,
            lastUpdated: Date.now()
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch quotas';
          set({ isLoading: false, error: message });
        }
      },

      fetchAllQuotas: async () => {
        await get().fetchQuotas(getVisibleQuotaProviders().map((provider) => provider.id));
      },

      fetchProviderQuota: async (providerId, requestedAccountId) => {
        const accountId = providerId === 'sub2api'
          ? requestedAccountId ?? useConfigStore.getState().currentProviderId
          : undefined;
        const fetchKey = providerId === 'sub2api' ? `${providerId}:${accountId}` : providerId;
        if (get().isFetchingProvider[fetchKey]) return;
        set((state) => ({
          isFetchingProvider: { ...state.isFetchingProvider, [fetchKey]: true }
        }));
        try {
          const result = await fetchProviderQuotaResult(providerId, accountId);

          set((state) => {
            const next = state.results.filter((entry) => (
              entry.providerId !== providerId
                || (providerId === 'sub2api' && entry.accountId !== accountId)
            ));
            next.push(result);
            const isCurrentAccount = providerId !== 'sub2api'
              || useConfigStore.getState().currentProviderId === accountId;
            return { results: next, error: isCurrentAccount ? null : state.error };
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch quota';
          const fallback: ProviderResult = {
            providerId,
            accountId,
            providerName: providerId,
            ok: false,
            configured: false,
            error: message,
            usage: null,
            fetchedAt: Date.now()
          };
          set((state) => {
            const next = state.results.filter((entry) => (
              entry.providerId !== providerId
                || (providerId === 'sub2api' && entry.accountId !== accountId)
            ));
            next.push(fallback);
            const isCurrentAccount = providerId !== 'sub2api'
              || useConfigStore.getState().currentProviderId === accountId;
            return { results: next, error: isCurrentAccount ? message : state.error };
          });
        } finally {
          set((state) => ({
            isFetchingProvider: { ...state.isFetchingProvider, [fetchKey]: false }
          }));
        }
      },

      setSelectedProvider: (providerId) => set({ selectedProviderId: providerId }),
      setDisplayMode: (mode) => set({ displayMode: mode }),
      setDropdownProviderIds: (providerIds) => set({ dropdownProviderIds: providerIds }),

      setSelectedModels: (providerId, modelNames) => {
        set((state) => ({
          selectedModels: { ...state.selectedModels, [providerId]: modelNames }
        }));
      },

      toggleModelSelected: (providerId, modelName) => {
        set((state) => {
          const currentSelected = state.selectedModels[providerId] ?? [];
          const isSelected = currentSelected.includes(modelName);
          const nextSelected = isSelected
            ? currentSelected.filter((m) => m !== modelName)
            : [...currentSelected, modelName];
          return {
            selectedModels: { ...state.selectedModels, [providerId]: nextSelected }
          };
        });
      },

      setExpandedFamilies: (providerId, familyIds) => {
        set((state) => ({
          expandedFamilies: { ...state.expandedFamilies, [providerId]: familyIds }
        }));
        // Persist
        void updateDesktopSettings({ usageExpandedFamilies: get().expandedFamilies });
      },

      toggleFamilyExpanded: (providerId, familyId) => {
        set((state) => {
          const currentExpanded = state.expandedFamilies[providerId] ?? [];
          const isExpanded = currentExpanded.includes(familyId);
          const nextExpanded = isExpanded
            ? currentExpanded.filter((id) => id !== familyId)
            : [...currentExpanded, familyId];
          return {
            expandedFamilies: { ...state.expandedFamilies, [providerId]: nextExpanded }
          };
        });
        // Persist
        void updateDesktopSettings({ usageExpandedFamilies: get().expandedFamilies });
      },

      applyDefaultSelections: (providerId, availableModels) => {
        const state = get();
        // Only apply if no prior selections exist
        if ((state.selectedModels[providerId]?.length ?? 0) > 0) return;

        const defaults = getDefaultModels(providerId as QuotaProviderId, availableModels);
        if (defaults.length === 0) return;

        set((s) => ({
          selectedModels: { ...s.selectedModels, [providerId]: defaults },
        }));
        // Persist
        void updateDesktopSettings({ usageSelectedModels: get().selectedModels });
      },
    }),
    { name: 'quota-store' }
  )
);

export const useQuotaAutoRefresh = () => {
  React.useEffect(() => {
    quotaAutoRefreshConsumers += 1;
    if (quotaAutoRefreshInterval === null) {
      quotaAutoRefreshInterval = window.setInterval(() => {
        const { dropdownProviderIds, fetchQuotas } = useQuotaStore.getState();
        if (dropdownProviderIds.length > 0) {
          void fetchQuotas(dropdownProviderIds);
        }
      }, QUOTA_REFRESH_INTERVAL_MS);
    }

    return () => {
      quotaAutoRefreshConsumers -= 1;
      if (quotaAutoRefreshConsumers === 0 && quotaAutoRefreshInterval !== null) {
        window.clearInterval(quotaAutoRefreshInterval);
        quotaAutoRefreshInterval = null;
      }
    };
  }, []);
};
