#!/usr/bin/env node
import { lifecycleContext, mainGuard, repoRoot } from '../lingxi/common.mjs';
import { findFormalRun, formalRunJobs } from './lifecycle-common.mjs';

await mainGuard(async () => {
  const ctx = lifecycleContext(repoRoot());
  const { tagSha, run } = findFormalRun(ctx);
  if (!tagSha) {
    console.log('LINGXI_RELEASE_STATUS=NO_TAG');
    console.log(`Tag not found: ${ctx.tag}`);
    return;
  }
  if (!run) {
    console.log('LINGXI_RELEASE_STATUS=WAITING');
    console.log(`Tag:          ${ctx.tag}`);
    console.log(`Build Source: ${tagSha}`);
    console.log('No formal workflow run is visible yet. Try this command again shortly.');
    return;
  }

  const jobs = formalRunJobs(ctx, run.id);
  console.log(`LINGXI_RELEASE_STATUS=${run.status === 'completed' ? (run.conclusion ?? 'completed').toUpperCase() : run.status.toUpperCase()}`);
  console.log(`Run ID:       ${run.id}`);
  console.log(`Run URL:      ${run.html_url}`);
  console.log(`Build Source: ${run.head_sha}`);
  for (const job of jobs) {
    console.log(`- ${job.name}: ${job.status}${job.conclusion ? ` / ${job.conclusion}` : ''}`);
  }
});
