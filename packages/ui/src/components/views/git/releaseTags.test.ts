import { describe, expect, test } from 'bun:test';
import { isPrereleaseTag, isStableReleaseTag, pickLatestPrereleaseTag, pickLatestStableTag } from './releaseTags';
import type { GitTagEntry } from '@/lib/api/types';

function tag(name: string, creatordateUnix: number): GitTagEntry {
  return { name, hash: 'a'.repeat(40), creatordateUnix, objectType: 'commit' };
}

describe('release tag classification', () => {
  test('stable versions are stable; suffixed ones are never stable', () => {
    expect(isStableReleaseTag('v1.21.0')).toBe(true);
    expect(isStableReleaseTag('1.21.0')).toBe(true);
    expect(isStableReleaseTag('v1.21.0-rc.1')).toBe(false);
    expect(isStableReleaseTag('v1.21.0-beta.2')).toBe(false);
    expect(isStableReleaseTag('nightly')).toBe(false);
    expect(isStableReleaseTag('v1')).toBe(false);
  });

  test('prerelease suffixes are recognized', () => {
    expect(isPrereleaseTag('v1.21.0-rc.1')).toBe(true);
    expect(isPrereleaseTag('v1.21.0-beta.2')).toBe(true);
    expect(isPrereleaseTag('v1.21.0-alpha')).toBe(true);
    expect(isPrereleaseTag('v1.21.0')).toBe(false);
  });
});

describe('pickLatestStableTag', () => {
  test('ignores prereleases so they cannot advance the stable-base semantics', () => {
    const tags = [
      tag('v1.20.0', 1_700_000_000),
      tag('v1.21.0-rc.1', 1_700_000_500),
    ];
    expect(pickLatestStableTag(tags)?.name).toBe('v1.20.0');
  });

  test('picks the newest stable by date', () => {
    const tags = [
      tag('v1.19.0', 1_690_000_000),
      tag('v1.20.0', 1_700_000_000),
      tag('not-a-version', 1_710_000_000),
    ];
    expect(pickLatestStableTag(tags)?.name).toBe('v1.20.0');
  });

  test('returns null when no stable tag exists (snapshot repo)', () => {
    expect(pickLatestStableTag([tag('v2.0.0-rc.1', 5)])).toBeNull();
    expect(pickLatestStableTag([])).toBeNull();
  });
});

describe('pickLatestPrereleaseTag', () => {
  test('returns the newest prerelease or null', () => {
    const tags = [tag('v1.21.0-beta.2', 10), tag('v1.21.0-rc.1', 20)];
    expect(pickLatestPrereleaseTag(tags)?.name).toBe('v1.21.0-rc.1');
    expect(pickLatestPrereleaseTag([tag('v1.20.0', 30)])).toBeNull();
  });
});
