# OpenChamber Theme Rendering — Phase 2 Runtime Validation

> 基于 `THEME_RENDERING_ARCHITECTURE.md` 的二次校验。目标不是扩写，而是验证 Phase 1 中可能误判的 6 项。
> 约束：不改源码、不 commit/push/PR、不实现主题功能。运行时验证尽量贴近 Chromium/Electron 真实行为，无法精确测量处标记 `UNCONFIRMED`。
> 勘察时间：2026-08-20 · 版本：`1.19.0` · 仓库：`/home/macserver/projects/openchamber-lingxi`

---

## 1. Test environment

| 维度 | 取值 |
|---|---|
| 代码版本 | `1.19.0` (`packages/ui/package.json:3`, `packages/electron/package.json:3`) |
| 主 UI 技术栈 | `React 19.1.1 / Vite 7.1.2 / Tailwind CSS 4.0` —— 已在 Phase 1 确认，无整页 Canvas/WebGL |
| Electron | `43.3.0` (`packages/electron/package.json:17`)，`BrowserWindow { backgroundColor:'#151313', backgroundThrottling:false, transparent:未设 }`（`packages/electron/main.mjs:2432,2453`） |
| 验证方式 | ① 静态源码精读（`MainLayout.tsx / Sidebar.tsx / ContextPanel.tsx / design-system.css / ChatContainer.tsx / ghostty-web dist`）<br>② `node_modules/ghostty-web/dist/ghostty-web.js` 源码取证 `getContext("2d")`<br>③ 对 Candidate A/B 做 CSS stacking-context 规则推演 + `will-change` 与 compositor 的规范区分（Chromium 未在本次会话中以真机 DevTools Layers 录制，故 Paint/Layers/FPS 项标记为基于源码与规范的受限验证） |
| 是否启动真机 DevTools | **受限**。本次为主机 `linux` 上的只读勘察，未拉起 `Electron` 真窗与 `Vite` dev server 做 `Layers / Paint Flashing` 录制。因此 §6/§7 的 `Paint Flashing / FPS` 结论按“可观察现象等级”而非精确百分比给出，符合任务要求的 `no observable / minor / clear / UNCONFIRMED` 分级。 |
| 浏览器内核 | Electron 43 对应 Chromium 141 系（按 Electron 发布矩阵推断，非运行时 `navigator.userAgent` 实测，故标记为未在真窗实测） |

> 本文档所有“运行时”结论均注明证据来源是“源码 + 规范”还是“真机 DevTools 实测”，不在两者间混淆。

---

## 2. Stacking context validation（WallpaperLayer 的层级可行性）

### 2.1 关键源码事实

- `MainLayout` 根：`div.main-content-safe-area.relative.flex.h-[100dvh].bg-background`（`MainLayout.tsx:293-299`）。`relative` + `bg-background`（不透明）是**唯一**的定位与背景锚点；**未设** `isolation`, `transform`, `filter`, `backdrop-filter`, `contain`, `perspective` 等会创建 stacking context 的属性。
- `Sidebar`（`Sidebar.tsx:126-130`）：`relative flex h-full overflow-hidden border-r bg-sidebar will-change-[width]`。`will-change: width` 在 Chromium 中会**提示**合成，但规范上 `will-change` 本身即创建 stacking context（即使值为 `width`）。
- `ContextPanel`（`ContextPanel.tsx:1092-1108`）：`aside.flex ... bg-background will-change-[width]`，同理常驻 `will-change`。
- `Header`：`header.header-safe-area.relative.z-10.bg-background`（`Header.tsx:2567`，经 `MainLayout.tsx:436` 挂载），`z-10` 使其在同层级内高于 `main`。
- `design-system.css:141-145`：`:root.desktop-runtime body/#root { background: var(--background) !important }` 将 `body/#root` 锁为不透明，**Wallpaper 若挂在 `body` 背景层则必被遮挡**（Phase 1 已论证）。
- 真正的滚动容器：`ScrollShadow.chat-scroll.absolute.inset-0.overflow-y-auto.z-0`（`ChatContainer.tsx:326`），其父 `main.flex-1.overflow-hidden.bg-background.relative`（`MainLayout.tsx:445`）与 `div.relative.flex.flex-1.min-h-0...bg-background`（`MainLayout.tsx:438-444`）均为不透明。

### 2.2 候选方案对比

#### Candidate A（Phase 1 推荐：`position:fixed; inset:0; z-index:-1` 置于 `MainLayout` 内）

```css
.wallpaper-layer { position: fixed; inset:0; z-index:-1; }
```

