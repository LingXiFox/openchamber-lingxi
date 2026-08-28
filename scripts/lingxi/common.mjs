import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';

import YAML from 'yaml';

const SEMVER_STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PATCH_BRANCH = /^(feat|fix|chore|refactor|perf|test|docs)\/[A-Za-z0-9._-][A-Za-z0-9._/-]*$/;

export const fail = (message) => {
  throw new Error(message);
};

export const run = (command, args = [], options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? (options.capture === false ? 'inherit' : 'pipe'),
    env: options.env ?? process.env,
  });

  if (result.error) {
    if (options.allowFailure) return result;
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const detail = stderr || stdout;
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}${detail ? `\n${detail}` : ''}`);
  }

  return result;
};

export const capture = (command, args = [], options = {}) => {
  const result = run(command, args, { ...options, capture: true });
  return `${result.stdout ?? ''}`.trim();
};

export const repoRoot = () => {
  const result = run('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), capture: true, allowFailure: true });
  if (result.status !== 0) fail('Not inside a Git repository.');
  return path.resolve(`${result.stdout}`.trim());
};

export const git = (root, args, options = {}) => run('git', args, { cwd: root, ...options });
export const gitCapture = (root, args, options = {}) => capture('git', args, { cwd: root, ...options });

export const gh = (root, args, options = {}) => run('gh', args, { cwd: root, ...options });
export const ghCapture = (root, args, options = {}) => capture('gh', args, { cwd: root, ...options });

export const ghJson = (root, args) => {
  const text = ghCapture(root, args);
  try {
    return JSON.parse(text || '{}');
  } catch {
    fail(`GitHub CLI returned invalid JSON for: gh ${args.join(' ')}`);
  }
};

export const ensureGh = (root) => {
  const result = gh(root, ['--version'], { allowFailure: true });
  if (result.status !== 0) fail('GitHub CLI (gh) is required for this command.');
};

export const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
export const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const readYaml = (filePath) => YAML.parse(fs.readFileSync(filePath, 'utf8'));
export const writeYaml = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(value, { lineWidth: 0 }));
};

export const electronPackagePath = (root) => path.join(root, 'packages/electron/package.json');
export const packageVersion = (root) => readJson(electronPackagePath(root)).version;
export const integrationBranch = (version) => `integration/openchamber-lingxi-${version}`;
export const releaseTag = (version) => `lingxi-v${version}`;
export const releaseRecordPath = (root, version) => path.join(root, `.lingxi/releases/${version}.yml`);

export const assertStableVersion = (version) => {
  if (!SEMVER_STABLE.test(version || '')) fail(`Expected stable semantic version X.Y.Z, got: ${version || '(missing)'}`);
  return version;
};

export const compareStableVersions = (a, b) => {
  const pa = assertStableVersion(a).split('.').map(Number);
  const pb = assertStableVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
};

export const assertPatchBranchName = (name) => {
  if (!PATCH_BRANCH.test(name || '') || name.includes('..') || name.endsWith('/') || name.includes('//')) {
    fail(`Invalid patch branch name: ${name || '(missing)'}\nAllowed prefixes: feat/, fix/, chore/, refactor/, perf/, test/, docs/`);
  }
  return name;
};

export const currentBranch = (root) => {
  const branch = gitCapture(root, ['branch', '--show-current']);
  if (!branch) fail('Detached HEAD is not supported by LingXi workflow commands.');
  return branch;
};

export const changedPaths = (root) => {
  const tracked = gitCapture(root, ['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean);
  const untracked = gitCapture(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
};

export const ensureOnlyPathsChanged = (root, allowed) => {
  const actual = changedPaths(root);
  const allow = new Set(allowed);
  const extra = actual.filter((name) => !allow.has(name));
  if (extra.length) fail(`Unexpected files changed during workflow operation:\n- ${extra.join('\n- ')}`);
  return actual;
};

export const isClean = (root) => gitCapture(root, ['status', '--porcelain=v1']) === '';
export const ensureClean = (root) => {
  if (!isClean(root)) fail('Working tree is not clean. Commit, stash, or discard changes before continuing.');
};

export const localBranchExists = (root, branch) => git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true }).status === 0;
export const remoteBranchExists = (root, branch) => git(root, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { allowFailure: true }).status === 0;
export const localTagExists = (root, tag) => git(root, ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], { allowFailure: true }).status === 0;

export const fetchOrigin = (root) => {
  git(root, ['fetch', '--prune', 'origin'], { capture: false });
};

export const commitSha = (root, ref = 'HEAD') => gitCapture(root, ['rev-parse', `${ref}^{commit}`]);

export const remoteTagCommit = (root, tag) => {
  const result = git(root, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { allowFailure: true });
  if (result.status !== 0) fail(`Unable to query remote tag: ${tag}`);
  const lines = `${result.stdout ?? ''}`.trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  const peeled = lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`));
  return (peeled ?? lines[0]).split(/\s+/)[0];
};

