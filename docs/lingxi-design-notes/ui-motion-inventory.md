# OpenChamber-LingXi UI motion inventory

Status: Phase 0-2 implemented
Inventory date: 2026-08-25
Implementation status: semantic tokens, one-shot draft reveals, per-character motion removal, and shared overlay presence are implemented without new dependencies.

## 1. Scope

This inventory follows the current React tree and state ownership rather than screenshots. It covers the shared desktop/web UI, Electron chrome, responsive branches that reuse desktop components, and dedicated mobile variants where they constrain a shared motion decision.

Primary paths inspected:

- `packages/ui/src/App.tsx`
- `packages/ui/src/components/layout/`
- `packages/ui/src/components/chat/`
- `packages/ui/src/components/session/`
- `packages/ui/src/components/ui/`
- `packages/ui/src/apps/`
- `packages/ui/src/index.css`
- `packages/electron/main.mjs`
- the nearest `DOCUMENTATION.md` files for Composer, message parts, work status, Sidebar, project context, stores, sync, surfaces, and performance tooling

The inventory contains **100 independently lifecycle-relevant element/state rows across 61 source component families**. A row is counted separately when the same component has states with different mount, exit, update, or motion rules. Small decorative icons and individual menu commands are not counted as separate elements unless they own a distinct lifecycle.

### Main component tree

```text
App
└─ MainLayout
   ├─ TitlebarLeftControls
   ├─ Sidebar
   │  ├─ SidebarTopBar
   │  └─ SessionSidebar
   │     ├─ SidebarNav / SidebarHeader
   │     ├─ SidebarProjectsList
   │     │  ├─ SidebarActivitySections
   │     │  └─ SortableProjectItem
   │     │     └─ SessionGroupSection
   │     │        ├─ SessionFolderItem
   │     │        └─ SessionNodeItem
   │     ├─ BulkActionBar
   │     └─ SidebarFooter
   └─ main column
      ├─ Header
      └─ chat area
         ├─ ChatContainer
         │  ├─ ChatViewport
         │  │  ├─ MessageList
         │  │  ├─ QuestionCard / PermissionCard
         │  │  └─ StatusRow
         │  ├─ ChatInput
         │  └─ WorkStatusPanel
         ├─ ContextPanel
         └─ ContextPanelRail
```

## 2. Classification and recommendation rules

| Code | Lifecycle class | Rule |
|---|---|---|
| A | Initial reveal | Play at most once when a page or major empty region first becomes visible. Never replay on data refresh or virtualization remount. |
| B | Conditional reveal | Use only for a real mount/unmount boundary caused by user action or authoritative state. Exit requires a presence owner. |
| C | State transition | Keep the element mounted. Crossfade, move an indicator, or swap an icon without replaying entrance motion. |
| D | Streaming/high frequency | No ordinary reveal. Direct updates are the default. Continuous motion is allowed only when it communicates a live operation. |
| E | Static/no motion | Keep still. Hover/focus color feedback is not treated as entrance motion. |

Recommendation values:

- **Recommended**: a clear lifecycle boundary and useful orientation benefit.
- **Optional**: motion can help, but the current static behavior is already correct.
- **Forbidden**: motion would replay too often, obscure authoritative state, disturb reading/scrolling, or add avoidable main-thread/GPU work.

Cost assumes realistic long-session use in Chromium/Electron, including MacBook Air and mobile hardware:

- **Low**: bounded `transform` and/or `opacity` on one or a few short-lived elements.
- **Medium**: a small bounded group, presence bookkeeping, isolated size interpolation, or short blur/filter use.
- **High**: repeated filters, geometry/layout animation, per-character DOM, large-area effects, or work tied to streaming updates.

## 3. UI component inventory

### 3.1 Global shell and header, G01-G10

| ID | Element / state | Source component | Source file | Parent | Trigger | Exit trigger | Update pattern | Frequency | Content type | Current motion | Sensitivity | Category | Candidate transition | Recommendation | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G01 | App shell ready | `App` | `packages/ui/src/App.tsx` | runtime root | Providers and initialization are ready | App shutdown/runtime replacement | Stable provider tree; recovery state changes in place | Once | Shell | None | High | E | None | Forbidden | A global entrance would delay recovery/auth states and replay across runtime changes. |
| G02 | Desktop main layout | `MainLayout` | `packages/ui/src/components/layout/MainLayout.tsx` | `App` | Desktop branch selected | Runtime becomes mobile | Store-driven surface visibility | Occasional | Layout | No whole-layout reveal | High | E | None | Forbidden | Child regions already own their boundaries; animating the whole workspace would move every reading target. |
| G03 | Electron native window chrome | `createBrowserWindow` | `packages/electron/main.mjs` | Electron main | Main window is created/shown | Window hidden/closed | Native move, resize, maximize events | Occasional | Window | OS-native | High | E | None | Forbidden | React must not imitate native window animation or replace macOS traffic lights. |
| G04 | Frameless window controls | `WindowsWindowControls` | `packages/ui/src/components/desktop/WindowsWindowControls.tsx` | `TitlebarLeftControls` or `Header` | Electron on Windows/Linux | Runtime/platform changes | Maximize state via IPC | Occasional | Icons/buttons | Color and 75ms glyph opacity | High | C | `icon-swap`, without blur | Optional, low cost | State may crossfade, but controls must remain immediately operable. |
| G05 | Fixed titlebar control cluster | `TitlebarLeftControls` | `packages/ui/src/components/layout/TitlebarLeftControls.tsx` | `MainLayout` | Desktop shell | Desktop shell exits | Width measured through `ResizeObserver` | Rare | Toolbar | Stays fixed while neighbors resize | High | E | None | Forbidden | Moving or remounting it would conflict with window drag regions and Sidebar geometry. |
| G06 | Sidebar closed/open | `Sidebar` | `packages/ui/src/components/layout/Sidebar.tsx` | `MainLayout` | Sidebar preference toggles | Opposite toggle | Width, min/max width, content opacity | Occasional | Panel | 200ms width and opacity, emphasized curve; disabled while resizing | High | C | Existing panel transition; not stock `panel-reveal` | Recommended, medium cost | Current motion preserves the fixed titlebar cluster. Stock panel reveal is too slow and uses blur. |
| G07 | Header spacer during Sidebar toggle | `Header` | `packages/ui/src/components/layout/Header.tsx` | main column | Sidebar toggles | Transition completes | Width follows Sidebar on same curve | Occasional | Layout spacer | 200ms width | High | C | Existing paired transition | Recommended, medium cost | Must stay synchronized with G06; an independent recipe would tear the layout. |
| G08 | Full-page surface title | `Header` | `packages/ui/src/components/layout/Header.tsx` | `MainLayout` | Scheduled, Archive, Worktrees, or Multi-run opens | Surface closes | Direct title replacement | Occasional | Text | None | Medium | C | `text-states-swap`, opacity-only | Optional, low cost | A short crossfade may clarify a real destination change; no stagger or blur. |
| G09 | Session title / rename | `Header` | `packages/ui/src/components/layout/Header.tsx` | `MainLayout` | Session/draft changes or rename starts | Session changes, save, cancel, outside click | Stable snapshot bridges brief cache gaps; editing mounts input | Occasional | Text/input | None | High | C/B | `text-states-swap` for title; none for input | Optional, low cost | Do not animate transient cache gaps or delay focus after menu close. |
| G10 | Header live context/usage readout | `ContextUsageDisplay` | `packages/ui/src/components/layout/Header.tsx` | `Header` | Resolved tokens exist and Work Status is hidden | Readout unavailable or Work Status appears | Message-derived value updates | Frequent while streaming | Dynamic number | Direct update | High | D | None; explicitly not `number-pop-in` | Forbidden | Number animation would run during streaming and compete with the transcript. |

### 3.2 New session and Composer, N01-N24

