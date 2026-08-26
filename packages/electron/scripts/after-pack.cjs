const fs = require('node:fs');
const path = require('node:path');
const {
  createAppUpdateConfig,
  parseAppUpdateConfig,
  assertAppUpdateConfig,
  serializeAppUpdateConfig,
} = require('./app-update-config.cjs');

module.exports = (context) => {
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  if (context.electronPlatformName !== 'darwin') return;

  const appUpdateConfig = createAppUpdateConfig({
    publish: context.packager.config.publish,
    updaterCacheDirName: context.packager.appInfo.updaterCacheDirName,
  });
  const appUpdateContent = serializeAppUpdateConfig(appUpdateConfig);
  assertAppUpdateConfig(parseAppUpdateConfig(appUpdateContent), appUpdateConfig);
  fs.writeFileSync(path.join(resourcesPath, 'app-update.yml'), appUpdateContent);

  const sourceAssetsPath = path.join(__dirname, '..', 'resources', 'icons', 'Assets.car');

  if (!fs.existsSync(sourceAssetsPath)) {
    throw new Error(`Missing compiled app icon asset catalog at ${sourceAssetsPath}`);
  }

  fs.copyFileSync(sourceAssetsPath, path.join(resourcesPath, 'Assets.car'));
};