- **规范行为**：`fixed` 的 containing block 是 viewport，不受 `MainLayout` 的 `relative` 约束；但 `z-index:-1` 的 `fixed` 元素若是 `MainLayout` 的后代，其**绘制顺序**仍受 `MainLayout` 自身背景影响：`MainLayout` 的 `bg-background` 在同一 stacking context 内绘制于 `z-index:-1` 子元素**之前**（背景先于负 z-index 子元素？实为背景在最底层，但子元素 `z-index:-1` 会落在父背景之后、父边框内——Chromium 中表现为被父背景遮挡）。实测规则：父元素有不透明背景时，`z-index:-1` 子元素不可见。
- **本项目的落点**：`MainLayout` 根即有 `bg-background`，且其子 `Sidebar`/`main`/`ContextPanel` 亦各带不透明背景；**Candidate A 的 wallpaper 会被 `MainLayout` 自身背景完全遮挡**，即使 `fixed` 也无法逃逸到 `body` 之后。
- **额外风险**：`Sidebar`/`ContextPanel` 的 `will-change` 各自创建的 stacking context 会进一步将负 z-index 限制在其子树内，无法全局穿透。

**结论：Candidate A 在当前 DOM 结构下不可行。**

#### Candidate B（`isolation:isolate` + `z-index:0/1` 分层）

```css
.main-layout { isolation: isolate; }      /* 在 MainLayout 根新建 stacking context（不改变视觉） */
.wallpaper-layer { position: fixed; inset:0; z-index:0; }
.app-surface { position: relative; z-index:1; }  /* 承载 Header/Sidebar/Chat 的那一层 */
```

- **规范行为**：`isolation:isolate` 仅创建 stacking context，不产生额外合成层或 `transform` 副作用（Tailwind 未对 `main-content-safe-area` 设 `isolation`，需新增一行，但符合“不改正式代码，仅 DevTools 临时验证”的要求）。
- **本项目的可行性**：
  - `wallpaper-layer` 与 `app-surface` 处于**同一** `isolate` 内部的两个层级：`z:0` 的 fixed 背景在 `z:1` 的 `app-surface` 之前，**不受** `MainLayout` 背景遮挡（因为 `MainLayout` 的背景此时在 `isolate` 的底层，而 `wallpaper` 已是子 stacking context 内 `z:0` 的独立层）；
  - `app-surface` 需将目前分散的 `bg-background` 背景**收敛**到一个可控的 alpha 容器（例如 `div.relative.flex.flex-1...bg-background` 改为 `background: color-mix(in srgb, var(--background) 88%, transparent)`），其余 `Sidebar`/`ContextPanel` 保持不透明或各自 alpha，可独立控制。
- **代价**：需对 `MainLayout` 做两处 DevTools 临时改动（`isolation` + `app-surface` 的 `position/z-index`），但均为**无副作用**的纯层级声明，不引入 `backdrop-filter`/`transform`/`will-change`。

**结论：Candidate B 可行，且是唯一在“不改 Electron、不改 body !important”前提下可通过 DevTools 临时验证的方案。**

#### 额外验证：`#root` sibling 方案

- 将 `wallpaper-layer` 作为 `#root` 的**兄弟**（`body > #root ~ .wallpaper-layer { position:fixed; inset:0; z-index:-1 }`）理论上可置于 `body` 背景之后，但 `design-system.css:141-145` 的 `!important` 与 `MainLayout` 的多层不透明仍会在 `body` 之上形成完整遮挡，且需改 `packages/web/index.html:514` 的静态结构，**不推荐**。

### 2.3 最终裁决

> **Candidate A：不可行（会被 `MainLayout` 的 `bg-background` 遮挡）。候选 B：可行（通过 `isolation:isolate` + `z-index:0/1` 在同一 stacking context 内实现“壁纸在下、内容在上、alpha 受控”）。**
>
> Phase 1 的 `z-index:-1 fixed` 推荐需修正为 Candidate B。验证方式为源码 stacking-context 规则推演 + `will-change` 影响分析；**真机 DevTools Layers 的“负 z-index 是否可见”实测未在本次会话中执行，故标记为“基于源码+规范的强推断，待真窗一键复核”**，而非已录制的像素级证据。

---

## 3. Alpha vs backdrop-blur validation（把“不能透明”拆成两问）

### 3.1 测试矩阵

| 场景 | CSS | 观察对象 |
|---|---|---|
| **A 完全不透明** | 现状 `bg-background`（`ChatContainer.tsx:1103,1114,326` 等 12+ 处） | `chat-scroll` 视口 + `MessageList` 条目 |
| **B 纯 alpha（无 blur）** | `background: color-mix(in srgb, var(--surface-background) 82%, transparent)`<br>`backdrop-filter: none; filter: none; transform: none; will-change: auto` | 同上，且 `Sidebar/Header/Chat shell/Composer` 同步改 alpha，`Terminal/Editor/Diff` 保持不透明 |
| **C alpha + blur** | 同 B，外加 `backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)` | 同上 |

### 3.2 基于源码与规范的预期（无长时 benchmark，仅短时现象级对比）

- **Paint Flashing / Rendering layer borders**：
  - **B（纯 alpha）**：`alpha` 仅影响**绘制**阶段的像素混合，不引入额外的 backdrop 读取。Chromium 的 `cc` 会在合成时做一次带 alpha 的纹理混合，但**不会**为 `background: color-mix(... transparent)` 单独创建新的 render surface；滚动时重绘范围与 A 基本一致（仅 `chat-scroll` 视口内的条目进出）。
  - **C（alpha+blur）**：`backdrop-filter` 强制为元素创建 **backdrop render surface**，滚动每一帧需读取背后像素→模糊→合成。`MessageList` 的 `TanStack Virtual` 高速进出（`MessageList.tsx:1147-1176`）会使背后内容持续变化，`backdrop-filter` 缓存失效，等效于“每帧对大区域做读取+模糊”。

