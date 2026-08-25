import React from 'react';
import { useI18n } from '@/lib/i18n';
import { formatQuotaGroupName, formatWindowLabel, getVisibleQuotaProviders } from '@/lib/quota';
import { getDisplayModelName } from '@/lib/quota/model-families';
import { findQuotaResult, useQuotaStore } from '@/stores/useQuotaStore';
import { useConfigStore } from '@/stores/useConfigStore';
import type { QuotaProviderId, UsageWindow } from '@/types';

export type UsageLimitRow = {
  key: string;
  label: string;
  subtitle?: string;
  window: UsageWindow;
};

export type UsageProviderGroup = {
  providerId: QuotaProviderId;
  providerName: string;
  planLabel?: string | null;
  rows: UsageLimitRow[];
  /** Provider-level message: a fetch error, or "nothing reported". */
  status: string | null;
};

/**
 * Quota windows grouped by provider, shaped for the compact usage list.
 *
 * Shared by the mobile session-metadata popover and the work-status panel so
 * the two cannot drift on which providers appear, how model rows are filtered,
 * or what counts as a provider-level status.
 *
 * Only providers the user put in the dropdown and that reported themselves as
 * configured are included.
 */
export const useUsageProviderGroups = (): UsageProviderGroup[] => {
  const { t } = useI18n();
  const quotaResults = useQuotaStore((state) => state.results);
  const dropdownProviderIds = useQuotaStore((state) => state.dropdownProviderIds);
  const selectedQuotaModels = useQuotaStore((state) => state.selectedModels);
  const currentProviderId = useConfigStore((state) => state.currentProviderId);

  return React.useMemo<UsageProviderGroup[]>(() => {
    return getVisibleQuotaProviders()
      .filter((providerMeta) => dropdownProviderIds.includes(providerMeta.id))
      .map((providerMeta) => ({
        providerMeta,
        result: findQuotaResult(quotaResults, providerMeta.id, currentProviderId),
      }))
      .flatMap(({ providerMeta, result }) => {
        if (!result?.configured) return [];
        const rows: UsageLimitRow[] = [];

        for (const [label, window] of Object.entries(result.usage?.windows ?? {})) {
          rows.push({ key: `window-${label}`, label: formatWindowLabel(label), window });
        }

        const modelEntries = Object.entries(result.usage?.models ?? {});
        const providerSelectedModels = selectedQuotaModels[providerMeta.id] ?? [];
        const visibleModelEntries = providerSelectedModels.length > 0
          ? modelEntries.filter(([modelName]) => providerSelectedModels.includes(modelName))
          : modelEntries;
        for (const [modelName, modelUsage] of visibleModelEntries) {
          const entries = Object.entries(modelUsage.windows ?? {});
          if (entries.length === 0) continue;
          const [label, window] = entries[0];
          rows.push({
            key: `model-${modelName}-${label}`,
            label: formatWindowLabel(label),
            subtitle: getDisplayModelName(modelName),
            window,
          });
        }

        const status = !result.ok && result.error
          ? result.error
          : rows.length === 0
            ? t('header.services.noRateLimitsReported')
            : null;

        return [{
          providerId: providerMeta.id,
          providerName: formatQuotaGroupName(providerMeta.name, providerMeta.id, result.accountId),
          planLabel: result.planLabel,
          rows,
          status,
        }];
      });
  }, [currentProviderId, dropdownProviderIds, quotaResults, selectedQuotaModels, t]);
};
