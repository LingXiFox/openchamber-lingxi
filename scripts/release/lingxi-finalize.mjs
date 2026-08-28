#!/usr/bin/env node
import {
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
  writeYaml,
} from '../lingxi/common.mjs';
import {
  localArtifactRecords,
  releaseByTag,
  requireFormalRunSuccess,
  verifyCollectedState,
  verifyReleaseAssetsAgainstLocal,
} from './lifecycle-common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureOnIntegration(ctx);
  ensureState(ctx, 'ready');
  ensureClean(root);
  ensureExactRemote(root, ctx.integration);

  const { run } = requireFormalRunSuccess(ctx);
  const { dir } = verifyCollectedState(ctx, run);
  const release = releaseByTag(ctx);
  if (release.draft || !release.published_at) throw new Error(`Release ${ctx.tag} is not published yet.`);
  verifyReleaseAssetsAgainstLocal(ctx, release, dir);

  const artifacts = localArtifactRecords(dir);
  ctx.record.state = 'published';
  ctx.record.formal_release = {
    run_id: run.id,
    run_url: run.html_url,
    build_source_commit: run.head_sha,
    release_url: release.html_url,
    published_at: release.published_at,
    artifact_round_trip: 'PASS',
    final_inventory: 'PASS',
    artifacts,
  };
  ctx.record.artifacts = artifacts;
  writeYaml(ctx.recordPath, ctx.record);
  runReleaseHelper(root, ['check', '--record']);
  ensureOnlyPathsChanged(root, [    `.lingxi/releases/${ctx.version}.yml`]);

  git(root, ['add', `.lingxi/releases/${ctx.version}.yml`], { capture: false });
  git(root, ['commit', '-m', `release: record published LingXiFox ${ctx.version}`], { capture: false });
  git(root, ['push', 'origin', ctx.integration], { capture: false });

  console.log('LINGXI_FINALIZE=PASS');
  console.log(`Version: ${ctx.version}`);
  console.log('State:   published');
  console.log(`Release: ${release.html_url}`);
  console.log('Lifecycle closed. Start the next version with: bun run release:lingxi:new X.Y.Z');
});