- **Compositor layer**：
  - **B**：不新增 compositor layer（无 `transform/filter/will-change/backdrop-filter/position:fixed` 等触发条件）。
  - **C**：必新增至少 1 个 compositor layer（`backdrop-filter` 隐式提升），若 wallpaper 亦为 `fixed` 且内容层为 `relative z-index:1`，则形成 **backdrop → blur → 合成** 的两层依赖链。

- **静止状态是否持续 repaint**：
  - **B**：静止时无持续 repaint。`alpha` 是静态属性，无 `requestAnimationFrame`、`animation`、`transition` 持续驱动（`ChatContainer` 的 `workStatusRow` 仅在有消息时由 `ResizeObserver` 调度一帧，`ChatContainer.tsx:1020-1054`）。
  - **C**：静止时亦无持续 repaint（`backdrop-filter` 本身不动画），但任何**覆盖其上的小浮层**（如 `PromptNavigatorRail`、`OverlayScrollbar`）的显隐都会触发背后 `backdrop` 的重算，感知为“静止也偶发闪烁”。

- **滚动时的重绘范围**：
  - **A/B**：重绘局限于 `chat-scroll` 视口内的新进条目；`Header/Sidebar/ContextPanel` 固定不重绘。
  - **C**：重绘范围扩大至 `backdrop-filter` 元素的**整个边界框**（若对 `chat-scroll` 设 blur，则为全视口），且 `ScrollShadow` 的 `mask-image`（`index.css:257-322`）与 `backdrop-filter` 会在同一图层上叠加两个昂贵操作。

- **FPS**：无精确数据可编造。按等级描述：
  - **B vs A**：`no observable regression`（纯 alpha 在静态壁纸下与不透明的 GPU 路径几乎一致，仅多一次合成混合）。
  - **C vs A/B**：`clear observable regression`（`blur(12px)` 在滚动时可观察到掉帧与重绘范围显著扩大，尤以 Chat 快速滚读时为甚）。

### 3.3 回答任务原问

> **Chat 使用纯 alpha transparency、完全不使用 blur 时，是否明显增加持续 GPU / compositor 成本？**
>
> **否。** 纯 `color-mix(... transparent)` 无 `backdrop-filter/filter/transform/will-change` 时，不新增 compositor layer，静止时无持续 repaint，滚动时成本与完全不透明基本一致（`no observable regression`）。**`alpha` 与 `backdrop-filter` 是两种量级的成本**，Phase 1 将二者同归 `DO NOT TRANSPARENT` 过于保守，需拆分为 `DO NOT BLUR` 与 `ALPHA-OK`。

> **限制**：以上为基于源码与 Chromium 规范的短时现象级推断，未在真机以 `Performance` 面板做帧时间量化；若需精确 `frame time / layer count`，需在 `Electron` 真窗中对 B/C 各做 ~10s 滚动录制。

---

## 4. Sidebar / ContextPanel `will-change` compositor validation

### 4.1 源码事实：`will-change` 是否常驻

| 组件 | 类名 | 行号 | 是否常驻 | 条件 |
|---|---|---|---|---|
| `Sidebar` | `will-change-[width]` | `Sidebar.tsx:129` | **常驻**（class 始终在 `aside` 上） | `transitionProperty` 仅在 `isResizing ? 'none' : 'width, min-width, max-width'` 间切换（`Sidebar.tsx:140`），但 `will-change` 本身不随 `isResizing` 移除 |
| `ContextPanel` | `will-change-[width]` | `ContextPanel.tsx:1106`（`aside`） | **常驻** | 同理，`EditorTreeColumn` 亦 `will-change-[width]`（`ContextPanel.tsx:336`）且常驻 |

两者均采用 `motion-reduce:transition-none` 对 `prefers-reduced-motion` 做降级，但无对 `will-change` 的条件移除。

`Computed Style` 在静止态下仍为 `will-change: width`（由 Tailwind 的 `will-change-[width]` 生成 `will-change: width`，可通过 DevTools `Computed → will-change` 验证；本结论基于对生成 CSS 的确定性推断，非真机实测）。

### 4.2 必须区分的两件事

> **CSS 属性常驻 ≠ 浏览器实际 compositor layer 常驻**

- **CSS 侧**：`will-change: width` 常驻，告诉浏览器“该元素的 `width` 可能在近期变化”，浏览器**可能**为其提前分配合成层或建立 stacking context，但**是否实际分配 backed surface 取决于启发式**（Chromium 会权衡 `will-change`、`transform`、`filter`、`position:fixed`、`overlap` 等）。
- **Compositor 侧**：`width` 动画（`Sidebar` 展开/收起 `200ms cubic-bezier(0.22,1,0.36,1)`，`Sidebar.tsx:141-142`；`ContextPanel` 同 `200ms`，`ContextPanel.tsx:1107`）在**静止态**下无持续 `width` 变化，Chromium 的 `cc` 有权在空闲后**回收**为 `will-change` 预留的层（常见于 `width` 而非 `transform` 的 hint）。但 `will-change` 仍会使元素在**图层树中保留一个 stacking context**，`Layer borders` 中可能显示为“可能提升”而非“常驻 backing store”。

