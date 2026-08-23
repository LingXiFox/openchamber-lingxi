# LingXiFox 主题渲染架构 · 只读勘察报告

> 目标：为「低 GPU 占用的静态壁纸 + 半透明 Surface」主题扩展提供只读依据。
> 约束：本轮不改代码、不改 Electron 配置、不新增依赖。所有结论基于静态源码与最小运行时推断。
> 勘察时间：2026-08-20 · 分支与版本：`1.19.0`（`packages/ui/package.json:3`, `packages/electron/package.json:3`）
> 勘察范围：`/home/macserver/projects/openchamber-lingxi`

---

## 1. Executive Summary（给主题设计者的 10 行结论）

1. **主渲染引擎是普通 DOM/CSS**：`React 19.1.1` + `ReactDOM.createRoot` 渲染到 `#root`（`packages/ui/src/main.tsx:56`），`Vite 7.1.2`（`packages/ui/package.json:112` / `vite.config.ts:1`）构建，`Tailwind CSS 4.0`（`packages/ui/package.json:107` / `packages/ui/src/index.css:1`）驱动样式。**不存在整页 Canvas/WebGL/WebGPU 渲染**；Canvas/WebGL 只出现在局部组件内部。
2. **Electron 是不透明窗口**：`BrowserWindow { backgroundColor:'#151313', backgroundThrottling:false, transparent:未设置, vibrancy:未使用 }`（`packages/electron/main.mjs:2432`, `2845`, `2453`），未关闭硬件加速、未使用 `offscreen`，打包后通过 `openchamber-ui://app` 自定义协议加载静态资源（`packages/electron/main.mjs:106-116, 1218-1249`）。
3. **页面被不透明层完全封死**：`html/body/#root/MainLayout/Header/Sidebar/Chat` 全部 `bg-background` 或 `bg-sidebar` 不透明（`packages/ui/src/styles/design-system.css:141-145`, `packages/ui/src/components/layout/MainLayout.tsx:298,435` 等），**现在在 `body` 后面放壁纸会 100% 被遮挡**。
4. **滚动容器是 Chat 视口本身**：`ScrollShadow` 即 `div.chat-scroll.overlay-scrollbar-target`（`packages/ui/src/components/chat/ChatContainer.tsx:326-335`, `packages/ui/src/index.css:539-598`），内部用 `@tanstack/react-virtual` 虚拟化（`packages/ui/src/components/chat/MessageList.tsx:3,44-74`），而非虚拟滚动容器之外的页面滚动。
5. **已有的 glass 严格限制在 Portal 浮层**：`oc-glass-popover/tooltip/panel/backdrop`（`packages/ui/src/styles/design-system.css:206-279`）仅用于 `DropdownMenu` / `Select` / `Tooltip` / `Dialog.Backdrop` / `WorkStatusPanel overlay` 等小面积浮层（见 §7），**滚动容器内部没有 `backdrop-filter`**。
6. **潜在合成层已存在但克制**：`will-change:[width]` 仅在可拖拽侧边栏宽度动画（`Sidebar.tsx:129`, `ContextPanel.tsx:336,1106`），`transform: translateZ(0)` 仅用于 SVG icon 与 `MessageBody` 的 `contain:layout` 优化（`packages/ui/src/index.css:404`, `packages/ui/src/components/chat/message/MessageBody.tsx:62`），未滥用 `will-change` / `translate3d` 全局提升。
7. **壁纸最合理位置是 `MainLayout` 内伪元素或专用 `WallpaperLayer` 组件**：`body` 层被 `desktop-runtime` 强制 `background: var(--background)` 覆盖（`design-system.css:141-145`），直接改 `body` 背景会与 Electron `backgroundColor` 和 `desktop-runtime` 锁定冲突；`MainLayout` 的 `main-content-safe-area` 下插入一个 `position:fixed; inset:0; z-index:-1` 的独立层最不侵入且不触发全窗 blur。
8. **透明度 SAFE 边界**：`Header` / `Sidebar` / `ContextPanel` / `WorkStatusPanel(inline)` 适合受控透明；`Chat 滚动视口`、`Editor`、`Terminal`、`Diff viewer` 必须保持不透明，详见 §11。
9. **主题变量可直接复用**：`Theme.colors.surface.*` → `CSSVariableGenerator.generateSurfaceColors()`（`packages/ui/src/lib/theme/cssGenerator.ts:203-214`）已产出 `--surface-*` / `--background` / `--sidebar-*` 全量语义 token，壁纸透明度应通过 `color-mix(in srgb, var(--surface-*) <alpha>, transparent)` 实现，而非新增 token。
10. **Electron 无需改动**：只要不追求系统级毛玻璃/透明窗口，仅在 Renderer DOM/CSS 层即可实现；若需 `transparent:true + vibrancy`，则必须同步改 `BrowserWindow` 并承担跨平台一致性与性能代价（见 §10 E）。

---

## 2. Rendering Engines（确认完整技术栈，拒绝推断）

### 2.1 主 UI

| 维度 | 证据 |
|---|---|
| **React 版本** | `19.1.1`（`packages/ui/package.json:73`, `package.json:139`） |
| **ReactDOM 入口** | `createRoot(document.getElementById('root')).render(<StrictMode>...)`（`packages/ui/src/main.tsx:51-67`） |
| **Vite 版本** | `^7.1.2`（`packages/ui/package.json:112`, `packages/web/package.json:99`），配置见 `vite.config.ts:9-12`（`react()` + `themeStoragePlugin()`） |
| **Tailwind 版本** | `^4.0.0`（`packages/ui/package.json:107`），入口 `packages/ui/src/index.css:1-3`（`@import "tailwindcss"` + `@import "./styles/design-system.css"`） |
| **是否纯 DOM/CSS** | **是**。`body { @apply bg-background text-foreground }` + `html/body/#root { height:100%; overflow:hidden; overscroll-behavior:none }`（`design-system.css:124-139`）。无 `Canvas` 作为主渲染，未使用 `pixi` / `three` 等。 |
| **整页 Canvas/WebGL** | **无**。唯一出现的 `canvas` 是：① `TerminalViewport` 内 `ghostty-web` 的终端画布（`packages/ui/src/components/terminal/TerminalViewport.tsx:247` `terminal.open(container)`）；② `TerminalViewport` 测量文字宽度的临时 `document.createElement('canvas')`（`TerminalViewport.tsx:55`）。 |

### 2.2 Electron

| 维度 | 证据 |
|---|---|
| **Electron 版本** | `^43.3.0`（`packages/electron/package.json:17`） |
| **打包 UI 如何加载** | 打包时 `shouldUsePackagedUi() === true` → `openchamber-ui://app/index.html`（`packages/electron/main.mjs:1121-1149,1218-1249` `protocol.handle(UI_PROTOCOL, ...)`）；开发时走本地 `sidecar`  dev server（`buildLocalUrl` + `DEFAULT_DESKTOP_PORT 57123`）。 |
| **BrowserWindow 主要配置** | `titleBarStyle:'hidden'`（darwin 或 frameless）、`frame:false`（win32/linux）、`backgroundColor:'#151313'`、`backgroundThrottling:false`、`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`、`webviewTag:true`、`icon:windowIconPath`、`minWidth:800/minHeight:520`（`packages/electron/main.mjs:2421-2463` 主窗口，`2821-2852` mini-chat 窗口）。 |
| **是否 transparent window** | **否**。`BrowserWindow(options)` 未传 `transparent`，即默认值 `false`。源码中仅有一处 `background: transparent` 是 CSS 的 `terminal hidden input` 样式（`packages/ui/src/index.css:1529-1542`），与窗口透明无关。 |
| **是否设置 backgroundColor** | **是**，两处均为 `'#151313'`（`main.mjs:2432,2829`），与 `dark --background oklch(0.16 0.01 30) /* #151313 */` 严格一致（`design-system.css:78`），保证启动闪屏与首帧无白闪。 |
| **是否关闭硬件加速** | **否**。全仓未出现 `app.disableHardwareAcceleration()`。 |
| **是否存在 offscreen rendering** | **否**。`main.mjs` 无 `offscreen: true`。 |
| **是否使用 vibrancy / visualEffectState** | **否**。`main.mjs` 无 `vibrancy`、`visualEffectState`、`backgroundMaterial` 等字段。macOS 仅定制 `trafficLightPosition {x:16,y:17}`（`main.mjs:2439`）与 `hidden` 标题栏。 |
| **额外加固** | `sandbox` 必须保持 `false`（`main.mjs:2457-2462` 注释：`preload` 需 `contextBridge + ipcRenderer`），`contextIsolation:true` 保障渲染世界隔离；`ui` 协议注册为 `standard/secure/supportFetchAPI/corsEnabled`（`main.mjs:106-116`）。 |

