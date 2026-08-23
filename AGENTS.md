# OpenChamber Agent Guide

## Purpose

OpenChamber provides shared web, desktop, VS Code, hosted-mobile, and native-mobile UI surfaces for OpenCode.

This file contains only always-on repository rules and routing. Detailed workflows belong to project skills and module documentation.

## Instruction Order

These steps are mandatory. Before editing, you **MUST**:

1. Follow this root guide.
2. Load every matching project skill and every task-required reference from
   those skills.
3. Read the nearest `DOCUMENTATION.md` and package `README.md` when present.
4. Follow local code and test precedent.

If these sources materially conflict, stop and resolve the conflict instead of silently choosing one.
Do not start editing when a matching skill or required reference has not been
read. Skill loading is a required part of the task, not optional guidance.

## Runtime Boundaries

- `packages/ui`: shared React UI, state, sync, and runtime contracts.
- `packages/web`: web surfaces, OpenChamber server, managed/external OpenCode lifecycle, and CLI.
- `packages/electron`: native desktop shell and privileged Electron boundary.
- `packages/vscode`: extension host, webview, and runtime bridge.
- `packages/mobile`: Capacitor iOS/Android shell; bundles the mobile web surface and connects to an existing OpenChamber server.
- `packages/docs`: product documentation; not a Bun workspace.

Shared UI calls official OpenCode APIs through `@opencode-ai/sdk/v2`. OpenChamber-owned capabilities use `RuntimeAPIs`, `runtimeFetch`, and shared browser/realtime transport helpers. Server-side upstream integrations may use their owning runtime modules.

Electron starts the OpenChamber backend in-process, never as a sidecar. Development may load loopback/HMR UI; packaged builds load staged assets through `openchamber-ui://` while the loopback server remains the API backend. Keep domain backends in web/runtime modules unless behavior is inherently native.

Shared contracts must define intentional behavior for every applicable runtime: web, desktop, VS Code, hosted mobile, and Capacitor mobile.

## Always-On Constraints

- Do not modify `../opencode`; it is a separate repository.
- Do not run git or GitHub commands unless the user explicitly asks.
- Do not add dependencies unless explicitly requested.
- Never add or log secrets, bearer tokens, pairing credentials, or sensitive user data.
- Keep changes minimal and preserve unrelated worktree changes.
- Enforce security and correctness in core/runtime logic, not only UI visibility or prompts.
- Keep entrypoints and bridges thin; place domain logic in focused owning modules.
- Update owning documentation when module ownership, contracts, or invariants change.

## Correctness Invariants

- Prefer authoritative state over heuristics.
- Derive live activity from live channels, not persisted history.
- Scope temporary fallbacks narrowly and clear them when authoritative state arrives.
- Never let fetch failure masquerade as authoritative empty success.
- Make partial results, rollback, cleanup, and stale-data behavior explicit.
- One failed entity must not erase or block unrelated complete entities.
- Runtime-specific differences must be intentional and visible in code.

## Documentation Discovery

Before changing a module, search for the nearest `DOCUMENTATION.md`; before package-level work, read its `README.md`. Discover docs dynamically under `packages/**/DOCUMENTATION.md` rather than relying on a static exhaustive map.

High-value anchors:

- Sync: `packages/ui/src/sync/DOCUMENTATION.md`
- Stores: `packages/ui/src/stores/DOCUMENTATION.md`
- CLI: `packages/web/bin/lib/DOCUMENTATION.md`
- Performance measurement tooling: `scripts/perf/DOCUMENTATION.md`
- VS Code runtime: `packages/vscode/src/DOCUMENTATION.md`
- Electron: `packages/electron/README.md`
- Mobile: `packages/mobile/README.md`

## Project Skills

Project skills live under `.agents/skills/*/SKILL.md`. You **MUST** load every
skill matching the character of the change before editing; multiple skills may
apply, including companion skills required by another skill. Read every
task-required reference named by those skills. Skills are canonical for their
detailed workflows and checklists. Treating this table as optional advice is a
process violation.

**Always load `.agents/skills/communication-style/SKILL.md` at the start of
every task, before any analysis, tool call, or response. Apply its guidance to
all messages and written output, not only to user-facing copy or documentation.**

