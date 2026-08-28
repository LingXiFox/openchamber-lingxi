#!/usr/bin/env node
import {
  aheadBehind,
  branchNode,
  fetchOrigin,
  isClean,
  lifecycleContext,
  mainGuard,
  remoteBranchExists,
  repoRoot,
} from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  fetchOrigin(root);

  const node = ctx.branch === ctx.integration ? null : branchNode(root, ctx.version, ctx.branch);
  const hasRemote = remoteBranchExists(root, ctx.branch);
  const counts = hasRemote ? aheadBehind(root, ctx.branch, `origin/${ctx.branch}`) : null;

  console.log(`LingXi version: ${ctx.version}`);
  console.log(`State:          ${ctx.record.state}`);
  console.log(`Current:        ${ctx.branch}`);
  console.log(`Parent:         ${ctx.branch === ctx.integration ? '(version root)' : node?.parent ?? '(unmanaged)'}`);
  console.log(`Integration:    ${ctx.integration}`);
  console.log(`Working tree:   ${isClean(root) ? 'clean' : 'dirty'}`);
  console.log(`Remote:         ${hasRemote ? `origin/${ctx.branch}` : '(not pushed)'}`);
  console.log(`Ahead/behind:   ${counts ? `${counts.ahead} / ${counts.behind}` : '- / -'}`);
  if (node) console.log(`Patch state:    ${node.state}`);
});
