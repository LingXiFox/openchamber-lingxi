#!/usr/bin/env node
import { childNodes, ensureClean, lifecycleContext, mainGuard, repoRoot, git } from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const target = process.argv[2];
  if (!target) throw new Error('Usage: bun run patch:down <child-branch>\nUse bun run patch:show all to inspect the tree.');
  const ctx = lifecycleContext(root);
  ensureClean(root);
  const children = childNodes(root, ctx.version, ctx.integration, ctx.branch).map(([name]) => name);
  if (!children.includes(target)) {
    throw new Error(`${target} is not a direct child of ${ctx.branch}.\nChildren: ${children.length ? children.join(', ') : '(none)'}`);
  }
  git(root, ['switch', target], { capture: false });
  console.log('PATCH_DOWN=PASS');
  console.log(`Current: ${target}`);
});