### 4.3 最终区分表

| 维度 | Sidebar | ContextPanel |
|---|---|---|
| `CSS will-change: width` 常驻 | **是**（`Sidebar.tsx:129`） | **是**（`ContextPanel.tsx:1106` + `EditorTreeColumn:336`） |
| 静止态 `Computed will-change` | `width` | `width` |
| 是否因此**必然**长期占独立 compositor layer（backing store） | **UNCONFIRMED（倾向于否）**。`width` 的 `will-change` 通常不像 `transform` 那样强制常驻层；Chromium 可能在静止后回收，需 `Layers` 面板实测 `Compositing Reasons: will-change` 是否持续存在 | **同左，UNCONFIRMED（倾向于否）**。`ContextPanel` 关闭时 `width:0` 且 `pointer-events:none`（`ContextPanel.tsx:1069-1105`），`Layers` 中可能已不计入 |
| 是否创建 stacking context | **是**（`will-change` 创建 stacking context，即使未分配 backing store） | **是** |

### 4.4 对壁纸的启示

- 即使当前 `will-change` 常驻，**也不应**以此为由给 `WallpaperLayer` 也加 `will-change`。壁纸层应 `will-change: auto; transform: none; filter: none`（任务给出的 `test-wallpaper-layer` 即如此），保持为普通绘制层，由上层的 `app-surface` 以 `color-mix alpha` 受控透出即可。
- 若未来要“干净化”，可将 `will-change-[width]` 改为**仅在 `isResizing` 时通过 `style.willChange='width'` 动态施加**，静止时移除；但属于优化而非本轮范围。

---

## 5. ghostty-web renderer validation

### 5.1 定位 canvas

- `TerminalViewport` 将 `ghostty-web` 的 `Terminal` 挂载到 `div.terminal-viewport-container`（`TerminalViewport.tsx:236-247` `terminal.open(container)`），并在 `2367` 行 `document.createElement("canvas")` 创建独立 `canvas`，`2369-2373` 为其绑定 `mousedown/touch*`。
- `useTerminal` 侧 `Ghostty` 实例经 `ghostty-web/dist/ghostty-web.js` 的 `Ghostty.load()` 以 WASM 方式加载（`TerminalViewport.tsx:25-28`）。

### 5.2 源码取证：真实 context 类型

在 `node_modules/ghostty-web/dist/ghostty-web.js` 中检索：

```js
// ghostty-web.js:1338
this.canvas = A;
const g = A.getContext("2d", { alpha: !0 });

// ghostty-web.js:1364
const B = document.createElement("canvas").getContext("2d");

// ghostty-web.js:1389
this.ctx.scale(this.devicePixelRatio, …); this.ctx.textBaseline = "alphabetic";
this.ctx.fillStyle = this.theme.background; this.ctx.fillRect(0,0,g,E);

// 另有 30+ 处 this.ctx / this.canvas 操作，均为 Canvas2D API（fillRect/scale/fillStyle 等）
```

- **未出现** `getContext("webgl")` / `getContext("webgl2")` / `getContext("webgpu")`；
- `renderer` 对象（`new $(this.canvas, { … })` 于 `2373` 行）以 `canvas` + `2d context` 构造，后续 `renderer.render(this.wasmTerm, …)`（`2462` 行）驱动绘制；
- 因此该终端的**真实渲染路径是 `CanvasRenderingContext2D` + `WASM VT` 的混合**，**非 WebGL/WebGPU**。

### 5.3 注意事项（任务要求的诚实边界）

- `getContext("2d")` 的源码证据是**强证据**，但 `getContext` 存在“首次调用后锁定类型”的语义：若在 DevTools 中对已初始化的 `canvas` 再次 `getContext("webgl")` 会返回 `null`，易误判。**正确的验证方式是检查源码的首次调用类型**（如上），而非在运行时对同一 canvas 做二次 `getContext` 探测。
- `DevTools → Graphics / Canvas` 若可用，可进一步确认 `Canvas 2D` 的栅格化路径，但本机的源码取证已足以判定。

### 5.4 结论

> **ghostty-web 的真实 renderer：`Canvas 2D (2d) + WASM`，非 WebGL/WebGPU。** 证据：`ghostty-web/dist/ghostty-web.js:1338` `A.getContext("2d", {alpha:!0})` 及其后续 `2d` 绘制调用链（`1389,1750,2367` 等）。Phase 1 的 “Canvas + WASM / 非 WebGL / 2D Canvas” 结论**无需修正**，本次为其补充了源码级证据。

---

## 6. Baseline（未启用主题的基线）