| ID | Element / state | Source component | Source file | Parent | Trigger | Exit trigger | Update pattern | Frequency | Content type | Current motion | Sensitivity | Category | Candidate transition | Recommendation | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| N01 | Welcome headline, first reveal | `ChatInputComponent`, `DraftWelcome` | `packages/ui/src/components/chat/ChatInput.tsx`; `packages/ui/src/components/chat/ChatContainer.tsx` | draft form / compact draft | New-session draft first opens | Draft materializes or closes | Project name may change | Once per draft | Heading text | Draft-only group fades out 120ms | Low | A | `texts-reveal`, adapted to opacity + 8px translate, 240-320ms | Recommended, low cost | This is the strongest text reveal candidate. It is short, prominent, and not streamed. |
| N02 | Welcome headline, project label update | Same as N01 | Same as N01 | draft form | Draft target project changes | Next target/session | Text replaces in place | Occasional | Heading text | None on content swap | Medium | C | `text-states-swap`, opacity-only | Optional, low cost | Replaying `texts-reveal` on each project selection would overstate a routine state change. |
| N03 | Draft project selector | `DraftTargetSelectors` | `packages/ui/src/components/chat/composer/ui/DraftTargetSelectors.tsx` | `ChatInput` | Draft open outside VS Code | Draft exits | Project list and selected target update | Occasional | Picker | Popup 150ms opacity/scale | Medium | B/C | Existing Select; `menu-dropdown` concept | Recommended, low cost | Keep trigger stable; only the popup should enter/exit. |
| N04 | Draft branch/worktree selector | `DraftTargetSelectors` | `packages/ui/src/components/chat/composer/ui/DraftTargetSelectors.tsx` | `ChatInput` | Project supports branches/worktrees | Draft exits or selector becomes inapplicable | Authoritative/pending worktree list | Occasional | Picker/list | Popup 150ms opacity/scale | High | B/C | Existing Select | Recommended, low cost | Pending targets must not visually snap back because discovery is incomplete. |
| N05 | Composer editor mount | `ComposerEditor` | `packages/ui/src/components/chat/composer/editor/ComposerEditor.tsx` | `ChatInput` | Chat input mounts | `ChatInput` unmounts | CodeMirror transactions | Once | Editor | None | High | E | None | Forbidden | Editor identity, focus, selection, and IME state are load-bearing. |
| N06 | Composer typing/caret | `ComposerEditor` | Same as N05 | Composer editor | Each input or selection transaction | Next transaction | Full prompt tokenization and caret updates | Very high | Editable text | Native/CodeMirror caret and selection | High | D | None | Forbidden | Never animate per keystroke, caret movement, selection, or editor height. |
| N07 | Draft to first session, draft-only UI exit | `ChatContainer` | `packages/ui/src/components/chat/ChatContainer.tsx` | chat column | Submitted draft materializes | 120ms completes | One-shot materialization marker | Once | Heading/selectors/actions | 120ms opacity fade; reduced-motion off switch | High | B | Existing custom exit | Recommended, low cost | Already correct and coordinated with editor preservation. |
| N08 | Draft to first session, Composer move | `ChatContainer` | Same as N07 | chat column | N07 completes and slot changes position | 180ms completes | FLIP from measured old/new bounds | Once | Composer panel | 180ms transform-only FLIP | High | C | Existing FLIP; not `card-resize` | Recommended, low cost | Do not replace with mount animation, height tween, or spring. |
| N09 | Attachment menu closed/open | `ComposerFooter` / attachment menu | `packages/ui/src/components/chat/composer/ui/ComposerFooter.tsx` | Composer footer | User opens attachment actions | Select, outside click, Escape | Static command list | Occasional | Dropdown | Shared Dropdown 150ms opacity/scale | Medium | B | `menu-dropdown` concept | Recommended, low cost | Existing shared primitive already matches the lifecycle. |
| N10 | Attachment chip added | `FileAttachment` | `packages/ui/src/components/chat/FileAttachment.tsx` | `ChatInput` | File is accepted | Removed or sent | File status may update | Occasional | Chip/card | No mount transition | Medium | B | Short opacity/scale-in only | Optional, low cost | A bounded chip reveal can confirm attachment, but must not animate Composer height. |
| N11 | Attachment chip removed | `FileAttachment` | Same as N10 | `ChatInput` | User removes file | Node unmounts | None | Occasional | Chip/card | Immediate unmount | High | B | Quiet opacity exit with presence | Optional, medium cost | Exit needs retained presence; deletion outcome must not wait for it. |
| N12 | Drag-over overlay | `ChatInputComponent` | `packages/ui/src/components/chat/ChatInput.tsx` | Composer box | Valid drag enters | Leave or drop | Drag depth/status | Interaction burst | Overlay | Immediate ring/overlay | Medium | B | 80-120ms opacity | Optional, low cost | Keep feedback immediate and avoid scale/layout movement. |
| N13 | Model selector closed/open | `ModelControls` | `packages/ui/src/components/chat/ModelControls.tsx` | Composer footer | Trigger opens | Selection, outside click, Escape | Query and provider/model rows update | High while open | Searchable dropdown | 150ms opacity/scale; loading spin | High | B | Existing Dropdown; `menu-dropdown` concept | Recommended, low cost | Do not animate filtered rows or metadata refreshes. |
| N14 | Model value changed | `ModelControls` | Same as N13 | Composer footer | User/session model changes | Next change | Label/logo replace | Occasional | Icon/text | Direct replacement | Medium | C | `text-states-swap` + icon crossfade, no blur | Optional, low cost | State change can crossfade in a fixed slot; do not slide a carousel. |
| N15 | Agent selector closed/open | `ModelControls` | Same as N13 | Composer footer | Trigger or mobile long press opens | Select/close | Query and agent rows update | High while open | Searchable dropdown | 150ms opacity/scale | High | B | Existing Dropdown | Recommended, low cost | Keep search/filter direct and restore Composer focus on close. |
| N16 | Agent value changed | `ModelControls` | Same as N13 | Composer footer | User/session agent changes | Next change | Label/color changes in place | Occasional | Icon/text | Direct replacement | Medium | C | `icon-swap` adapted without blur | Optional, low cost | A fixed-slot crossfade is safe; server restoration must not flash the global agent. |
| N17 | Reasoning/effort selector | `ModelControls` | Same as N13 | Composer footer | Current model has variants | Model loses variants or menu closes | Pending keyboard variant and committed value | Occasional/high while open | Picker/chips | Popup 150ms; direct chip updates | Medium | B/C | Existing Dropdown; indicator move | Recommended, low cost | Animate the selection indicator, never the value on each arrow-key preview. |
| N18 | Microphone idle/ready | `ComposerDictation` | `packages/ui/src/components/dictation/ComposerDictation.tsx` | Composer footer | Dictation available and idle | Recording starts/unavailable | Capability/state changes | Occasional | Icon button | Static icon | Medium | C | `icon-swap`, opacity/transform only | Optional, low cost | Keep hit target fixed and recording start immediate. |
| N19 | Microphone recording | `ComposerDictation` | Same as N18 | Composer/footer overlay | Recording starts | Stop/cancel/failure | Waveform updates continuously | Very high while active | Live status | Ping, waveform; mobile delayed content fade | High | D | Existing live indicators | Recommended, bounded duration | Continuous motion is justified only while audio capture is actually live. |
| N20 | Dictation transcribing/error | `ComposerDictation` | Same as N18 | Composer overlay | Recording stops or transcription fails | Result accepted/retried/discarded | Pending/error state | Occasional | Status/actions | Spinner; direct error state | High | C | `spinner-to-check-morph` only if result boundary is authoritative | Optional, low cost | Never delay error, retry, or partial-result actions for a flourish. |
| N21 | Send button idle/disabled/ready | `ComposerActionButtons` | `packages/ui/src/components/chat/composer/ui/ComposerActionButtons.tsx` | Composer footer | Composer is mounted | Composer unmounts | Content and permission state | Per keystroke | Button/icon | Direct disabled/opacity state | High | D/C | None for readiness | Forbidden | Readiness changes on every key; entrance or pop animation would be constant noise. |
| N22 | Send to stop/queue state | `ComposerActionButtons` | Same as N21 | Composer footer | Session becomes busy or queueable | Session settles | Authoritative session status | Occasional | Button/icon | Immediate branch replacement | High | C | Fixed-slot icon crossfade, no blur | Optional, low cost | Stop must become available immediately; no spin, bounce, or moving hit target. |
| N23 | Quick action group, first reveal | `DraftPresetChips` | `packages/ui/src/components/chat/DraftPresetChips.tsx` | draft welcome | Draft starters become visible on initial draft | Draft exits/settings hide group | Registry preload may fill labels; DnD updates positions | Once | Chip list | DnD transform; whole group joins 120ms exit | Medium | A | One group fade/translate; no per-chip stagger | Recommended, low cost | Reveal the group once. Per-chip stagger is too landing-page-like and unstable with async registry data. |
| N24 | Goal/Schedule quick actions and Goal state | `DraftPresetChips`, `SessionGoalButton`, `SessionGoalRow` | `packages/ui/src/components/chat/DraftPresetChips.tsx`; `packages/ui/src/components/chat/SessionGoalButton.tsx`; `packages/ui/src/components/chat/SessionGoalRow.tsx` | draft actions / Composer / chat | Goal mounts or state changes; Schedule chip submits command | Goal removed/completed; draft materializes | Goal counter per key; goal state low-frequency | Mixed | Chip/status row | Dialog/sheet motion, spinner for evaluating | High | C/B/D | State color/icon crossfade; no `texts-reveal` for counters | Optional | Goal row may reveal once; objective counts and status authority must update directly. Schedule has no separate UI lifecycle. |

### 3.3 Session and chat, C01-C25

