#!/usr/bin/env node
import { lifecycleContext, mainGuard, remoteTagCommit, repoRoot } from '../lingxi/common.mjs';

await mainGuard(async () => {
  const ctx = lifecycleContext(repoRoot());
  const remoteTag = remoteTagCommit(ctx.root, ctx.tag);
  console.log(`Version:     ${ctx.version}`);
  console.log(`State:       ${ctx.record.state}`);
  console.log(`Current:     ${ctx.branch}`);
  console.log(`Integration: ${ctx.integration}`);
  console.log(`Tag:         ${ctx.tag}${remoteTag ? ` (${remoteTag})` : ' (not pushed)'}`);
  console.log(`Upstream:    ${ctx.record?.upstream?.tag ?? '(missing)'} @ ${ctx.record?.upstream?.commit ?? '(missing)'}`);
  console.log(`macOS sign:  ${ctx.record?.signing?.macos ?? '(missing)'}`);
  console.log(`Notarized:   ${String(ctx.record?.signing?.notarized ?? '(missing)')}`);
});
