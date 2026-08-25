import type { GitTagEntry } from '@/lib/api/types';

/**
 * Release tag classification, local tags only. A prerelease (`-rc`, `-beta`,
 * `-alpha` suffixes) must never advance the "stable base updated" semantics.
 */
const STABLE_RELEASE_TAG_PATTERN = /^v?\d+\.\d+\.\d+$/;
const PRERELEASE_TAG_PATTERN = /^v?\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/;

export function isStableReleaseTag(name: string): boolean {
  return STABLE_RELEASE_TAG_PATTERN.test(name.trim());
}

export function isPrereleaseTag(name: string): boolean {
  return PRERELEASE_TAG_PATTERN.test(name.trim());
}

/** Newest stable release by creatordate; falls back to name order for ties. */
export function pickLatestStableTag(tags: GitTagEntry[]): GitTagEntry | null {
  const stable = tags.filter((tag) => isStableReleaseTag(tag.name));
  if (stable.length === 0) return null;
  return stable.reduce((latest, tag) => {
    const latestDate = latest.creatordateUnix ?? 0;
    const tagDate = tag.creatordateUnix ?? 0;
    if (tagDate !== latestDate) return tagDate > latestDate ? tag : latest;
    return tag.name > latest.name ? tag : latest;
  });
}

/** Newest prerelease tag, or null when none exists. */
export function pickLatestPrereleaseTag(tags: GitTagEntry[]): GitTagEntry | null {
  const pre = tags.filter((tag) => isPrereleaseTag(tag.name));
  if (pre.length === 0) return null;
  return pre.reduce((latest, tag) => {
    const latestDate = latest.creatordateUnix ?? 0;
    const tagDate = tag.creatordateUnix ?? 0;
    if (tagDate !== latestDate) return tagDate > latestDate ? tag : latest;
    return tag.name > latest.name ? tag : latest;
  });
}