| ID | Element / state | Source component | Source file | Parent | Trigger | Exit trigger | Update pattern | Frequency | Content type | Current motion | Sensitivity | Category | Candidate transition | Recommendation | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Initial session hydration | `ChatContainer` / `Skeleton` | `packages/ui/src/components/chat/ChatContainer.tsx`; `packages/ui/src/components/ui/skeleton.tsx` | chat column | Session messages are not hydrated | Messages become available/error | Bootstrap state | Once per load | Skeleton | Infinite pulse | Medium | B | `skeleton-loader-and-reveal`, opacity-only adaptation | Optional, medium cost | One bounded pulse and crossfade is better than indefinite pulse; no blur. |
| C02 | Historical user message | `UserTextPart` | `packages/ui/src/components/chat/message/parts/UserTextPart.tsx` | `MessageBody` | History row mounts | Virtualized/unloaded | Static after hydration | Rare | Markdown/text | Reveal disabled for history | High | E | None | Forbidden | Re-mount reveal would flash during virtualization and break reading continuity. |
| C03 | Newly sent user message | `ChatMessage` | `packages/ui/src/components/chat/ChatMessage.tsx` | `MessageListEntry` | One pending-send marker is consumed | Animation completes | Optimistic echo later reconciles in place | Once per send | Message block | 300ms opacity + 0.5rem translate; reduced-motion support | Medium | B | Existing reveal | Recommended, low cost | Clear one-shot boundary; do not replay when server echo replaces optimistic data. |
| C04 | Final assistant message | `AssistantTextPart` | `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx` | assistant body | Completed assistant text mounts/history loads | Virtualized/unloaded | Static | Rare | Markdown | No text entrance | High | E | None | Forbidden | Long-form reading benefits from stability, not ornamental reveal. |
| C05 | Streaming assistant Markdown | `AssistantTextPart` | Same as C04 | assistant body | Part is streaming | Part completes | Bounded/coalesced text updates, roughly up to 10Hz | Very high | Markdown | Direct update | High | D | None; not `streaming-text` or `texts-reveal` | Forbidden | Word blur/reveal would multiply DOM/paint work and make text harder to track. |
| C06 | Reasoning collapsed summary | `ReasoningPart` | `packages/ui/src/components/chat/message/parts/ReasoningPart.tsx` | `MessageBody` / `ProgressiveGroup` | Reasoning part exists and is collapsed | Expanded/part removed | Summary/duration updates | Mixed | Text row | Static summary | Medium | C | `text-states-swap` only after completion | Optional, low cost | During streaming, summary changes must remain direct. |
| C07 | Reasoning manual expand/collapse | `ReasoningTimelineBlock` | Same as C06 | reasoning part | User toggles | Opposite toggle | Presence held for exit | Occasional | Expandable panel | 200ms height plus 180ms opacity/translate | High | C | `accordion`, but transform/opacity-first adaptation | Optional, medium cost | User-controlled boundary can animate; current height animation needs profiling and reduced-motion coverage. |
| C08 | Streaming reasoning text | `ReasoningPart` | Same as C06 | expanded reasoning | Reasoning streams | Completes/collapses | Text updates roughly up to 10Hz | Very high | Markdown | Direct growth | High | D | None; not `reasoning-stream` | Forbidden | Do not animate each update, auto-scroll line, blur, or repeatedly resize the container. |
| C09 | Static grouped tool row | `StaticToolRow` | `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx` | `ProgressiveGroup` | Static navigation tool appears | Group unmounts | Title/path may update before completion | Occasional | Compact row | `ToolRevealOnMount`; some text uses per-character generate effect | High | B | Whole-row `ToolRevealOnMount` only | Recommended with restriction | Keep one bounded row reveal; remove/avoid per-character motion. |
| C10 | Expandable tool header | `ToolPart` | `packages/ui/src/components/chat/message/parts/ToolPart.tsx` | `MessageBody` | Tool part appears | Message unloads | Status, title, timer, diff stats update | Frequent while running | Expandable row | One-time tool reveal; active opacity state | High | B/C | Existing one-time reveal + fixed-slot state swap | Recommended with restriction | Do not replay reveal for status/output updates. |
| C11 | Tool expanded body | `ToolExpandedContent` | Same as C10 | `ToolPart` | User expands | User collapses/message unloads | Heavy content lazy-mounts after toggle | Occasional | Output panel | Direct `auto/0`, no ordinary height tween | High | C | None by default | Forbidden | Large JSON, code, diff, and diagnostics make size animation risky. |
| C12 | Tool result finalized | `ToolPart` | Same as C10 | tool card | Tool status becomes completed/error | Next state/unmount | Header/result replace in place | Occasional | Status/output | Direct update | High | C | `spinner-to-check-morph` only for compact status glyph | Optional, low cost | A glyph morph may help; output must not crossfade or remount. |
| C13 | Running Bash output | `ToolScrollableSection` | Same as C10 | expanded tool body | Bash starts emitting | Tool finalizes/collapses | Snapshot append/replace, scroll-follow | Very high | Monospace log | No reveal or smooth scroll | High | D | None | Forbidden | Per-line reveal, smooth scroll, blur, or height animation would be expensive and disorienting. |
| C14 | Bash live duration | `LiveDuration` | Same as C10 | tool header | Bash is running | Tool settles | Number updates every 250ms | High | Dynamic number | Direct update | High | D | None; not `spinning-counter` | Forbidden | Four updates per second make digit animation constant. |
| C15 | Final Bash/tool output | `ToolPart` / output renderers | Same as C10 | tool body | Tool settles and canonical output arrives | Collapse/unmount | One final normalization/highlight pass | Once | Code/log/JSON | Direct final render | High | E | None | Forbidden | Syntax highlighting and large payloads should not be wrapped in reveal/filter effects. |
| C16 | Tool diff preview | `ToolPartDiffPreview` / `PlainDiffFallback` | `packages/ui/src/components/chat/message/parts/ToolPartDiffPreview.tsx` | expanded tool body | Diff body is opened | Collapse/unmount | Lazy chunk replaces plain fallback | Once | Diff | Suspense fallback swap | High | B/E | `skeleton-loader-and-reveal` only as opacity crossfade | Optional, medium cost | Preserve readable fallback. Never animate diff lines or geometry. |
| C17 | Turn changed-files control | `TurnChangedFilesDropdown` | `packages/ui/src/components/chat/TurnChangedFilesDropdown.tsx` | completed turn footer | Turn has changed files | Turn unmounts | Count/list stable after completion | Occasional | Popover/list | 150ms fade/scale/slide | Medium | B | Existing Popover | Recommended, low cost | User-triggered compact overlay matches the shared primitive. |
| C18 | Message attachments | `FileAttachment` | `packages/ui/src/components/chat/FileAttachment.tsx` | message body | Message contains attachments | Message unmounts | Load/error state per attachment | Occasional | Chip/image | Hover feedback; no list reveal | Medium | E/B | None for history; one fade for newly attached local item | Optional | History must stay static; only new local attachment confirmation may animate. |
| C19 | Assistant image gallery | `MarkdownImageGallery` | `packages/ui/src/components/chat/MarkdownImageGallery.tsx` | completion area | Completed message has image candidates near viewport | Message unmounts | Lazy preparation/load/error per image | Occasional | Thumbnail grid | Hover scale; no gallery reveal | High | E | None | Forbidden | Lazy image arrival must not shift or replay motion across long history. |
| C20 | Image/Mermaid preview | `ToolOutputDialog` | `packages/ui/src/components/chat/message/ToolOutputDialog.tsx` | portal | User opens ready preview | Close/Escape | Presence via RAF and 150ms delayed unmount | Occasional | Modal/preview | 150ms opacity | Medium | B | `modal-open-close`, transform/opacity | Recommended, low cost | A true user-triggered overlay; keep 3D tilt/image bend out of the developer tool. |
| C21 | Message actions | `MessageBody` footer actions | `packages/ui/src/components/chat/message/MessageBody.tsx` | message block | Pointer hover/focus or touch affordance | Pointer/focus leaves | Action availability changes rarely | Interaction | Icon buttons | 150ms opacity | Medium | C | Existing hover transition | Recommended, low cost | Do not animate the message itself to reveal controls. |
| C22 | Assistant/tool error and retry | message error renderers | `packages/ui/src/components/chat/message/MessageBody.tsx`; `packages/ui/src/components/chat/message/parts/ToolPart.tsx` | message/tool | Authoritative error appears | Retry succeeds/message unloads | Error text and retry pending state | Occasional | Error card/actions | Mostly static; pending spinner | High | B/C | Quiet opacity-in; optional `error-state-shake` only on rejected direct input | Optional with restriction | Never shake server/tool errors or delay retry. Error text must appear immediately. |
| C23 | Working placeholder / BusyDots | `WorkingPlaceholder`, `BusyDots` | `packages/ui/src/components/chat/message/parts/WorkingPlaceholder.tsx`; `BusyDots.tsx` | status row | Session is actively working without content | Content arrives/session settles | Three-dot opacity loop | Continuous while active | Live status | 1.2s pulse; reduced-motion disables | Medium | D | Existing live indicator | Recommended, bounded duration | Motion conveys a real live state and stops with it. |
| C24 | Permission/question card | `PermissionCard`, `QuestionCard` | `packages/ui/src/components/chat/PermissionCard.tsx`; `QuestionCard.tsx` | `ChatViewport` | Pending request exists | Answered/cancelled/session changes | Submit/error states | Occasional | Interactive card | Pending spinner; otherwise direct | High | B/C | 120-180ms opacity/translate on true mount | Optional, low cost | Arrival may be announced gently; controls and resolution must not wait for exit motion. |
| C25 | Task/subagent/multi-agent rows | task summary + Work Status sections | `packages/ui/src/components/chat/message/parts/ToolPart.tsx`; `packages/ui/src/components/chat/work-status/` | tool card / Work Status | Child/task appears | Session/part unmounts | Live status, blockers, summary entries and sorting | Frequent | List/status rows | Tool reveal plus some per-character text; no row reorder motion | High | D/C | Static insert or whole-row opacity only | Forbidden for repeated reveal | New child identity may fade once, but summary/status updates and sorting must remain static. |

