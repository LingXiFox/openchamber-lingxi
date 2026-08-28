#!/usr/bin/env node
import fs from 'node:fs';

import {
  assertStableVersion,
  compareStableVersions,
  confirmExact,
  ensureClean,
  ensureExactRemote,
  ensureOnIntegration,
  ensureOnlyPathsChanged,
  ensureState,
  ensureVersionTree,
  git,
  integrationBranch,
  lifecycleContext,
  localBranchExists,
  mainGuard,
  readYaml,
  releaseRecordPath,
  releaseTag,
  remoteBranchExists,
  repoRoot,
  runReleaseHelper,
  writeYaml,
} from '../lingxi/common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const nextVersion = assertStableVersion(process.argv[2]);
  const current = lifecycleContext(root);
  ensureOnIntegration(current);
  ensureState(current, 'published');
  ensureClean(root);
  ensureExactRemote(root, current.integration);

  if (compareStableVersions(nextVersion, current.version) <= 0) {
    throw new Error(`New version must be greater than current version ${current.version}.`);
  }

  const nextIntegration = integrationBranch(nextVersion);
  if (localBranchExists(root, nextIntegration) || remoteBranchExists(root, nextIntegration)) {
    throw new Error(`Next integration branch already exists: ${nextIntegration}`);
  }
  const nextRecordPath = releaseRecordPath(root, nextVersion);
  if (fs.existsSync(nextRecordPath)) throw new Error(`Release record already exists: .lingxi/releases/${nextVersion}.yml`);

  await confirmExact(
    `Create a new LingXi lifecycle ${nextVersion} from ${current.integration}?`,
    nextVersion,
  );

  git(root, ['switch', '-c', nextIntegration], { capture: false });
  runReleaseHelper(root, ['prepare', nextVersion]);

  const previous = readYaml(current.recordPath);
  const nextRecord = {
    schema: 1,
    product: {
      name: previous.product.name,
      app_id: previous.product.app_id,
    },
    version: nextVersion,
    tag: releaseTag(nextVersion),
    state: 'development',
    upstream: structuredClone(previous.upstream),
    targets: structuredClone(previous.targets),
    signing: structuredClone(previous.signing),
  };
  writeYaml(nextRecordPath, nextRecord);
  runReleaseHelper(root, ['check', '--record']);
  ensureOnlyPathsChanged(root, [    'packages/electron/package.json', 'bun.lock', `.lingxi/releases/${nextVersion}.yml`]);

  git(root, ['add', 'packages/electron/package.json', 'bun.lock', `.lingxi/releases/${nextVersion}.yml`], { capture: false });
  git(root, ['commit', '-m', `release: begin LingXiFox ${nextVersion} development`], { capture: false });
  git(root, ['push', '-u', 'origin', nextIntegration], { capture: false });
  ensureVersionTree(root, nextVersion, nextIntegration);

  console.log('LINGXI_NEW=PASS');
  console.log(`Version:     ${nextVersion}`);
  console.log(`Integration: ${nextIntegration}`);
  console.log(`Record:      .lingxi/releases/${nextVersion}.yml`);
  console.log('State:       development');
});
