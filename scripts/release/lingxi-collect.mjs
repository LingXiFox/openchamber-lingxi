#!/usr/bin/env node
import fs from 'node:fs';

import {
  assembledDir,
  gh,
  lifecycleContext,
  mainGuard,
  readLocalReleaseState,
  repoRoot,
  repositorySlug,
  verifySha256Sums,
} from '../lingxi/common.mjs';
import { formalRunArtifact, requireFormalRunSuccess, writeCollectedState } from './lifecycle-common.mjs';

await mainGuard(async () => {
  const ctx = lifecycleContext(repoRoot());
  const { repo, run } = requireFormalRunSuccess(ctx);
  const artifact = formalRunArtifact(ctx, run.id);
  const dir = assembledDir(ctx.root, ctx.version);
  const existingState = readLocalReleaseState(ctx.root, ctx.version);

  if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    if (existingState?.run_id === run.id && existingState?.build_source_commit === run.head_sha) {
      verifySha256Sums(dir);
      console.log('LINGXI_COLLECT=PASS');
      console.log('Existing collected artifacts match the current formal run and passed SHA256 verification.');
      console.log(`Directory: ${dir}`);
      return;
    }
    throw new Error(`Collected directory is not empty and does not belong to the current formal run: ${dir}\nRemove or archive it manually before retrying.`);
  }

  fs.mkdirSync(dir, { recursive: true });
  const result = gh(ctx.root, [
    'run', 'download', String(run.id),
    '--repo', repo,
    '--name', artifact.name,
    '--dir', dir,
  ], { allowFailure: true, capture: false });
  if (result.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`Failed to download Actions artifact ${artifact.name}.`);
  }

  verifySha256Sums(dir);
  writeCollectedState(ctx, run, artifact);
  console.log('LINGXI_COLLECT=PASS');
  console.log(`Run ID:    ${run.id}`);
  console.log(`Artifact:  ${artifact.name}`);
  console.log(`Directory: ${dir}`);
  console.log('SHA256:    PASS');
  console.log('Next:      bun run release:lingxi:draft');
});