### 3.4 Sidebar, S01-S20

| ID | Element / state | Source component | Source file | Parent | Trigger | Exit trigger | Update pattern | Frequency | Content type | Current motion | Sensitivity | Category | Candidate transition | Recommendation | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | New session navigation row | `SidebarNav` | `packages/ui/src/components/session/sidebar/SidebarNav.tsx` | `SessionSidebar` | Desktop/web Sidebar visible | VS Code/hidden controls | User action only | Rare | Navigation row | Hover/focus | Low | E | None | Forbidden | Persistent navigation should not reveal repeatedly with Sidebar open/close. |
| S02 | Add project / Scheduled / Multi-run / Archive toolbar | `SidebarHeader` | `packages/ui/src/components/session/sidebar/SidebarHeader.tsx` | `SessionSidebar` | Directory controls available | Runtime variant hides controls | Availability and surface flags | Occasional | Icon toolbar | Hover color | Medium | E/C | Icon crossfade for active surface only | Optional, low cost | Keep toolbar stable; do not stagger icons. |
| S03 | Search field mount | `SidebarHeader` | Same as S02 | `SessionSidebar` | Search button/shortcut | Escape/outside click | Local text then 120ms debounced query | High while typing | Input | Direct mount/unmount | High | B | Short opacity/width only if focus remains immediate | Optional, medium cost | Search focus and result visibility must not wait for a decorative expansion. |
| S04 | Search results filtering | `SidebarProjectsList` | `packages/ui/src/components/session/sidebar/SidebarProjectsList.tsx` | `SessionSidebar` | Debounced query changes | Query clears | Tree projection recomputes | High while typing | Large list | Direct replacement | High | D | None | Forbidden | Per-row reveal/layout motion on every query would be costly and visually unstable. |
| S05 | Search empty state | `SessionSidebar` | `packages/ui/src/components/session/SessionSidebar.tsx` | Sidebar content | Query has no matches after debounce | Match appears/query clears | Debounced condition | Occasional | Empty-state text | Static | Low | B | Whole-state opacity/translate | Optional, low cost | A real conditional state, distinct from fetch failure and global empty. |
| S06 | Selection mode idle/active | `SidebarHeader`, `BulkActionBar` | `packages/ui/src/components/session/sidebar/SidebarHeader.tsx`; `BulkActionBar.tsx` | `SessionSidebar` | User enables selection and selects rows | Selection clears/mode exits | Selection store updates | Interaction burst | Toolbar/bar | Direct mount/unmount; color state | Medium | C/B | Fixed toolbar state swap; quiet bar reveal | Optional, low cost | Do not animate every selected row or alter list geometry more than necessary. |
| S07 | Chats section header | `SidebarActivitySections` | `packages/ui/src/components/session/sidebar/SidebarActivitySections.tsx` | `SidebarProjectsList` | Non-VS Code and no query | Runtime/query hides it | Structural session data | Occasional | Section header | Hover chevron/action opacity | Medium | E/C | Icon swap without blur | Optional, low cost | Persistent section identity should stay still. |
| S08 | Chats empty state | `SessionGroupSection` | `packages/ui/src/components/session/sidebar/SessionGroupSection.tsx` | Chats section | Authoritative Chats list is empty | First chat appears/loading/error | Authoritative state only | Rare | Empty-state text | Static | Low | B | `texts-reveal` once, opacity/translate only | Optional, low cost | Valid mount boundary, but it must never represent fetch failure. |
| S09 | Recent section | `SidebarActivitySections` | Same as S07 | `SidebarProjectsList` | Preference enabled, all-project mode, no query | Preference/mode/query changes | Structural membership; active root enters on lifecycle edge | Occasional | Section/list | No row entrance | High | B/E | Whole section fade only | Optional, low cost | Do not reveal each row or replay when active membership changes. |
| S10 | Project zone | `SortableProjectItem` | `packages/ui/src/components/session/sidebar/sortableItems.tsx` | `SidebarProjectsList` | Configured project exists | Project removed/filter hides it | Metadata and section references | Occasional | Section/panel | DnD transform; hover actions | High | E/C | Existing DnD only | Forbidden for ordinary mount | Project discovery/reordering should not make the entire Sidebar dance. |
| S11 | Project collapse/expand | `SortableProjectItem` | Same as S10 | project zone | User toggles | Opposite toggle | Persisted expansion state | Occasional | Collapsible list | Body direct mount/unmount | High | C | None by default; not `accordion` for large trees | Forbidden | Height/layout animation scales with every session row and fights scroll anchoring. |
| S12 | Group/worktree collapse | `SessionGroupSection` | `packages/ui/src/components/session/sidebar/SessionGroupSection.tsx` | project zone | User toggles group | Opposite toggle | Persisted state; search overrides visibility | Occasional | Collapsible list | Direct mount/unmount | High | C | None | Forbidden | Same large-list and search-expansion risk as S11. |
| S13 | Folder collapse/expand | `SessionFolderItem` | `packages/ui/src/components/session/SessionFolderItem.tsx` | group | User toggles | Opposite toggle | Hidden subtree changes | Occasional | Tree row/subtree | Direct mount/unmount | High | C | Chevron transform only | Optional, low cost | Animate only the indicator, not subtree height or rows. |
| S14 | Session row normal/selected | `SessionNodeItem` | `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` | group/folder/recent | Session is rendered/selected | Filter, batching, hidden Sidebar, delete | Leaf subscriptions for active/status/unseen | Frequent across tree | List row | Color/action opacity; scroll compensation | High | C/E | Existing color/opacity | Recommended, low cost | Never add mount reveal to batched, searched, or virtualized rows. |
| S15 | Session busy/retry indicator | `SessionNodeItem`, `SessionActivityDuration` | Same as S14; `packages/ui/src/components/session/SessionActivityDuration.tsx` | session row | Session enters busy/retry | Settles/is read | Static dot; duration ticks once/sec | High over long turns | Status dot/number | No spinner; 1fps number | High | D | None | Forbidden | Current static dot plus counter replaced costly perpetual row spinners. |
| S16 | Session unread indicator | `SessionNodeItem` | Same as S14 | session row | Settled output is unseen | Session is read | Dot/color and timing snapshot | Occasional | Status/text | Static info dot; color-only title | High | C | Color crossfade only | Recommended, low cost | Do not pulse or change font weight, which shifts truncation width. |
| S17 | Session short worktree move | `SessionNodeItem` | Same as S14 | session row | User starts move | Move completes/fails | Pending boolean | Rare/short | Spinner | `animate-spin` | Medium | D | Existing spinner | Recommended, bounded duration | A short user-initiated operation has an honest continuous pending state. |
| S18 | Session/folder rename | `SessionNodeItem`, `SessionFolderItem` | Same as S14/S13 | row | Menu fully closes and editing begins | Save, Escape, outside click | Local input | Interaction | Inline input | Direct swap | High | C | None | Forbidden | Focus timing across duplicate Recent/project row instances matters more than visual transition. |
| S19 | Sidebar loading/error/retry | `SessionGroupSection` | Same as S12 | empty/stale group | Bootstrap queued/running/failed | Success/retry | Directory-scoped bootstrap state | Occasional | Status row | Loading spinner; static error | High | B/C | Skeleton crossfade only for initial load | Optional with restriction | Failure must remain distinct from authoritative empty; stale data stays visible. |
| S20 | Show more/fewer and archived virtualization | `SessionGroupSection`, `SidebarActivitySections` | Same as S12/S07 | list footer/history | User requests batch or archived list crosses threshold | Collapse/filter/unmount | Batch count or virtual range changes | Interaction/scroll | List | New rows direct; virtual rows transform-positioned | High | D/E | None | Forbidden | Stagger/reveal would replay on batch and virtualization mounts and disturb scroll anchoring. |

### 3.5 Context Panel and Work Status, P01-P10