export const ensureIntegrationLocal = (root, branch) => {
  if (!remoteBranchExists(root, branch)) fail(`Remote integration branch does not exist: origin/${branch}`);
  if (!localBranchExists(root, branch)) {
    git(root, ['branch', '--track', branch, `origin/${branch}`], { capture: false });
  }
};

export const aheadBehind = (root, localRef, remoteRef) => {
  const text = gitCapture(root, ['rev-list', '--left-right', '--count', `${remoteRef}...${localRef}`]);
  const [behind, ahead] = text.split(/\s+/).map(Number);
  return { ahead, behind };
};

export const ensureExactRemote = (root, branch) => {
  fetchOrigin(root);
  ensureIntegrationLocal(root, branch);
  const local = commitSha(root, branch);
  const remote = commitSha(root, `origin/${branch}`);
  if (local !== remote) {
    const counts = aheadBehind(root, branch, `origin/${branch}`);
    fail(`${branch} is not identical to origin/${branch}. ahead=${counts.ahead} behind=${counts.behind}`);
  }
  return local;
};

export const ensureNotBehindRemote = (root, branch) => {
  fetchOrigin(root);
  if (!remoteBranchExists(root, branch)) return { ahead: null, behind: null, remote: false };
  const counts = aheadBehind(root, branch, `origin/${branch}`);
  if (counts.behind > 0) fail(`${branch} is behind origin/${branch} by ${counts.behind} commit(s). Update it before continuing.`);
  return { ...counts, remote: true };
};

export const lifecycleContext = (root = repoRoot()) => {
  const version = packageVersion(root);
  if (!version) fail('packages/electron/package.json has no version.');
  const recordPath = releaseRecordPath(root, version);
  if (!fs.existsSync(recordPath)) fail(`Missing release record: .lingxi/releases/${version}.yml`);
  const record = readYaml(recordPath);
  const integration = integrationBranch(version);
  const tag = releaseTag(version);
  const branch = currentBranch(root);

  if (record?.version !== version) fail(`Release record version mismatch: package=${version} record=${record?.version ?? '(missing)'}`);
  if (record?.tag !== tag) fail(`Release record tag mismatch: expected ${tag}, got ${record?.tag ?? '(missing)'}`);
  if (record?.product?.name !== 'OpenChamber LingXiFox' || record?.product?.app_id !== 'com.lingxifox.openchamber') {
    fail('Release record product identity mismatch.');
  }

  return { root, version, record, recordPath, integration, tag, branch };
};

export const ensureState = (ctx, ...states) => {
  if (!states.includes(ctx.record?.state)) {
    fail(`Release state must be ${states.join(' or ')}, got ${ctx.record?.state ?? '(missing)'}.`);
  }
};

export const ensureOnIntegration = (ctx) => {
  if (ctx.branch !== ctx.integration) fail(`This command must run on ${ctx.integration}; current branch is ${ctx.branch}.`);
};

export const repositorySlug = (root) => {
  const pkg = readJson(electronPackagePath(root));
  const raw = pkg?.build?.publish;
  const publish = Array.isArray(raw) ? raw.find((entry) => entry?.provider === 'github') : raw;
  if (publish?.provider !== 'github' || !publish?.owner || !publish?.repo) fail('Electron GitHub publish configuration is missing.');
  return `${publish.owner}/${publish.repo}`;
};

export const runReleaseHelper = (root, args, { inherit = true } = {}) => {
  const script = path.join(root, 'scripts/release/lingxi-release.mjs');
  if (!fs.existsSync(script)) fail('Missing scripts/release/lingxi-release.mjs.');
  const result = run('node', [script, ...args], { cwd: root, capture: !inherit, stdio: inherit ? 'inherit' : 'pipe' });
  return inherit ? '' : `${result.stdout ?? ''}`.trim();
};

export const gitDir = (root) => {
  const raw = gitCapture(root, ['rev-parse', '--git-dir']);
  return path.resolve(root, raw);
};

export const localLingxiDir = (root) => path.join(gitDir(root), 'lingxi');
export const branchTreePath = (root) => path.join(localLingxiDir(root), 'branch-tree.json');

export const readBranchTree = (root) => {
  const file = branchTreePath(root);
  if (!fs.existsSync(file)) return { schema: 1, versions: {} };
  const data = readJson(file);
  if (data?.schema !== 1 || typeof data?.versions !== 'object') fail(`Unsupported branch tree metadata: ${file}`);
  return data;
};

export const writeBranchTree = (root, data) => {
  writeJson(branchTreePath(root), data);
};

export const ensureVersionTree = (root, version, integration) => {
  const data = readBranchTree(root);
  data.versions[version] ??= { integration, nodes: {} };
  if (data.versions[version].integration !== integration) fail(`Branch tree integration mismatch for ${version}.`);
  data.versions[version].nodes ??= {};
  writeBranchTree(root, data);
  return data.versions[version];
};

export const versionTree = (root, version, integration) => {
  const data = readBranchTree(root);
  const tree = data.versions?.[version] ?? { integration, nodes: {} };
  if (tree.integration !== integration) fail(`Branch tree integration mismatch for ${version}.`);
  return tree;
};