### 2.3 特殊渲染器（区分“全局引擎”与“局部组件 renderer”）

| 渲染器 | 最终形态 | 触发位置 | 与全局引擎关系 |
|---|---|---|---|
| **CodeMirror 6** | **DOM**（`EditorView` 将 `contentDOM` 渲染为普通 DOM 行，gutters/selection 由 DOM 装饰） | `CodeMirrorEditor.tsx:408`（`new EditorView({ parent: host })`），用于 `FilesView`/`PlanView`/`SkillsPage`/`ComposerEditor` 等 | 局部，占比中等；`Shiki` 高亮与 `createFlexokiCodeMirrorTheme` 仅装饰 token |
| **ghostty-web `0.4.0`** | **Canvas + WASM**（`Terminal.open(container)` 在 `div` 内创建 `<canvas>`，`FitAddon` 负责自适应） | `TerminalViewport.tsx:25-247`，`WASM` 的 `Ghostty.load()` 与 `FitAddon` | 局部，独立 canvas，不参与主 DOM 合成 |
| **@pierre/diffs `1.3.0-beta.6`** | **Shadow DOM + DOM**（`diffs-container` 的 `shadowRoot` 内渲染 `pre` 行），配合 `Virtualizer` 虚拟化与 `WorkerPool` 异步高亮 | `PierreDiffViewer.tsx:863-873`（`new VirtualizedFileDiff` / `PierreFileDiff` + `WEBKIT_SCROLL_FIX_CSS` 注入 shadowRoot） | 局部，大本体但子树隔离在 shadow 内 |
| **Mermaid (`beautiful-mermaid`)** | **SVG 为主，ASCII 降级** | `MarkdownRendererImpl.tsx:3` `renderMermaidSVG`；`packages/ui/src/index.css:1454-1461` ` [data-markdown="mermaid"] svg { width:100%!important }` | 局部，`MermaidBlock` 自带 `transform` 交互视口 |
| **Markdown / 代码高亮** | **DOM + Web Worker Shiki**（`markdown-shiki.worker.ts` 创建 `createHighlighter`，主线程 `markdownCore` 消费） | `components/chat/markdown/markdown-shiki.worker.ts:3`, `markdown-worker.ts:152` | 局部，`Streamdown` 渲染为普通 DOM |
| **SVG** | **品牌与图标**（`@remixicon/react`, `packages/ui/src/App.css` 内 SVG 样式，`splash` 立方体） | 全局图标系统、`packages/web/index.html:518-571` 启动 SVG | 局部 |
| **WebGL / WebGPU / iframe / webview** | **WebGL/WebGPU：无**；`iframe` 仅用于 `ContextPanel` 的 `EmbeddedSessionChat` 子会话（`ContextPanel.tsx:1170` `<iframe src={activeChatSrc}>`）；`webviewTag:true` 仅为 `BrowserPane` 预留，未在 Electron 主流程强依赖 | `ContextPanel.tsx:1171-1188`；`packages/electron/main.mjs:2456` | 局部，`iframe` 背景 `bg-background` 不透明 |

> **一句话区分**：全局页面是 **React DOM + Tailwind + 普通 CSS 布局**；Canvas/WebGL 仅作为**终端与 Diff 两个子树**的内部实现，不代表“整页是 Canvas”。

---

## 3. React / DOM Hierarchy（沿真实组件树追踪）

### 3.1 挂载链路

```
html.h-full                        // packages/web/index.html:2
└─ body.h-full.bg-background.text-foreground   // web/index.html:513
   └─ #root.h-full                 // web/index.html:514  + design-system.css:133-139 height:100% overflow:hidden
      └─ ReactRoot                 // packages/ui/src/main.tsx:56 createRoot(rootElement)
         └─ <StrictMode>
            └─ <I18nProvider> <ThemeSystemProvider> <ThemeProvider> <SessionAuthGate>
               └─ <App apis={runtimeAPIs}>              // packages/ui/src/App.tsx:226
                  ├─ #initial-loading (splash, 10s fallback) // web/index.html:494-510  z-index:9999
                  └─ <SyncProvider> <RuntimeAPIProvider> <FireworksProvider>
                     └─ <TooltipProvider>
                        └─ div.h-full.text-foreground.{ bg-transparent | bg-background }  // App.tsx:949
                           └─ <MainLayout>               // App.tsx:952
```

`App.tsx:949` 的关键分支：

```tsx
<div className={isDesktopRuntime ? 'h-full text-foreground bg-transparent'
                                 : 'h-full text-foreground bg-background'}>
```

- **Web / PWA**：`bg-background` 不透明
- **Desktop (Electron)**：`bg-transparent`，但随即被 `MainLayout` 的 `bg-background` 覆盖，且 `design-system.css:141-145` 用 `!important` 将 `body/#root` 锁回 `var(--background)`，因此实际仍不透明（见 §5）。

### 3.2 MainLayout 桌面分支（`isMobile === false`，`packages/ui/src/components/layout/MainLayout.tsx:420-492`）

```
MainLayout.tsx:292  div.main-content-safe-area.relative.flex.h-[100dvh].bg-background  [data-page-scroll-lock]
├─ <TitlebarLeftControls />                          // 绝对定位的 caption 按钮区
├─ div.flex.flex-1.overflow-hidden                   // 横向主轴
│  ├─ <Sidebar isOpen={isSidebarOpen}>               // Sidebar.tsx:126 aside.relative.flex.border-r.bg-sidebar.will-change-[width]  width:280-500px
│  │  ├─ <SidebarTopBar />
│  │  └─ div.min-h-0.flex-1.overflow-y-auto > <SessionSidebar isVisible={isSidebarOpen} />
│  └─ div.relative.flex.flex-1.min-w-0.flex-col.overflow-hidden.bg-background  // 右侧总容器
│     ├─ <Header />                                   // Header.tsx:2567 header.header-safe-area.relative.z-10.bg-background
│     └─ div.relative.flex.flex-1.min-h-0.overflow-hidden.bg-background
│        └─ div.relative.flex.flex-1.min-w-0.flex-col.overflow-hidden.border-t.border-border.bg-background
│           └─ div.flex.flex-1.min-h-0.overflow-hidden
│              └─ div.relative.flex.flex-1.min-h-0.min-w-0.overflow-hidden[data-chat-area]  // 关键：Chat+Context 共享宽度
│                 ├─ main.flex-1.overflow-hidden.bg-background.relative  // Chat 宿主
│                 │  ├─ div.absolute.inset-0 (> ChatView)                 // ChatView.tsx:28 ChatContainer
│                 │  └─ div.absolute.inset-0 (> DiffView/FilesView 等 secondaryView) // 按 activeMainTab 切换
│                 └─ <ContextPanel />                // ContextPanel.tsx:1092 aside.flex.min-h-0.flex-col.overflow-hidden.bg-background.will-change-[width]
│                    ├─ header.h-10.border-b.border-border > SortableTabsStrip | title
│                    └─ div.min-h-0.flex-1.overflow-hidden > FilesView | BrowserPane | DiffView | TerminalView | WalkthroughView | iframe(EmbeddedChat)
└─ div.border-t.border-border > <ContextPanelRail />  // ContextPanelRail.tsx:289 w-11.bg-background.flex-col
```

### 3.3 MainLayout 移动分支（`isMobile === true`，`MainLayout.tsx:306-419`）

```
div.flex.h-[100dvh].flex-col
├─ <Header onToggleLeftDrawer / onToggleRightDrawer />  // 仅 mobile 显示
├─ div.flex.flex-1.overflow-hidden.relative
│  └─ main.w-full.h-full.overflow-hidden.bg-background.relative
│     ├─ div.absolute.inset-0 > ChatView
│     ├─ div.absolute.inset-0 > secondaryView
│     ├─ motion.div.absolute.inset-0.z-20.bg-sidebar  style x:leftDrawerX  // 左抽屉 SessionSidebar
│     └─ motion.div.absolute.inset-0.z-20.bg-sidebar  style x:rightDrawerX // 右抽屉 GitView
└─ div.absolute.inset-0.z-10.bg-background > SettingsView (仅 isSettingsDialogOpen)
```

### 3.4 Chat 容器内部（`packages/ui/src/components/chat/ChatContainer.tsx:315-405, 1094-1308`）

