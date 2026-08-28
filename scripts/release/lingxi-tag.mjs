#!/usr/bin/env node
import {
  commitSha,
  confirmExact,
  ensureClean,
  ensureExactRemote,
  ensureOnIntegration,
  ensureState,
  git,
  lifecycleContext,
  localTagExists,
  mainGuard,
  remoteTagCommit,
  repoRoot,
  runReleaseHelper,
} from '../lingxi/common.mjs';

await mainGuard(async () => {
  const root = repoRoot();
  const ctx = lifecycleContext(root);
  ensureOnIntegration(ctx);
  ensureState(ctx, 'ready');
  ensureClean(root);
  ensureExactRemote(root, ctx.integration);

  const freezeSource = ctx.record?.freeze?.source_commit;
  if (!/^[0-9a-f]{40}$/.test(freezeSource ?? '')) throw new Error('Ready record has no valid freeze.source_commit. Re-run the freeze stage.');
  const head = commitSha(root);
  const parentLine = git(root, ['show', '-s', '--format=%P', 'HEAD'], { capture: true }).stdout.trim();
  const parentShas = parentLine.split(/\s+/).filter(Boolean);
  if (parentShas.length !== 1 || parentShas[0] !== freezeSource) {
    throw new Error('Integration changed after freeze. Unfreeze, reconcile changes, and freeze again before tagging.');
  }
  const changed = git(root, ['diff', '--name-only', `${freezeSource}..HEAD`], { capture: true }).stdout.trim().split('\n').filter(Boolean);
  const expected = `.lingxi/releases/${ctx.version}.yml`;
  if (changed.length !== 1 || changed[0] !== expected) {
    throw new Error(`Freeze commit must change only ${expected}. Found: ${changed.join(', ') || '(none)'}`);
  }

  runReleaseHelper(root, ['check', '--record', '--tag', ctx.tag]);
  runReleaseHelper(root, ['secret-gate', 'LingXiFox/openchamber-lingxi']);

  const remote = remoteTagCommit(root, ctx.tag);
  if (remote) throw new Error(`Remote formal tag already exists and is immutable: ${ctx.tag} -> ${remote}`);

  if (localTagExists(root, ctx.tag)) {
    const localCommit = commitSha(root, ctx.tag);
    if (localCommit !== head) throw new Error(`Local tag ${ctx.tag} points to ${localCommit}, expected ${head}.`);
  }

  await confirmExact(`Create and push formal tag ${ctx.tag} at ${head}? This triggers the three-platform release workflow.`, ctx.tag);

  if (!localTagExists(root, ctx.tag)) {
    git(root, ['tag', '-a', ctx.tag, '-m', `OpenChamber LingXiFox ${ctx.version}`], { capture: false });
  }
  git(root, ['push', 'origin', ctx.tag], { capture: false });

  console.log('LINGXI_TAG_CREATE=PASS');
  console.log(`Tag:          ${ctx.tag}`);
  console.log(`Build Source: ${head}`);
  console.log('Actions:      triggered');
  console.log('Next:         bun run release:lingxi:status');
});
