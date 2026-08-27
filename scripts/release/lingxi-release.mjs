#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptRoot, '../..');
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const releasePaths = ['package.json', 'bun.lock', 'packages/ui', 'packages/web', 'packages/vscode', 'packages/electron', 'scripts'];

const platforms = {
  windows: { manifest: 'latest.yml', extensions: ['.exe'], blockmaps: true },
  linux: { manifest: 'latest-linux.yml', extensions: ['.AppImage'], blockmaps: false },
  macos: { manifest: 'latest-mac.yml', extensions: ['.dmg', '.zip'], blockmaps: true },
};

const targetPlatforms = {
  'windows-x64': 'windows',
  'linux-x64': 'linux',
  'macos-arm64': 'macos',
};

const secretPatterns = {
  'Google OAuth Client ID': /[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com/g,
  'Google OAuth Client Secret': /GOCSPX-[A-Za-z0-9_-]+/g,
  'Google API Key': /AIza[A-Za-z0-9_-]{35}/g,
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);

export const assertVersion = (version) => {
  if (!versionPattern.test(version)) throw new Error(`Invalid release version: ${version}`);
  return version;
};

const readElectronLockVersion = (root) => {
  const lock = fs.readFileSync(path.join(root, 'bun.lock'), 'utf8');
  const workspace = lock.match(/^    "packages\/electron": \{([\s\S]*?)^    \},$/m)?.[1];
  const version = workspace?.match(/^      "version": "([^"]+)",$/m)?.[1];
  if (!version) throw new Error('bun.lock has no packages/electron workspace version');
  return version;
};

const assertExactTargets = (actual, expected, label) => {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} targets must be exactly ${expected.join(', ')}`);
  }
};

export const checkRepository = (root = defaultRoot, { tag, requireRecord = false } = {}) => {
  const rootPackage = readJson(path.join(root, 'package.json'));
  const electron = readJson(path.join(root, 'packages/electron/package.json'));
  const version = assertVersion(electron.version);
  const sdkVersion = rootPackage.dependencies?.['@opencode-ai/sdk'];

  if (!versionPattern.test(sdkVersion || '')) throw new Error('@opencode-ai/sdk must use an exact version');
  if (electron.build?.appId !== 'com.lingxifox.openchamber') throw new Error('Unexpected Electron appId');
  if (electron.build?.productName !== 'OpenChamber LingXiFox') throw new Error('Unexpected Electron productName');
  if (electron.build?.publish?.provider !== 'github' || electron.build.publish.owner !== 'LingXiFox' || electron.build.publish.repo !== 'openchamber-lingxi') {
    throw new Error('Unexpected Electron updater repository');
  }
  assertExactTargets(electron.build?.mac?.target, ['dmg', 'zip'], 'macOS');
  assertExactTargets(electron.build?.win?.target, ['nsis'], 'Windows');
  assertExactTargets(electron.build?.linux?.target, ['AppImage'], 'Linux');

  const lockVersion = readElectronLockVersion(root);
  if (lockVersion !== version) throw new Error(`bun.lock Electron version mismatch: expected ${version}, got ${lockVersion}`);
  if (tag && tag !== `lingxi-v${version}`) throw new Error(`Release tag must be lingxi-v${version}, got ${tag}`);

  if (requireRecord) {
    const recordPath = path.join(root, `.lingxi/releases/${version}.yml`);
    if (!fs.existsSync(recordPath)) throw new Error(`Missing release record: .lingxi/releases/${version}.yml`);
    const record = YAML.parse(fs.readFileSync(recordPath, 'utf8'));
    if (record?.version !== version || record?.tag !== `lingxi-v${version}`) throw new Error(`Release record does not describe ${version}`);
    if (record?.product?.name !== 'OpenChamber LingXiFox' || record?.product?.app_id !== 'com.lingxifox.openchamber') {
      throw new Error('Release record product identity mismatch');
    }
    if (tag && !['ready', 'published'].includes(record?.state)) {
      throw new Error(`Release record state must be ready or published before tagging, got ${record?.state || '(missing)'}`);
    }
  }

  return { version, tag: `lingxi-v${version}`, sdkVersion };
};

export const prepareRepository = (root, version) => {
  assertVersion(version);
  const packagePath = path.join(root, 'packages/electron/package.json');
  const electron = readJson(packagePath);
  electron.version = version;
  writeJson(packagePath, electron);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
};

const runCapture = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}: ${result.stderr.toString().trim()}`);
  return result.stdout;
};

export const verifyParity = (root, legacy, canonical) => {
  run('git', ['diff', '--quiet', legacy, canonical, '--', ...releasePaths], { cwd: root });
};