| ID | Element / state | Source component | Source file | Parent | Trigger | Exit trigger | Update pattern | Frequency | Content type | Current motion | Sensitivity | Category | Candidate transition | Recommendation | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 | Context Panel closed/open | `ContextPanel` | `packages/ui/src/components/layout/ContextPanel.tsx` | `MainLayout` | Rail/tab action opens panel | Close action/surface invalid | Width and content opacity; shell remains mounted/inert | Occasional | Docked panel | 200ms width/opacity, emphasized curve | High | C | Existing panel transition; not stock `panel-reveal` | Recommended, medium cost | Existing horizontal dock behavior is more appropriate than the recipe's 350-400ms Y slide and blur. |
| P02 | Context rail item active | `ContextPanelRailItem` | `packages/ui/src/components/layout/ContextPanelRail.tsx` | `ContextPanelRail` | Active mode changes | Another mode/close | Selection and badge values | Occasional | Icon button | Hover/selection; DnD transition | Medium | C | `icon-swap` only where glyph truly changes | Optional, low cost | Selection should primarily use theme state; avoid badge pop on live counts. |
| P03 | Context multi-instance tab indicator | `ContextPanelContent` | `packages/ui/src/components/layout/ContextSidebarTab.tsx` | `ContextPanel` | Active file/chat/browser tab changes | Tab strip unmounts | Measured transform and size | Occasional | Tab strip | 280ms position, 260ms size; reduced-motion support | Medium | C | `tabs-sliding`, adapted to semantic tokens | Recommended, medium cost | Already follows the same indicator concept; width animation remains a measured exception. |
| P04 | Context surface switch | `ContextPanel` / surface views | `packages/ui/src/components/layout/ContextPanel.tsx` | panel content | Active rail mode changes | Next mode/panel close | Some views keep alive, others mount only active | Occasional | Full panel content | Mostly direct; lazy fallback is `null` | High | C/B | 100-150ms opacity crossfade only when both states are available | Optional, medium cost | Do not blank the panel longer or remount keep-alive surfaces merely to animate. |
| P05 | Context lazy surface loading | lazy views | Same as P04 | panel content | Lazy chunk first requested | Chunk resolves/errors | One-time code load | Once per surface | Loading state | `fallback={null}` | Medium | B | `skeleton-loader-and-reveal`, no blur/pulse loop | Optional, medium cost | A minimal stable placeholder can prevent an unexplained blank, but needs implementation evidence later. |
| P06 | Project Context section/tab switch | `ProjectNotesTodoPanel` | `packages/ui/src/components/session/project-context/ProjectNotesTodoPanel.tsx` | notes surface | Notes/Todos/Plans/Memory selection changes | Next section/surface close | Search can redirect active section | Occasional | Panel/tab/list | Direct content swap | High | C | `tabs-sliding` for indicator only | Optional, medium cost | Keep lists static, especially while search changes section automatically. |
| P07 | Knowledge card expand/collapse | `KnowledgeCard` | `packages/ui/src/components/session/project-context/KnowledgeCard.tsx` | notes/memory list | User opens/closes card | Opposite toggle/project switch | Local draft/edit state | Occasional | Expandable card | Direct content state | High | C | Indicator rotation only; no stock `card-resize` | Optional, low cost | Editing and 3000-character notes make size interpolation risky. |
| P08 | Work Status Panel shown/hidden | `WorkStatusPanel` | `packages/ui/src/components/chat/work-status/WorkStatusPanel.tsx` | `ChatContainer` | Preference/layout/data presence allows it | Context panel, width, preference, or empty data hides it | Inline or overlay visibility; content delayed 200ms on exit | Occasional | Panel/card | 200ms width/opacity/translate/margin or overlay opacity/translate/scale | High | C | Existing custom panel transition | Recommended, medium cost | It is coordinated with Context Panel and measured chat width; generic panel motion would risk oscillation. |
| P09 | Work Status section expand/collapse | `WorkStatusCollapsibleSection` | `packages/ui/src/components/chat/work-status/WorkStatusPrimitives.tsx` | `WorkStatusPanel` | User toggles section; Subagents auto-opens only on 0-to-positive edge | Opposite toggle/panel hides | Immediate child mount/unmount; persisted expansion | Occasional | Section/list | No body animation; icon swaps | High | C | Chevron transform; no `accordion` body motion by default | Optional, low cost | Lists and live rows change size; body animation would fight active updates and user choice. |
| P10 | Usage, quota, MCP, sources, tasks, subagents values | Work Status section components | `packages/ui/src/components/chat/work-status/` | `WorkStatusPanel` | Data exists | Section becomes empty/panel hides | Quota 3-minute refresh plus manual; session/task/MCP live updates | Mixed/high | Dynamic rows | Spinners only for explicit pending; values direct | High | D/E | None; not `number-pop-in`, `spinning-counter`, or `texts-reveal` | Forbidden | Labels are static reading anchors; values and list rows must not animate on refresh or live events. |

### 3.6 Overlay and secondary UI, O01-O11

| ID | Element / state | Source component | Source file | Parent | Trigger | Exit trigger | Update pattern | Frequency | Content type | Current motion | Sensitivity | Category | Candidate transition | Recommendation | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| O01 | Dropdown/menu | shared `DropdownMenu` | `packages/ui/src/components/ui/dropdown-menu.tsx`; `dropdown-menu.styles.ts` | Portal/current dialog | Trigger opens | Select/outside/Escape | Menu state and active item | Occasional | Overlay/list | 150ms opacity + scale .95, full enter/exit presence | Medium | B | `menu-dropdown` concept | Recommended, low cost | Existing primitive is coherent and widely reused. |
| O02 | Popover | shared `Popover` consumers | `packages/ui/src/components/ui/popover.tsx` | Portal | User opens contextual content | Outside/Escape/action | Local data while open | Occasional | Overlay/card | 150ms opacity/scale/side offset | Medium | B | Existing popover | Recommended, low cost | Keep travel small and placement-aware. |
| O03 | Tooltip | shared `Tooltip` | `packages/ui/src/components/ui/tooltip.tsx` | Tooltip provider/portal | Hover/focus/long press delay | Leave/blur/timeout | Usually static; grouped tooltips can switch instantly | Frequent interaction | Text bubble | 150ms opacity/scale; instant mode | Medium | B | `tooltip-open-close` | Recommended, low cost | Appear-only delay and fast exit fit tool UI; do not animate tooltip text itself. |
| O04 | Context menu | shared `ContextMenu` | `packages/ui/src/components/ui/context-menu.tsx` | Portal | Right click/keyboard menu | Select/outside/Escape | Menu state | Occasional | Overlay/list | Reuses Dropdown styles | Medium | B | `menu-dropdown` concept | Recommended, low cost | Must not trigger row selection/collapse while opening. |
| O05 | Dialog/modal | shared `Dialog` | `packages/ui/src/components/ui/dialog.tsx` | Global portal | Controlled/open trigger | Close/Escape/action | Dialog-local forms and async state | Occasional | Modal | Backdrop and content 150ms; scale .98; full presence | Medium | B | `modal-open-close` | Recommended, low cost | Current 150ms close already matches the recipe's exit. Recipe's 250ms open is optional, not a required change. |
| O06 | Command palette | `Command` in shared Dialog | `packages/ui/src/components/ui/command.tsx` | Dialog | Shortcut/trigger | Select/Escape | Search filters each key | High while open | Modal/search/list | Dialog motion; rows direct | High | B/D | Modal only | Recommended with restriction | Animate the shell once, never filtered rows or active item movement. |
| O07 | Settings | `SettingsWindow`, `SettingsView` | `packages/ui/src/components/views/SettingsWindow.tsx` | `MainLayout` | Settings opens | Close/back | Desktop keeps lazy-loaded content mounted; mobile full-screen branch | Occasional | Modal/full page | Desktop Dialog 150ms; mobile direct mount | High | B | Desktop existing modal; mobile page-side transition only after navigation contract review | Optional | Desktop is solved. Mobile should not gain motion until back/keyboard behavior is verified. |
| O08 | File/directory picker | `DirectoryExplorerDialog` plus native/runtime pickers | `packages/ui/src/components/session/DirectoryExplorerDialog.tsx` | Dialog or `MobileOverlayPanel` | User requests path/file | Select/cancel | Loading, permission, error, retry, listing | Mixed | Modal/list | Desktop Dialog; mobile 200ms sheet enter; native pickers OS-owned | High | B/D | Existing wrappers only | Recommended with restriction | Never wrap OS picker, loading rows, or filtered file lists in extra reveal. |
| O09 | Toast | Sonner wrapper | `packages/ui/src/components/ui/sonner.tsx`; `toast.ts` | Global toaster | App emits notification | Timeout/dismiss/action | Usually immutable message | Occasional/bursty | Floating notification | Sonner-owned motion, not tokenized | Medium | B | `toast-open-close` concept | Optional, medium cost | Centralize only if Sonner supports the contract without forking internals; avoid blur. |
| O10 | Confirmation | shared Dialog and remaining `window.confirm` callers | shared Dialog plus feature callers | Portal/browser | Destructive or trust-boundary action | Confirm/cancel | Usually static; submit may pend | Occasional | Modal/actions | App Dialog 150ms or browser native | High | B/E | App Dialog `modal-open-close`; native none | Recommended for shared Dialog, forbidden for native override | Native confirmation must stay native until explicitly migrated for behavior reasons, not motion consistency. |
| O11 | Mobile sheet/drawer/metadata overlay | `MobileOverlayPanel`, mobile drawers, `MobileSessionMetadata` | `packages/ui/src/components/ui/MobileOverlayPanel.tsx`; `packages/ui/src/apps/MobileSessionMetadata.tsx`; `MainLayout.tsx` | Mobile shell | Mobile action opens | Close/back/gesture/runtime change | Keyboard inset and gesture state | Occasional | Sheet/drawer/popover | Sheet 200ms enter but immediate unmount on close; metadata 170/140ms custom presence; drawers use spring | High | B/C | Existing mobile curves; do not copy desktop modal | Optional, medium cost | Shared UI decisions must note the asymmetry, but fixing exit cannot delay iOS close signals or keyboard restoration. |

