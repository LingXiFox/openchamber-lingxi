#!/usr/bin/env node
import { lifecycleContext, mainGuard, renderBranchTree, repoRoot } from './common.mjs';

await mainGuard(async () => {
  const mode = process.argv[2];
  if (!['current', 'all'].includes(mode)) {
    throw new Error('Usage: bun run patch:show <current|all>');
  }
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  if (mode === 'current') {
    console.log(ctx.branch);
    return;
  }
  console.log(renderBranchTree(root, ctx));
});
