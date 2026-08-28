#!/usr/bin/env node
import {
  assertPatchBranchName,
  branchNode,
  ensureClean,
  ensureState,
  fetchOrigin,
  lifecycleContext,
  localBranchExists,
  mainGuard,
  remoteBranchExists,
  repoRoot,
  setBranchNode,
  git,
} from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const name = assertPatchBranchName(process.argv[2]);
  const ctx = lifecycleContext(root);
  ensureState(ctx, 'development');
  ensureClean(root);

  if (ctx.branch === ctx.integration) {
    throw new Error(`patch:branch starts from a managed patch branch. Use patch:create to branch from ${ctx.integration}.`);
  }
  const parentNode = branchNode(root, ctx.version, ctx.branch);
  if (!parentNode || parentNode.state !== 'active') {
    throw new Error(`Current branch is not an active LingXi patch branch: ${ctx.branch}`);
  }
  fetchOrigin(root);
  if (localBranchExists(root, name) || remoteBranchExists(root, name)) {
    throw new Error(`Branch already exists: ${name}`);
  }

  git(root, ['switch', '-c', name], { capture: false });
  setBranchNode(root, ctx.version, ctx.integration, name, {
    parent: ctx.branch,
    version: ctx.version,
    state: 'active',
    created_at: new Date().toISOString(),
  });

  console.log('PATCH_BRANCH=PASS');
  console.log(`Parent: ${ctx.branch}`);
  console.log(`Branch: ${name}`);
});
