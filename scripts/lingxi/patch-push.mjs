#!/usr/bin/env node
import {
  branchNode,
  ensureClean,
  ensureNotBehindRemote,
  ensureState,
  fetchOrigin,
  git,
  lifecycleContext,
  mainGuard,
  remoteBranchExists,
  repoRoot,
} from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureState(ctx, 'development');
  ensureClean(root);
  if (ctx.branch !== ctx.integration) {
    const node = branchNode(root, ctx.version, ctx.branch);
    if (!node || node.state !== 'active') throw new Error(`Current branch is not an active LingXi patch branch: ${ctx.branch}`);
  }

  fetchOrigin(root);
  const remote = remoteBranchExists(root, ctx.branch);
  if (remote) {
    const counts = ensureNotBehindRemote(root, ctx.branch);
    if (counts.ahead === 0) {
      console.log('PATCH_PUSH=PASS');
      console.log('Remote already up to date.');
      return;
    }
    git(root, ['push', 'origin', ctx.branch], { capture: false });
  } else {
    git(root, ['push', '-u', 'origin', ctx.branch], { capture: false });
  }

  console.log('PATCH_PUSH=PASS');
  console.log(`Branch: origin/${ctx.branch}`);
});