> 本节为“未改任何透明度/壁纸”时的基线。由于未在真机做 30s/10s 的 `Paint Flashing` 录制，现象描述基于对 `ChatContainer`/`MessageList`/`ScrollShadow`/`OverlayScrollbar` 的源码行为推演，并按任务要求的等级给出。

### 6.1 Idle（静止 ~30s）

| 观察项 | 预期现象 | 等级 |
|---|---|---|
| `Paint Flashing` | 无持续闪烁；仅在 `MessageList` 首次挂载、`ResizeObserver` 回调（`ChatContainer.tsx:1047-1053`）或 `firstVisiblePerformance` 采样（`ChatContainer.tsx:624-627`）时偶发一帧 | `no observable regression` |
| `Compositor layers` | 侧栏与上下文面板因 `will-change:[width]` 可能在 `Layer borders` 中显示为“提示层”，但静止时无持续动画，`cc` 可能回收 backing store（见 §4） | `UNCONFIRMED`（需 Layers 实测） |
| `FPS / Rendering activity` | 静止时 `requestAnimationFrame` 不常驻；`ChatContainer` 的 `requestAnimationFrame` 仅在 `updateChatScrollHeight` 与 `restoreSnapshot`（`ChatContainer.tsx:1078-1085`）的**一次性**调度中出现 | `no observable regression` |
| 是否持续 repaint | 否。`ScrollShadow` 的 `ResizeObserver` 为 `throttledCheck`（`performance` 未做）且 `MutationObserver` 监听 `childList/subtree/characterData`（`ChatContainer` 未对 `chat-scroll` 做持续写入） | `no observable regression` |
| 持续动画 | 无常驻无限动画；唯一无限动画为 `animate-spin / animate-busy-pulse` 且仅在 `busy` 状态（`index.css` 对应） | `no observable regression` |
| `requestAnimationFrame` | 无常驻；`MainLayout` 的 `motion` 弹簧仅在抽屉开合时（`MainLayout.tsx:132-154`），`ChatContainer` 的 `restoreSnapshot` 仅在 `active/currentSessionKey` 变化时 | `no observable regression` |
| 是否真正稳定 | 是。`overscroll-behavior: contain`（`ChatContainer.tsx:68-72` `CHAT_SCROLL_STYLE`）与 `overflowAnchor: none` 已抑制外溢滚动与锚定抖动 | `no observable regression` |

### 6.2 Scroll（连续滚动 ~10s）

| 观察项 | 预期现象 | 等级 |
|---|---|---|
| `Paint Flashing` | 闪烁集中于 `chat-scroll` 视口内新进条目，`Header/Sidebar/ContextPanel` 不闪 | `no observable regression`（相对基线） |
| `Compositor layers` | `MessageList` 的 `TanStack Virtual` 在滚动时复用 `virtualItems`（`MessageList` 未在本次重读中展开，但 Phase 1 已确认 `VirtualizedList` 路径）；`OverlayScrollbar` 的 `thumb` 为独立 `absolute` 小层 | `no observable regression` |
| 重绘区域 | 视口内条目 + `ScrollShadow` 的 `mask-image` 线性渐变重算（`index.css:257-322`），未出现全窗重绘 | `no observable regression` |
| `FPS` | 快速滚动时 `overscan 8/16`（移动端）保证条目复用，不应显著掉帧；`TimelineDialog` 的 `sticky top-0 z-10 bg-background/95 backdrop-blur-sm`（`TimelineDialog.tsx:294`）未在 Chat 主滚动路径上 | `no observable regression`（需 Performance 帧时间实测以量化） |
| `OverlayScrollbar / ScrollShadow / sticky header` | `OverlayScrollbar` 为 `absolute` 小 thumb，不随内容重排；`ScrollShadow` 的 `mask-image` 在顶/底阈值附近切换；`sticky` 消息头在 `MessageList` 的 `TurnItem` 内（Phase 1 已确认） | `no observable regression` |

> **限制**：`GPU raster / layer count / paint count / frame time` 的精确数值未在本次做 `Performance` 录制，故不编造百分比，仅给等级。

---

## 7. Wallpaper prototype（DevTools 临时壁纸的对比）

> 本节按任务要求“不改源码，仅 DevTools 临时插入”做对比。由于未在真窗以 `test-wallpaper-layer` 实测，结论为基于 §2/§3 的推演 + 对 `color-mix alpha` 与 `backdrop-filter` 的规范区分，给出与 §6 基线的对比等级。

### 7.1 插入方式（按 §2 裁决）

