import fs from 'node:fs';
import path from 'node:path';

import {
  artifactFiles,
  assembledDir,
  commitSha,
  ensureGh,
  gh,
  ghJson,
  localTagExists,
  readLocalReleaseState,
  releaseLocalStatePath,
  remoteTagCommit,
  repositorySlug,
  sha256File,
  verifySha256Sums,
  writeLocalReleaseState,
} from '../lingxi/common.mjs';

export const findFormalRun = (ctx, { requireRun = false } = {}) => {
  ensureGh(ctx.root);
  const repo = repositorySlug(ctx.root);
  let tagSha = null;

  if (localTagExists(ctx.root, ctx.tag)) {
    tagSha = commitSha(ctx.root, ctx.tag);
  } else {
    tagSha = remoteTagCommit(ctx.root, ctx.tag);
  }

  if (!tagSha) {
    if (requireRun) throw new Error(`Formal tag does not exist: ${ctx.tag}`);
    return { repo, tagSha: null, run: null };
  }

  const data = ghJson(ctx.root, [
    'api', '-X', 'GET',
    `repos/${repo}/actions/workflows/lingxi-release.yml/runs`,
    '-f', 'event=push',
    '-f', `head_sha=${tagSha}`,
    '-f', 'per_page=20',
  ]);
  const runs = (data.workflow_runs ?? [])
    .filter((run) => run.head_sha === tagSha && run.event === 'push')
    .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0));
  const run = runs[0] ?? null;
  if (!run && requireRun) throw new Error(`No formal LingXi Desktop Release run found for ${ctx.tag} (${tagSha}).`);
  return { repo, tagSha, run };
};

export const formalRunJobs = (ctx, runId) => {
  const repo = repositorySlug(ctx.root);
  const data = ghJson(ctx.root, ['api', `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`]);
  return data.jobs ?? [];
};

export const requireFormalRunSuccess = (ctx) => {
  const found = findFormalRun(ctx, { requireRun: true });
  if (found.run.status !== 'completed' || found.run.conclusion !== 'success') {
    throw new Error(`Formal workflow is not successful yet. status=${found.run.status} conclusion=${found.run.conclusion ?? '(none)'}`);
  }
  return found;
};

export const formalRunArtifact = (ctx, runId) => {
  const repo = repositorySlug(ctx.root);
  const data = ghJson(ctx.root, ['api', `repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`]);
  const name = `lingxi-${ctx.version}-release`;
  const matches = (data.artifacts ?? []).filter((artifact) => artifact.name === name && !artifact.expired);
  if (matches.length !== 1) throw new Error(`Expected exactly one non-expired Actions artifact named ${name}; found ${matches.length}.`);
  return matches[0];
};

export const verifyCollectedState = (ctx, run) => {
  const state = readLocalReleaseState(ctx.root, ctx.version);
  if (!state) throw new Error(`No collected release state found. Run: bun run release:lingxi:collect`);
  if (state.run_id !== run.id || state.build_source_commit !== run.head_sha) {
    throw new Error(`Collected artifacts belong to a different formal run. collected_run=${state.run_id} current_run=${run.id}`);
  }
  const dir = assembledDir(ctx.root, ctx.version);
  if (!fs.existsSync(dir)) throw new Error(`Collected artifact directory is missing: ${dir}`);
  verifySha256Sums(dir);
  return { state, dir };
};

export const releaseByTag = (ctx, { allowMissing = false } = {}) => {
  ensureGh(ctx.root);
  const repo = repositorySlug(ctx.root);
  const result = gh(ctx.root, ['api', `repos/${repo}/releases/tags/${ctx.tag}`], { allowFailure: true });
  if (result.status !== 0) {
    const stderr = `${result.stderr ?? ''}`;
    if (allowMissing && /404|Not Found/i.test(stderr)) return null;
    throw new Error(`Unable to read GitHub Release ${ctx.tag}.\n${stderr.trim()}`);
  }
  return JSON.parse(`${result.stdout ?? '{}'}`);
};

export const verifyReleaseAssetsAgainstLocal = (ctx, release, directory) => {
  const localNames = artifactFiles(directory);
  const remoteAssets = release.assets ?? [];
  const remoteNames = remoteAssets.map((asset) => asset.name).sort();
  if (localNames.join('\n') !== remoteNames.join('\n')) {
    throw new Error(`GitHub Release asset inventory mismatch.\nLocal: ${localNames.join(', ')}\nRemote: ${remoteNames.join(', ')}`);
  }

  for (const asset of remoteAssets) {
    const localPath = path.join(directory, asset.name);
    const size = fs.statSync(localPath).size;
    if (Number(asset.size) !== size) throw new Error(`GitHub Release asset size mismatch: ${asset.name}`);
    if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
      const localDigest = `sha256:${sha256File(localPath)}`;
      if (asset.digest !== localDigest) throw new Error(`GitHub Release asset digest mismatch: ${asset.name}`);
    }
  }
  return localNames;
};

export const writeCollectedState = (ctx, run, artifact) => {
  writeLocalReleaseState(ctx.root, ctx.version, {
    schema: 1,
    version: ctx.version,
    tag: ctx.tag,
    run_id: run.id,
    run_url: run.html_url,
    build_source_commit: run.head_sha,
    actions_artifact: {
      id: artifact.id,
      name: artifact.name,
      digest: artifact.digest ?? null,
    },
    collected_at: new Date().toISOString(),
    state_file: releaseLocalStatePath(ctx.root, ctx.version),
  });
};

export const localArtifactRecords = (directory) => artifactFiles(directory).map((name) => ({
  name,
  bytes: fs.statSync(path.join(directory, name)).size,
  sha256: sha256File(path.join(directory, name)),
}));
