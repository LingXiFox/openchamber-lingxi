# Theme Appearance Extension v1 — Architecture

> Phase 3: Candidate B wins. v1 keeps Electron opaque, static fixed wallpaper, pure alpha.

## 1. Decision summary
- **Location: A — Theme inline `appearance?`** No companion file. Single JSON keeps `/api/config/themes` and `ThemeSystemContext` unchanged.
- **Asset: A — theme directory** `~/.config/openchamber/themes/<id>/theme.json` + `assets/` ; single-file `themes/*.json` remains supported for old themes.
- **Wallpaper route: Backend asset URL** `GET /api/themes/<id>/assets/<path>` — renderer never sees absolute path.
- **Override: per-runtimeKey + per-variant `DesktopSettings`**, not localStorage.
- **Remote: theme definition + assets owned by the connected runtime (Remote or Local); user overrides stay local per-runtimeKey.**
- **Platform: Electron + Web = full, Mobile = deferred, VSCode = inherit-only, MiniChat = follow main.**
- **PRs: 4 small PRs, each revertible.**

## 2. Existing system integration
- `Theme` is typed (`packages/ui/src/types/theme.ts:107`) with `metadata/colors/config`. `ThemeSystemContext` merges `built-in / custom / dev` via `availableThemes` (first-wins by id) and loads custom via `runtimeFetch('/api/config/themes')` filtered by `isValidTheme`. `CSSVariableGenerator.generate()` → single `<style id="opencode-theme-variables">` injected and `classList light/dark`. Embedded sync via `postMessage openchamber:theme-sync`. `runtimeKey` (`getRuntimeKey`) drives reload on host switch. Custom files live at `~/.config/openchamber/themes/*.json` (server `readCustomThemes` reads that dir, 64KB limit, `isValidTheme` validates). No asset handling exists — v1 adds it.