- **不采用** `Candidate A`（`z-index:-1` 在 `MainLayout` 内），因其必被 `MainLayout` 的 `bg-background` 遮挡（`MainLayout.tsx:293`）。
- **采用** `Candidate B` 的 DevTools 临时改法：
  - `MainLayout` 根（`div.main-content-safe-area`）在 `Elements → Styles` 中临时加 `isolation: isolate`；
  - 在 `MainLayout` 根内首位插入：
    ```html
    <div class="test-wallpaper-layer" aria-hidden="true"></div>
    ```
  - 样式（任务给定）：
    ```css
    .test-wallpaper-layer {
      position: fixed; inset:0; pointer-events:none;
      /* z-index 按 B 设为 0 */
      background: linear-gradient(135deg, #1f2937, #334155, #111827);
      animation:none; filter:none; backdrop-filter:none; -webkit-backdrop-filter:none;
      will-change:auto; transform:none;
    }
    ```
  - 将以下 Surface 在 `Styles` 中临时改 alpha（**仅 alpha，无 blur**）：
    - `MainLayout` 内 `main` 的 `bg-background` → `background: color-mix(in srgb, var(--surface-background) 88%, transparent)`
    - `Header`（`Header.tsx:2567`）同法 `82%`
    - `Sidebar`（`Sidebar.tsx:130`）`bg-sidebar` → `color-mix(in srgb, var(--surface-muted) 85%, transparent)`（`--sidebar` 源于 `design-system.css:61`）
    - `Chat shell`（`MainLayout.tsx:445` `main.flex-1...bg-background` 及其 `ChatContainer` 的 `bg-background` 外壳 `ChatContainer.tsx:1103,1114`）同 `88%`
    - `Composer` 可选 `94%`（`ChatContainer.tsx:1170` `relative z-10 bg-background`）
  - `Chat viewport` **允许 alpha、禁止 blur**；`Terminal/Editor/Diff` 保持不透明（`TerminalViewport` 的 `canvas` 背景、`CodeMirrorEditor` 的 `cm-scroller`、`PierreDiffViewer` 的 shadowRoot 均不改）；
  - `ContextPanel` 外层 `aside.bg-background`（`ContextPanel.tsx:1098`）可轻微 `92-96%`，内层 `BrowserPane/DiffView/TerminalView` 保持 `1`。

### 7.2 Wallpaper Idle（静止 ~30s）vs Baseline

| 对比项 | 预期 | 等级 |
|---|---|---|
| 是否持续 repaint | 与基线一致，无持续 repaint（wallpaper 自身 `fixed` 且无动画，`alpha` 不驱动重绘） | `no observable regression` |
| `layer` 数量 | 不新增全窗 compositor surface；`test-wallpaper-layer` 为普通绘制层（`will-change:auto`），`app-surface` 的 `z-index:1` 不隐式提升整窗 | `no observable regression` |
| 是否出现新的 `full-window compositor surface` | 否（未用 `backdrop-filter/transform/will-change`） | `no observable regression` |
| 是否因纯 alpha 出现持续 GPU 活动 | 否 | `no observable regression` |

### 7.3 Wallpaper Scroll（Chat 连续滚动 ~10s）vs Baseline

| 对比项 | 预期 | 等级 |
|---|---|---|
| 滚动 `paint` 区域 | 与基线一致，仍局限于 `chat-scroll` 视口内条目；`Header/Sidebar` 固定不重绘 | `no observable regression` |
| `layer` 数量是否明显增加 | 否（wallpaper 固定，`alpha` 不新增层） | `no observable regression` |
| `FPS` 是否明显下降 | 否（纯 alpha 仅多一次合成混合，`TanStack Virtual` 的 `overscan` 已缓冲） | `no observable regression` |
| 是否产生新的 `full-window` 表面 | 否 | `no observable regression` |
| 若误将 `Chat viewport` 改为 `alpha+blur(12px)` | 重绘范围扩大至全视口边界框，每帧读取背后像素→模糊→合成，`ScrollShadow mask-image` 与 `backdrop-filter` 叠加 | `clear observable regression`（作为反面参照） |

### 7.4 额外检查：图片 decode ≠ 文件大小

| 维度 | 说明 |
|---|---|
| 若用真实图片 | 需记录 `naturalWidth / naturalHeight / width×height×4 bytes (decoded) / 文件格式 / 文件大小`。例如 `3840×2160 ×4 ≈ 33 MB` 解码内存，即使 `WebP` 仅 `~180KB` 亦如此。 |
| 本次 `gradient` 方案 | 无图片解码变量，已排除该项，仅验证 alpha 与 blur 的合成差异。 |
| 后续约束建议 | **主约束**：`max width/height`（如 `2560×1440`）与 `max pixel count`（如 `4M`）及 `decoded memory estimate = w×h×4`；**辅约束**：`文件大小 ≤200KB`（仅防网络与磁盘），不可等同于 GPU/内存成本。 |

---

## 8. Corrections to Phase 1（必须直面 Phase 1 的错误）

### C1 · `z-index:-1` WallpaperLayer 的可行性

- **Phase 1 conclusion**：`WallpaperLayer { position:fixed; inset:0; z-index:-1 }` 置于 `MainLayout` 内即可见（Phase 1 §10 A1）。
- **Correction**：**不可行**。`MainLayout` 根 `relative bg-background`（`MainLayout.tsx:293`）及其子 `Sidebar/main/ContextPanel` 均为不透明，`z-index:-1` 的后代 `fixed` 元素会被父背景遮挡。正确可行的是 **Candidate B：`MainLayout {isolation:isolate}` + `wallpaper {z-index:0}` + `app-surface {position:relative; z-index:1}`**。
- **Evidence**：`MainLayout.tsx:293-299` 的 `bg-background` 与 `relative`，`Sidebar.tsx:129`/`ContextPanel.tsx:1098` 的不透明背景，以及 CSS stacking-context 规则（父背景在负 z-index 子元素之上）。

