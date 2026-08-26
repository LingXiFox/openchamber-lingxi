# Release Base Manifest

Authoritative provenance record for official OpenChamber LingXiFox builds.
Every formal release must update its release section here before tagging and packaging.

## Version model

OpenChamber LingXiFox uses two independent version axes:

- **LingXi version**: product version, git tag, macOS bundle version, and updater
  version all use the same value.
  - Git tag: `lingxi-vX.Y.Z`
  - `packages/electron/package.json` `version`: `X.Y.Z`
  - `CFBundleShortVersionString`: `X.Y.Z`
  - `CFBundleVersion`: `X.Y.Z`
  - electron-updater version: `X.Y.Z`
- **Upstream Base**: the OpenChamber release this LingXi release is based on.
  It is tracked independently and does not determine the LingXi version.

Example progression:

- LingXi 1.0.0 / Upstream Base OpenChamber 1.20.0
- LingXi 1.0.1 / Upstream Base OpenChamber 1.20.0
- LingXi 1.1.0 / Upstream Base OpenChamber 1.20.0
- A later LingXi release may move to a newer OpenChamber base without copying
  the upstream version number into the LingXi version.

Once a formal LingXi version is published, subsequent LingXi versions must
never go backwards.

## LingXi 1.0.0 — current

- LingXi Version: 1.0.0
- Bundle Version: 1.0.0
- Updater Version: 1.0.0
- Git Tag: `lingxi-v1.0.0`
- Upstream Base: OpenChamber 1.20.0
- Upstream Base Tag: `v1.20.0`
- Upstream Base Commit: `52ee878669867d5cc415f7da7bda1808d51fdf5d`
- Development repo base merge: `79e928158`

This is the first formal OpenChamber LingXiFox release under the current
versioning scheme.

Earlier experimental release records using a separate LingXi product version
and bundle/updater version are obsolete and are not part of the formal release
history.

### Cumulative source state

Release repository history for the source carried into LingXi 1.0.0:

~~~text
OpenChamber 1.20.0 (52ee87866, upstream)
        ↓ development-repo sync/main lineage (79e928158)
LingXi cumulative patch state
        ↓ f77e17df0  feat(ui): establish motion foundation
        ↓ b3ee036f4  feat(ui): add semantic agent activity visuals
        ↓ e4f985b58  fix(ui): show percent-only quota in work-status usage section
        ↓ ac6da2225  chore(release): reset LingXi version and fix release link
LingXi 1.0.0 release preparation
~~~

### Included features and development-source commits

Cumulative LingXi patches:

- macOS application/build integration:
  development branch `chore/macos-remote-build` @ `60bec91ec`
- Sub2API quota integration:
  development branch `feat/sub2api-quota-v2` @ `4a99643e6`
- Global background transparency:
  development branch `fix/bg-global-no-workspace` @ `9a957a739`
  (includes parent `feat/background-transparency`)
- Patch graph:
  development branch `feat/patch-graph` @ `51689e7b3`
- Motion Foundation:
  development `feat/ui-motion-foundation` final commit `664d9d7c5`
  → release `f77e17df0`
- Agent Activity Visuals / Thinking Orbs:
  development `feat/agent-activity-visuals` final commit `571151a56`
  → release `b3ee036f4`
  - adds dependency `thinking-orbs@^0.3.1`
- Percent-only quota display in work-status usage:
  development `fix/sub2api-quota-error` final commit `05e73a904`
  → release `e4f985b58`
  - conflicts against the Sub2API quota baseline were resolved by retaining
    `findQuotaResult` / `formatQuotaGroupName`
- Release version reset and LingXi GitHub release-link correction:
  release `ac6da2225`

Development-sandbox tooling is deliberately excluded from the release
repository.

The following remain development-only:

- `.dev-sandbox` launcher scripts
- sandbox-specific main-process path handling
- `electron-dev.mjs --sandbox`
- related sandbox tests and npm scripts
- sandbox-specific `.gitignore` entries
- sandbox README documentation

## Application identity

These values must remain stable unless an intentional migration is performed:

- Bundle identifier: `com.lingxifox.openchamber`
- Product name: `OpenChamber LingXiFox`
- Updater: electron-updater
- Update provider: GitHub
- Repository: `LingXiFox/openchamber-lingxi`
- macOS channel: `latest`
- Release tag format: `lingxi-v<X.Y.Z>`

The updater receives release metadata from `latest-mac.yml` published as a
GitHub Release asset.

The packaged application must contain:

~~~yaml
provider: github
owner: LingXiFox
repo: openchamber-lingxi
updaterCacheDirName: '@openchamberelectron-updater'
~~~

## Build and signing

Formal macOS builds are produced locally from this release repository.

The package entry point is:

~~~bash
bun run --cwd packages/electron package -- \
  --mac \
  --arm64 \
  --publish=never
~~~

The Electron package configuration supplies:

