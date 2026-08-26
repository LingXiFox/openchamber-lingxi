#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_UPDATER_FEED } from '../updater-feed.mjs';

const require = createRequire(import.meta.url);
const {
  assertAppUpdateConfig,
  createAppUpdateConfig,
  parseAppUpdateConfig,
} = require('./app-update-config.cjs');

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

const electronBuilderEntry = require.resolve('electron-builder');
const appBuilderLibEntry = require.resolve('app-builder-lib', {
  paths: [path.dirname(electronBuilderEntry)],
});
const { sanitizeFileName } = require(require.resolve('builder-util/out/filename.js', {
  paths: [path.dirname(appBuilderLibEntry)],
}));

const expected = createAppUpdateConfig({
  publish: packageJson.build.publish,
  updaterCacheDirName: `${sanitizeFileName(packageJson.name).toLowerCase()}-updater`,
});

assertAppUpdateConfig(expected, {
  ...PRODUCTION_UPDATER_FEED,
  updaterCacheDirName: expected.updaterCacheDirName,
});

const artifactPath = path.resolve(process.argv[2] || '');
if (!process.argv[2]) {
  throw new Error('Usage: verify-app-update.mjs <path-to-app-or-zip>');
}

const relativeConfigPath = path.join('Contents', 'Resources', 'app-update.yml');
let content;
if (artifactPath.endsWith('.zip')) {
  const entry = `${packageJson.build.productName}.app/${relativeConfigPath}`;
  try {
    content = execFileSync('unzip', ['-p', artifactPath, entry], { encoding: 'utf8' });
  } catch {
    throw new Error(`Missing ${entry} in ${artifactPath}`);
  }
} else {
  const configPath = path.join(artifactPath, relativeConfigPath);
  if (!fs.existsSync(configPath)) throw new Error(`Missing ${configPath}`);
  content = fs.readFileSync(configPath, 'utf8');
}

assertAppUpdateConfig(parseAppUpdateConfig(content), expected);
console.log(`[electron] verified app-update.yml in ${artifactPath}`);
console.log(content.trim());
