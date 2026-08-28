#!/usr/bin/env node
import {
  confirmExact,
  ensureClean,
  ensureExactRemote,
  ensureOnIntegration,
  ensureOnlyPathsChanged,
  ensureState,
  git,
  lifecycleContext,
  mainGuard,
  remoteTagCommit,
  repoRoot,
  runReleaseHelper,
  writeYaml,
} from '../lingxi/common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureOnIntegration(ctx);
  ensureState(ctx, 'ready');
  ensureClean(root);
  ensureExactRemote(root, ctx.integration);

  if (remoteTagCommit(root, ctx.tag)) {
    throw new Error(`Cannot unfreeze: immutable formal tag already exists on origin: ${ctx.tag}`);
  }

  await confirmExact(`Return LingXiFox ${ctx.version} from ready to development?`, `unfreeze ${ctx.version}`);
  ctx.record.state = 'development';
  delete ctx.record.freeze;
  writeYaml(ctx.recordPath, ctx.record);
  runReleaseHelper(root, ['check', '--record']);
  ensureOnlyPathsChanged(root, [    `.lingxi/releases/${ctx.version}.yml`]);

  git(root, ['add', `.lingxi/releases/${ctx.version}.yml`], { capture: false });
  git(root, ['commit', '-m', `release: unfreeze LingXiFox ${ctx.version}`], { capture: false });
  git(root, ['push', 'origin', ctx.integration], { capture: false });

  console.log('LINGXI_UNFREEZE=PASS');
  console.log(`Version: ${ctx.version}`);
  console.log('State:   development');
});