| Trigger | Required skill |
|---|---|
| Source/dependency changes, exports or package contracts, build/generated assets, or module ownership | `openchamber-change-discipline` |
| CLI commands, prompts, terminal output, non-TTY, `--quiet`, or `--json` behavior | `clack-cli-patterns` |
| Shared UI data access, OpenCode SDK or server routes, `RuntimeAPIs`, runtime auth/URLs, bridges, or runtime switching | `ui-api-decoupling` |
| Electron main/preload, IPC, native UI, updater, deep links, SSH/tunnels, packaging, or child processes | `desktop-shell` |
| Session sync, bootstrap/reconnect, reducers, polling, optimistic state, queues, live status, reconciliation, or directory-scoped caches | `sync-state-invariants` |
| Render/store/event hot paths, large lists, caches/indexes, or reported lag, freezes, CPU/memory, startup, or performance regressions | `performance-engineering` |
| WebSocket, SSE, streaming transport, runtime transport internals, or private relay | `relay-transport` |
| UI components, styling, colors, buttons, or icons | `theme-system` |
| User-facing or accessible UI text, labels, aria, toasts, dialogs, or navigation copy | `locale-ui-patterns` |
| Settings UI, settings dialogs, configuration surfaces, or settings search | `settings-ui-patterns` |
| Sortable or drag-to-reorder behavior, especially `@dnd-kit` and touch/wrapping layouts | `drag-to-reorder` |
| iOS Simulator build, launch, preview, gestures, or `serve-sim` control | `serve-sim` |
| Drafting or updating user-facing CHANGELOG entries for the `[Unreleased]` section (main app or VS Code extension) | `changelog-authoring` |
| Creating or editing skills, `AGENTS.md`, or docs reached through agent instructions/context pointers | `writing-for-agents` |

Pure code-reading or explanation does not require implementation skills unless needed to interpret a specialized subsystem.

### Skill Ownership

Keep each cross-cutting rule with one canonical owner; companion skills add only domain-specific consequences and a pointer to that owner.

| Concern | Canonical skill |
|---|---|
| Change scope, abstraction discipline, and validation risk | `openchamber-change-discipline` |
| State authority, reconciliation, optimistic state, and lifecycle correctness | `sync-state-invariants` |
| Measurement, hot-path cost, caching performance, and optimization evidence | `performance-engineering` |
| Shared UI API and runtime boundaries | `ui-api-decoupling` |
| WebSocket/SSE and private relay mechanics | `relay-transport` |
| Electron native ownership and privilege boundary | `desktop-shell` |
| UI tokens, primitives, icons, and animation styling | `theme-system` |
| Settings composition and search behavior | `settings-ui-patterns` |
| User-facing text and localization | `locale-ui-patterns` |
| Agent-facing document structure and context pointers | `writing-for-agents` |

Before adding guidance to a skill, identify its canonical owner. If another skill owns the rule, add a precise companion pointer and only the local consequence; do not copy the rule.

## Validation

- Use `package.json` scripts as the command source of truth.
- Prefer focused tests and package-scoped type-check/lint for executable source changes.
- Use workspace-wide checks for cross-workspace contracts, root tooling, dependencies, or shared generated assets.
- Run `bun run dead-code` when source files are added/deleted/renamed or exports, types, entrypoints, or import shape change; inspect its report because it is non-blocking.
- Run `bunx oxlint <changed-paths>` on TypeScript/JavaScript files you created or substantially rewrote. This runs the vendored `anti-slop` plugin, which rejects low-evidence typing: unjustified type assertions, `unknown`/`object`/`Record<string, unknown>` contracts, ad hoc `typeof` narrowing, and module mocking. Fix findings in code you authored. Pre-existing findings elsewhere are a known backlog: do not mass-fix them, and never silence a rule, weaken severity, or launder types to make the check pass.
- Do not assume TypeScript/lint covers server JS, CLI JS, Electron helpers, or native behavior; run focused tests, syntax checks, builds, or runtime validation for the touched surface.
- For docs-only or isolated config changes, run the narrowest relevant validation.
- Report exactly what was and was not validated. Static checks alone do not prove runtime, relay, performance, or platform correctness.

## Pull Request Handoff

Before creating or updating a pull request, read `CONTRIBUTING.md` and
`.github/PULL_REQUEST_TEMPLATE.md`. Complete the template with concrete,
current evidence for the final PR HEAD; do not make the reviewer reconstruct
intent, affected surfaces, applicable guidance, validation, visual behavior,
or failure and rollback considerations from the diff alone.

## Local Development Storage Boundary

This repository is developed on the dedicated APFS development volume:

`/Volumes/Development`

Repository:

`/Volumes/Development/Projects/projects/openchamber-lingxi`

All large development caches, downloaded build artifacts, package-manager caches, and temporary development dependencies must remain on the Development volume whenever the relevant tool supports a configurable location.

Configured locations:

- Go module cache: `/Volumes/Development/Go/pkg/mod`
- Go build cache: `/Volumes/Development/Cache/go-build`
- Bun install cache: `/Volumes/Development/Cache/bun/install`
- Bun runtime cache: `/Volumes/Development/Cache/bun/runtime`
- Electron cache: `/Volumes/Development/Cache/electron`
- electron-builder cache: `/Volumes/Development/Cache/electron-builder`
- npm cache: `/Volumes/Development/Cache/npm`
- uv cache: `/Volumes/Development/Cache/uv`

