#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const electronDir = path.join(repoRoot, 'packages/electron');
const preferredHmrUiPort = Number(process.env.OPENCHAMBER_HMR_UI_PORT || '5173');
const preferredHmrApiPort = Number(process.env.OPENCHAMBER_HMR_API_PORT || '3901');
const sandboxRoot = path.join(repoRoot, '.dev-sandbox');
const sandboxBackupsRoot = path.join(repoRoot, '.dev-sandbox-backups');
const sandboxPidFile = path.join(sandboxRoot, 'launcher.pid');

const SANDBOX_ENV_ALLOWLIST = new Set([
  'OPENCHAMBER_ELECTRON_USE_BUNDLED_UI',
  'OPENCHAMBER_HMR_API_PORT',
  'OPENCHAMBER_HMR_UI_PORT',
  'OPENCHAMBER_STARTUP_PERF',
]);
const SANDBOX_SECRET_ENV_PATTERN = /(?:^|_)(?:API_?KEY|ACCESS_KEY(?:_ID)?|AUTH|CREDENTIALS?|MCP|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)(?:$|_)/i;
const SANDBOX_CREDENTIAL_ENV = new Set([
  'AWS_PROFILE',
  'AZURE_CONFIG_DIR',
  'DOCKER_CONFIG',
  'GH_CONFIG_DIR',
  'GIT_ASKPASS',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GPG_AGENT_INFO',
  'KUBECONFIG',
  'SSH_ASKPASS',
  'SSH_AUTH_SOCK',
]);

export function buildSandboxEnv(sourceEnv, root) {
  const home = path.join(root, 'home');
  const env = { ...sourceEnv };
  for (const key of Object.keys(env)) {
    if (
      SANDBOX_SECRET_ENV_PATTERN.test(key)
      || SANDBOX_CREDENTIAL_ENV.has(key)
      || ((key.startsWith('OPENCHAMBER_') || key.startsWith('OPENCODE_')) && !SANDBOX_ENV_ALLOWLIST.has(key))
    ) {
      delete env[key];
    }
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    TMPDIR: path.join(root, 'tmp'),
    TEMP: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'),
    OPENCHAMBER_SANDBOX_ROOT: root,
    OPENCHAMBER_DATA_DIR: path.join(home, '.config', 'openchamber'),
    OPENCHAMBER_DIST_DIR: path.join(repoRoot, 'packages', 'web', 'dist'),
    OPENCHAMBER_BUNDLED_OPENCODE_CLI_DIR: path.join(repoRoot, 'packages', 'electron', 'resources', 'opencode-cli'),
    OPENCHAMBER_MANAGED_PROCESS_REGISTRY: path.join(home, '.config', 'openchamber', 'managed-opencode'),
    OPENCHAMBER_OPENCODE_CWD: path.join(root, 'workspace'),
    OPENCODE_BINARY: path.join(repoRoot, 'packages', 'electron', 'resources', 'opencode-cli', process.platform === 'win32' ? 'opencode.exe' : 'opencode'),
    OPENCODE_CONFIG_DIR: path.join(home, '.config', 'opencode'),
  };
}

