import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { buildSandboxEnv } from './electron-dev.mjs';

describe('buildSandboxEnv', () => {
  it('isolates runtime paths and removes inherited endpoints and credentials', () => {
    const root = path.resolve('/repo/.dev-sandbox');
    const env = buildSandboxEnv({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'secret',
      SSH_AUTH_SOCK: '/production/agent.sock',
      OPENCHAMBER_SERVER_URL: 'https://production.example',
      OPENCODE_CONFIG_CONTENT: '{"mcp":{}}',
      OPENCHAMBER_HMR_UI_PORT: '5179',
    }, root);

    expect(env.PATH).toBe('/usr/bin');
    expect(env.OPENCHAMBER_HMR_UI_PORT).toBe('5179');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.OPENCHAMBER_SERVER_URL).toBeUndefined();
    expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    expect(env.OPENCHAMBER_DIST_DIR).toEndWith(path.join('packages', 'web', 'dist'));
    expect(env.OPENCHAMBER_BUNDLED_OPENCODE_CLI_DIR).toEndWith(path.join('packages', 'electron', 'resources', 'opencode-cli'));
    expect(env.OPENCODE_BINARY).toContain(path.join('packages', 'electron', 'resources', 'opencode-cli', 'opencode'));

    for (const key of [
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
      'XDG_CACHE_HOME',
      'XDG_STATE_HOME',
      'TMPDIR',
      'TEMP',
      'TMP',
      'OPENCHAMBER_DATA_DIR',
      'OPENCHAMBER_MANAGED_PROCESS_REGISTRY',
      'OPENCHAMBER_OPENCODE_CWD',
      'OPENCODE_CONFIG_DIR',
    ]) {
      expect(path.relative(root, env[key]).startsWith('..')).toBe(false);
    }
  });
});
