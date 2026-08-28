#!/usr/bin/env node
import {
  branchNode,
  confirmExact,
  descendants,
  ensureClean,
  fetchOrigin,
  git,
  lifecycleContext,
  localBranchExists,
  mainGuard,
  remoteBranchExists,
  removeBranchNodes,
  repoRoot,
} from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureClean(root);
  if (ctx.branch === ctx.integration) throw new Error('The integration branch can never be deleted by patch:delete.');

  const requested = process.argv[2] ?? ctx.branch;
  if (requested !== ctx.branch) {
    throw new Error(`For safety, patch:delete only deletes the current branch subtree. Current=${ctx.branch}, requested=${requested}`);
  }

  const node = branchNode(root, ctx.version, ctx.branch);
  if (!node?.parent) throw new Error(`Current branch is not managed by LingXi metadata: ${ctx.branch}`);

  const childrenDeepFirst = descendants(root, ctx.version, ctx.integration, ctx.branch);
  const subtree = [...childrenDeepFirst, ctx.branch];

  console.log('PATCH_DELETE');
  console.log('Will permanently discard branch pointers for:');
  for (const name of subtree) console.log(`  - ${name}`);
  console.log(`Return to: ${node.parent}`);
  await confirmExact('This discards the current branch and its entire child subtree locally and on origin.', ctx.branch);

  fetchOrigin(root);
  git(root, ['switch', node.parent], { capture: false });

  for (const name of subtree) {
    if (remoteBranchExists(root, name)) {
      git(root, ['push', 'origin', '--delete', name], { capture: false });
    }
  }
  for (const name of subtree) {
    if (localBranchExists(root, name)) {
      git(root, ['branch', '-D', name], { capture: false });
    }
  }

  removeBranchNodes(root, ctx.version, subtree);
  console.log('PATCH_DELETE=PASS');
  console.log(`Current: ${node.parent}`);
});