Respect these existing environment variables:

- `GOMODCACHE`
- `GOCACHE`
- `BUN_INSTALL_CACHE_DIR`
- `BUN_RUNTIME_TRANSPILER_CACHE_PATH`
- `ELECTRON_CACHE`
- `ELECTRON_BUILDER_CACHE`
- `UV_CACHE_DIR`

Use `npm config get cache` as the npm cache source of truth.

Do not intentionally recreate development caches at:

- `~/.npm`
- `~/.bun/install/cache`
- `~/.cache/uv`
- `~/.cache/huggingface`
- `~/Library/Caches/go-build`
- `~/Library/Caches/electron`
- `~/Library/Caches/electron-builder`

Do not change cache paths back to `$HOME`, `~/Library`, `/tmp`, or another system-volume location to work around a build problem.

If a command would create a large cache/runtime on the system volume and no safe Development-volume override is known, stop and report it before executing the command.

Normal application configuration, credentials, logs, OpenCode user data, and other small persistent application state are not development caches and should not be relocated without an explicit task requiring it.

## OpenChamber Electron Development

For normal local Electron development, start from the repository root:

`bun run electron:dev`

This is the preferred development-mode entry point.

Use the existing shell environment so Bun, Electron, npm, uv, and Go inherit the Development-volume cache configuration.

Do not manually set:

`OPENCHAMBER_ELECTRON_DEV=1`

when launching a packaged `.app`.

That variable changes resource resolution to development behavior and must not be used as a packaged-app isolation mechanism.

A packaged build and a development instance that share the same OpenChamber/OpenCode data must not be run concurrently.

Before launching another OpenChamber instance that uses the normal user environment, make sure the previous instance has fully exited.

For isolated packaged-app testing, use explicit temporary HOME/XDG/OpenChamber/Electron user-data directories rather than forcing Electron development mode.

## Isolated macOS Packaged-App Validation

When validating a locally built macOS `.app`, do not run it directly against the normal user environment first.

The goal of this procedure is to validate the packaged desktop application while preventing the test build from writing OpenChamber, OpenCode, Electron/Chromium, package-manager, or development cache data into the normal user environment on the macOS system volume.

### 1. Build the local ARM64 packaged app

Run from the repository root:

```bash
cd /Volumes/Development/Projects/projects/openchamber-lingxi

CSC_IDENTITY_AUTO_DISCOVERY=false \
bun run --cwd packages/electron package -- \
  --mac \
  --arm64 \
  --dir \
  --config.mac.notarize=false
```

Expected output application:

```text
/Volumes/Development/Projects/projects/openchamber-lingxi/packages/electron/dist/mac-arm64/OpenChamber LingXiFox.app
```

This is the preferred local packaged build for development validation.

It uses an ad-hoc/local signing path and skips notarization. Do not add notarization merely for local validation unless explicitly requested.

### 2. Use the dedicated isolated runtime

All packaged-app validation state must use:

```text
/Volumes/Development/Runtime/OpenChamberTest
```

The isolation layout is:

```text
/Volumes/Development/Runtime/OpenChamberTest/
├── home/
│   ├── .config/
│   ├── .local/
│   │   └── share/
│   ├── .cache/
│   └── Library/
├── data/
└── electron-user-data/
```

Create the directories if necessary:

```bash
mkdir -p \
  /Volumes/Development/Runtime/OpenChamberTest/home/.config \
  /Volumes/Development/Runtime/OpenChamberTest/home/.local/share \
  /Volumes/Development/Runtime/OpenChamberTest/home/.cache \
  /Volumes/Development/Runtime/OpenChamberTest/data \
  /Volumes/Development/Runtime/OpenChamberTest/electron-user-data
```

### 3. Launch the packaged app in isolation

Run the packaged executable directly:

```bash
env \
  HOME="/Volumes/Development/Runtime/OpenChamberTest/home" \
  XDG_CONFIG_HOME="/Volumes/Development/Runtime/OpenChamberTest/home/.config" \
  XDG_DATA_HOME="/Volumes/Development/Runtime/OpenChamberTest/home/.local/share" \
  XDG_CACHE_HOME="/Volumes/Development/Runtime/OpenChamberTest/home/.cache" \
  OPENCHAMBER_DATA_DIR="/Volumes/Development/Runtime/OpenChamberTest/data" \
  OPENCHAMBER_OPENCODE_CWD="/Volumes/Development/Projects/projects/openchamber-lingxi" \
  "/Volumes/Development/Projects/projects/openchamber-lingxi/packages/electron/dist/mac-arm64/OpenChamber LingXiFox.app/Contents/MacOS/OpenChamber LingXiFox" \
  --user-data-dir="/Volumes/Development/Runtime/OpenChamberTest/electron-user-data"
```

The real repository may be used as the OpenCode working directory:

