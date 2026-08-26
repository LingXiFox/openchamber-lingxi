const KEYS = ['provider', 'owner', 'repo', 'updaterCacheDirName'];

const readPublishConfig = (publish) => {
  const config = Array.isArray(publish) ? publish[0] : publish;
  if (!config || Array.isArray(config)) {
    throw new Error('Electron build.publish must define an update provider');
  }
  return config;
};

const createAppUpdateConfig = ({ publish, updaterCacheDirName }) => {
  const config = readPublishConfig(publish);
  const result = {
    provider: config.provider,
    owner: config.owner,
    repo: config.repo,
    updaterCacheDirName,
  };
  for (const key of KEYS) {
    if (!result[key] || String(result[key]) !== result[key] || /[\r\n]/.test(result[key])) {
      throw new Error(`Invalid app-update.yml ${key}`);
    }
  }
  return result;
};

const yamlScalar = (value) => (
  /^[A-Za-z0-9._/-]+$/.test(value) ? value : `'${value.replaceAll("'", "''")}'`
);

const serializeAppUpdateConfig = (config) => (
  `${KEYS.map((key) => `${key}: ${yamlScalar(config[key])}`).join('\n')}\n`
);

const parseYamlScalar = (value) => {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  return value;
};

const parseAppUpdateConfig = (content) => {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s+(.+)$/);
    if (!match || !KEYS.includes(match[1]) || result[match[1]] !== undefined) {
      throw new Error(`Unexpected app-update.yml line: ${line}`);
    }
    result[match[1]] = parseYamlScalar(match[2]);
  }
  return createAppUpdateConfig({
    publish: result,
    updaterCacheDirName: result.updaterCacheDirName,
  });
};

const assertAppUpdateConfig = (actual, expected) => {
  for (const key of KEYS) {
    if (actual[key] !== expected[key]) {
      throw new Error(`app-update.yml ${key} mismatch: expected ${expected[key]}, got ${actual[key]}`);
    }
  }
};

module.exports = {
  assertAppUpdateConfig,
  createAppUpdateConfig,
  parseAppUpdateConfig,
  serializeAppUpdateConfig,
};