function prepareSandbox() {
  const env = buildSandboxEnv(process.env, sandboxRoot);
  for (const directory of [
    sandboxRoot,
    env.HOME,
    env.APPDATA,
    env.LOCALAPPDATA,
    env.XDG_CONFIG_HOME,
    env.XDG_DATA_HOME,
    env.XDG_CACHE_HOME,
    env.XDG_STATE_HOME,
    env.TMPDIR,
    env.OPENCHAMBER_DATA_DIR,
    env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY,
    env.OPENCHAMBER_OPENCODE_CWD,
    env.OPENCODE_CONFIG_DIR,
    path.join(sandboxRoot, 'electron', 'app-data'),
    path.join(sandboxRoot, 'electron', 'user-data'),
    path.join(sandboxRoot, 'electron', 'session-data'),
    path.join(sandboxRoot, 'electron', 'cache'),
    path.join(sandboxRoot, 'electron', 'logs'),
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  Object.assign(process.env, env);
  fs.writeFileSync(sandboxPidFile, `${process.pid}\n`, { mode: 0o600 });
  console.log('[electron:sandbox] runtime mode: development sandbox');
  console.log(`[electron:sandbox] root: ${sandboxRoot}`);
  console.log(`[electron:sandbox] userData: ${path.join(sandboxRoot, 'electron', 'user-data')}`);
  console.log(`[electron:sandbox] sessionData: ${path.join(sandboxRoot, 'electron', 'session-data')}`);
  console.log(`[electron:sandbox] cache: ${path.join(sandboxRoot, 'electron', 'cache')}`);
  console.log(`[electron:sandbox] OpenChamber data: ${env.OPENCHAMBER_DATA_DIR}`);
  console.log(`[electron:sandbox] managed OpenCode registry: ${env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY}`);
  console.log('[electron:sandbox] production isolation status: isolated');
}

function cleanSandbox() {
  if (!fs.existsSync(sandboxRoot)) {
    console.log('[electron:sandbox] no sandbox state to clean');
    return;
  }
  try {
    const pid = Number.parseInt(fs.readFileSync(sandboxPidFile, 'utf8').trim(), 10);
    if (Number.isInteger(pid) && pid > 0) {
      process.kill(pid, 0);
      throw new Error(`sandbox is still running under launcher pid ${pid}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ESRCH') throw error;
  }
  fs.mkdirSync(sandboxBackupsRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(sandboxBackupsRoot, stamp);
  fs.renameSync(sandboxRoot, backup);
  console.log(`[electron:sandbox] moved previous state to ${backup}`);
}

const quoteWindowsCommandArg = (value) => `"${String(value).replace(/"/g, '""')}"`;

function resolveWindowsCommand(command) {
  if (process.platform !== 'win32' || path.isAbsolute(command)) {
    return command;
  }

  const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    return command;
  }

  const candidates = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return candidates.find((entry) => /\.(exe|cmd|bat)$/i.test(entry)) || candidates[0] || command;
}

function spawnProcess(command, args, options = {}) {
  const resolvedCommand = resolveWindowsCommand(command);
  const isWindowsCommandScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand);
  const spawnCommand = isWindowsCommandScript ? (process.env.ComSpec || 'cmd.exe') : resolvedCommand;
  const spawnArgs = isWindowsCommandScript
    ? ['/d', '/s', '/c', ['call', quoteWindowsCommandArg(resolvedCommand), ...args.map(quoteWindowsCommandArg)].join(' ')]
    : args;

  return spawn(spawnCommand, spawnArgs, {
    cwd: repoRoot,
    env: { ...process.env, OPENCHAMBER_ELECTRON_DEV: '1' },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    windowsVerbatimArguments: isWindowsCommandScript,
    ...options,
  });
}

function ensureElectronInstalled() {
  // Electron's postinstall can silently fail to extract the binary under
  // Node 24 (see ensure-electron.mjs). Fail fast with a repair attempt
  // before wiring up the dev servers so the error is actionable.
  const result = spawnSync('node', [path.join(__dirname, 'ensure-electron.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      '[electron:dev] electron binary is missing or incomplete and could not be repaired. ' +
        'Run `bun run --cwd packages/electron ensure:electron` (or `bun install`) with a network connection.',
    );
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, OPENCHAMBER_ELECTRON_DEV: '1' },
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}`));
    });
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve();
    }, timeoutMs);

    child.once('exit', onExit);
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(preferredPort) {
  const start = Number.isFinite(preferredPort) && preferredPort > 0 ? preferredPort : 0;
  if (start === 0) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.once('listening', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolve(port));
      });
      server.listen(0, '127.0.0.1');
    });
  }

  for (let port = start; port < start + 50; port += 1) {
    if (await isPortAvailable(port)) {
      if (port !== start) {
        console.warn(`[electron:dev] port ${start} is unavailable, using ${port} instead.`);
      }
      return port;
    }
  }

  throw new Error(`No available port found near ${start}`);
}

function killWindowsProcessTree(pid) {
  if (!pid) return;
  try {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
  }
}

function signalChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
  }

  try {
    child.kill(signal);
  } catch {
  }
}

async function stopChildTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  signalChild(child, 'SIGINT');
  await waitForExit(child, 2500);

  if (process.platform === 'win32' && child.exitCode === null && child.signalCode === null) {
    killWindowsProcessTree(child.pid);
    await waitForExit(child, 1000);
  }

  if (child.exitCode === null && child.signalCode === null) {
    signalChild(child, 'SIGTERM');
    await waitForExit(child, 2500);
  }

  if (child.exitCode === null && child.signalCode === null) {
    signalChild(child, 'SIGKILL');
    await waitForExit(child, 1000);
  }
}

async function main() {
  const useSandbox = process.argv.includes('--sandbox');
  const webOnly = process.argv.includes('--web-only');
  const smokeDurationMs = Number.parseInt(process.argv.find((arg) => arg.startsWith('--smoke-duration-ms='))?.split('=')[1] || '', 10);
  if (process.argv.includes('--clean-sandbox')) {
    cleanSandbox();
    return;
  }
  if (useSandbox) prepareSandbox();

  const useBundledUi = process.env.OPENCHAMBER_ELECTRON_USE_BUNDLED_UI === '1';
  let devServer = null;
  let hmrApiPort = '';
  let hmrUiPort = '';

  ensureElectronInstalled();

  if (useBundledUi) {
    await runProcess('bun', ['run', '--cwd', 'packages/electron', 'build:web-assets']);
  } else {
    hmrApiPort = String(await findAvailablePort(preferredHmrApiPort));
    hmrUiPort = String(await findAvailablePort(preferredHmrUiPort));
    devServer = spawnProcess('node', ['./scripts/dev-web-hmr.mjs'], {
      env: {
        ...process.env,
        OPENCHAMBER_ELECTRON_DEV: '1',
        OPENCHAMBER_HMR_UI_PORT: hmrUiPort,
        OPENCHAMBER_HMR_API_PORT: hmrApiPort,
        OPENCHAMBER_DISABLE_PWA_DEV: '1',
      },
    });
  }

  const electronEnv = {
    ...process.env,
    OPENCHAMBER_ELECTRON_DEV: '1',
    OPENCHAMBER_HMR_UI_PORT: hmrUiPort,
    OPENCHAMBER_HMR_API_PORT: hmrApiPort,
    OPENCHAMBER_DISABLE_PWA_DEV: '1',
  };
  if (useBundledUi) electronEnv.OPENCHAMBER_ELECTRON_USE_BUNDLED_UI = '1';

  const electron = webOnly
    ? null
    : spawnProcess('npx', ['electron', './main.mjs'], {
        cwd: electronDir,
        env: electronEnv,
      });

  let cleaning = false;
  const teardown = async (code) => {
    if (cleaning) {
      return;
    }
    cleaning = true;

    await Promise.all([stopChildTree(electron), stopChildTree(devServer)]);
    if (useSandbox) {
      try { fs.rmSync(sandboxPidFile, { force: true }); } catch {}
    }
    process.exit(typeof code === 'number' ? code : 0);
  };

  const onChildExit = (label) => (code, signal) => {
    if (code !== 0 || signal) {
      console.warn(`[electron:dev] ${label} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}.`);
    }
    void teardown(code ?? 1);
  };

  devServer?.on('exit', onChildExit('dev server'));
  electron?.on('exit', onChildExit('electron'));
  devServer?.on('error', (error) => {
    console.error('[electron:dev] failed to start dev server:', error);
    void teardown(1);
  });
  electron?.on('error', (error) => {
    console.error('[electron:dev] failed to start electron:', error);
    void teardown(1);
  });

  for (const [signal, exitCode] of Object.entries({ SIGINT: 130, SIGTERM: 143, SIGQUIT: 131, SIGHUP: 129 })) {
    process.on(signal, () => {
      void teardown(exitCode);
    });
  }
  if (Number.isFinite(smokeDurationMs) && smokeDurationMs > 0) {
    setTimeout(() => void teardown(0), smokeDurationMs);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((error) => {
    console.error('[electron:dev] unexpected error:', error);
    process.exit(1);
  });
}