## 4. Lifecycle classification

### A. Initial reveal

Use once per real page/empty-region visit:

- N01 welcome headline
- N23 Quick Actions as one group
- S08 authoritative Chats empty state, optionally
- C01 initial hydration content handoff, if implemented as a bounded crossfade
- P05 first lazy surface load, if a stable placeholder is added later

Do not treat every component mount as an initial reveal. Virtualization, batching, filtering, runtime switching, and keep-alive surfaces make mount an unreliable proxy for user-perceived arrival.

### B. Conditional reveal

Good boundaries are user-opened overlays and authoritative cards:

- Dropdown, Select, Popover, Tooltip, Context Menu, Dialog, preview, and toast shells
- Attachment chips and drag overlay
- Permission/question cards
- One newly created tool row
- Search/empty/error states when their authority is explicit

Exit animation is allowed only when the owner retains the exiting node. CSS on a conditionally removed node cannot produce an exit by itself.

### C. State transition

Keep identity and geometry stable:

- Sidebar, Context Panel, Work Status open/closed
- Header title and surface title
- Model, Agent, effort, mic, Send/Stop, Goal status
- Tabs and selected indicators
- Collapsed/expanded chevrons
- Loading to success status glyphs

The default is an icon/label crossfade or indicator transform, not a fresh entrance.

### D. Streaming/high frequency

No ordinary reveal:

- Assistant streaming Markdown
- Reasoning/thinking streaming text
- Running Bash and tool output
- Bash timer
- Composer input, caret, Goal objective counter, and send readiness
- Usage/context/token/quota values while live
- Task/subagent status and summary updates
- Sidebar duration counters and session activity
- Search-filtered lists
- Virtualized or batched rows

### E. Static/no motion

- Historical and finalized messages
- Final tool output, diff, diagnostics, syntax-highlighted code
- Normal navigation rows and long-lived labels
- Project/session/folder list mounts
- Image galleries and historical attachments
- Completed changed-file metadata
- Work Status labels and completed rows

## 5. Existing motion audit

### Existing mechanisms

| Mechanism | Current use | Assessment |
|---|---|---|
| Base UI starting/ending styles | Dialog, Dropdown, Tooltip, Context Menu, Select, Popover | Most coherent family: usually 150ms `opacity` + small `scale`. Keep as the overlay baseline. |
| Tailwind transition classes | Hover/focus, Sidebar, panels, tabs | Useful but durations and curves are scattered. Tokenize later instead of replacing working primitives. |
| Hand-written CSS keyframes | Spinner, pulse, shimmer, marquee, migration, mobile overlays | Keep only when tied to a live status or platform-specific lifecycle. |
| React state plus RAF/timeout presence | Preview, Work Status, mobile metadata | Correct where lifecycle requires retained exit nodes, but timing ownership is fragmented. |
| `motion/react` spring | Responsive/mobile drawers and per-character generated text | Drawers have a real gesture/layout role. Per-character generated text is a high-cost outlier. |
| Sonner internal motion | Toasts | Behavior is dependency-owned and not aligned to repository tokens. Do not fork it solely for visual uniformity. |
| Web Animations API FLIP | Draft Composer to first session | Strong existing pattern: transform-only, one shot, measured, reduced-motion aware. |

### Current timing families

| Timing | Current examples | Decision |
|---|---|---|
| 75-120ms | window glyphs, draft-only exit, some collapsible wrappers | Fast feedback/exit only. |
| 140-180ms | mobile metadata, overlay primitives, preview, Composer FLIP | Primary micro/overlay range. |
| 200ms | Sidebar, Context Panel, Work Status, mobile sheet | Panel/layout range. |
| 250-300ms | tabs, user message reveal, meters | Use sparingly; not for repetitive list content. |
| 400-500ms | stock transitions.dev panel/text/tool recipes | Too slow for most OpenChamber controls. Reserve only for one-time content, and shorten where adapted. |
| Continuous | spinner, pulse, waveform, marquee | Must have a live state and stop immediately when the state ends. |

### Conflicts and gaps

1. Reduced-motion handling is not consistent across shared overlays, custom previews, mobile sheets, and Reasoning expansion.
2. `MobileOverlayPanel` has enter motion but unmounts immediately on close. Adding exit presence cannot delay the synchronous mobile close signal used for keyboard restoration.
3. Context lazy views use `fallback={null}`, so first load can look like an empty panel.
4. Preview presence exists in both shared Dialog and custom portals.
5. App Dialog confirmation and browser-native `window.confirm` coexist.
6. Sonner, CSS transitions, Web Animations, and `motion/react` do not share tokens.
7. `Text variant="generate-effect"` creates per-character `motion.span` elements in tool/task text. This conflicts with the no-reveal rule for frequently updating developer output.
8. Some panel transitions animate width, margin, or height. They are intentional existing exceptions, but they do not satisfy the current theme contract's default of transform/opacity-only motion.
9. `SessionSwitcherDropdown` still uses a busy pulse while primary Sidebar rows use a static dot and 1fps duration.
10. Sidebar documentation contains stale details about nav placement and unread bolding. This inventory follows source behavior.

## 6. transitions.dev candidate mapping

The public catalog was inspected on 2026-08-25. `texts-reveal` uses 500ms, 12px rise, 40ms line stagger, 3px blur, and a 200ms non-staggered exit. `panel-reveal` uses 400ms open, 350ms close, Y translation, opacity, and 2px blur. `modal-open-close` uses 250ms open, 150ms close, scale .96, and opacity. These recipes are references, not drop-in requirements.

| Transition | Suitable UI | Unsuitable UI | Recommended position | Cost/risk |
|---|---|---|---|---|
| `texts-reveal` | Welcome headline; optional authoritative empty-state headline; at most a two-line first reveal | Streaming/final messages, Thinking, tool text, Sidebar items, usage labels/values, dialog titles on every open | N01 first; S08 only if the empty state is visually prominent | Original blur/filter and 500ms duration are medium cost and too slow. Adapt to opacity + 8px transform, 240-320ms, at most 40ms stagger. |
| `text-states-swap` | Header destination title, fixed-slot model/agent label, completed compact status | Streaming text, timers, counters, editable input | G08, N14, N16 | Low if opacity-only; medium if blur is retained. Do not retain blur. |
| `modal-open-close` | Shared Dialog, previews, confirmations | Docked Context Panel, mobile sheet, native picker | O05, O10, C20 | Low with transform/opacity. Current 150ms implementation is already valid; 250ms open is optional. |
| `panel-reveal` | Small transient panel with clipped bounds | Sidebar, Context Panel, Work Status, large file/diff panels | No direct stock use; design reference only | Medium/high. 350-400ms and blur are too heavy; Y travel is wrong for horizontal docked panels. |
| `menu-dropdown` | Dropdown, Select, Context Menu, compact Popover | Search result rows, large file lists, mobile bottom sheets | O01, O02, O04; N03-N17 popup shells | Low if using current shared 150ms opacity/scale. |
| `tooltip-open-close` | Shared Tooltip | Persistent labels, mobile navigation surfaces | O03 | Low. Keep instant exit for grouped tooltip handoff. |
| `icon-swap` | Send/Stop, mic states, collapsed chevrons, fixed-slot status glyphs | Window controls that change hit target, constantly changing list badges | G04, N18, N22, S13 | Original blur plus scale .25 is too dramatic. Use opacity and subtle scale .92-1 only. |
| `spinner-to-check-morph` / `success-check` | A compact user-triggered operation with authoritative completion | Long agent turns, tool output, quota refresh, every completed tool row | N20 or C12 only after a concrete interaction is chosen | Low/medium; SVG path/rotation should be short and bounded. |
| `skeleton-loader-and-reveal` | Initial chat hydration, first lazy context chunk | Streaming content, repeated polling, populated stale-data refresh | C01, P05, possibly C16 fallback handoff | Original filter is medium cost. Use one bounded opacity pulse and crossfade; never reset populated data to skeleton. |
| `tabs-sliding` | Context instance tabs, stable settings/project-context tabs | High-frequency filters, wrapping tabs, lists | P03 and indicator-only P06 | Medium because measured width changes are involved. Keep absolute indicator and reduced-motion snap. |
| `accordion` | Small, bounded, user-controlled disclosure | Project/session trees, large tool output, streaming Reasoning auto-growth | Small settings disclosure only; not a primary candidate here | Medium/high when animating grid rows or height. Indicator-only adaptation is safer. |
| `toast-open-close` | Sonner toast shell if supported without custom internals | Inline errors, permission cards, persistent status rows | O09 | Medium integration risk. Avoid blur and do not change timeout semantics. |
| `notification-badge` | Rare bounded unread-count creation | Live token/task/subagent counters, Sidebar activity across many rows | No Phase 1 target | Spring/pop motion across many rows would be noisy; optional only for a single newly nonzero badge. |
| `error-state-shake` | Directly rejected user input in a small local control | Tool/server errors, dialogs, whole Composer, Sidebar rows | No initial target | Medium motion sensitivity and accessibility risk. Never shake asynchronously arriving errors. |
| `card-resize` | Small fixed-content card after measured proof | Composer, Knowledge cards, tool output, long notes, Work Status sections | No current recommendation | High. Geometry animation can trigger layout and scroll movement. |
| `page-side-by-side` | A deliberate mobile forward/back navigation contract | Desktop main surfaces, chat/session switch, settings search results | Future mobile-only study | Medium/high. Requires navigation direction, interruption, focus, and keyboard semantics first. |
| `shimmer-text` / `thinking-states` | One compact truthful pending label | Assistant text, Reasoning stream, tool descriptions, long turns | Existing short active status only | Continuous paint/attention cost. Do not add another shimmer family. |
| `reasoning-stream` / `streaming-text` | transitions.dev demo contexts | OpenChamber Reasoning, Assistant Markdown, Bash/tool output | Nowhere in OpenChamber transcript | High. The names match the domain but the update model does not: word/line effects compound on long streams. |
| `number-pop-in` / `spinning-counter` | Rare one-shot milestone value | Usage, quota, token counts, Bash timer, session duration | No current recommendation | High repetition risk. Values update too often or need immediate comparison. |
| Particle, 3D, dissolve, tilt, matrix, organic and gradient effects | Marketing or expressive standalone interactions | Core OpenChamber workspace | None | High visual and GPU cost; inconsistent with a long-running development tool. |

