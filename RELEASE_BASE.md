# LingXi Release Base Manifest

This file defines the persistent release model and release invariants for
OpenChamber LingXiFox.

Concrete release versions, upstream base revisions, artifact hashes, sizes,
release dates, and other per-release metadata are recorded by release-specific
commits and are not part of the reusable LingXi release-base patch.

## Version model

OpenChamber LingXiFox has two independent version axes:

- LingXi version
  - product version
  - git tag: `lingxi-vX.Y.Z`
  - `packages/electron/package.json` version for a formal release
  - macOS bundle version
  - electron-updater version

- Upstream Base
  - the OpenChamber release used as the source base
  - tracked independently from the LingXi version

A change in the upstream OpenChamber version does not automatically determine
the LingXi product version.

Concrete LingXi version numbers are assigned only during release preparation.

## Application identity

Persistent LingXi desktop identity:

- Bundle identifier: `com.lingxifox.openchamber`
- Product name: `OpenChamber LingXiFox`
- Update provider: GitHub
- Update repository: `LingXiFox/openchamber-lingxi`
- Release tag format: `lingxi-v<X.Y.Z>`

These values form part of the reusable LingXi release-base integration and
should survive upstream-base changes unless an intentional migration is made.

## Updater integration

LingXi desktop builds use the LingXi GitHub repository as their production
update source.

The packaged application must contain an `app-update.yml` generated from the
Electron Builder publish configuration.

The generated updater configuration must be validated before release.

The update dialog must:

- prefer an update URL supplied by updater metadata;
- otherwise fall back to the LingXi GitHub Releases page;
- never assume that LingXi tags use upstream's `vX.Y.Z` naming rule.

## Packaging and signing invariants

Formal builds are produced through the Electron Builder packaging flow.

Do not manually deep re-sign the completed application with a command such as:

    codesign --force --deep ...

A post-build deep re-sign can replace Electron Builder's final application
signature and strip required entitlements.

Release validation must include:

- strict recursive code-signature verification;
- inspection of final application entitlements;
- verification of packaged updater configuration;
- validation of the final DMG and ZIP;
- a real launch test of the packaged application.

Signing and notarization status must be described truthfully for each release.

## Release artifacts

A macOS release normally publishes:

- DMG for manual installation;
- ZIP for electron-updater delivery;
- `latest-mac.yml` for updater metadata;
- `SHA256SUMS.txt` for public integrity verification.

The filenames, byte sizes, SHA-512 values referenced by `latest-mac.yml`, and
published artifact bytes must agree exactly.

Concrete artifact names, hashes and sizes belong to the release-specific
record, not to this reusable base patch.

## Upstream-base migration

When moving to a newer OpenChamber base:

1. start from the selected official OpenChamber tag;
2. replay the LingXi release-base patch;
3. replay the approved LingXi feature patch stack;
4. resolve upstream conflicts within the affected patch only;
5. prepare the new LingXi version;
6. update the release-specific manifest data;
7. build, verify and publish.

The release-base patch must remain independent from feature patches and from
one-time release metadata.