```
ChatContainer
├─ div.flex.h-full.flex-col.bg-background[data-composer-bound]  // 外层
│  ├─ (draftOpen ? DraftWelcome + ChatInput : Session 视图)
│  └─ ChatViewport (有 session 时)
│     └─ div.relative.min-h-0.flex-1 (isDesktopExpandedInput? absolute inset-0 opacity-0 : flex-1)
│        └─ div.absolute.inset-0
│           ├─ ScrollShadow.chat-scroll.overlay-scrollbar-target.absolute.inset-0.overflow-y-auto.z-0  // §7 关键滚动容器
│           │  ref=scrollRef  data-scroll-shadow  data-scrollbar="chat"
│           │  style { overflowAnchor:none; overscrollBehavior:contain }
│           │  └─ div.relative.z-0.min-h-full  // 滚动内容
│           │     ├─ (showLoadOlderButton? Button)
│           │     ├─ <MessageList key={currentSessionKey} />          // §7, §8
│           │     ├─ QuestionCard / PermissionCard
│           │     ├─ <SessionRecapNote />
│           │     ├─ <StatusRowContainer />
│           │     └─ div.h-[10vh|40px]  // 底部留白
│           ├─ <OverlayScrollbar containerRef={scrollRef} />           // 自定义 6px thumb, index.css:636-678
│           └─ <PromptNavigatorRail />                                 // 仅桌面非 VSCode 且 promptNavigatorEnabled
├─ div.relative.z-10.bg-background > <ChatInput />   // Composer 吸底
└─ <WorkStatusPanel /> (inline 或 overlay)            // packages/ui/src/components/chat/work-status/WorkStatusPanel.tsx:166
```

### 3.5 Portal / 浮层（`z-index` 体系）

| Portal 根 | 组件 | 文件 | DOM 节点 | position | z-index | 背景来源 | Portal |
|---|---|---|---|---|---|---|---|
| **Dialog** | `DialogContent` / `SettingsWindow` | `components/ui/dialog.tsx:89,92,64`, `views/SettingsWindow.tsx:39-60` | `BaseDialog.Portal` → `BaseDialog.Backdrop` + `div.fixed.inset-0` + `BaseDialog.Popup` | `fixed` | `z-50`（backdrop + wrapper 同层） | backdrop `oc-glass-backdrop bg-black/25`；popup `bg-background` 不透明 | `BaseDialog.Portal` |
| **Dropdown / Select / ContextMenu** | `DropdownMenuContent` / `Select` | `components/ui/dropdown-menu.tsx:115-136`, `components/ui/select.tsx:198`, `dropdown-menu.styles.ts:1` | `BaseMenu.Portal` → `BaseMenu.Positioner` → `BaseMenu.Popup` | `fixed` 由 Base UI 计算 | `z-50`（positioner）+ `z-[120]`（select 更高） | `oc-glass-popover oc-glass-floating`（`color-mix` + `backdrop-filter: blur(22/26px)`） | `BaseMenu.Portal`（可选透传到 dialog 内）|
| **Tooltip** | `TooltipContent` | `components/ui/tooltip.tsx:273-280` | `BaseTooltip.Portal` → `Positioner` → `Popup` | `fixed` | `z-50` | `oc-glass-tooltip` | `BaseTooltip.Portal` |
| **Toast** | `Toaster` (sonner) | `components/ui/sonner.tsx:84-131` | `body > [data-sonner-toaster] > [data-sonner-toast]` | `fixed`（sonner 默认右下） | 隐式高于 50 | `var(--surface-elevated)` 不透明 + 自定义 `box-shadow` | portaled 到 `document.body` |
| **Popover-like** | `McpDropdownContent` / `CommandPalette` / `TimelineDialog` / `Autocomplete` | `components/mcp/McpDropdown.tsx` 等 | `absolute` | 与触发器相邻 | 50-60 区间 | 多为 `bg-background` 或 `oc-glass-popover` | 部分 `Portal`，部分就近 `absolute` |

> 与壁纸的层级关系：所有 Portal 浮层均为 `fixed` 且 `z-50+`，**天然盖在壁纸之上**，不需要为壁纸特殊处理其层级。

---

## 4. Visual Layer Map（渲染层地图 · 只保留重要视觉层）

> 图例：`Alpha=1` 表示不透明；`Blur` 指 `backdrop-filter`；`Likely compositor = yes` 表示存在 `will-change / transform / filter / backdrop-filter / fixed / sticky` 等触发合成层 的 CSS。

| Layer | Component | File | Background | Alpha | Blur | Scroll | Portal | Likely compositor | Notes |
|---|---|---|---|---|---|---|---:|---|---|
| L0 | `html` | `web/index.html:2` | `--splash-background`（启动后由 `--background` 接管） | 1 | — | no | no | no | 启动首帧，`color-scheme` 由 `localStorage` 阻塞脚本设置 |
| L1 | `body` | `web/index.html:513` + `design-system.css:124` | `bg-background`（`hsl(var(--background))`） | 1 | — | no | no | no | `desktop-runtime` 下被 `!important` 锁回 `var(--background)` |
| L2 | `#root` | `web/index.html:514` + `design-system.css:133` | 继承 `body`，`desktop-runtime` 显式 `background:var(--background)!important` | 1 | — | no | no | no | `height:100% overflow:hidden overscroll-behavior:none` |
| L3 | `App` wrapper | `App.tsx:949` | `bg-background`（web） / `bg-transparent`（desktop，对实际无影响） | 1 | — | no | no | no | Desktop 的 `transparent` 仅为代码分支，真实仍不透明 |
| L4 | `MainLayout` root | `MainLayout.tsx:292` | `bg-background` | 1 | — | no | no | no | `main-content-safe-area h-[100dvh]` |
| L5 | `Header` | `Header.tsx:2567` | `bg-background` | 1 | — | no | no | — | `relative z-10`；移动端 `backdrop-blur`（`MobileHeader.tsx:71` `bg-background/95 backdrop-blur`）是唯一 Header 级 blur |
| L6 | `Sidebar` | `Sidebar.tsx:126-144` | `bg-sidebar`（`--surface-muted`） | 1 | — | inner `overflow-y-auto` | no | **yes** (`will-change:[width]`) | 拖拽时 `will-change` short-lived；关闭时 `opacity:0` + `pointer-events:none` |
| L7 | `Main column` | `MainLayout.tsx:438` | `bg-background` + `border-t` | 1 | — | no | no | no | 包裹 `Header` 与 Chat 区域的列 |
| L8 | `Chat shell` | `MainLayout.tsx:445` + `ChatContainer.tsx:1114` | `bg-background` | 1 | — | no | no | no | `flex-1 overflow-hidden relative` |
| L9 | **`Chat scroll viewport`** | `ChatContainer.tsx:326-335` | `transparent`（由 `ScrollShadow` 容器透出 `bg-background` 来自外层） | 1（外层） | **NO**（刻意避免） | **YES — 主滚动容器** | no | **yes** (`sticky` 子项 + `contain:layout translateZ(0)` 在条目) | **性能最敏感**；`ScrollShadow` 用 `mask-image` 线性渐变而非 `backdrop-filter` |
| L10 | `Message items` | `MessageList.tsx:1147-1176` + `MessageBody.tsx:62` | `bg-background` / 卡片 `bg-surface-*` | 1 | — | no | no | **yes**（`transform:translateZ(0)` + `contain:layout` 优化重排） | TanStack 虚拟化条目 |
| L11 | `Composer (ChatInput)` | `ChatContainer.tsx:1170` 等 | `bg-background` (`relative z-10`) | 1 | — | no | no | `fixed`（移动端全屏输入时） | 移动端全屏输入通过 `visualViewport` 固定定位 |
| L12 | `WorkStatusPanel inline` | `WorkStatusPanel.tsx:182,203` | `bg-[var(--surface-muted)]/40` + `shadow` | 0.4 | **NO** | inner `overflow-y-auto` | no | **yes** (`translateX` + `width` 过渡) | 与 `ContextPanel` 同步 200ms cubic-bezier |
| L13 | `WorkStatusPanel overlay` | `WorkStatusPanel.tsx:196` | `oc-glass-panel`（`color-mix … 52% + blur 22/26px`） | 0.52 | **YES** 22/26px | inner | no | **yes** (`backdrop-filter` → 合成层) | 仅在 Chat 窄时以 dropdown 形态出现，面积小 |
| L14 | `ContextPanel` | `ContextPanel.tsx:1092-1108` | `bg-background` | 1 | — | inner（各 view 自滚动） | no | **yes** (`will-change:[width]` + `transition:[width]`) | 宽度 380-1400px，可 `absolute inset-y-0 right-0 z-20` 展开 |
| L15 | `ContextPanelRail` | `ContextPanelRail.tsx:289` | `bg-background` | 1 | — | no | no | no | `w-11` 固定竖条 |
| L16 | `TerminalView` | `TerminalViewport.tsx:536` | 由 `TerminalTheme.background` 注入 canvas | 1 | — | canvas 内部 | no | **yes**（canvas 单独层） | `ghostty-web` 的 `<canvas>` 是独立绘制层 |
| L17 | `CodeMirror editor` | `CodeMirrorEditor.tsx:511-518` | `bg-background` + 主题 token | 1 | — | `cm-scroller` 内滚动 | no | **yes**（行装饰、gutter sticky） | `EditorView` 自管理滚动，不依赖外层 |
| L18 | `Diff viewer` | `PierreDiffViewer.tsx:1092-1103` | `--diffs-bg`（`--surface-elevated`）+ shadowRoot 样式 | 1 | — | `ScrollableOverlay` / `Virtualizer` | no | **yes**（`Virtualizer`） | Shadow DOM 内部虚拟化 |
| L19 | `OverlayScrollbar` | `index.css:636-678` | thumb `var(--oc-scrollbar-thumb)` | 0.8 | — | no | no | **yes** (`will-change: transform,height`) | 非原生滚动条，`pointer-events:none` 容器 + `absolute` thumb |
| L20 | `Dialog overlay` | `dialog.tsx:64` | `oc-glass-backdrop bg-black/25` | 0.25 | **4px** | no | **yes** | **yes**（`backdrop-filter` + `fixed`） | 全屏但仅在弹窗时出现 |
| L21 | `Dialog content` | `dialog.tsx:91-96` | `bg-background` | 1 | — | `overflow-y-auto` | **yes** | no | `max-w-lg` / `SettingsWindow` `w-[90vw] h-[85vh]` |
| L22 | `Dropdown / Select` | `dropdown-menu.styles.ts:1` | `oc-glass-popover oc-glass-floating` | 0.50 | **22/26px** | — | **yes** | **yes**（`backdrop-filter floating shadow`） | 小面积卡片 |
| L23 | `Tooltip` | `tooltip.tsx:280` | `oc-glass-tooltip` | 0.62/0.64 | **22/26px** | — | **yes** | **yes** | 更小面积 |
| L24 | `Toast` | `sonner.tsx:107-109` | `var(--surface-elevated)` | 1 | — | — | **yes** | no (shadow 优化后固定) | 非 glass，避免重叠 blur |

