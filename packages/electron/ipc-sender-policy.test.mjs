import assert from 'node:assert/strict';
import test from 'node:test';
import { isLocalIpcSenderUrl } from './ipc-sender-policy.mjs';

const policy = {
  uiProtocol: 'openchamber-ui',
  isDev: false,
  hmrUiPort: '5173',
  localOrigin: 'http://127.0.0.1:3901',
  sidecarUrl: null,
};

test('treats the packaged bundled UI as a local Sub2API quota IPC sender', () => {
  assert.equal(isLocalIpcSenderUrl({
    ...policy,
    rawUrl: 'openchamber-ui://app/index.html',
  }), true);
});

test('rejects a remote Sub2API quota IPC sender', () => {
  assert.equal(isLocalIpcSenderUrl({
    ...policy,
    rawUrl: 'https://official.openchamber.dev/',
  }), false);
});