## 7. `texts-reveal` suitability matrix

| Text | First appearance | True remount | Content switch | Never use | Decision |
|---|---|---|---|---|---|
| `What are we working on?` | Yes | Only for a newly opened draft, not a responsive remount | Use opacity-only text swap if project-specific wording changes | No repeated stagger on project selection | Best candidate. Adapt recipe to no blur and shorter duration. |
| Project selector label | No | Popup shell may reveal, label should not | Fixed-slot crossfade optional | `texts-reveal` | It is control state, not editorial content. |
| Quick Actions | Reveal the group once | No per-chip replay | Direct update when registry data arrives | Per-chip text stagger | One group opacity/translate only. |
| Session empty-state text | Yes, if authoritative and visually central | Yes, only when state genuinely changes from non-empty to empty | Direct/crossfade | Loading/error masquerading as empty | Optional. |
| Panel heading | Usually no | Only a first-open onboarding panel could qualify | Opacity-only title swap | Every tab/panel open | Stable headings are navigation anchors. |
| Dialog title | No by default | Dialog shell already animates | Direct | Replaying line stagger on every open | Double motion adds no information. |
| Assistant message | No | No | Direct stream/final reconciliation | Always | Reading and virtualization stability take priority. |
| Thinking/Reasoning | No | No | Direct | Always | High-frequency and often auto-expanded. |
| Tool description/path | No | At most whole-row one-shot reveal | Direct | Per-character or repeated reveal | Existing generated-character effect is already too much. |
| Sidebar item | No | No | Direct/color state | Always | Filtering, batching, virtualization, and lifecycle reorder create frequent mounts. |
| Usage/quota label | No | No | Label stays static; values update direct | Always | Labels are comparison anchors; values are periodic/live. |

## 8. Performance risk matrix

| Technique | Cost | OpenChamber boundary |
|---|---|---|
| Short `transform` + `opacity` on one overlay | Low | Default for new bounded motion. |
| Whole-group first reveal with 2-4 children | Low | Allow once; no replay after async data fill. |
| Small icon crossfade/scale | Low | Fixed slot and fixed hit target only. |
| Width animation on Sidebar/Context/Work Status | Medium | Existing measured exception. Do not proliferate. Profile any change with `bun run profile:animation`. |
| Height/grid-row/card resize | Medium to high | Avoid on messages, tool output, Sidebar trees, notes, and live panels. |
| Blur/filter on a tiny short-lived overlay | Medium | Not the default. Repository theme guidance requires measurement for non-transform/opacity animation. |
| Blur/filter over panel or transcript | High | Forbidden. |
| Per-character spans and stagger | High | Forbidden in tool/task/streaming text; existing `generate-effect` is a conflict. |
| Per-row stagger in Session/Sidebar lists | High | Forbidden because batching, filtering, status reorder, and virtualization replay it. |
| Infinite spinner/pulse/shimmer | Medium to high over time | Only while a real operation is pending; stop immediately and provide reduced-motion behavior. |
| WebGL/shader/displacement/large backdrop animation | High | Forbidden for routine UI. MetalFx or future visual experiments require isolated profiling and explicit scope. |
| Smooth scrolling during Bash/streaming growth | High | Forbidden; preserve direct scroll-follow and user opt-out. |

### Runtime constraints

- **Long sessions:** history virtualization and hydration can remount nodes. Reveal eligibility must use semantic one-shot state, not DOM mount.
- **Markdown streaming:** new text may arrive around 10 times per second after coalescing. No animation may scale with token, word, line, or Markdown node count.
- **Tool and Bash output:** append/replace snapshots and follow-scroll are already active work. No reveal, smooth scroll, or geometry transition.
- **Syntax highlighting and diff:** these paths already perform parsing and rendering. Motion must not wrap every line or delay fallback replacement.
- **Context Panel:** some surfaces stay alive while hidden. Hidden surfaces must not run decorative animations.
- **Multiple agents:** task/subagent rows can change status and ordering independently. Animate neither sorting nor every status update.
- **Electron/Chromium:** hidden windows run with `backgroundThrottling: false`; lifecycle gates, not browser throttling, must stop ongoing animations.
- **High-refresh displays:** continuous animation consumes more frames without adding information. Duration is not a substitute for bounded lifecycle.
- **MacBook Air/mobile:** avoid broad filter/backdrop/shader use and multiple simultaneous composited effects.
- **Reduced motion:** every future system-level primitive needs an immediate final state under `prefers-reduced-motion: reduce`.

## 9. Recommended motion categories

1. **Reveal once:** prominent first-view text or a single grouped empty state. Opacity + small Y transform.
2. **Overlay presence:** dialog, menu, popover, tooltip, preview. Opacity + subtle scale/placement offset with asymmetric faster exit.
3. **Panel geometry:** existing Sidebar, Context Panel, and Work Status choreography only. Keep one owner for geometry and content presence.
4. **State swap:** icon/label crossfade in a fixed slot. Never move hit targets or defer authoritative state.
5. **Selection indicator:** transform an absolutely positioned pill/underline; measured size changes are an exception requiring reduced-motion snapping.
6. **Live operation:** spinner, dots, waveform, or progress only while work is actually active.
7. **No motion:** streaming, historical reading, large lists, virtualized content, output, diff, and dynamic counters.

## 10. Elements that must not animate

- Assistant streaming text and final historical Markdown
- Thinking/Reasoning streaming text
- Running Bash and tool output, including each new line
- Final code, syntax highlighting, diff lines, diagnostics, and JSON trees
- Composer input, caret, selection, IME composition, and per-key height changes
- Goal objective count, Bash timer, session duration, token, context, usage, and quota number updates
- Search result rows on each query
- Session rows when batched, reordered by lifecycle, or virtualized
- Project, group, folder, and large Work Status section body heights
- Task/subagent summaries and status sorting
- Lazy image/gallery arrival across historical messages
- Sticky Sidebar identity overlay, which must stay synchronized with its mask in the same frame
- Native window chrome and native file/confirmation UI

## 11. Proposed motion token system

This is a design layer, not an implementation proposal for this phase.

### Duration

| Token | Proposed range | Use |
|---|---:|---|
| `motion-duration-instant` | 0ms | Reduced motion, initialization placement, synchronized sticky overlays. |
| `motion-duration-fast` | 100-120ms | Hover-adjacent exits, draft-only fade, very small state swaps. |
| `motion-duration-normal` | 150-180ms | Dropdown, tooltip, dialog, preview, icon/label swap. |
| `motion-duration-panel` | 200ms | Sidebar, Context Panel, Work Status, mobile sheet. |
| `motion-duration-reveal` | 240-320ms | One-time welcome/empty-state reveal only. |
| `motion-duration-indicator` | 280ms | Selection indicator travel (tab pill/underline). |