---

## 5. Background Coverage Map（如果在 `body` 后面放壁纸，谁会挡住它）

### 5.1 结论：全部挡住

| 元素 | 实际背景 | 覆盖结果 | 关键证据 |
|---|---|---|---|
| `html` | `--splash-background` → `--background` | **挡住** | `web/index.html:494`, `design-system.css:2,36,78` |
| `body` | `bg-background` 且 `desktop-runtime` 锁 `!important` | **挡住** | `design-system.css:117-127` + `141-145` |
| `#root` | 同上 `!important` | **挡住** | 同上 |
| `desktop-runtime body/#root` | `background:var(--background)!important` | **挡住**（即使 `App.tsx:949` 尝试 `bg-transparent`） | `design-system.css:141-145` |
| `MainLayout` | `bg-background` | **挡住** | `MainLayout.tsx:292,435,438` |
| `Header` | `bg-background`（`z-10`） | **挡住** | `Header.tsx:2567` |
| `Sidebar` | `bg-sidebar` 不透明 | **挡住** | `Sidebar.tsx:130` + `design-system.css:61,102` |
| `Chat root` | `bg-background` | **挡住** | `ChatContainer.tsx:1103,1114` |
| `Message list viewport` | 外层 `bg-background`，条目亦不透明 | **挡住** | `ChatContainer.tsx:326-352`，`design-system.css:539-598` `chat-scroll` |
| `Composer` | `bg-background relative z-10` | **挡住** | `ChatContainer.tsx:1170` |
| `ContextPanel` | `bg-background` | **挡住** | `ContextPanel.tsx:1098` |
| `ContextPanelRail` | `bg-background` | **挡住** | `ContextPanelRail.tsx:289` |
| `Settings` | `bg-background`（`SettingsWindow` `bg-background`, `SettingsView` 全 `bg-background`） | **挡住** | `SettingsWindow.tsx:53`, `SettingsView.tsx:1023-1039` |
| `Terminal` | Canvas 填充 `TerminalTheme.background`，容器 `overflow-hidden` | **挡住** | `TerminalViewport.tsx:241-247` |
| `Editor` | `bg-background` + `cm-scroller` 不透明 | **挡住** | `CodeMirrorEditor.tsx:511-518` |

> **一句话**：当前架构是 **“五层不透明三明治”**：`body → #root → MainLayout → Column → Chat/Sidebar` 每一层都自带全幅不透明背景，若不把某一层改透明，任何位于 `body` 背景层的壁纸都不可见。

### 5.2 特别注意：`design-system.css:133-145` 的“锁定”

```css
:root, :root body, :root #root {
  height: 100%;
  overflow: hidden;          /* 页面滚动被禁用，滚动必须在子容器 */
  overscroll-behavior: none;
}
:root.desktop-runtime body,
:root.desktop-runtime #root {
  background: var(--background) !important;
  background-color: var(--background) !important;
}
```

- 这两条规则**用 `!important` 覆盖了任何 `body` 透明化尝试**，目的是让 Electron 的 `backgroundColor:'#151313'` 与 CSS 首帧一致。
- 若壁纸方案想让 `body` 透明，必须**同时**满足：① 移除或覆写该 `!important`；② 将 `BrowserWindow.backgroundColor` 设为透明或与壁纸底色一致；③ 在 `MainLayout` 内提供新的不透明“卡片”层。否则要么壁纸不可见，要么启动白闪/黑闪。

### 5.3 不要只看变量定义，要追踪 consumer

- `--background` 定义于 `design-system.css:36,78`，但 **consumer 远多于变量本身**：`index.css:117,125`（`body`）、`MainLayout.tsx:292/298/349/359/385/397/409/435/438/445`、`ChatContainer.tsx:1100-1308` 中 12+ 处 `bg-background`、`Header.tsx:2567`、`Sidebar.tsx:130`（`bg-sidebar`）、`ContextPanel.tsx:336` 等。
- `color-mix` 亦非仅装饰：在 `Glass` 与 `diff` 覆盖中使用 `color-mix(in srgb, var(--surface-*) …)`（`design-system.css:213`, `index.css:53,81,89`），改变 `Surface.alpha` 需评估其与 `color-mix` 的叠加效果。

---

## 6. Scroll / Virtualization Model（为什么这决定了 blur 成本）

### 6.1 谁负责滚动

- **主滚动容器**：`ChatContainer.tsx:326-337` 的 `ScrollShadow`（即 `div.chat-scroll.overlay-scrollbar-target.absolute.inset-0.overflow-y-auto`），`ref={scrollRef}` 传入 `useChatAutoFollow` 与 `MessageList`。
- **滚动锁定**：`design-system.css:133-139` 禁止页面级滚动；所有滚动必须发生在上述 `chat-scroll` 容器内。`data-page-scroll-lock="true"` 在 `MainLayout` 各层重复标记，作为 JS 侧滚动兜底。
- **滚动阴影**：`ScrollShadow.tsx:44-174` 通过 `data-top-scroll / data-bottom-scroll / data-top-bottom-scroll` 切换 `mask-image` 线性渐变（`index.css:257-322`），**用 `mask-image` 而非 `backdrop-filter` 实现阴影**，避免合成成本。
- **自定义滚动条**：`OverlayScrollbar`（`components/ui/OverlayScrollbar.tsx` + `index.css:636-678`）接管 `chat-scroll` 的滚动条，`thumb` 为 `absolute` 小圆角，`will-change: transform,height`。

### 6.2 消息列表虚拟化

- **引擎**：`@tanstack/react-virtual`（`packages/ui/src/components/chat/MessageList.tsx:3,44-74`），而非 `virtua`。
  - `TANSTACK_ESTIMATED_ENTRY_SIZE 320px`，`overscan 8`（桌面）/`16`（移动）(`MessageList.tsx:53-60`)。
  - `anchorTo:'end'`（Bottom-anchored），`elementScroll` 自定义 `scrollToFn` 在写入前更新 `height` 避免高度突变（`MessageList.tsx:1055-1062`）。
  - `shouldAdjustScrollPositionOnItemSizeChange` 仅对视口**上方**重测量的条目补偿滚动（`MessageList.tsx:1077-1081`），避免展开工具调用时视口抖动。
  - 移动端“安静窗口”策略：触摸/惯性滚动期间，`prependAbove` 的历史加载被延迟至 `HISTORY_PREPEND_QUIET_MS 160ms` 安静期或 `MAX_HOLD_MS 1500ms` 超时（`MessageList.tsx:83-1030`）。
- **`virtua` 的归属**：`virtua 0.49.1` **仅用于** `Settings` 与 `SessionSidebar` 的 `archived` 分组（`components/session/sidebar/SessionGroupSection.tsx:5`），与 Chat 主滚动无关。
- **阈值**：`MESSAGE_LIST_VIRTUALIZE_THRESHOLD = 5`（`MessageList.tsx:32`）以下短列表不虚拟化，走 `engine:'none'` 直渲染。

### 6.3 滚动时哪些父层固定

