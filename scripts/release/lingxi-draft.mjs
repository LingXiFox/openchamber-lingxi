#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import {
  artifactFiles,
  confirmExact,
  ensureGh,
  gh,
  lifecycleContext,
  mainGuard,
  repoRoot,
  repositorySlug,
} from '../lingxi/common.mjs';
import {
  releaseByTag,
  requireFormalRunSuccess,
  verifyCollectedState,
  verifyReleaseAssetsAgainstLocal,
} from './lifecycle-common.mjs';

await mainGuard(async () => {
  const ctx = lifecycleContext(repoRoot());
  const { run } = requireFormalRunSuccess(ctx);
  const { dir } = verifyCollectedState(ctx, run);
  ensureGh(ctx.root);
  const repo = repositorySlug(ctx.root);

  const existing = releaseByTag(ctx, { allowMissing: true });
  if (existing) throw new Error(`GitHub Release already exists for ${ctx.tag}. draft=${existing.draft} url=${existing.html_url}`);

  const notesPath = path.join(path.dirname(dir), 'RELEASE_NOTES_DRAFT.md');
  const notes = [
    `# OpenChamber LingXiFox ${ctx.version}`,
    '',
    'Release notes pending manual review.',
    '',
    '## Distribution notes',
    '- macOS arm64 is ad-hoc signed and is not notarized by Apple; first launch may require manual approval in macOS.',
    '- Windows x64 is unsigned.',
    '- SHA256SUMS.txt is included for release asset verification.',
    '',
  ].join('\n');
  fs.writeFileSync(notesPath, notes);

  const files = artifactFiles(dir).map((name) => path.join(dir, name));
  await confirmExact(`Create GitHub Draft Release ${ctx.tag} and upload ${files.length} verified assets?`, `draft ${ctx.tag}`);

  gh(ctx.root, [
    'release', 'create', ctx.tag,
    '--repo', repo,
    '--verify-tag',
    '--draft',
    '--title', `OpenChamber LingXiFox ${ctx.version}`,
    '--notes-file', notesPath,
    ...files,
  ], { capture: false });

  const created = releaseByTag(ctx);
  if (!created.draft) throw new Error('Created release is not a Draft; refusing to continue.');
  verifyReleaseAssetsAgainstLocal(ctx, created, dir);

  console.log('LINGXI_DRAFT=PASS');
  console.log(`Draft: ${created.html_url}`);
  console.log('Review/edit the Draft Release and its release notes before publishing.');
  console.log('Next:  bun run release:lingxi:publish');
});