const checksum = (algorithm, filePath, encoding) => crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest(encoding);
const fingerprint = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

const locationKey = ({ path: sourcePath, first_introduced_commit: commit }) => `${sourcePath}\0${commit}`;

export const evaluateSecretAlerts = (baselineAlerts, alerts) => {
  const baseline = new Map(baselineAlerts.map((entry) => [`${entry.secret_type}\0${entry.fingerprint}`, entry]));
  if (baseline.size !== baselineAlerts.length) throw new Error('Secret baseline contains duplicate fingerprints');
  const inherited = [];
  const unreviewed = [];

  for (const alert of alerts) {
    const entry = baseline.get(`${alert.secret_type}\0${fingerprint(alert.secret)}`);
    const expected = new Set(entry?.locations.map(locationKey) ?? []);
    const actual = new Set(alert.locations.map(locationKey));
    if (!entry || expected.size !== actual.size || [...actual].some((location) => !expected.has(location))) {
      unreviewed.push(alert);
      continue;
    }
    inherited.push(alert);
  }

  return { inherited, unreviewed };
};

const verifySecretBaseline = (root, baseline) => {
  if (baseline?.schema_version !== 1 || baseline?.classification !== 'KNOWN_UPSTREAM_SECRET_SCANNING_BASELINE') {
    throw new Error('Unsupported upstream secret baseline');
  }
  if (!/^[0-9a-f]{40}$/.test(baseline?.upstream?.commit ?? '')) throw new Error('Secret baseline requires an exact upstream commit');
  if (!Array.isArray(baseline.sources) || !Array.isArray(baseline.alerts)) throw new Error('Secret baseline sources and alerts are required');

  const sources = new Map();
  for (const source of baseline.sources) {
    const sourcePath = path.resolve(root, source.path);
    if (!sourcePath.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe secret baseline path: ${source.path}`);
    const current = fs.readFileSync(sourcePath);
    const upstream = runCapture('git', ['show', `${baseline.upstream.commit}:${source.path}`], { cwd: root, encoding: null });
    if (fingerprint(current) !== `sha256:${source.file_sha256}` || !current.equals(upstream)) {
      throw new Error(`Secret baseline source no longer matches upstream: ${source.path}`);
    }
    sources.set(source.path, current);
  }

  for (const alert of baseline.alerts) {
    const pattern = secretPatterns[alert.secret_type];
    if (!pattern || !/^sha256:[0-9a-f]{64}$/.test(alert.fingerprint)) throw new Error(`Unsupported secret baseline entry: ${alert.secret_type}`);
    for (const location of alert.locations) {
      const source = sources.get(location.path);
      if (!source) throw new Error(`Secret baseline location has no source record: ${location.path}`);
      const matches = source.toString('utf8').match(pattern) ?? [];
      if (!matches.some((value) => fingerprint(value) === alert.fingerprint)) {
        throw new Error(`Secret baseline fingerprint mismatch: ${location.path}`);
      }
      runCapture('git', ['merge-base', '--is-ancestor', location.first_introduced_commit, baseline.upstream.commit], { cwd: root });
    }
  }
};

const collectOpenSecretAlerts = (repository) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error(`Invalid GitHub repository: ${repository}`);
  const pages = JSON.parse(runCapture('gh', [
    'api', '--method', 'GET', '--paginate', '--slurp',
    `repos/${repository}/secret-scanning/alerts`,
    '-f', 'state=open', '-f', 'per_page=100', '-F', 'hide_secret=false',
  ]));

  return pages.flat().map((alert) => {
    if (!alert.secret) throw new Error(`GitHub did not return alert ${alert.number} fingerprint material`);
    const locationPages = JSON.parse(runCapture('gh', [
      'api', '--paginate', '--slurp',
      `repos/${repository}/secret-scanning/alerts/${alert.number}/locations`,
    ]));
    return {
      number: alert.number,
      secret_type: alert.secret_type_display_name,
      secret: alert.secret,
      locations: locationPages.flat().map(({ details }) => ({
        path: details.path,
        first_introduced_commit: details.commit_sha,
      })),
    };
  });
};

const runSecretGate = (root, repository) => {
  const baseline = readJson(path.join(root, '.lingxi/security/upstream-secret-baseline.json'));
  verifySecretBaseline(root, baseline);
  const alerts = collectOpenSecretAlerts(repository || baseline.release_repository);
  const { inherited, unreviewed } = evaluateSecretAlerts(baseline.alerts, alerts);
  console.log(`UPSTREAM_BASELINE_ALERTS=${inherited.length}`);
  console.log(`NEW_LINGXI_SECRET_ALERTS=${unreviewed.length}`);
  console.log(`PRIVATE_CREDENTIAL_LEAKS=${unreviewed.length}`);
  console.log(`SECRET_SCAN_RELEASE_GATE=${unreviewed.length === 0 ? 'PASS' : 'FAIL'}`);
  if (unreviewed.length !== 0) throw new Error('Unreviewed GitHub Secret Scanning alerts block release');
};

const artifactName = (url) => {
  const rawUrl = `${url ?? ''}`;
  if (!rawUrl || rawUrl.includes('\\')) throw new Error(`Unsafe artifact URL: ${rawUrl || '(missing)'}`);
  const name = decodeURIComponent(path.posix.basename(rawUrl));
  if (!name || name === '.' || name === '..' || /[\/\\\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`Unsafe artifact URL: ${rawUrl}`);
  }
  return name;
};

const manifestEntries = (manifest, config, version) => {
  if (manifest?.version !== version) throw new Error(`Manifest version mismatch: expected ${version}, got ${manifest?.version || '(missing)'}`);
  if (!Array.isArray(manifest.files)) throw new Error('Manifest has no files list');
  const files = manifest.files.map((entry) => ({ entry, name: artifactName(entry?.url) }));
  return config.extensions.map((extension) => {
    const matches = files.filter(({ name }) => name.endsWith(extension));
    if (matches.length !== 1) throw new Error(`Expected one ${extension} manifest entry, got ${matches.length}`);
    return { ...matches[0], extension };
  });
};

const sourceArtifact = (dist, canonicalName, extension) => {
  const exact = path.join(dist, canonicalName);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(dist).filter((name) => name.endsWith(extension) && fs.statSync(path.join(dist, name)).isFile());
  if (matches.length !== 1) throw new Error(`Expected one ${extension} artifact in ${dist}, found ${matches.length}`);
  return path.join(dist, matches[0]);
};

export const stageArtifacts = ({ platform, dist, output, version }) => {
  const config = platforms[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);
  assertVersion(version);
  fs.mkdirSync(output, { recursive: true });
  if (fs.readdirSync(output).length !== 0) throw new Error(`Staging directory must be empty: ${output}`);

  const manifestPath = path.join(dist, config.manifest);
  const manifest = YAML.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = manifestEntries(manifest, config, version);
  const staged = [];

  for (const { entry, name: canonicalName, extension } of entries) {
    const source = sourceArtifact(dist, canonicalName, extension);
    const bytes = fs.statSync(source).size;
    if (entry.size !== bytes) throw new Error(`Manifest size mismatch for ${canonicalName}: expected ${entry.size}, got ${bytes}`);
    if (entry.sha512 !== checksum('sha512', source, 'base64')) throw new Error(`Manifest SHA-512 mismatch for ${canonicalName}`);
    fs.copyFileSync(source, path.join(output, canonicalName));
    staged.push(canonicalName);

    if (config.blockmaps) {
      const blockmap = `${source}.blockmap`;
      if (!fs.existsSync(blockmap)) throw new Error(`Missing blockmap: ${blockmap}`);
      if (Number.isSafeInteger(entry.blockMapSize) && fs.statSync(blockmap).size !== entry.blockMapSize) {
        throw new Error(`Manifest blockmap size mismatch for ${canonicalName}`);
      }
      fs.copyFileSync(blockmap, path.join(output, `${canonicalName}.blockmap`));
      staged.push(`${canonicalName}.blockmap`);
    }
  }

  fs.copyFileSync(manifestPath, path.join(output, config.manifest));
  staged.push(config.manifest);
  return staged;
};

const parseTargets = (value) => {
  const targets = value.split(',').map((target) => target.trim()).filter(Boolean);
  if (targets.length === 0 || new Set(targets).size !== targets.length) throw new Error('Release targets must be a non-empty list without duplicates');
  for (const target of targets) {
    if (!targetPlatforms[target]) throw new Error(`Unsupported release target: ${target}`);
  }
  return targets;
};

const verifiedPlatformFiles = ({ platform, directory, version }) => {
  const config = platforms[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);
  const manifestPath = path.join(directory, config.manifest);
  const manifest = YAML.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = [config.manifest];

  for (const { entry, name } of manifestEntries(manifest, config, version)) {
    const artifactPath = path.join(directory, name);
    if (!fs.existsSync(artifactPath)) throw new Error(`Missing release artifact: ${name}`);
    if (fs.statSync(artifactPath).size !== entry.size) throw new Error(`Release artifact size mismatch: ${name}`);
    if (checksum('sha512', artifactPath, 'base64') !== entry.sha512) throw new Error(`Release artifact SHA-512 mismatch: ${name}`);
    files.push(name);

    if (config.blockmaps) {
      const blockmapName = `${name}.blockmap`;
      const blockmapPath = path.join(directory, blockmapName);
      if (!fs.existsSync(blockmapPath)) throw new Error(`Missing release blockmap: ${blockmapName}`);
      if (Number.isSafeInteger(entry.blockMapSize) && fs.statSync(blockmapPath).size !== entry.blockMapSize) {
        throw new Error(`Release blockmap size mismatch: ${blockmapName}`);
      }
      files.push(blockmapName);
    }
  }

  return files;
};

export const artifactDigest = ({ platform, directory, version }) => {
  const digest = crypto.createHash('sha256');
  for (const name of verifiedPlatformFiles({ platform, directory, version }).sort()) {
    digest.update(`${checksum('sha256', path.join(directory, name), 'hex')}  ${name}\n`);
  }
  return digest.digest('hex');
};

export const verifyInventory = ({ directory, targets: targetList, version }) => {
  const targets = parseTargets(targetList);
  const expected = new Set();

  for (const target of targets) {
    for (const name of verifiedPlatformFiles({ platform: targetPlatforms[target], directory, version })) expected.add(name);
  }

  const actual = fs.readdirSync(directory).filter((name) => name !== 'SHA256SUMS.txt').sort();
  const wanted = [...expected].sort();
  if (actual.join('\n') !== wanted.join('\n')) throw new Error(`Release inventory mismatch\nExpected: ${wanted.join(', ')}\nActual: ${actual.join(', ')}`);
  const lines = actual.map((name) => `${checksum('sha256', path.join(directory, name), 'hex')}  ${name}`);
  const checksumPath = path.join(directory, 'SHA256SUMS.txt');
  if (fs.existsSync(checksumPath)) throw new Error(`Refusing to overwrite existing checksums: ${checksumPath}`);
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, { flag: 'wx' });
  return [...actual, 'SHA256SUMS.txt'];
};

const argument = (args, name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const main = () => {
  const [command, ...args] = process.argv.slice(2);
  const root = process.env.LINGXI_REPO_ROOT ? path.resolve(process.env.LINGXI_REPO_ROOT) : defaultRoot;

  if (command === 'prepare') {
    const version = args[0];
    prepareRepository(root, version);
    run('bun', ['install', '--lockfile-only', '--ignore-scripts'], { cwd: root });
    const result = checkRepository(root);
    console.log(`Prepared ${result.tag}; review packages/electron/package.json and bun.lock.`);
    return;
  }
  if (command === 'check') {
    const result = checkRepository(root, { tag: argument(args, '--tag'), requireRecord: args.includes('--record') });
    console.log(`version=${result.version}`);
    console.log(`tag=${result.tag}`);
    return;
  }
  if (command === 'parity') {
    const [legacy, canonical] = args;
    if (!legacy || !canonical) throw new Error('Usage: lingxi-release.mjs parity <legacy-commit> <canonical-commit>');
    verifyParity(root, legacy, canonical);
    console.log('BUILD_RELEVANT_TREE_PARITY=PASS');
    return;
  }
  if (command === 'stage') {
    const [platform, dist, output, version] = args;
    if (!platform || !dist || !output || !version) throw new Error('Usage: lingxi-release.mjs stage <platform> <dist> <output> <version>');
    const files = stageArtifacts({ platform, dist: path.resolve(dist), output: path.resolve(output), version });
    console.log(`Staged ${files.join(', ')}`);
    return;
  }
  if (command === 'digest') {
    const [platform, directory, version] = args;
    if (!platform || !directory || !version) throw new Error('Usage: lingxi-release.mjs digest <platform> <directory> <version>');
    console.log(artifactDigest({ platform, directory: path.resolve(directory), version: assertVersion(version) }));
    return;
  }
  if (command === 'inventory') {
    const [directory, targets, version] = args;
    if (!directory || !targets || !version) throw new Error('Usage: lingxi-release.mjs inventory <directory> <targets> <version>');
    const files = verifyInventory({ directory: path.resolve(directory), targets, version: assertVersion(version) });
    console.log(`Verified ${files.length} release files.`);
    return;
  }
  if (command === 'secret-gate') {
    runSecretGate(root, args[0]);
    return;
  }
  throw new Error('Usage: lingxi-release.mjs <prepare|check|parity|stage|digest|inventory|secret-gate> ...');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