## 3. v1 schema (additive, optional)
```ts
// Inside Theme
appearance?: {
  wallpaper?: {
    enabled?: boolean              // default false
    asset?: string                 // relative ./assets/bg.webp ; no absolute, no file://, no http(s) in v1
    fit?: 'cover' | 'contain'      // default 'cover'
    opacity?: number               // 0..1, default 0.12, clamped
  }
  surfaces?: {
    main?: number        // alias for MainLayout column
    header?: number
    sidebar?: number
    chat?: number        // ChatContainer outer shell
    composer?: number
    contextPanel?: number
    // terminal/editor/diff NOT exposed in v1
  } // each 0..1, default 1
}
```
Unknown fields rejected (strict Zod). `wallpaper.asset` validated as relative POSIX, no `..`, no `/`, no `\`, no `:`.

## 4. Theme asset model
- **New form (preferred):** `themes/<id>/theme.json` + `themes/<id>/assets/*.{webp,avif,jpg,png}` . `id` must equal directory name (lower kebab, validated).
- **Old form (compat):** `themes/<id>.json` — if `appearance.wallpaper.asset` present, ignored with warning (no assets dir).
- **Serving:** `GET /api/themes/:id/assets/*` — server joins `themesDir/<id>/assets/<req>`, verifies `resolved.startsWith(assetsRoot)`, checks symlink via `realpath`, enforces `ext ∈ {webp,avif,jpg,png}`, `size ≤ 2MB`, and returns `Content-Type` by ext + `Cache-Control: immutable`. No `file://` exposure.
- **Lifecycle:** Rename/delete theme dir auto-removes assets; `id` collision → load keeps first, second skipped with warning. Remote themes: assets proxied from Remote's `/api/themes/...` to renderer as blob URL (see §10).

## 5. Resolved appearance model
```
Resolved = defaults(1) ← theme.appearance ← userOverrides[ runtimeKey + variant ]
```
- `defaults`: wallpaper off, all surfaces 1.
- `theme.appearance`: author defaults.
- `userOverrides`: per-`runtimeKey` (local vs host:<id>) and per `variant` (light/dark) stored in `DesktopSettings.appearanceOverrides` (see §14). Merge is shallow, `undefined` means “follow theme”. `null` on wallpaper asset means “theme wallpaper disabled by user”.

## 6. DOM / renderer integration (Candidate B)
```
MainLayout (isolation:isolate)
├─ WallpaperLayer  position:fixed; inset:0; z-index:0; pointer-events:none; background: var(--oc-wallpaper-image) center / var(--oc-wallpaper-fit) no-repeat; opacity: var(--oc-wallpaper-opacity); animation:none; filter:none; backdrop-filter:none; will-change:auto
└─ AppContent      position:relative; z-index:1
   ├─ Sidebar       background: color-mix(in srgb, var(--sidebar) calc(var(--oc-surface-sidebar-alpha)*100%), transparent)
   ├─ Header        background: color-mix(in srgb, var(--background) calc(var(--oc-surface-header-alpha)*100%), transparent)
   ├─ Chat shell    same with --oc-surface-chat-alpha / main / composer
   └─ ContextPanel  outer --oc-surface-contextPanel-alpha, inner Terminal/Editor/Diff keep background: var(--background) (alpha 1)
     └─ Portals (dropdown/tooltip/dialog) — unchanged, still z-index 50+ above content, not affected
```
- Component: `packages/ui/src/components/layout/WallpaperLayer.tsx` (reads CSS vars, renders null when disabled). Mounted as first child of `.main-content-safe-area`.
- `isolation:isolate` added to `.main-content-safe-area` only (no global html/body change). MiniChat/Mobile/VSCode: wallpaper disabled (return null).

## 7. CSS variable contract
Generated by `CSSVariableGenerator` alongside colors, only when appearance present:
```
--oc-wallpaper-image: url("/api/themes/<id>/assets/<file>") | none
--oc-wallpaper-fit: cover | contain
--oc-wallpaper-opacity: 0..1
--oc-surface-main-alpha: 0..1
--oc-surface-header-alpha
--oc-surface-sidebar-alpha
--oc-surface-chat-alpha
--oc-surface-composer-alpha
--oc-surface-contextPanel-alpha
```
- Old themes → no variables emitted → existing `bg-background` stays opaque.
- Variables consumed only at integration points (§6) via `color-mix`, not globally.

## 8. Performance constraints (Phase 3: ALPHA_OK)
- Static only, `fixed`, no animation/filter/backdrop/transform/will-change on WallpaperLayer.
- Large Surfaces never `backdrop-filter`. Small `oc-glass-*` (popover/tooltip/dialog) unchanged.
- Image limits: `max 2560×1440`, `max 4M pixels`, `file ≤ 2MB`, `formats webp/avif/jpg/png`, `decoded ≈ w*h*4` checked in server via lightweight header parse (no sharp dependency — read IHDR/WebP VP8 header, fallback to reject if unknown → warning, wallpaper off). DPR 2 does not imply 2× wallpaper.

## 9. Accessibility
- `@media (prefers-reduced-transparency: reduce)` → force `--oc-surface-*-alpha:1` and `--oc-wallpaper-opacity:0` (wallpaper hidden but not removed, surfaces opaque). Small glass already has fallback to solid in `design-system.css:265`.

## 10. Local / Remote ownership
- **Theme + assets**: owned by the *current* runtime. Local → `GET /api/themes` from Local; Remote → same endpoint from Remote (via `runtimeFetch` with `runtimeKey`). Renderer never uses Local path when connected to Remote.
- **User overrides**: stored locally per `runtimeKey` (`local` vs `host:<id>`) and per variant, in `DesktopSettings`. Host switch triggers `subscribeRuntimeEndpointChanged` → `ThemeSystemContext` reloads themes and re-resolves appearance with the correct override bucket. Disconnect → fallback to Local theme (appearance from Local).
- **Remote wallpaper with image**: Remote serves asset via its `/api/themes/.../assets` (authenticated via `runtimeFetch`); Electron main proxies as blob; if unavailable → warning, wallpaper off, theme still loads.

## 11. Platform matrix
| Feature | Electron | Web | Mobile | VSCode | MiniChat |
|---|---|---|---|---|---|
| Color theme | ✅ | ✅ | ✅ | inherit-only (adapter) | inherits main |
| Wallpaper | ✅ | ✅ | deferred | ❌ (no) | ❌ |
| Surface alpha | ✅ | ✅ | deferred | ❌ | ❌ |
| User override | ✅ per-host | ✅ per-host | — | — | — |
| Reduced-transp. | ✅ | ✅ | — | ✅ | ✅ |

## 12. Backward compatibility
- `appearance` is optional; `isValidTheme` allows absence. Old `themes/*.json` continue to load unchanged.
- New directory form coexists: loader checks `themes/<id>/theme.json` first, then `themes/<id>.json`. No migration required, no bulk rewrite.

## 13. Validation and error handling
- Zod-like validator extends `isValidTheme`: unknown appearance fields → reject appearance only; alpha out of 0..1 → clamp + warning; asset absolute/traversal/URL → reject wallpaper; format unsupported/size>limit/pixels>limit → reject wallpaper.
- `appearance.ok: boolean, warning?: string, error?: string` per theme; `colors` valid + wallpaper invalid → theme loads, wallpaper off + inline Settings warning (not toast). Missing asset → warning.
- Server asset route returns 404 with `X-Theme-Warning` rather than 500.

## 14. Settings UX (minimal)
- **Theme Appearance** section in Settings: `Wallpaper enable` (switch), `Asset` (file picker that copies into `themes/<id>/assets/`), `Fit` (cover/contain), `Opacity` slider (0.04–0.3), `Surfaces` collapsed **Advanced** with 6 sliders (0.7–1, step 0.02) + `Reset to theme defaults`. No per-pixel position, no blur controls.

## 15. Explicit non-goals (v1)
video/GIF/animated WebP, WebGL/WebGPU/particles/parallax/mouse-reactive, fullscreen `backdrop-filter` or nested glass, arbitrary CSS/JS/HTML, remote wallpaper URLs, custom font downloads. Each would need separate security/perf design.

## 16. Implementation PR plan
**PR-A (schema+loader+assets):** `types/theme.ts` + `theme-validation` + server `themes` dir support + `GET /api/themes/:id/assets/*` + `CSSVariableGenerator` appearance vars + `isValidTheme` tests. No UI.
**PR-B (renderer):** `WallpaperLayer` + `MainLayout isolation` + surface `color-mix` integration + `prefers-reduced-transparency` + `ThemeSystemContext` resolved appearance. No Settings.
**PR-C (overrides + Settings):** `DesktopSettings.appearanceOverrides` per-runtimeKey/variant + Settings UI + asset picker copy + reset. No remote proxy yet.
**PR-D (remote+polish):** Remote asset proxy, host-switch reload, docs, smoke tests. Each PR behind no-op defaults, revertible.

## 17. Test plan
- Unit: validation (traversal/format/size/pixels), CSS gen, merge, override bucket.
- Server: asset path security, symlink, MIME, 404, cache.
- Runtime: host switch (Local↔Remote) keeps correct overrides, disconnect fallback.
- Smoke: Electron + Web with/without wallpaper, reduced-transparency, wallpaper off. Paint Flashing idle 30s + Chat scroll 10s (Phase3 method) → expect `NONE` wallpaper repaint.

## 18. Open questions
- Exact default alphas per surface after user testing (current 0.88 placeholder).
- Whether to expose `position` (center/top) in v1.1 if cover is insufficient.
- Server-side image dimension read without native dep for all formats (fallback to client `Image` decode + warning if server cannot parse).
