#!/usr/bin/env node
import {
  confirmExact,
  ensureGh,
  gh,
  lifecycleContext,
  mainGuard,
  repoRoot,
  repositorySlug,
} from '../lingxi/common.mjs';
import {
  releaseByTag,
  requireFormalRunSuccess,
  verifyCollectedState,
  verifyReleaseAssetsAgainstLocal,
} from './lifecycle-common.mjs';

await mainGuard(async () => {
  const ctx = lifecycleContext(repoRoot());
  const { run } = requireFormalRunSuccess(ctx);
  const { dir } = verifyCollectedState(ctx, run);
  ensureGh(ctx.root);
  const repo = repositorySlug(ctx.root);
  const release = releaseByTag(ctx);
  if (!release.draft) throw new Error(`Release ${ctx.tag} is already published (or is not a Draft).`);
  verifyReleaseAssetsAgainstLocal(ctx, release, dir);

  console.log(`Draft:   ${release.html_url}`);
  console.log(`Assets:  ${(release.assets ?? []).length}`);
  console.log('Checks:  local SHA256 + GitHub asset inventory/size PASS');
  await confirmExact('Publish this GitHub Draft Release? This is the final public release action.', `publish ${ctx.tag}`);

  gh(ctx.root, ['release', 'edit', ctx.tag, '--repo', repo, '--draft=false'], { capture: false });
  const published = releaseByTag(ctx);
  if (published.draft || !published.published_at) throw new Error('GitHub Release did not transition to published state.');

  console.log('LINGXI_PUBLISH=PASS');
  console.log(`Release:      ${published.html_url}`);
  console.log(`Published at: ${published.published_at}`);
  console.log('Next:         bun run release:lingxi:finalize');
});