- `Header`、`Sidebar`、`ContextPanel`、`ContextPanelRail` 均在 `chat-scroll` **之外**，滚动时完全固定，不随 Chat 内容平移。
- `Composer`（`ChatInput`）位于 `ChatContainer` 的 `relative z-10 bg-background` 吸底区，不随滚动移动。

### 6.4 在 Chat Surface 上加 `backdrop-filter` 的后果

- **会触发每帧重绘**：`backdrop-filter` 需要读取**背后**像素，Chromium 必须在滚动时对过滤区域做 **backdrop 计算 + 合成**。若将 `backdrop-filter` 放在 `chat-scroll` 容器本身或其内部宽条（如 `MessageList` 条目），滚动每一帧都需重算背后内容。
- **虚拟化放大代价**：TanStack 虚拟化使得滚动时 DOM 条目高速进出，背后内容持续变化 → `backdrop-filter` 缓存失效，无法复用纹理。
- **结论**：`Chat 滚动视口**禁止** `backdrop-filter`**（见 §11 DO NOT BLUR）。唯一可接受的 blur 是**浮于滚动之外**的小面积 `fixed` 浮层（如 `PromptNavigatorRail` 已用 `oc-glass-*` 仅当卡片悬浮时）。

---

## 7. Glass & Compositor Analysis（现有透明与潜在合成层）

### 7.1 玻璃 token

```css
/* design-system.css:19-24（light） / 72-76（dark） */
--oc-glass-blur: 22px (light) / 26px (dark);
--oc-glass-opacity: 52% (light) / 50% (dark);
--oc-glass-popover-opacity: 50% / 52%;
--oc-glass-tooltip-opacity: 62% / 64%;
--oc-glass-saturation: 1.24 / 1.16;
```

对应类（`design-system.css:206-279`）：

- `.oc-glass-popover/.oc-glass-tooltip/.oc-glass-panel { background-color: color-mix(in srgb, var(--oc-glass-color) var(--oc-glass-opacity), transparent); -webkit-backdrop-filter: blur(var(--oc-glass-blur)) saturate(var(--oc-glass-saturation)); backdrop-filter: 同上 }`
- `.oc-glass-panel { --oc-glass-color: var(--surface-muted) }`；`popover/tooltip { --oc-glass-color: var(--surface-elevated) }`
- `.oc-glass-floating` 追加内外双层阴影（`design-system.css:232-250`）
- `.oc-glass-backdrop { backdrop-filter: blur(4px) }`（`design-system.css:252-255`）轻量全屏遮罩

`@supports not (backdrop-filter)` 与 `@media (prefers-reduced-transparency:reduce)` 均有 **纯色降级**（`design-system.css:257-279`）。

### 7.2 哪些组件真正消费

| 组件 | 类 | 面积 | 证据 |
|---|---|---|---|
| `DropdownMenu` / `Select` 下拉 | `oc-glass-popover oc-glass-floating` | 小（`min-w-[8rem]` 卡片） | `dropdown-menu.styles.ts:1`, `select.tsx:198` |
| `Tooltip` | `oc-glass-tooltip` | 极小（`w-fit` 气泡） | `tooltip.tsx:280` |
| `Dialog.Backdrop` / `SettingsWindow.Backdrop` | `oc-glass-backdrop` + `bg-black/25` | 全屏但仅弹窗时 | `dialog.tsx:64`, `SettingsWindow.tsx:41` |
| `BrowserAddressSuggestions` | `oc-glass-popover oc-glass-floating` | 小（地址建议下拉） | `BrowserAddressSuggestions.tsx:29` |
| `WorkStatusPanel overlay` | `oc-glass-panel` | 中小（`~280px` 侧卡，`absolute right-3 top-3`） | `WorkStatusPanel.tsx:196` |
| `DiffView` 吸顶栏 | `bg-[var(--surface-elevated)]/90 backdrop-blur-md` | 条带（`sticky top-0 z-30`） | `DiffView.tsx:760`, `WalkthroughStream.tsx:87` |
| `MobileHeader` | `bg-background/95 backdrop-blur` | 横条 `relative z-30` | `MobileHeader.tsx:71` |
| `Browser annotation overlay`（注入到 `BrowserPane` 的 iframe 外浮层）| 运行时 `THEME.glassSurface + glassFilter` | 小工具条 | `browser/annotationOverlay.ts:218,222`, `browser/overlayTheme.ts:70-72` |

### 7.3 覆盖面积与嵌套风险

1. **单个 Glass 面积均小**：除 `Backdrop` 全屏外，其余均为下拉/气泡/小卡片，**不构成大面积 blur**。
2. **无 Glass 套 Glass**：现有 `Popover` 内不会再渲染另一个 `oc-glass-*` 浮层；`Dialog` 的 `Popup` 本身 `bg-background` 不透明，不会与 `Backdrop` 的 4px blur 叠加为双重过滤。
3. **滚动容器内无 backdrop-filter**：`chat-scroll` 与 `MessageList` 条目均无 `backdrop-filter`，**符合低功耗原则**。
4. **无 fullscreen `backdrop-filter: blur(22px)`**：仅 `backdrop` 使用 4px 轻量 blur，且仅在交互时短暂出现。
5. **无大量重复 card blur**：Chat 消息卡片、工具卡片、CodeBlock 均用纯色 `bg-surface-*`，未启用 glass。

### 7.4 触发合成层的静态信号

| 信号 | 出现位置 | 是否会新增 compositor layer |
|---|---|---|
| `transform` / `translateZ(0)` | `index.css:404`（SVG icon `translateZ(0)`）、`MessageBody.tsx:62`（`contain:layout + translateZ(0)`）、`WorkStatusPanel.tsx:214-220`（`translateY/scale` 过渡） | **会**，但范围小且短时 |
| `will-change` | `Sidebar/ ContextPanel` 的 `will-change:[width]`（`Sidebar.tsx:129`, `ContextPanel.tsx:336,1106`）、`OverlayScrollbar thumb` 的 `will-change: transform,height`（`index.css:662`） | **会**，但仅在拖拽/动画期间；`index.css:429,662,1678` 等均为有限状态 |
| `filter` / `backdrop-filter` | `design-system.css:214-255`, `App.css:11 will-change:filter`（fireworks） | **必会**，但当前仅限小浮层 |
| `position: fixed` | `Dialog`、`Tooltip`、`Dropdown` 定位器、`Toast` | **会**，但数量少且不在滚动路径 |
| `position: sticky` | `MessageList` 的 `TurnItem` 用户消息头、`Sidebar SessionGroupSection` 的 `stickyZoneHeaders`（`sidebar/sortableItems.tsx:260`, `SidebarActivitySections.tsx:183`）、`DiffView` 吸顶栏（`DiffView.tsx:760`） | **会**，Chat 的 sticky 是核心交互，但已有 `contain` 优化 |
| `contain: layout` | `MessageBody.tsx:62` | **会**（隔离子树），但用于**降**成本而非增成本 |
| `animation` / `transition` | `pill-tabs` 280ms、`MainLayout` motion spring 400/35、`WorkStatusPanel` 200ms、`index.css` 多处 | 短时；`index.css:42-47` 在 `oc-theme-switching` 时全局 `transition:none` 以避免切换动画污染 |

> **总体**：合成层数量**受控**、生命周期**短暂**、面积**小**，未出现“整窗 `will-change: transform`”或“滚动容器 `backdrop-filter`”等反模式。

---

## 8. Special Renderers（这些区域将来应禁止透明或单独策略）

### 8.1 Terminal — `ghostty-web 0.4.0`

- **最终渲染**：`Canvas`（`TerminalViewport.tsx:247` `terminal.open(container)` 在 `div.terminal-viewport-container` 内创建 `<canvas>`）+ **WASM VT 解析**（`Ghostty.load()` 通过 `ghostty-web` 的 WASM 模块，`TerminalViewport.tsx:25-28`）。
- **非 WebGL**：`ghostty-web` 不使用 WebGL，而是 2D Canvas 渲染器；`FitAddon`（`packages/ui/src/components/terminal/TerminalViewport.tsx:245`）负责尺寸自适应。
- **字体**：`JetBrainsMono / FiraCode Nerd Font` 按需懒加载（`TerminalViewport.tsx:35-44` `ensureNerdFonts`，`web/index.html:600-631` `__openchamberEnsureNerdFonts`），`NERD_FONT_WAIT_MS 2000ms` 有界等待。
- **主题策略**：**禁止透明**。终端内容依赖 `TerminalTheme.background` 纯色以保证 `COLORFGBG` 与对比度；`getGhosttySafeResetSequence`（`TerminalViewport.tsx:128,258`）会用该纯色重置，已针对透明做加固，若改为半透明将导致 ANSI 色彩与底层内容叠加、对比度灾难。

### 8.2 Editor — CodeMirror 6

- **渲染**：`EditorView` 将文档行渲染为普通 DOM（`CodeMirrorEditor.tsx:408` `new EditorView({ parent: host })`），`gutters`（`gutters({ fixed:true })` + `lineNumbers`）为 sticky DOM 元素，`cm-scroller` 为独立滚动容器。
- **性能隔离**：`forceParsing` 与 `requestMeasure` 在初始化与每次 `extensions` 变更后显式触发（`CodeMirrorEditor.tsx:413,444,452`），避免长文档首帧阻塞。
- **主题策略**：**默认不透明**。编辑器已通过 `flexokiTheme` 与 `shikiHighlightExtension` 产生高对比 token 色，半透明会使行号与注释可读性骤降；若需壁纸，可仅让编辑器**外框**透明，内容区保留 `bg-background`。

### 8.3 Diff — `@pierre/diffs 1.3.0-beta.6`

- **输出**：**Shadow DOM**（`diffs-container` 的 `shadowRoot` 内 `pre` 行）+ **Web Worker 高亮**（`DiffWorkerProvider.tsx:55` `import('@pierre/diffs/worker')` + `WorkerPoolManager`）+ **Virtualizer 虚拟化**（`PierreDiffViewer.tsx:390-423` `Virtualizer.setup(root, content)`）。
- **样式隔离**：`WEBKIT_SCROLL_FIX_CSS`（`PierreDiffViewer.tsx:82-193`）注入 shadowRoot，`--diffs-bg` 等变量通过 `style.setProperty` 同步（`PierreDiffViewer.tsx:674-736`）。
- **主题策略**：**禁止对 Diff 内容区加 blur/透明**。其 `pre` 背景与增/删行色已通过 `terminal.ansiGreen/Red/Blue` 派生，半透明会使对比度失效；`ScrollableOverlay` 的滚动已虚拟化，blur 会显著增大每帧 cost。

### 8.4 Mermaid — `beautiful-mermaid 1.1.3`

- **输出**：**SVG** 为主，ASCII 降级（`MarkdownRendererImpl.tsx:3` `renderMermaidSVG / renderMermaidASCII`；`index.css:1454-1461` 对 `svg` 强制 `width:100%`）。
- **交互**：`[data-markdown="mermaid-viewport"]` 为 `overflow:hidden + touch-action:none` 的缩放/拖拽视口（`index.css:1423-1442`），全屏模式通过 `markdown-mermaid-fullscreen` 放大（`index.css:1464-1527`）。
- **主题策略**：**可保持卡片级半透明边框**，但 `mermaid svg` 本身背景应为 `var(--surface-elevated)` 不透明，避免图形线条与壁纸干扰。

### 8.5 其他 Markdown / Syntax

- `marked` + `shiki` 通过 `markdown-shiki.worker.ts` 的 `createHighlighter` 异步高亮，主线程仅拼装 `HTML`（`markdown/markdown-worker.ts:152` 注释强调“每行布局的一次性 tokenize”）。
- `KaTeX` 已提前随主包加载（`index.css:6-31`），避免首条含公式消息的 late stylesheet reflow。

---

## 9. Performance Risks（当前架构的潜在 GPU 高负载点 · 只识别，不优化）

> 主题目标：**静态壁纸 + 半透明 Surface 在空闲时不应产生持续渲染负担**（禁止 `requestAnimationFrame` 常驻、视频/动画壁纸、WebGL 特效、全窗 blur、嵌套 blur、滚动容器大面积 blur、大原图常驻、空洞 `will-change`、无限 CSS 动画）。

| # | 风险点 | 文件 | 机制 | 触发条件 | 影响 |
|---|---|---|---|---|---|
| R1 | **`Motion` 抽屉弹簧动画** | `MainLayout.tsx:132-154`（`animate(leftDrawerX, {... stiffness:400,damping:35 })` + 对 `rightDrawerX` 同） | `motion/react` 对 `x` 的 JS 驱动 spring | 移动端抽屉开合 | 抽屉宽度为视口宽，全幅 `transform` 动画；但短时且仅移动端 |
| R2 | **`will-change:[width]` 常驻** | `Sidebar.tsx:129`, `ContextPanel.tsx:336,1106` | 宽度过渡 `200ms cubic-bezier(0.22,1,0.36,1)` | 侧边栏/上下文面板拖拽与展开/收起 | 动画期间提升为合成层，结束后浏览器回收；若壁纸层被误设 `will-change` 会常驻 |
| R3 | **`Tailwind` 动画与 `transition-all`** | `dropdown-menu.styles.ts:1`（`transition-all duration-150`）、`dialog.tsx:64-99`、`tooltip.tsx:280` | `opacity + scale + transform` 同步 | 下拉/弹窗/气泡显隐 | 短时，但若未来给全窗加 `transition-all` 会误伤 |
| R4 | **`backdrop-filter: blur(22/26px)` 的合成成本** | `design-system.css:214-215` | 读取背后像素→模糊→合成 | 任何 `oc-glass-*` 元素可见时 | 当前仅小面积浮层，成本可控；**若误用于 Chat 视口或全屏卡片则每滚动帧重算** |
| R5 | **`TanStack Virtual` 的高速 DOM 进出** | `MessageList.tsx:1147-1177` | 视口移动时 `virtualItems` 重建 + `measureElement` | 快速滚动、历史 `prepend` | 已有 `overscan 8/16` 与 `isAtEnd` 阈值缓冲；但若叠加 `backdrop-filter` 会使虚拟化成本倍增 |
| R6 | **`Ghostty Canvas` 常驻重绘** | `TerminalViewport.tsx:158-179` `flush()` + `terminal.write` 队列 | VT 输出到达时写入 canvas | 终端有输出时 | 仅终端 Tab 可见时活跃；若给终端容器加透明+blur，会与 canvas 频繁互染 |
| R7 | **`@pierre/diffs` Virtualizer + Worker** | `PierreDiffViewer.tsx:390-461` | 虚拟滚动 + `MutationObserver` + `requestAnimationFrame` 双重触发重绘 | 大 Diff 打开 | 已通过 `LARGE_CONTENT_BYTES 500k` 降级高亮；但 `wakeVirtualizer` 的 `scroll+resize` 事件分发（`PierreDiffViewer.tsx:435-453`）在壁纸层透明时可能误触发重合成 |
| R8 | **`ScrollShadow` 的 `mask-image` 线性渐变** | `index.css:257-322` | 每滚动帧更新 `data-*scroll`，触发 `mask-image` 重算 | Chat 滚动到顶/底 | 比 `backdrop-filter` 轻，但仍是滚动路径上的样式计算；避免在此层再叠加 `filter` |
| R9 | **全局 `svg` 的 `translateZ(0)`** | `index.css:404` `button svg:not(.animate-spin){ transform:translateZ(0) }` | 强制提升所有按钮图标 | 常驻 | 单个成本低，但全页图标数量多时合成层计数上升 |
| R10 | **`MessageBody` 的 `contain:layout + translateZ(0)`** | `MessageBody.tsx:62` `CONTAIN_LAYOUT_STYLE` | 隔离每条消息子树的布局 | 每条消息 | 正确用法（降低重排范围），但若再在消息卡上加 `backdrop-filter` 会抵消其收益 |
| R11 | **`OverlayScrollbar` 的 `will-change: transform,height`** | `index.css:662` | thumb 跟随滚动 | 滚动时持续 | 仅 6px 窄条，影响可忽略 |
| R12 | **启动闪屏的 `10s` 保活定时器** | `web/index.html:581-593` | `setTimeout` + `fetch` 探测 manifest | 冷启动 | 非渲染成本，但会延长 `initial-loading` 的存在时间，若壁纸在此层之下会被其不透明背景遮挡更久 |

> **当前未发现**：`requestAnimationFrame` 常驻、`WebGL` 主渲染、`video` 背景、`full-window blur`、`nested blur`、`will-change: scroll-position` 滥用等反模式。

---

## 10. Recommended Wallpaper Insertion Points（只比较，不实施）

### A. 最适合的插入位置（按推荐度排序）

| 候选 | 插入 DOM | CSS 前瞻 | 优点 | 缺点 | 适用主题形态 |
|---|---|---|---|---|---|
| **A1 推荐 · `MainLayout` 内 `WallpaperLayer` 组件** | `MainLayout.tsx:292` 的 `div.main-content-safe-area` 内，**作为第一个子元素**：`<WallpaperLayer aria-hidden />` → `position:fixed; inset:0; z-index:-1; background: var(--wallpaper-image) center/cover; opacity: var(--wallpaper-opacity); pointer-events:none` | 独立层，不继承滚动；`z-index:-1` 天然位于所有 `bg-background` 卡片之下，但**在 `body/#root` 之上**，避开 `desktop-runtime !important` 锁定 | ① 不改 `body` 即可见（只需将上层改为半透明）；② 与 Electron `backgroundColor` 无耦合；③ 易做懒加载、响应式与 `prefers-reduced-motion`；④ 与 `MainLayout` 的 `safe-area` 系统天然对齐 | 需将部分上层 `bg-background` 改为 `bg-background/xx`（见 §11） | 静态壁纸/渐变/低频纹理（目标形态） |
| **A2 备选 · `MainLayout` 伪元素** | `MainLayout.tsx:295` 的 `className` 增加 `before:content-[''] before:fixed before:inset-0 before:z-[-1] before:bg-[image]` | 零额外 DOM，纯 CSS | 最少改动，利于 `!important` 覆盖 | 难以做图片懒加载、模糊预加载与 `srcSet`；Tailwind 伪元素 `background-image` 需任意值，易误触发 `content` 争议 | 渐变/纯色壁纸 |
| **A3 备选 · `body::before`** | `design-system.css:141` 覆写 `desktop-runtime body::before` 为壁纸层 | 理论上最底层，能被所有上层透出 | 概念最干净 | **被 `!important` 锁定**，需更高优先级的 `!important` 或 `layer` 覆盖；与 Electron 启动色 `#151313` 视觉断层；`body` 的 `overflow:hidden` 使伪元素定位受限 | 不推荐，除非重构 `design-system.css` 的锁定 |
| **A4 不推荐 · `#root` sibling** | 在 `web/index.html:514` 的 `#root` 同级插入 `<div id="wallpaper">` | `position:fixed; inset:0` | 完全独立于 React 树，可由非 React 代码控制 | 需改 `index.html`（影响所有运行时），且 `#root` 的 `height:100% overflow:hidden` 会裁剪 sibling 的交互；与 `App.tsx:949` 的 `bg-background` 逻辑重复 | 仅当需要跨 `mini-chat.html` 共享壁纸时 |
| **A5 不推荐 · Electron native background** | `BrowserWindow.backgroundColor` 改透明 + `titleBarStyle hiddenInset` + `vibrancy` | 系统级毛玻璃，可与壁纸联动 | 真正的系统级材质 | ① 需 `transparent:true`（`performance/userData` 路径影响）；② 跨平台不一致（Linux/Windows 无 vibrancy）；③ 与 `design-system` 的 `oklch` 语义冲突；④ 失去 `#151313` 的启动一致性保护 | 仅当目标是“系统毛玻璃”而非“静态壁纸”时 |

