import { afterAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deleteLegacyOpenCodeGoCredential, deleteQuotaCredential, readQuotaCredential, writeQuotaCredential } from './store.js';
import { writeManagedCredential } from './providers.js';

const previousDataDir = process.env.OPENCHAMBER_DATA_DIR;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-quota-store-'));
process.env.OPENCHAMBER_DATA_DIR = temporaryDirectory;

describe('quota credential store', () => {
  it('uses owner-only permissions and rejects arbitrary provider paths', () => {
    writeQuotaCredential('ollama-cloud', { cookie: 'secret' });
    expect(fs.statSync(path.join(temporaryDirectory, 'quota')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(temporaryDirectory, 'quota', 'ollama-cloud.json')).mode & 0o777).toBe(0o600);
    expect(readQuotaCredential('ollama-cloud', (value) => value)).toEqual({ cookie: 'secret' });
    expect(() => writeQuotaCredential('../escape', {})).toThrow('Unsupported credential provider');
    deleteQuotaCredential('ollama-cloud');
  });

  it('keeps Sub2API configuration read-only', () => {
    expect(() => writeManagedCredential('sub2api', {
      baseUrl: 'https://sub2api.example/',
      accessToken: 'panel-jwt',
    })).toThrow('Unsupported credential provider');
    writeQuotaCredential('sub2api', {
      accounts: { HappyCode: { baseUrl: 'https://sub2api.example/', accessToken: 'panel-jwt' } },
    });
    expect(fs.statSync(path.join(temporaryDirectory, 'quota', 'sub2api.json')).mode & 0o777).toBe(0o600);
    deleteQuotaCredential('sub2api');
  });

  it('removes the obsolete OpenCode Go credential without parsing it', () => {
    const legacyPath = path.join(temporaryDirectory, 'quota', 'opencode-go.json');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, '{not valid json', { mode: 0o600 });
    deleteLegacyOpenCodeGoCredential();
    expect(fs.existsSync(legacyPath)).toBe(false);
  });
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = previousDataDir;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});