export const setBranchNode = (root, version, integration, name, node) => {
  const data = readBranchTree(root);
  data.versions[version] ??= { integration, nodes: {} };
  data.versions[version].nodes[name] = node;
  writeBranchTree(root, data);
};

export const updateBranchNode = (root, version, name, patch) => {
  const data = readBranchTree(root);
  const tree = data.versions?.[version];
  const node = tree?.nodes?.[name];
  if (!node) fail(`Branch is not managed by LingXi metadata: ${name}`);
  tree.nodes[name] = { ...node, ...patch };
  writeBranchTree(root, data);
  return tree.nodes[name];
};

export const removeBranchNodes = (root, version, names) => {
  const data = readBranchTree(root);
  const tree = data.versions?.[version];
  if (!tree) return;
  for (const name of names) delete tree.nodes[name];
  writeBranchTree(root, data);
};

export const branchNode = (root, version, name) => versionTree(root, version, integrationBranch(version)).nodes?.[name] ?? null;

export const childNodes = (root, version, integration, parent, { activeOnly = false } = {}) => {
  const tree = versionTree(root, version, integration);
  return Object.entries(tree.nodes ?? {})
    .filter(([, node]) => node.parent === parent && (!activeOnly || node.state === 'active'))
    .sort((a, b) => `${a[1].created_at ?? ''}`.localeCompare(`${b[1].created_at ?? ''}`));
};

export const descendants = (root, version, integration, parent) => {
  const result = [];
  const walk = (name) => {
    for (const [child] of childNodes(root, version, integration, name)) {
      walk(child);
      result.push(child);
    }
  };
  walk(parent);
  return result;
};

const treeLabel = (name, node, current) => {
  const suffix = node?.state === 'merged' ? ' [merged]' : '';
  return `${name}${suffix}${name === current ? '  ← CURRENT' : ''}`;
};

export const renderBranchTree = (root, ctx) => {
  const tree = versionTree(root, ctx.version, ctx.integration);
  const lines = [treeLabel(ctx.integration, null, ctx.branch)];

  const renderChildren = (parent, prefix) => {
    const children = childNodes(root, ctx.version, ctx.integration, parent);
    children.forEach(([name, node], index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${treeLabel(name, node, ctx.branch)}`);
      renderChildren(name, `${prefix}${last ? '    ' : '│   '}`);
    });
  };

  renderChildren(ctx.integration, '');
  return lines.join('\n');
};

export const confirmExact = async (message, expected) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('This destructive/release action requires an interactive terminal.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message}\nType exactly: ${expected}\n> `)).trim();
    if (answer !== expected) fail('Confirmation did not match. No action was taken.');
  } finally {
    rl.close();
  }
};

export const confirmYes = async (message) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('This action requires an interactive terminal.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') fail('Cancelled. No action was taken.');
  } finally {
    rl.close();
  }
};

export const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

export const verifySha256Sums = (directory) => {
  const checksumPath = path.join(directory, 'SHA256SUMS.txt');
  if (!fs.existsSync(checksumPath)) fail(`Missing SHA256SUMS.txt in ${directory}`);
  const lines = fs.readFileSync(checksumPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) fail('SHA256SUMS.txt is empty.');

  const expectedNames = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) fail(`Invalid SHA256SUMS.txt line: ${line}`);
    const [, expected, name] = match;
    if (path.basename(name) !== name || name.includes('\0')) fail(`Unsafe artifact name in SHA256SUMS.txt: ${name}`);
    const filePath = path.join(directory, name);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail(`Missing checksummed artifact: ${name}`);
    const actual = sha256File(filePath);
    if (actual !== expected) fail(`SHA256 mismatch for ${name}: expected ${expected}, got ${actual}`);
    expectedNames.push(name);
  }

  const actualNames = fs.readdirSync(directory)
    .filter((name) => fs.statSync(path.join(directory, name)).isFile())
    .sort();
  const wantedNames = [...expectedNames, 'SHA256SUMS.txt'].sort();
  if (actualNames.join('\n') !== wantedNames.join('\n')) {
    fail(`Collected artifact inventory mismatch.\nExpected: ${wantedNames.join(', ')}\nActual: ${actualNames.join(', ')}`);
  }

  return expectedNames;
};

export const releaseLocalDir = (root, version) => path.join(localLingxiDir(root), 'releases', version);
export const assembledDir = (root, version) => path.join(releaseLocalDir(root, version), 'assembled');
export const releaseLocalStatePath = (root, version) => path.join(releaseLocalDir(root, version), 'state.json');

export const writeLocalReleaseState = (root, version, value) => writeJson(releaseLocalStatePath(root, version), value);
export const readLocalReleaseState = (root, version) => {
  const file = releaseLocalStatePath(root, version);
  return fs.existsSync(file) ? readJson(file) : null;
};

export const artifactFiles = (directory) => fs.readdirSync(directory)
  .filter((name) => fs.statSync(path.join(directory, name)).isFile())
  .sort();

export const mainGuard = async (fn) => {
  try {
    await fn();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};