> **决策建议**：**A1** 为唯一符合“静态壁纸 + 半透明 Surface 空闲零负担”的方案。壁纸层应为**单层、固定、不参与滚动、不带 `backdrop-filter`、不设 `will-change`**，仅用 `background` + `opacity`。

### 壁纸层的低功耗守则（供 A1 直接套用）

```css
.wallpaper-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--wallpaper-image, none) center / cover no-repeat;
  opacity: var(--wallpaper-opacity, 0.12);
  /* 禁止：animation, backdrop-filter, filter, will-change, transform */
}
@media (prefers-reduced-transparency: reduce) {
  .wallpaper-layer { display: none; }
}
```

图片策略：单张 WebP/AVIF ≤ 200KB，`cover` 前做 `blur(2px)` 预压缩，**不设 `will-change`**，加载后通过 `image.decode()` 再淡入，避免首帧 `requestAnimationFrame`。

---

## 11. Recommended Transparency Boundaries（哪些 Surface 适合透明）

> 透明度通过 `color-mix(in srgb, var(--token) <alpha>, transparent)` 或 `rgb(from var(--token) r g b / <alpha>)` 实现，**不要**新增 `--wallpaper-*` 语义色，保持与 `CSSVariableGenerator` 的复用（见 §10 C）。

### SAFE（可直接启 alpha，面积可控，滚动外）