Avoid a general `slow` token. A 400-500ms transition should require a named, measured exception rather than becoming an easy default.

### Easing

| Token | Value family | Use |
|---|---|---|
| `motion-ease-standard` | `ease-out` | Small overlays and opacity transitions. |
| `motion-ease-emphasized` | `cubic-bezier(0.22, 1, 0.36, 1)` | Existing panel and FLIP movement. |
| `motion-ease-mobile-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | Existing mobile sheet/metadata family. |
| `motion-ease-linear` | `linear` | Spinner rotation only. |

### Distance, scale, and opacity

| Token | Proposed value | Use |
|---|---:|---|
| `motion-distance-xs` | 2px | Tooltip/menu placement cue. |
| `motion-distance-sm` | 8px | Welcome/empty-state reveal. |
| `motion-distance-md` | 12px | Maximum ordinary transient travel; not list rows. |
| `motion-scale-subtle` | .97-.98 | Dialog/popover entrance. |
| `motion-scale-icon` | .92 | Fixed-slot icon swap; do not use transitions.dev's .25 scale. |
| `motion-opacity-hidden` | 0 | Presence start/end. |
| `motion-opacity-muted` | .6 | Dragging or temporarily de-emphasized content, not disabled controls. |

### Blur and geometry policy

- Do not define a general-purpose blur token in the default motion set. Blur is an exception that requires profiling.
- Do not define generic animated width/height tokens. Existing panel geometry motion remains component-owned.
- Do not expose arbitrary durations/easings at component call sites. Shared primitives choose from semantic states: overlay, panel, reveal, state swap, live operation.
- Reduced motion resolves every duration to `0ms` except live progress that still needs a static alternative.

## 12. Suggested implementation phases

### Phase 0: remove ambiguity before adding motion

- Establish semantic tokens and reduced-motion behavior.
- Document one-shot reveal eligibility so virtualization/remount cannot replay it.
- Decide whether existing per-character `generate-effect` remains; current evidence recommends removing it from tool/task text.
- Measure any proposed non-transform/opacity exception with `bun run profile:animation` before accepting it.

### Phase 1: one-time, low-cost reveal

- Welcome headline N01 with an adapted `texts-reveal`: opacity + 8px Y, 240-320ms, at most one 40ms line offset, no blur.
- Quick Actions N23 as one group, not a chip stagger.
- Optional authoritative empty-state reveal for Chats/search, after state authority is explicit.

This phase has the highest clarity gain and the smallest runtime footprint.

### Phase 2: consolidate overlay presence

- Align Dialog, Dropdown, Select, Popover, Tooltip, Context Menu, and preview around the existing 150-180ms transform/opacity family.
- Add complete reduced-motion handling.
- Do not modify Sonner or native confirmations unless behavior work already touches them.
- Treat mobile wrappers separately; do not delay the existing synchronous close signal to gain an exit animation.

### Phase 3: fixed-slot state transitions

- Send/Stop, mic, model/agent label, compact tool status, and chevrons.
- Use opacity and subtle scale only.
- Preserve immediate authority and a fixed hit target.

### Phase 4: panel and tab consistency

- Tokenize the existing 200ms Sidebar/Context/Work Status family without changing geometry ownership.
- Align tab indicators where the tab layout is stable.
- Profile width/height exceptions and verify Work Status visibility does not oscillate.

### Phase 5: optional platform-specific work

- Mobile sheet exit presence, mobile settings navigation, and lazy Context placeholders.
- Proceed only with device/browser validation for keyboard, focus, gestures, interruption, and keep-alive behavior.

### Not planned

- Streaming/reasoning text recipes
- Number reels for usage/timers
- Per-row or per-character stagger
- 3D, particles, dissolve, shader, WebGL, displacement, or broad blur effects
- Large-tree accordion/layout animation

## 13. Decisions and open questions

Implemented decisions:

- Welcome and Quick Actions reveal once per explicit draft opening. Automatic drafts, responsive remounts, target changes, and registry refreshes do not replay it.
- Tool/task text no longer uses the per-character `generate-effect` variant.
- Semantic duration, easing, distance, and scale tokens now own reduced-motion behavior for new reveal motion.
- Dialog, Settings modal, Dropdown, Select, Popover, Tooltip, Context Menu, Command Palette shell, and tool preview shells use one 120-160ms opacity/transform presence family. Filtered rows and overlay internals remain static.
- Phase 3 fixed-slot state transitions: Send/Stop share one persistent button whose stacked glyphs crossfade via `oc-motion-state-icon`; model/agent labels crossfade through `StateSwap`; variant trigger colors transition; disclosure chevrons (folder, Work Status sections, reasoning, tool rows) rotate a single icon via `oc-motion-indicator`. Mic has no per-button glyph swap (the overlay owns active states), and compact tool status keeps its existing shine/color treatment because no separate status glyph exists in the header.
- Phase 4 tokenized the existing panel family without changing geometry owners: Sidebar, Header spacers, both Context Panel columns, and Work Status now reference `--motion-duration-panel` / `--motion-ease-emphasized`; resize-time `transition-property: none` behavior is untouched. Tab indicators (pill/underline/layout variants) reference the dedicated `--motion-duration-indicator` token (280ms, state-transition family), consolidating the former 280ms travel + 260ms size split onto it. Project Context tabs were skipped: the section nav is a vertical color-state list with no measurable indicator element, and adding one would restructure the nav and animate on search auto-redirect.
- Phase 5 (optional platform work): mobile sheet exit was skipped — `MobileOverlayPanel`'s layout-effect close event is the synchronous window iOS keyboard restoration depends on, and any exit presence would delay it or require a shadow-state layer. Mobile settings navigation was skipped — `SettingsView.mobileStage` is a single state machine with no directional route owner. Lazy Context surfaces received a stable first-load placeholder (`ContextSurfaceFallback`): Suspense bounds show it only while a chunk first loads; keep-alive reopens, data refreshes, and late resolves keep existing semantics for free. It is decorative (`aria-hidden`), geometry-preserving, opacity-pulse only, and static under reduced motion. Drawers stay gesture-owned springs; `MobileSessionMetadata` keeps its existing 170/140ms presence unchanged.

Open questions:

1. Should lazy Context surfaces show a stable placeholder, or is blank-until-ready intentional? This needs a product decision before applying skeleton motion.
2. Are browser-native confirmations expected to remain for their blocking semantics? They should not be migrated solely to make motion uniform.
3. Does mobile require visible close motion for sheets, or is synchronous keyboard recovery more important? Current code chooses keyboard recovery.
4. Should Session Switcher activity be aligned with the primary Sidebar's static dot + 1fps duration before introducing any new status animation?
5. Is transitions.dev Pro available and licensed for later implementation phases? This inventory only evaluates the public catalog and does not install or copy a package.

## 14. Validation notes

- Static source and repository documentation were cross-checked.
- Phase 0 and Phase 1 were implemented with opacity/transform-only reveal motion. Focused profiling measured `0` style recalculations/sec and `0` layouts/sec for both properties.
- Phase 2 uses only the same profiled opacity/transform property family. Reduced motion resolves all shared overlay transition durations to `0ms`.
- Phase 3 adds only opacity/transform crossfades, one color transition on the variant trigger, and chevron `transform: rotate` transitions; reduced-motion resolves each to `0ms`. Static-markup tests pin Send/Stop authority timing and StateSwap's single-current-layer invariant. The isolated HMR runtime was re-checked through OpenChamber's built-in browser capability.
- Phase 4 introduced no new property families: panels keep their measured width/margin exception, indicators stay transform/left-based, and every touched surface already carried `motion-reduce:transition-none` or an explicit reduced-motion block, which now resolves the token durations to `0ms`. Sandbox checks covered rapid sidebar toggles (settles exactly at authoritative width), rapid Context surface switches, Work Status mutual exclusion with the Context Panel at desktop and narrow widths, and the served CSS containing the token-driven rules.
- Phase 5 adds one opacity-only pulse (placeholder blocks, self-terminating on chunk load; static under reduced motion) and no other new motion. Mobile sheet exit, settings navigation, drawer springs, and native pickers were left untouched on platform-safety grounds. iOS/Android device behaviors were not validated this round; nothing implemented depends on them.
- The isolated HMR runtime was checked through OpenChamber's built-in browser capability at desktop and narrow viewports. Dialog presence rendered without new page errors; existing Base UI button-semantics and nested-button diagnostics remain outside this motion change.
- The live public transitions.dev catalog and the CSS for `texts-reveal`, `panel-reveal`, `modal-open-close`, `icon-swap`, `tabs-sliding`, and `skeleton-loader-and-reveal` were inspected on 2026-08-25.
- No external-browser profile was run for Phase 2. Any future non-transform/opacity implementation still requires an approved production-build before/after measurement.
