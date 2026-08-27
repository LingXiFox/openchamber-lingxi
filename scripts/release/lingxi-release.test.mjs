import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import YAML from 'yaml';

import { artifactDigest, assertVersion, checkRepository, prepareRepository, stageArtifacts, verifyInventory } from './lingxi-release.mjs';

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi-release-test-'));
  fs.mkdirSync(path.join(root, 'packages/electron'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lingxi/releases'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@opencode-ai/sdk': '1.18.23' } }));
  fs.writeFileSync(path.join(root, 'packages/electron/package.json'), JSON.stringify({
    version: '1.2.3',
    build: {
      appId: 'com.lingxifox.openchamber',
      productName: 'OpenChamber LingXiFox',
      publish: { provider: 'github', owner: 'LingXiFox', repo: 'openchamber-lingxi' },
      mac: { target: ['dmg', 'zip'] },
      win: { target: ['nsis'] },
      linux: { target: ['AppImage'] },
    },
  }));
  fs.writeFileSync(path.join(root, 'bun.lock'), '    "packages/electron": {\n      "version": "1.2.3",\n    },\n');
  fs.writeFileSync(path.join(root, '.lingxi/releases/1.2.3.yml'), YAML.stringify({
    version: '1.2.3',
    tag: 'lingxi-v1.2.3',
    state: 'ready',
    product: { name: 'OpenChamber LingXiFox', app_id: 'com.lingxifox.openchamber' },
  }));
  return root;
};

test('checks release identity, tag, lockfile, and record together', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(checkRepository(root, { tag: 'lingxi-v1.2.3', requireRecord: true }).version, '1.2.3');
  assert.throws(() => checkRepository(root, { tag: 'v1.2.3' }), /Release tag must be/);
  fs.writeFileSync(path.join(root, 'bun.lock'), '    "packages/electron": {\n      "version": "1.2.2",\n    },\n');
  assert.throws(() => checkRepository(root), /bun\.lock Electron version mismatch/);
});

test('prepare changes only the Electron product version', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rootBefore = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  prepareRepository(root, '2.0.0-rc.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'packages/electron/package.json'))).version, '2.0.0-rc.1');
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), rootBefore);
  assertVersion('2.0.0-rc.1');
  assert.throws(() => assertVersion('02.0.0'), /Invalid release version/);
});

test('stages manifest-named artifacts and verifies the final inventory', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi-stage-test-'));
  const dist = path.join(root, 'dist');
  const output = path.join(root, 'output');
  fs.mkdirSync(dist);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sourceName = 'OpenChamber LingXiFox-1.2.3-win-x64.exe';
  const canonicalName = 'OpenChamber-LingXiFox-1.2.3-win-x64.exe';
  const bytes = Buffer.from('installer');
  const blockmap = Buffer.from('blockmap');
  fs.writeFileSync(path.join(dist, sourceName), bytes);
  fs.writeFileSync(path.join(dist, `${sourceName}.blockmap`), blockmap);
  fs.writeFileSync(path.join(dist, 'latest.yml'), YAML.stringify({
    version: '1.2.3',
    files: [{
      url: canonicalName,
      sha512: crypto.createHash('sha512').update(bytes).digest('base64'),
      size: bytes.length,
      blockMapSize: blockmap.length,
    }],
  }));

  stageArtifacts({ platform: 'windows', dist, output, version: '1.2.3' });
  assert.deepEqual(fs.readdirSync(output).sort(), [canonicalName, `${canonicalName}.blockmap`, 'latest.yml'].sort());
  const uploadedDigest = artifactDigest({ platform: 'windows', directory: output, version: '1.2.3' });
  verifyInventory({ directory: output, targets: 'windows-x64', version: '1.2.3' });
  assert.match(fs.readFileSync(path.join(output, 'SHA256SUMS.txt'), 'utf8'), new RegExp(canonicalName));
  assert.equal(artifactDigest({ platform: 'windows', directory: output, version: '1.2.3' }), uploadedDigest);
  fs.writeFileSync(path.join(output, `${canonicalName}.blockmap`), Buffer.from('BLOCKMAP'));
  assert.notEqual(artifactDigest({ platform: 'windows', directory: output, version: '1.2.3' }), uploadedDigest);
  assert.throws(
    () => verifyInventory({ directory: output, targets: 'windows-x64', version: '1.2.3' }),
    /Refusing to overwrite existing checksums/,
  );
});

test('rejects encoded artifact paths before staging', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi-stage-path-test-'));
  const dist = path.join(root, 'dist');
  const output = path.join(root, 'output');
  fs.mkdirSync(dist);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dist, 'latest-linux.yml'), YAML.stringify({
    version: '1.2.3',
    files: [{ url: '..%2Fescape.AppImage', sha512: 'unused', size: 0 }],
  }));

  assert.throws(
    () => stageArtifacts({ platform: 'linux', dist, output, version: '1.2.3' }),
    /Unsafe artifact URL/,
  );
  assert.equal(fs.existsSync(path.join(root, 'escape.AppImage')), false);
});