| Surface | 当前背景 | 建议 alpha | 证据 |
|---|---|---|---|
| **`Header`** | `bg-background` `relative z-10` | `88-92%`（light 更不透明） | `Header.tsx:2567`、`MainLayout.tsx:436`；固定横条，滚动时不移动，blur 成本低 |
| **`Sidebar`（左会话列表）** | `bg-sidebar`（`--surface-muted`） | `82-88%` | `Sidebar.tsx:130`；独立 `overflow-y-auto`，但列表滚动高度有限；`will-change:[width]` 仅动画时 |
| **`ContextPanelRail`** | `bg-background` `w-11` | `90-95%` | `ContextPanelRail.tsx:289`；极窄，不影响可读性 |
| **`SettingsView` 侧边栏** | `bg-sidebar`（桌面分割布局） | `90%` | `SettingsView.tsx:1012` `isVSCode ? bg-background : bg-sidebar`；非滚动主路径 |
| **`WorkStatusPanel inline`** | `bg-[var(--surface-muted)]/40` | 已为 `0.4`，可保持 | `WorkStatusPanel.tsx:203`；窄卡，随 Chat 一同滚动但高度受限 |
| **`Tooltip / Dropdown` 等 Portal** | 已是 `oc-glass-*` 50-64% | **保持**，不另增透明 | `dropdown-menu.styles.ts:1`, `tooltip.tsx:280`；已验证面积小 |

### CAUTION（可谨慎启，需加可读性兜底）

| Surface | 风险 | 条件 |
|---|---|---|
| **`ContextPanel` 内容区** | 内容为 `FilesView`/`Diff`/`Terminal`/`Browser` 等高密度阅读区，透明会降低行对比度 | 仅允许 `bg-background/92-96%`，且 `Editor`/`Terminal`/`Diff` 的**内层内容区**保持 `1`（即“边框透明、内容不透明”） |
| **`SettingsWindow` popup** | `w-[90vw] h-[85vh]` 大卡，`border + shadow` | 若透明，需同步加深 `border` 与 `shadow`，并确保 `ScrollableOverlay` 内文字不透出壁纸 |
| **`Composer（ChatInput）`** | 位于 `relative z-10 bg-background` 吸底区，输入时用户聚焦 | 可 `bg-background/94%` + 顶部 `border-t` 加深，避免与滚动内容视觉粘连 |

### DO NOT BLUR / DO NOT TRANSPARENT（禁止）

| Surface | 原因 |
|---|---|
| **`Chat scroll viewport`（`chat-scroll`）** | 主滚动容器，每帧滚动 + 虚拟化条目高速进出，`backdrop-filter` 会每帧重算背后像素，成本与滚动速度正相关（`MessageList.tsx:1147-1176`） |
| **`MessageList` 条目** | 已用 `contain:layout + translateZ(0)` 隔离重排（`MessageBody.tsx:62`），叠加 `backdrop-filter` 会抵消该优化并新增合成层 |
| **`Terminal`（ghostty canvas）** | Canvas 为独立绘制层，容器透明会使 ANSI 色与背后壁纸叠加，对比度崩溃（`TerminalViewport.tsx:241`） |
| **`Editor`（CodeMirror）** | 行号与 gutter 为 sticky DOM，透明会使代码与壁纸纹理竞争（`CodeMirrorEditor.tsx:511-518`） |
| **`Diff viewer`（@pierre/diffs shadowRoot）** | `Virtualizer` 虚拟滚动 + `Worker` 高亮已是高负载，shadow 内 `pre` 背景为语义色（`PierreDiffViewer.tsx:674-736`） |
| **`ScrollShadow` 容器** | 已用 `mask-image` 实现滚动阴影（`index.css:257-322`），再叠加 `backdrop-filter` 会使滚动路径上同时出现 `mask` 与 `filter` 两个昂贵操作 |

---

## 12. 复用与禁避

### C. `Theme.colors` 与 `CSSVariableGenerator` 可直接复用处

| 能力 | 位置 | 复用方式 |
|---|---|---|
| **Surface 语义色** | `cssGenerator.ts:203-214` `generateSurfaceColors` → `--surface-background/muted/elevated/overlay/subtle` | 壁纸透明度直接 `color-mix(in srgb, var(--surface-background) 92%, transparent)`，无需新增 token |
| **Sidebar 语义** | `cssGenerator.ts:99-142` `hexToRgb + --sidebar-* + --sidebar-overlay-*` | 侧边栏透明用已有 `--sidebar-overlay-soft/strong`（`rgb(var(--sidebar-base-rgb)/alpha)`） |
| **Interactive 边框** | `cssGenerator.ts:216-229` → `--interactive-border(-hover,-focus)` | 半透明卡片需同步加深 `border`，直接用 `--interactive-border` 而非硬编码 |
| **Charts / Status** | `cssGenerator.ts:231-266` | 壁纸不应影响图表与状态色，保持 `1` 不透明 |
| **Typography** | `cssGenerator.ts:527-650` | 不受壁纸影响，无需动 |
| **Tailwind 语义映射** | `cssGenerator.ts:67-159` `--background/--foreground/--sidebar 等` | 壁纸层通过覆盖 `--background` 的消费侧 alpha 实现，而非改变量定义本身 |
| **VSCode 适配** | `vscode/adapter.ts:358-369` `read('sideBar.background', ...)` 等 | VSCode 运行时禁用壁纸（`isVSCodeRuntime()`），保持与 `ChatView.tsx` 的运行时分支一致 |