```text
/Volumes/Development/Projects/projects/openchamber-lingxi
```

but application state must remain isolated under:

```text
/Volumes/Development/Runtime/OpenChamberTest
```

### 4. Critical packaged-mode rule

Never set the following variable when launching a packaged `.app`:

```text
OPENCHAMBER_ELECTRON_DEV=1
```

In the Electron main process:

```js
const isDev =
  process.env.OPENCHAMBER_ELECTRON_DEV === '1' ||
  !app.isPackaged;
```

Packaged resource resolution depends on remaining in packaged mode:

```js
const resourceRoot = () =>
  isDev
    ? path.join(__dirname, 'resources')
    : process.resourcesPath;
```

Forcing `OPENCHAMBER_ELECTRON_DEV=1` on a packaged app incorrectly redirects resources toward development paths inside `app.asar`.

This can cause failures such as:

```text
dist-bundle/resources/web-dist not found
```

or:

```text
ERR_UNEXPECTED
```

even though the correctly packaged resources exist under:

```text
OpenChamber LingXiFox.app/Contents/Resources/
```

Therefore:

```text
Packaged .app
→ app.isPackaged = true
→ isDev = false
→ process.resourcesPath
→ Contents/Resources
```

must remain intact.

Do not use `OPENCHAMBER_ELECTRON_DEV=1` as an isolation mechanism.

### 5. Do not fall back to the normal user environment

If the isolated packaged app fails to start:

- Do not remove `HOME`.
- Do not remove the XDG overrides.
- Do not remove `OPENCHAMBER_DATA_DIR`.
- Do not remove `--user-data-dir`.
- Do not launch it against the normal OpenChamber/OpenCode state merely to see whether that fixes the problem.

Diagnose the actual packaging, resource, runtime, or configuration failure instead.

### 6. Concurrent-instance rule

Do not run the normal installed application and a development/test instance against the same application data at the same time.

The normal installed application is:

```text
/Applications/OpenChamber.app
```

The local packaged build is:

```text
/Volumes/Development/Projects/projects/openchamber-lingxi/packages/electron/dist/mac-arm64/OpenChamber LingXiFox.app
```

Their filenames may differ, but they belong to the same OpenChamber application/data ecosystem.

When using the normal user environment, make sure the previous OpenChamber instance has fully exited before launching another build.

This avoids concurrent access to OpenCode/OpenChamber databases and related state.

### 7. Validation order

Use this order for local macOS desktop work:

```text
Source changes
    ↓
type-check / targeted tests
    ↓
bun run build when required
    ↓
local ARM64 packaged .app build
    ↓
launch with OpenChamberTest isolation
    ↓
validate startup and required functionality
    ↓
only then consider normal-user-environment testing
```

Do not skip directly from an unvalidated source change to running a packaged build against the normal user environment.

### 8. Normal Electron development mode

For interactive development with the development server/HMR, use the repository's normal Electron development entry point from the repository root:

```bash
cd /Volumes/Development/Projects/projects/openchamber-lingxi
bun run electron:dev
```

This is separate from packaged-app validation.

Conceptually:

```text
bun run electron:dev
→ development mode / HMR

package --mac --arm64 --dir
→ produces packaged .app

packaged .app + OpenChamberTest environment
→ isolated packaged-app validation
```

Do not confuse these three workflows.

### 9. Development-volume cache boundary

The existing development cache configuration must continue to be respected during both development and packaging.

Configured locations include:

```text
Go module cache
/Volumes/Development/Go/pkg/mod

Go build cache
/Volumes/Development/Cache/go-build

Bun install cache
/Volumes/Development/Cache/bun/install

Bun runtime transpiler cache
/Volumes/Development/Cache/bun/runtime

Electron cache
/Volumes/Development/Cache/electron

electron-builder cache
/Volumes/Development/Cache/electron-builder

npm cache
/Volumes/Development/Cache/npm

uv cache
/Volumes/Development/Cache/uv
```

Respect the configured environment variables:

```text
GOMODCACHE
GOCACHE
BUN_INSTALL_CACHE_DIR
BUN_RUNTIME_TRANSPILER_CACHE_PATH
ELECTRON_CACHE
ELECTRON_BUILDER_CACHE
UV_CACHE_DIR
```

Use:

```bash
npm config get cache
```

as the source of truth for the npm cache path.

Do not silently redirect these caches back to the system volume.

### 10. Isolation scope

The isolated packaged-app procedure is intended to keep test application state away from the normal:

```text
~/.config/openchamber
~/.config/opencode
~/.local/share/opencode
~/Library/Application Support/OpenChamber
```

and related normal Electron/Chromium application state.

Normal macOS system metadata, unified logging, operating-system databases, or unrelated application logs are outside this isolation guarantee.

Do not relocate ordinary macOS preferences, credentials, or unrelated application state merely to satisfy the development-volume policy.