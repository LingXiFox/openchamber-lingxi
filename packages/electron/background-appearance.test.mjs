import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BACKGROUND_APPEARANCE,
  detectBackgroundImageType,
  isBackgroundAssetId,
  normalizeBackgroundScope,
  readBackgroundAppearance,
  writeBackgroundAppearance,
} from './background-appearance.mjs';

test('keeps background appearance isolated by runtime and directory', () => {
  const root = {};
  writeBackgroundAppearance(root, { runtimeKey: 'local', directory: 'C:\\repo\\one\\' }, {
    panelOpacity: 0.5,
    readability: 'strong',
    blur: true,
  });

  assert.deepEqual(readBackgroundAppearance(root, { runtimeKey: 'local', directory: 'C:/repo/one' }), {
    ...DEFAULT_BACKGROUND_APPEARANCE,
    panelOpacity: 0.7,
    readability: 'strong',
    blur: true,
  });
  assert.deepEqual(
    readBackgroundAppearance(root, { runtimeKey: 'url:https://example.com', directory: 'C:/repo/one' }),
    DEFAULT_BACKGROUND_APPEARANCE,
  );
  assert.throws(() => normalizeBackgroundScope({ runtimeKey: 'local', directory: '' }));
});

test('detects only supported image bytes', () => {
  assert.deepEqual(detectBackgroundImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])), {
    extension: 'jpg',
    mime: 'image/jpeg',
  });
  assert.deepEqual(detectBackgroundImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), {
    extension: 'png',
    mime: 'image/png',
  });
  assert.equal(detectBackgroundImageType(Buffer.from('not an image')), null);
  assert.equal(isBackgroundAssetId('12345678-1234-4123-8123-123456789abc.webp'), true);
  assert.equal(isBackgroundAssetId('../background.png'), false);
});
