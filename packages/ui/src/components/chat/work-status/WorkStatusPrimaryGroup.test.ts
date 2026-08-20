import { describe, expect, test } from 'bun:test';
import { getWorkStatusPrRemoteName } from './workStatusPrRemote';

describe('getWorkStatusPrRemoteName', () => {
  test('uses the tracking remote instead of an upstream comparison', () => {
    const gitStatus = {
      tracking: 'origin/feature',
      upstreamComparison: { remote: 'upstream', branch: 'feature' },
    };

    expect(getWorkStatusPrRemoteName(gitStatus.tracking)).toBe('origin');
  });

  test('uses upstream when the branch tracks upstream', () => {
    expect(getWorkStatusPrRemoteName('upstream/feature')).toBe('upstream');
  });

  test('keeps remote discovery automatic without a tracking branch', () => {
    expect(getWorkStatusPrRemoteName(null)).toBeNull();
  });
});
