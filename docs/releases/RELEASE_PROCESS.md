# LingXi release process

## Source model

The canonical `integration/openchamber-lingxi-X.Y.Z` branch decides release content. The immutable `lingxi-vX.Y.Z` tag decides the Build Source. Preflight resolves the selected ref to one commit, and every build job checks out that commit without changing versions or source files.

Each release keeps a machine record under `.lingxi/releases/` and a human record under `docs/releases/`. Records must distinguish a release source from a binary attestation. Do not infer an unrecorded build commit from timestamps.

## Prepare

A new LingXi development cycle starts from the latest published LingXi product base.

Create the canonical integration branch first:

```bash
git switch -c integration/openchamber-lingxi-X.Y.Z
```

Immediately initialize the Electron product version for that development cycle:

```bash
node scripts/release/lingxi-release.mjs prepare X.Y.Z
```

This changes only `packages/electron/package.json` and the matching `bun.lock` workspace version. Commit those changes at the beginning of the development cycle.

The canonical `integration/openchamber-lingxi-X.Y.Z` branch keeps that version throughout development. Do not defer the version bump until release day.

Before release, run the `LingXi Prepare Release` workflow only as a lightweight verification step. It verifies that:

- the selected branch is exactly `integration/openchamber-lingxi-X.Y.Z`
- the Electron product version is already `X.Y.Z`
- the release contract is valid
- the workflow does not mutate the source tree

The Prepare workflow does not modify source files, create temporary release branches, or open preparation pull requests.

Before tagging, add or update the release records and run the required release checks described below.

## Secret scanning gate

Run `bun run release:lingxi:secret-gate` against the candidate source before creating a tag. The gate blocks every open GitHub Secret Scanning alert unless its type, SHA-256 fingerprint, complete location set, first-introduced commits, and upstream source bytes match `.lingxi/security/upstream-secret-baseline.json`. The baseline contains no secret plaintext. Adding or moving even an inherited value requires a new provenance review.

Known upstream baseline alerts may remain open in GitHub and do not block a release. New or changed secrets, private credentials, GitHub Actions secrets written to source, Apple signing material, and any alert absent from the reviewed baseline block release. Do not give the release workflow a credential that can read secret plaintext; the gate is an explicit local pre-tag operation by a repository administrator.

## Dry-run

Run `LingXi Desktop Release` manually with `dry_run=true`, the exact source ref, and only the targets under test. Preflight pins that ref to a commit before starting native jobs. Manual runs upload GitHub Actions artifacts and never create or change a GitHub Release.

Current formal targets are:

- `windows-x64`: NSIS on `windows-2022`
- `linux-x64`: AppImage on `ubuntu-24.04`
- `macos-arm64`: DMG and ZIP on the native arm64 macOS runner

Do not add architectures or package targets without changing the release contract and records first.

Because `macos-arm64` receives signing and notarization secrets, manual macOS dry-runs accept only the matching canonical integration branch. The protected `lingxi-release` environment remains the approval boundary. Windows and Linux dry-runs may use another exact ref because those jobs receive no release secrets or write token.

## Publish

Set the machine release record state to `ready` only after the candidate source and required release checks are complete.

Create and push the `lingxi-vX.Y.Z` tag manually. The tag must point at the tip of the matching canonical `integration/openchamber-lingxi-X.Y.Z` branch.

The tag-triggered `LingXi Desktop Release` workflow does not publish a GitHub Release. It only:

- resolves the tag to an immutable Build Source commit
- validates the release contract
- builds the formal native targets
- runs platform packaging and smoke checks
- verifies updater manifests and blockmaps
- verifies artifact upload/download digests
- assembles the exact release inventory
- generates `SHA256SUMS.txt`
- uploads the complete assembled release as a GitHub Actions artifact

After the workflow succeeds, the release operator manually downloads the assembled Actions artifact and creates the GitHub Draft Release for `lingxi-vX.Y.Z`.

Before publishing, verify that the Draft Release contains exactly the intended release assets and verify `SHA256SUMS.txt`.

On macOS:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

On Linux:

```bash
sha256sum --check SHA256SUMS.txt
```

The checksum verification must pass against the downloaded Draft assets before publication.

The release operator then publishes the Draft manually.

Creating release tags, creating Draft Releases, and publishing Releases are human-controlled operations. Automation and coding agents must not perform these actions unless explicitly instructed by the release operator.

macOS signing and notarization secrets belong in the protected `lingxi-release` GitHub Environment. They must only be exposed to the canonical reviewed release source. Temporary certificates and signing keychains must be removed after the build, including on failure.

Windows builds remain unsigned until a separate signing design is approved, and release notes must state that.

## Retirement gate

Do not delete a source repository, worktree, backup, or staging artifact until its commits and useful dirty state are preserved, canonical source parity passes, CI artifacts have completed a GitHub upload/download hash round trip, and the retirement report prints `RELEASE_REPO_RETIREMENT_CHECK=PASS`.
