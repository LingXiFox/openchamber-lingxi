#!/usr/bin/env node
import {
  commitSha,
  confirmExact,
  ensureClean,
  ensureExactRemote,
  ensureOnIntegration,
  ensureOnlyPathsChanged,
  ensureState,
  git,
  lifecycleContext,
  mainGuard,
  repoRoot,
  runReleaseHelper,
  versionTree,
  writeYaml,
} from '../lingxi/common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureOnIntegration(ctx);
  ensureState(ctx, 'development');
  ensureClean(root);
  const sourceCommit = ensureExactRemote(root, ctx.integration);

  const tree = versionTree(root, ctx.version, ctx.integration);
  const active = Object.entries(tree.nodes ?? {}).filter(([, node]) => node.state === 'active').map(([name]) => name);
  if (active.length) {
    throw new Error(`Cannot freeze while active patch branches remain:\n- ${active.join('\n- ')}`);
  }

  runReleaseHelper(root, ['check', '--record']);
  runReleaseHelper(root, ['secret-gate', 'LingXiFox/openchamber-lingxi']);

  await confirmExact(`Freeze LingXiFox ${ctx.version} for formal release?`, `freeze ${ctx.version}`);

  ctx.record.state = 'ready';
  ctx.record.freeze = {
    source_commit: sourceCommit,
    frozen_at: new Date().toISOString(),
  };
  writeYaml(ctx.recordPath, ctx.record);
  runReleaseHelper(root, ['check', '--record']);
  ensureOnlyPathsChanged(root, [    `.lingxi/releases/${ctx.version}.yml`]);

  git(root, ['add', `.lingxi/releases/${ctx.version}.yml`], { capture: false });
  git(root, ['commit', '-m', `release: freeze LingXiFox ${ctx.version}`], { capture: false });
  git(root, ['push', 'origin', ctx.integration], { capture: false });

  console.log('LINGXI_FREEZE=PASS');
  console.log(`Version:       ${ctx.version}`);
  console.log(`Frozen source: ${sourceCommit}`);
  console.log(`Ready commit:  ${commitSha(root)}`);
  console.log(`Next:          bun run release:lingxi:tag`);
});