- `appId: com.lingxifox.openchamber`
- `productName: OpenChamber LingXiFox`
- `hardenedRuntime: true`
- `resources/entitlements.mac.plist`
- matching inherited entitlements
- GitHub publish metadata for `LingXiFox/openchamber-lingxi`
- DMG and ZIP macOS targets
- `scripts/after-pack.cjs`

`after-pack.cjs` generates `Contents/Resources/app-update.yml` before signing.

### Signing rule

Do not manually deep re-sign the completed Electron application.

In particular, do not run a post-build command equivalent to:

~~~text
codesign --force --deep ...
~~~

A manual deep re-sign can replace Electron Builder's final application
signature and strip the top-level entitlements.

The final application requires the hardened-runtime exceptions defined in:

`packages/electron/resources/entitlements.mac.plist`

In particular:

`com.apple.security.cs.disable-library-validation`

must remain present.

Without it, dyld may reject Electron's bundled `libffmpeg.dylib` because the
library signature identity differs from the application Team ID.

### Release verification

The final packaged application must pass:

~~~bash
codesign --verify --deep --strict --verbose=4 \
  "OpenChamber LingXiFox.app"
~~~

The final application entitlements must also be inspected explicitly.

`codesign --verify` alone is not sufficient.

A real application launch test is part of the release gate.

The application packaged inside the final DMG and ZIP must independently pass
the same signature and launch checks.

### Notarization

Signing and notarization status must be verified against the exact artifacts
being published.

A diagnostic build produced with notarization disabled must not be described
as notarized.

Public distribution notarization status is therefore a separate release gate
and must be checked before the Draft Release is published.

## LingXi 1.0.0 release artifacts

The macOS arm64 GitHub Release contains:

~~~text
OpenChamber-LingXiFox-1.0.0-mac-arm64.dmg
OpenChamber-LingXiFox-1.0.0-mac-arm64.zip
latest-mac.yml
SHA256SUMS.txt
~~~

Artifact roles:

- `OpenChamber-LingXiFox-1.0.0-mac-arm64.dmg`
  - primary manual installation package
- `OpenChamber-LingXiFox-1.0.0-mac-arm64.zip`
  - primary electron-updater payload
- `latest-mac.yml`
  - macOS updater manifest
- `SHA256SUMS.txt`
  - public SHA-256 integrity checksums

The public artifact names intentionally use Electron Builder's GitHub-safe
hyphenated names.

For every formal release:

1. The ZIP referenced by `latest-mac.yml` must exist in the same GitHub Release.
2. The ZIP filename in `latest-mac.yml` must match the uploaded filename.
3. The ZIP byte size in `latest-mac.yml` must match the uploaded artifact.
4. The ZIP SHA-512 in `latest-mac.yml` must match the uploaded artifact.
5. The DMG and ZIP must be validated before upload.
6. `SHA256SUMS.txt` must match the final uploaded artifact bytes.
7. GitHub asset names and sizes must be checked before publishing the Draft.

## LingXi 1.0.0 validated artifact state

Current validated arm64 artifacts:

~~~text
OpenChamber-LingXiFox-1.0.0-mac-arm64.dmg
size: 210882712 bytes

OpenChamber-LingXiFox-1.0.0-mac-arm64.zip
size: 203373919 bytes

latest-mac.yml
size: 551 bytes

SHA256SUMS.txt
size: 297 bytes
~~~

`latest-mac.yml` references:

~~~text
OpenChamber-LingXiFox-1.0.0-mac-arm64.zip
~~~

with SHA-512:

~~~text
Uq4qXbkI+K770fnM8tCQg14e656x7iKd3RMdLTIQSVJSd+yKcpS6gO5AN/TdJjSWQ4OayOTmq9AIgvARxGTP8w==
~~~

and byte size:

~~~text
203373919
~~~

The corresponding DMG SHA-512 is:

~~~text
xZoFfhTP+xza0dZJIr2z2gCSaBFagb4qHfrwpm0Qj3s7kt54V9gXkVaqNfqoDUPuNMqIn4zBNwKEu/C001by7Q==
~~~

The SHA-256 release checksums are:

~~~text
c279e97519d87fd24e2a3631bdb744461c33bdde9e1e6dd5b197b06a149e6591  OpenChamber-LingXiFox-1.0.0-mac-arm64.dmg
3074747eda6a1c0885387d1eb7707d3060af4e365beec26ad91533b5b9e997a7  OpenChamber-LingXiFox-1.0.0-mac-arm64.zip
e8457e843317c79b6342566a70fb72c14402efebcd5a38420968720afe906e46  latest-mac.yml
~~~

The DMG and ZIP application copies have been verified with strict codesign
validation and real launch tests.

The packaged application reports:

- `CFBundleShortVersionString`: 1.0.0
- `CFBundleVersion`: 1.0.0
- `CFBundleIdentifier`: `com.lingxifox.openchamber`

The packaged updater configuration points to:

`LingXiFox/openchamber-lingxi`

The GitHub Draft Release must remain unpublished until all remaining release
gates, including final distribution-signing/notarization checks, are complete.