> **实践**：新增 `wallpaper` 配置仅需两个运行时 CSS 变量：`--wallpaper-image`（`url(...)`）与 `--wallpaper-opacity`（`0-1`），其余通过 `color-mix` 与现有 surface token 组合。

### D. 低功耗主题必须避免的现有 CSS 模式

| 禁止模式 | 当前是否已避免 | 证据 / 说明 |
|---|---|---|
| `full-window backdrop-filter` | ✅ 已避免 | 仅 `Dialog.Backdrop` 用 `blur(4px)` 且短时全屏（`dialog.tsx:64`） |
| `nested backdrop-filter` | ✅ 已避免 | 无 `oc-glass` 套 `oc-glass` |
| `scrolling container 大面积 blur` | ✅ 已避免 | `chat-scroll` 容器无 `backdrop-filter`，用 `mask-image` 代替 |
| `will-change: scroll-position / transform` 全局 | ✅ 已避免 | 仅侧边栏宽度与 thumb 短时 |
| `infinite CSS animation` 常驻 | ✅ 已避免 | 唯一无限动画为 `animate-spin` / `animate-busy-pulse` 且仅在 `busy` 状态（`index.css:433,612-619`） |
| `large image long-resident` | 待壁纸引入后约束 | 需对壁纸做 `≤200KB` + `decode()` 懒加载 + 不常驻大原图 |
| `animated wallpaper / video wallpaper` | — | 直接禁止 |
| **未来壁纸必须同步禁止** | — | `requestAnimationFrame` 常驻、`WebGL` 特效、`translate3d` 强提全窗、多个 `fixed` 壁纸层叠加 |

### E. 是否需要改 Electron `BrowserWindow`

**结论：完全在 Renderer DOM/CSS 层即可，无需改 Electron。**

- **不改的理由**：
  1. 壁纸是**静态图片**，只需在 `MainLayout` 内固定层 + 上层改 `bg-background/xx` 即可见；
  2. 当前窗口已是**不透明**（`backgroundColor:'#151313'`）且与 `dark --background` 一致，首帧无闪屏；
  3. `desktop-runtime` 的 `!important` 锁定虽阻碍 `body` 透明化，但 A1 方案**不改 `body`**，仅对 `MainLayout` 下游做 alpha，规避该锁定；
  4. `backgroundThrottling:false` 已保证后台不冻渲染，若改 `transparent:true` 反而增加合成与显存。

- **唯一需要改 Electron 的场景**：
  - 需求变为“**系统级毛玻璃**（窗口本身透明，透出桌面壁纸）”或“**窗口圆角+阴影跟随系统材质**”。
  - 此时需：`transparent:true` + `backgroundColor:'#00000000'` +（macOS）`vibrancy/visualEffectState/titleBarStyle:'hiddenInset'`，并重写 `design-system.css:141-145` 的 `!important` 与 `web/index.html:235` 的 `background_color` manifest，同时处理 Windows/Linux 无 vibrancy 的降级。代价：跨平台一致性差、显存与合成分辨率上升、与 `oklch` 语义冲突。

> **建议**：本期仅做 A1 的 DOM/CSS 方案，将壁纸能力完整封装在 `packages/ui` 内，不触及 `packages/electron/main.mjs`。

---

## 13. 复核 · Unknowns / Runtime Validation Gaps（未覆盖与需最小运行时验证）

| # | 未知项 | 为何静态无法确认 | 建议的最小验证（不跑大型测试） |
|---|---|---|---|
| U1 | `MainLayout` 在 `wide-chat-layout` 与 `vscode-runtime` 下的真实层级差异 | `App.tsx:322-325` `documentElement.classList.toggle('wide-chat-layout')` 与 `isVSCodeRuntime()` 会改变 `ContextPanel` 的装载与 `Header` 的 `workStatus` 读数，但静态树无法量化宽度阈值 | 在对应运行时用 DevTools `Elements` 查看 `MainLayout` 的 `class` 与 `data-chat-area` 宽度 |
| U2 | 实际合成层数量（Layers 面板） | `will-change` 与 `backdrop-filter` 仅预示可能，真实层数取决于 Chromium 的 `cc` 决策与视口大小 | DevTools `Rendering → Layer borders` + `Layers` 面板静止 + 一次 Chat 滚动，观察 `chat-scroll` 是否产生额外 backing surface |
| U3 | `ghostty-web` 在不同缩放下的 DPR 与 canvas 尺寸 | `TerminalViewport` 的 `getProvisionalTerminalSize` 用临时 canvas 测 `M` 宽度，真实 `cols/rows` 取决于容器尺寸与字体加载时序 | 在 `TerminalView` 打开时检查 `canvas` 的 `width/height` 与 `devicePixelRatio` |
| U4 | `PWA` 运行时 `body` 背景是否受 `manifest background_color '#151313'` 影响首帧 | `web/index.html:235` `background_color` 仅影响安装后启动画面，但 iOS Safari 的 `theme-color` 与 `color-scheme` 可能叠加 | 在 iOS PWA 与桌面 Chrome 分别观察首帧背景 |
| U5 | `prefers-reduced-transparency` 的真实覆盖率 | `design-system.css:265-279` 已有降级，但用户侧覆盖需验证 `matchMedia` 生效 | 在系统“减少透明度”开启后检查 `oc-glass-*` 是否回退为纯色 |
| U6 | 壁纸图片解码对首帧的阻塞 | 静态无法评估 `image.decode()` 时长与 `cover` 重排 | 加壁纸后用 `Performance` 录制首帧 `LCP` 与 `image decode` 耗时 |

---

## 附：关键文件索引（精简）

```
React 入口          packages/ui/src/main.tsx:51-67  createRoot(#root)
App 分流            packages/ui/src/App.tsx:949     bg-transparent vs bg-background
MainLayout 桌面      packages/ui/src/components/layout/MainLayout.tsx:420-492
MainLayout 移动      MainLayout.tsx:306-419
Header              packages/ui/src/components/layout/Header.tsx:2567
Sidebar             packages/ui/src/components/layout/Sidebar.tsx:126-144
ContextPanel        packages/ui/src/components/layout/ContextPanel.tsx:1092-1139  bg-background + will-change:[width]
ContextPanelRail    packages/ui/src/components/layout/ContextPanelRail.tsx:289
ChatContainer       packages/ui/src/components/chat/ChatContainer.tsx:315-405, 1094-1308
MessageList         packages/ui/src/components/chat/MessageList.tsx:3,44-74,326,938-1176  @tanstack/virtual
ScrollShadow        packages/ui/src/components/ui/ScrollShadow.tsx:44-174  + index.css:257-322
CodeMirrorEditor    packages/ui/src/components/ui/CodeMirrorEditor.tsx:408-526  EditorView
TerminalViewport    packages/ui/src/components/terminal/TerminalViewport.tsx:25-247  ghostty-web Canvas+WASM
PierreDiffViewer    packages/ui/src/components/views/PierreDiffViewer.tsx:82-1108  shadowRoot + Virtualizer + Worker
Design System       packages/ui/src/styles/design-system.css:1-530  glass tokens + desktop-runtime 锁定
Global Styles       packages/ui/src/index.css:1-1769  scrollbar + glass fallback + will-change
Theme Generator     packages/ui/src/lib/theme/cssGenerator.ts:36-214  CSSVariableGenerator
Electron 主进程     packages/electron/main.mjs:106-116,2421-2463,2813-2852
Electron 预加载     packages/electron/preload.mjs:1-171
Shell HTML          packages/web/index.html:1-643  #root + splash
```

---

## 术语

- **compositor layer**：Chromium 合成器为 `transform / will-change / backdrop-filter / position:fixed / sticky` 等创建的独立纹理层，需额外显存与合成 pass。
- **oc-glass-***：设计系统定义的毛玻璃材质族，`blur(22/26px) + saturate(1.16/1.24) + color-mix alpha`。
- **ScrollShadow**：HeroUI 的滚动阴影实现，用 `mask-image: linear-gradient` 替代 `box-shadow`，避免滚动时整行重绘。

---

*本报告为只读勘察，未修改任何源码、未 commit、未 push。后续壁纸实现请基于 A1（MainLayout 内 WallpaperLayer）进行，并在 Renderer 层通过 `surface alpha` 控制可见性，保持空闲零合成负担。*