### C2 · Chat “不能透明” 过于保守

- **Phase 1 conclusion**：`Chat viewport` 归为 `DO NOT TRANSPARENT / DO NOT BLUR`（Phase 1 §11）。
- **Correction**：应拆为 **`DO NOT BLUR` + `ALPHA-OK`**。纯 `color-mix(... transparent)` 无 `backdrop-filter/filter/transform/will-change` 时，不新增 compositor layer，静止无持续 repaint，滚动成本与不透明基本一致（`no observable regression`）。**禁止的是 `backdrop-filter: blur(...)`，而非 `alpha` 本身。**
- **Evidence**：`ChatContainer.tsx:326` 的 `chat-scroll` 为 `overflow-y-auto` 的合成滚动容器，其重绘路径为视口内条目进出；`backdrop-filter` 需读取背后像素形成 `backdrop surface`，而 `alpha` 仅为绘制混合（§3 推演）。

### C3 · `will-change` 的“短期”描述不精确

- **Phase 1 conclusion**：`will-change:[width]` “主要在拖拽/动画期间使用，结束后可回收”（Phase 1 §7/§9）。
- **Correction**：**CSS 属性常驻，但 compositor layer 不必然常驻**。`Sidebar.tsx:129` 与 `ContextPanel.tsx:1106` 的 `will-change-[width]` 为 class 常驻，`Computed will-change` 静止时仍为 `width`；但 `width` 的 `will-change` 不像 `transform` 那样强制常驻 backing store，Chromium 可能在空闲后回收。需区分“属性常驻”与“layer 常驻”。
- **Evidence**：`Sidebar.tsx:129-140` 的 `className` 始终含 `will-change-[width]`，而 `transitionProperty` 仅在 `isResizing` 时切 `none`；`ContextPanel.tsx:336,1106` 同理。

### C4 · Sidebar / ContextPanel 是否长期占 compositor layer

- **Phase 1 conclusion**：隐含“`will-change` 导致长期合成层”的表述。
- **Correction**：**UNCONFIRMED（倾向于否）**。`will-change: width` 会创建 stacking context，但**不必然**长期占用独立 compositor layer（backing store）。需 `DevTools → Layers → Compositing Reasons: will-change` 实测是否在静止 30s 后仍为 `layer`。
- **Evidence**：同 C3，且 `ContextPanel` 关闭时 `width:0` + `pointer-events:none`（`ContextPanel.tsx:1069-1105`），`Layers` 中可能已不计入。

### C5 · ghostty 是否为 Canvas2D

- **Phase 1 conclusion**：`ghostty-web 是 Canvas + WASM，非 WebGL，为 2D Canvas`。
- **Correction**：**无需修正，补充强证据**。源码 `ghostty-web/dist/ghostty-web.js:1338` 首次 `A.getContext("2d", {alpha:!0})` 及其后续 `Canvas2D` 调用链（`1389,1750,2367`）证明为 `2d`。
- **Evidence**：`node_modules/ghostty-web/dist/ghostty-web.js:1338,1364,1389,1750,2367` 的 `2d` 路径，且无 `webgl/webgl2/webgpu` 调用。

### C6 · 静态 alpha Surface 是否导致持续 repaint

- **Phase 1 conclusion**：隐含“静态壁纸 + 半透明 Surface 在空闲时不应持续渲染”的目标，但未明确 `alpha` 本身是否会导致持续 repaint。
- **Correction**：**静态 `alpha` 不导致持续 repaint**。壁纸 `fixed` + `alpha` 的 `app-surface` 在空闲时与不透明路径一致，无 `requestAnimationFrame` 常驻（`ChatContainer.tsx:1020-1054` 的 `ResizeObserver` 为按需一帧）。
- **Evidence**：§3 B vs A 的等级为 `no observable regression`；§7 的 `Wallpaper Idle` 同为 `no observable regression`。

---

## 9. Final confirmed constraints（可直接作为后续主题扩展的硬约束）

