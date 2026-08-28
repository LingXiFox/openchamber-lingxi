#!/usr/bin/env node
import { branchNode, ensureClean, lifecycleContext, mainGuard, repoRoot, git } from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureClean(root);
  if (ctx.branch === ctx.integration) throw new Error(`Already at version root: ${ctx.integration}`);
  const node = branchNode(root, ctx.version, ctx.branch);
  if (!node?.parent) throw new Error(`Current branch is not managed by LingXi metadata: ${ctx.branch}`);
  git(root, ['switch', node.parent], { capture: false });
  console.log('PATCH_UP=PASS');
  console.log(`Current: ${node.parent}`);
});
