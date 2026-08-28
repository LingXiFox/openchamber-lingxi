#!/usr/bin/env node
import {
  assertPatchBranchName,
  currentBranch,
  ensureClean,
  ensureExactRemote,
  ensureIntegrationLocal,
  ensureState,
  fetchOrigin,
  git,
  lifecycleContext,
  localBranchExists,
  mainGuard,
  remoteBranchExists,
  repoRoot,
  setBranchNode,
} from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const name = assertPatchBranchName(process.argv[2]);
  const ctx = lifecycleContext(root);
  ensureState(ctx, 'development');
  ensureClean(root);

  fetchOrigin(root);
  if (localBranchExists(root, name) || remoteBranchExists(root, name)) {
    throw new Error(`Branch already exists: ${name}`);
  }

  ensureIntegrationLocal(root, ctx.integration);
  ensureExactRemote(root, ctx.integration);

  if (currentBranch(root) !== ctx.integration) {
    git(root, ['switch', ctx.integration], { capture: false });
  }
  git(root, ['switch', '-c', name], { capture: false });

  setBranchNode(root, ctx.version, ctx.integration, name, {
    parent: ctx.integration,
    version: ctx.version,
    state: 'active',
    created_at: new Date().toISOString(),
  });

  console.log('PATCH_CREATE=PASS');
  console.log(`Version: ${ctx.version}`);
  console.log(`Base:    ${ctx.integration}`);
  console.log(`Branch:  ${name}`);
});