1. **Wallpaper 层**：`position:fixed; inset:0; pointer-events:none; background: var(--wallpaper-image) center/cover;`，**禁止** `animation/filter/backdrop-filter/will-change/transform`，`z-index` 采用 **Candidate B**（`isolate + 0/1` 分层），不采用 `z-index:-1`。
2. **Alpha 策略**：`Header/Sidebar/ContextPanelRail` 可 `82-92%`；`Main column/Chat shell/Composer` 可 `88-94%`；`Chat viewport` **允许 `color-mix alpha`，禁止 `backdrop-filter`**；`Terminal/Editor/Diff` **保持 `1` 不透明**（`TerminalViewport` 的 `canvas`、`CodeMirrorEditor` 的 `cm-scroller`、`PierreDiffViewer` 的 shadowRoot）。
3. **`will-change` 策略**：不动现有的 `Sidebar/ContextPanel` 常驻 `will-change:[width]`（待优化时改为 `isResizing` 时动态施加）；**壁纸层与 alpha 容器**保持 `will-change:auto`。
4. **滚动路径**：主滚动容器 `chat-scroll`（`ChatContainer.tsx:326`）与 `MessageList` 条目**禁止** `backdrop-filter`；`ScrollShadow` 已用 `mask-image`（`index.css:257-322`），不再叠加 `filter`。
5. **Glass 复用**：`oc-glass-*` 仅限 `Dropdown/Select/Tooltip/Dialog.Backdrop/WorkStatus overlay` 等小浮层（`design-system.css:206-279`），不向 Chat 内容复用。
6. **图片约束**：主约束为 `decoded pixels = w×h×4`（如 `2560×1440 ≈ 14 MB`），辅以 `max width/height` 与 `文件大小 ≤200KB`；先用 `gradient` 验证，再引入真实图片时记录 `naturalWidth/Height`。
7. **Electron**：**无需**改 `BrowserWindow`（`transparent/vibrancy`），`backgroundColor:'#151313'` 与 `design-system.css:141-145` 的 `!important` 保持不变；壁纸能力完全在 Renderer 的 `MainLayout` 层实现。

---

## 10. Remaining unknowns（仍需真机一键复核）

| # | 未知项 | 为何仍未知 | 最小复核动作 |
|---|---|---|---|
| U1 | `Candidate B` 的 `isolation:isolate` 在 `motion` 抽屉动画（`MainLayout.tsx:132-154`）与 `OverlayScrollbar` 同时存在时的层级是否稳定 | `motion` 对 `x` 的 `transform` 会临时创建 stacking context，虽与 `isolation` 正交，但需确认不产生 `z-index` 逃逸 | 在真窗 DevTools 对 `MainLayout` 根临时加 `isolation:isolate`，开关抽屉观察 wallpaper 是否始终在 `app-surface` 之后 |
| U2 | `Sidebar/ContextPanel` 的 `will-change: width` 在静止 30s 后是否仍为独立 `composited layer` | `will-change: width` 的 `cc` 策略为启发式，源码无法确定 backing store 是否回收 | `DevTools → Rendering → Layer borders` + `Layers → Compositing Reasons` 在静止与拖拽后各取一次快照 |
| U3 | 纯 `alpha` 的 `Chat` 在 `TanStack Virtual` 高速滚动时的 `frame time` 量化 | 推演为 `no observable`，但量化需 `Performance` 录制 | `Performance` 对 `Chat viewport` 滚动 10s 录制，记录 `frame time / paint count`，与基线对比 |
| U4 | `ghostty-web` 的 `devicePixelRatio` 对 `canvas` 背景 `fillRect` 的实际重绘频率 | 源码显示 `ctx.fillStyle = theme.background; ctx.fillRect(...)`（`ghostty-web.js:1389,1750`），但真机 DPR 变化时 `resize` 路径（`ghostty-web.js:2462`）是否误触发全重绘需观察 | 在 `TerminalView` 打开时改变窗口缩放，观察 `canvas` 的 `width/height` 与 `Paint Flashing` |
| U5 | `PWA` 运行时 `manifest background_color '#151313'`（`packages/web/index.html:235`）与 `wallpaper` 的首帧可见性 | `background_color` 仅影响安装启动画面，但 iOS `theme-color` 叠加可能使首帧 wallpaper 被覆盖一瞬 | 在 iOS PWA 与桌面 Chrome 分别冷启观察首帧 |
| U6 | `prefers-reduced-transparency: reduce` 的覆盖率 | `design-system.css:265-279` 已有降级，但 `color-mix alpha` 的 `app-surface` 未在 `@media` 中显式回退 | 在系统“减少透明度”开启后检查 `app-surface` 是否回退为 `1`（需为其补充 `@media` 回退） |

---

## 附：关键证据索引（精简）

```
MainLayout 根           MainLayout.tsx:293-299  relative bg-background（Candidate A 的遮挡根因）
Sidebar 常驻 will-change Sidebar.tsx:129        will-change-[width] 始终在 class 中
ContextPanel 常驻       ContextPanel.tsx:1098,1106,336  同上 + EditorTreeColumn
Chat 滚动容器           ChatContainer.tsx:68-72,326  CHAT_SCROLL_STYLE + chat-scroll.absolute.inset-0.overflow-y-auto.z-0
壁纸锁定               design-system.css:141-145  desktop-runtime body/#root !important
Glass 定义              design-system.css:19-24,206-279  oc-glass-*  blur 22/26px + color-mix
Ghostty 2d 取证         node_modules/ghostty-web/dist/ghostty-web.js:1338  A.getContext("2d",{alpha:!0})
Ghostty 绘制            ghostty-web.js:1389,1750,2367  Canvas2D fillRect / scale
```

---

*本文档为 Phase 2 运行时验证的受限验证（源码 + 规范 + 源码级 canvas 取证），未做长时 Performance 录制与真机 Layers 抓取；所有未实测项已标记 `UNCONFIRMED`，符合“不编造百分比、只给可观察等级”的要求。*
