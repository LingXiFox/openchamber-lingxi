export const getWorkStatusPrRemoteName = (tracking: string | null | undefined): string | null => {
  const normalized = String(tracking || '').trim();
  const slashIndex = normalized.indexOf('/');
  return slashIndex > 0 ? normalized.slice(0, slashIndex).trim() || null : null;
};
