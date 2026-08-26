# Release Base Manifest

Authoritative provenance record for official OpenChamber LingXiFox builds.
Every formal release must append/update its section here before packaging.

## Version model

Two independent version axes:

- **LingXi product version** (marketing / git tag `lingxi-vX.Y.Z`): 1.0.0, 1.1.0, ...
- **Bundle/updater version** (`packages/electron/package.json` `version`): the only
  version electron-builder writes into `CFBundleShortVersionString` /
  `CFBundleVersion`, and the only one electron-updater compares.

The bundle lane starts at 1.21.0 because the released 1.0.0 fleet internally
reports 1.20.0; a truthful 1.1.0 bundle would be rejected as a downgrade and
in-app updates would never fire. Rule: each LingXi release picks the next
strictly-increasing bundle version (LingXi 1.1.0 → bundle 1.21.0, LingXi
1.1.1 → 1.21.1, ...). When this lane risks colliding with a future upstream
base number, pick the next free higher number; never reuse or go backwards.

## LingXi 1.1.0 (bundle 1.21.0) — current

- LingXi Version: 1.1.0
- Bundle/Updater Version: 1.21.0
- Upstream Base: OpenChamber 1.20.0
- Upstream Base Tag: `v1.20.0`
- Upstream Base Commit: `52ee878669867d5cc415f7da7bda1808d51fdf5d`
- Development repo base merge: `79e928158` (LingXiFox/openchamber-lingxi main at 1.0.0)

### Cumulative source state

Release repo main history:

```
OpenChamber 1.20.0 (52ee87866, upstream)
        ↓ dev-repo sync/main lineage (79e928158)
LingXi 1.0.0 cumulative state (dev tag lingxi-v1.0.0 = 9e3c5fb3a)
        ↓ f77e17df0  feat(ui): establish motion foundation
        ↓ b3ee036f4  feat(ui): add semantic agent activity visuals
        ↓ e4f985b58  fix(ui): show percent-only quota in work-status usage section
LingXi 1.1.0 release commit (this file's commit)
```

### Included features and development-source commits

LingXi 1.0.0 patches (carried inside `lingxi-v1.0.0` = `9e3c5fb3a`):

- `chore/macos-remote-build` @ dev `60bec91ec`
- `feat/sub2api-quota-v2` @ dev `4a99643e6`
- `fix/bg-global-no-workspace` @ dev `9a957a739` (includes parent `feat/background-transparency`)
- `feat/patch-graph` @ dev `51689e7b3`

LingXi 1.1.0 additions:

- Motion Foundation: replay of dev `feat/ui-motion-foundation` final commit `664d9d7c5`
  → release `f77e17df0`
- Agent Activity Visuals (Thinking Orbs): replay of dev `feat/agent-activity-visuals`
  final commit `571151a56` → release `b3ee036f4`; adds dependency `thinking-orbs@^0.3.1`
- Percent-only quota display in work-status usage: replay of dev
  `fix/sub2api-quota-error` final commit `05e73a904` → release `e4f985b58`;
  conflicts against the sub2api-quota-v2 baseline resolved by keeping
  `findQuotaResult` / `formatQuotaGroupName`

Replay exclusions: all development-sandbox tooling was deliberately NOT
carried into this repository (`.dev-sandbox` launcher scripts, main-process
sandbox path handling in `packages/electron/main.mjs`,
`electron-dev.mjs --sandbox` mode and its tests, sandbox npm scripts,
related `.gitignore` entries and README sections). The sandbox remains
available in the development repository for QA work.

## Application identity (must not change between releases)

- appId / bundle identifier: `com.lingxifox.openchamber`
- productName: `OpenChamber LingXiFox`
- updater: electron-updater, GitHub provider, feed `LingXiFox/openchamber-lingxi`,
  channel `latest` on macOS (requires `latest-mac.yml` in the GitHub release assets;
  the lingxi-v1.0.0 release shipped without it, so 1.0.0 clients start seeing
  updates again from the first release that includes the manifest)
- signing: Apple Development identity
  `Apple Development: handsomezhu2019@outlook.com (WV86S3A54T)`
  (TeamID `4VXWMYSQG8`), same as 1.0.0; no Developer ID notarization yet

## Build & sign (macOS arm64, from THIS repository only)

```bash
bun install
bun run --cwd packages/electron package   # full desktop package pipeline
```

Sign with the local Apple Development identity above, then verify:

```bash
codesign --verify --deep --strict --verbose=2 <app>
```

Publish artifacts to GitHub Release `lingxi-v<X.Y.Z>` on
`LingXiFox/openchamber-lingxi`: signed `.zip`, `latest-mac.yml` matching the
uploaded zip (url/sha512/size), optional `.blockmap`, `SHA256SUMS.txt`.
