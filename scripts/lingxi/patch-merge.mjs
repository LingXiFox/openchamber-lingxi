#!/usr/bin/env node
import {
  branchNode,
  childNodes,
  ensureClean,
  ensureNotBehindRemote,
  ensureState,
  fetchOrigin,
  git,
  lifecycleContext,
  localBranchExists,
  mainGuard,
  remoteBranchExists,
  repoRoot,
  updateBranchNode,
} from './common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureState(ctx, 'development');
  ensureClean(root);
  if (ctx.branch === ctx.integration) throw new Error('The integration branch has no parent to merge into.');

  const node = branchNode(root, ctx.version, ctx.branch);
  if (!node || node.state !== 'active') throw new Error(`Current branch is not an active LingXi patch branch: ${ctx.branch}`);

  const activeChildren = childNodes(root, ctx.version, ctx.integration, ctx.branch, { activeOnly: true }).map(([name]) => name);
  if (activeChildren.length) {
    throw new Error(`PATCH_MERGE=BLOCKED\n${ctx.branch} still has active child branches:\n- ${activeChildren.join('\n- ')}\nMerge or delete child branches first.`);
  }

  fetchOrigin(root);
  if (remoteBranchExists(root, ctx.branch)) ensureNotBehindRemote(root, ctx.branch);

  const parent = node.parent;
  if (!localBranchExists(root, parent)) {
    if (!remoteBranchExists(root, parent)) throw new Error(`Parent branch does not exist locally or on origin: ${parent}`);
    git(root, ['branch', '--track', parent, `origin/${parent}`], { capture: false });
  }
  if (remoteBranchExists(root, parent)) ensureNotBehindRemote(root, parent);

  const child = ctx.branch;
  git(root, ['switch', parent], { capture: false });
  const result = git(root, ['merge', '--no-ff', child, '-m', `merge: ${child} into ${parent}`], { capture: false, allowFailure: true });

  if (result.status !== 0) {
    git(root, ['merge', '--abort'], { capture: false, allowFailure: true });
    git(root, ['switch', child], { capture: false, allowFailure: true });
    throw new Error(`PATCH_MERGE=CONFLICT\nMerge was aborted and you were returned to ${child}. Ask the Agent to resolve/reconcile the conflict, then retry patch:merge.`);
  }

  updateBranchNode(root, ctx.version, child, {
    state: 'merged',
    merged_into: parent,
    merged_at: new Date().toISOString(),
  });

  console.log('PATCH_MERGE=PASS');
  console.log(`Merged:  ${child}`);
  console.log(`Into:    ${parent}`);
  console.log(`Current: ${parent}`);
  console.log('The child branch was retained. Delete it explicitly with patch:delete when you no longer need it.');
});
