# Agent Activity 状态系统盘点与 Thinking Orbs 接入设计

> 持续设计与落地记录。Phase 0 至 Phase 3 已完成；Phase 4 仅做候选审查，未修改运行时代码、依赖、store 或 UI。
> 分支：`feat/agent-activity-visuals`。姊妹文档（同目录规划中）：`ui-motion-inventory.md`（transitions.dev 盘点，见 `.agents/plans/glowing-meadow-lynx-agent-a430d8a1dcc7334b2.md`）。

---

## 1. Scope

本文回答一个问题：在接入 Jakub Antalik 的 Thinking Orbs 之前，OpenChamber-LingXi 当前的 Agent / Session / Tool / Reasoning 活动状态到底有哪些、真实来源在哪、如何映射到 Orb 的视觉状态。

覆盖范围：

- `packages/ui/src/sync` 的 session 状态层（事件、快照、全局索引）
- `packages/ui/src/hooks/useAssistantStatus.ts` / `useSessionActivity.ts` 的派生层
- chat 转写区、composer、侧栏、WorkStatusPanel、dictation 等 UI 呈现点
- Thinking Orbs 官网（orbs.jakubantalik.com）、GitHub 仓库 README 与站点 bundle 实测

不覆盖：后端 OpenCode server 内部实现（以 SDK 类型与 SSE 事件为准）、VS Code 特有传输细节和 Electron IPC 实现。

---

## 2. Existing Agent/Session/Tool State Architecture

### 2.1 权威数据通道（Authoritative）

| 信号 | 类型定义 | 送达方式 | 存储位置 |
|---|---|---|---|
| Session 回合状态 | SDK `SessionStatus = {type:"idle"} \| {type:"retry", attempt, message, next} \| {type:"busy"}`（SDK `types.gen.d.ts:396`） | `session.status` / `session.idle` / `session.error` SSE 事件 + `/session/status` 目录快照轮询（5s watchdog） | 目录子 store `state.session_status`；跨目录增量索引 `useGlobalSessionStatusStore` |
| Tool 执行状态 | `ToolPart.state.status = pending \| running \| completed \| error`（SDK `types.gen.d.ts:211-262`） | `message.part.updated/delta/removed` | 目录子 store `state.part[messageID]` |
| Reasoning 进行中 | `ReasoningPart.time.end === undefined`（SDK `types.gen.d.ts:158`） | 同上 | 同上 |
| Text 流式中 | `TextPart.time.end === undefined` | 同上 | 同上 |
| 回合未收尾 | 尾部 assistant 消息 `time.completed === undefined` | `message.updated` | `state.message` |
| Permission 阻塞 | `state.permission[sessionID]: PermissionRequest[]` | `permission.asked/replied` | 目录子 store |
| Question 阻塞 | `state.question[sessionID]` | `question.asked/replied/rejected` | 目录子 store |
| MCP 连接 | `McpStatus = connected \| disabled \| failed \| needs_auth \| needs_client_registration` | bootstrap + 事件 | `state.mcp` |
| Todo | `Todo.status = pending \| in_progress \| completed \| cancelled` | `todo.updated` | `state.todo` |

关键不变量（来自 `sync/global-session-status.ts:15-23`）：**全局索引只存非 idle 条目，absence 即 idle**。快照省略 idle 会话，因此"缺失"在该索引里有明确语义。`sync/DOCUMENTATION.md:147` 明确记录：OpenCode 在 agent loop 每一步都重发 `busy`，所以 busy 事件是"仍在跑"，不是"刚开始"；只有 `session.idle` / `session.error` 是一次性回合终点。

### 2.2 客户端自有状态（client-owned authoritative）

| 信号 | 定义处 | 取值 |
|---|---|---|
| 传输连接 | `stores/useConfigStore.ts:1016` `connectionPhase` | `connecting \| connected \| reconnecting` |
| 听写 | `hooks/useDictation.ts:20` `DictationStatus` | `idle → recording → uploading → idle \| failed` |
| 消息队列 | `stores/messageQueueStore.ts:43` `QueuedMessage[]`（按 runtime+directory+session 键） | 有队列 ≠ 活动，但 busy→idle 边沿触发自动补发（`useQueuedMessageAutoSend.ts:170-172`） |

### 2.3 派生层（Derived）

1. **`useSessionActivity`**（`hooks/useSessionActivity.ts:30-69`）
   - phase：`idle | busy | retry`，镜像 SessionStatus。
   - permission/question 非空 → 强制 idle（阻塞指示优先，发送键保持可用）。
   - status 缺失时，用"尾部 assistant 消息未 completed"做窄口径回退（transient fallback，非权威）。
2. **`useAssistantStatus`**（`hooks/useAssistantStatus.ts`）— 当前最完整的 activity 派生器：
   - 自有枚举 `AssistantActivity = 'idle' | 'streaming' | 'tooling' | 'cooldown' | 'permission'`（第 10 行）。注意 `cooldown` 恒为 false（第 380 行硬编码），是死分支。
   - `createParsedStatus`（141-200 行）对最后一条 assistant 消息的 parts **倒序扫描**，取第一个活跃 part：reasoning 无 end → `'reasoning'`；tool `running/pending` → `'tool'` 或（命中编辑工具集时）`'editing'`；text 无 end 且非空 → `'text'`。即**最新活跃 part 赢**。
   - 顶层覆盖（424-457 行）：question 待答 → 整体视为不在工作；permission 待批 → statusText 固定 "waiting for permission"，仍算 working。
3. **全局聚合**：`live-aggregate.ts:33-44` 冲突消解优先级 retry(4) > busy(3) > idle(1)；`session-ordering.ts` 以 active/settled 相位驱动列表排序；`session-activity-timing.ts` 维护回合起止时长（持久化 start 只是查找表，不是活动声明）。

### 2.4 启发层（Heuristic）

| 位置 | 内容 | 风险 |
|---|---|---|
| `useAssistantStatus.ts:80-100` | `TOOL_STATUS_PHRASES`：按 tool name 字符串映射文案（grep→searching content、bash→running command…），未知工具回退 `using ${toolName}` | 工具改名/新增 MCP 工具即失配，只影响文案不影响判定 |
| `useAssistantStatus.ts:79` | `EDITING_TOOLS = {edit, write, multiedit, apply_patch}` 按名字分类 | 同上 |
| `useAssistantStatus.ts:101-116` | `WORKING_PHRASES`：无具体信号时的风味短语，按 session/message hash 稳定选取 | 纯装饰，无业务含义 |
| `hooks/usePlanDetection.ts:42` | 扫描 assistant 文本含 `"The plan at "` 判定 plan 可用 | 对措辞脆弱，与 orb 无关但同类风险样本 |

### 2.5 纯视觉层（Visual-only）

- `BusyDots`（`parts/BusyDots.tsx`）：三个点的 CSS opacity 动画 `oc-busy-pulse`（`index.css:1621`），reduced-motion 下关闭（`index.css:1745`）。使用点：WorkingPlaceholder、ReasoningPart 头部、MobileApp 连接 splash、AutoReviewBanner。
- 侧栏活动圆点（静态色块，非动画）：`SessionNodeItem.tsx:688-708`，busy/retry → `bg-primary`，unread → `--status-info`。
- `border-glow-pulse`、`navrail-dot-wave`、Fireworks（回合完成庆祝，`useFireworks.ts`）、`MinDurationShineText`（工具卡 shimmer）。

---

## 3. Source-of-Truth Inventory

Authority 判定标准：Authoritative = 后端/协议字段直接给出；Derived = 由多个权威字段推导；Heuristic = 字符串/文本猜测；Visual-only = 无业务语义。

| State / Event | Source | Source file | Owner | Authority | Trigger | Exit | Frequency | Duration | Scope | Existing UI | Can overlap | Priority（现行为） | Orb candidate | Confidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SessionStatus.busy` | SSE `session.status` + 快照 | sync-context reducer; global-session-status.ts | server（UI 只镜像） | **A** | agent loop 每步重发 | `session.idle/error` 或快照收敛 | 高（每步一次） | 回合级：秒~分钟 | session | StatusRow working 态、侧栏点、排序相位 | 与 tool/reasoning/text 并存 | 作为基底，被 part 细化 | working | High | busy ≠ 新回合开始 |
| `SessionStatus.retry{attempt,next}` | 同上 | 同上 | server | **A** | provider 请求失败退避 | 重试成功或最终 error | 突发 | 秒~分钟（有 next 倒计时） | session | WorkingPlaceholder retry 倒计时分支 | 覆盖一切 part 信号（phase=retry 时 isStreaming=false） | 高于 part 细化 | connecting（弱）/ 不映射 | Medium | retry 本质是 provider 连接问题 |
| tool `pending/running` | ToolPart.state | state.part | server | **A** | part 事件 | completed/error 事件；idle 后尾刷兜底 | 每 tool 一次 | 读类 <1s~数 s；bash 可达分钟 | message/tool | ToolPart 卡片各自显示；StatusRow 只取最新一个 | 多工具并发（见 §6） | 倒序扫描=最新赢 | searching/shaping/working（按工具族） | High | 见 §7 工具族划分 |
| reasoning 进行中 | ReasoningPart.time.end 缺失 | state.part | server 字段+前端判读 | **A/D**（字段权威，"进行中"由 end 缺失推出） | part 创建 | delta 收尾写入 end | 每回合多次 | 秒~分钟 | message/part | ReasoningPart 头部 BusyDots | 可与 tool 并存（少见） | 倒序最新赢 | breathing | High | 库内默认 aria-label 就是 "Thinking…" |
| text 流式 | TextPart.time.end 缺失 | state.part | server 字段+前端判读 | A/D | 首 delta | 完成/abort | 连续高频（~60/s） | 输出期间 | message/part | AssistantTextPart 渐进渲染 | 与上游 busy 并存 | 最新赢 | composing | Medium-High | streaming 是传输现象，composing 才是语义 |
| 尾消息未完成 | Message.time.completed 缺失 | state.message | server 字段+前端判读 | D | status 缺失时的兜底 | status/idle 到位 | 低（仅 race 窗口） | 亚秒~秒 | session | 无（仅参与 isWorking 计算） | — | 低于权威 status | （不单独映射） | — | useSessionActivity 显式标注 transient |
| permission 待批 | state.permission[sid] 非空 | permissionStore/目录 store | server 请求 + 用户应答 | **A** | permission.asked | permission.replied | 阻塞型 | 不定（等用户） | session | PermissionCard（转写区顶部）+ WorkingPlaceholder "waiting for permission" | 覆盖 part 信号 | 最高交互优先级之一 | 无合适 orb（见 §11） | — | question 优先于 permission（useAssistantStatus 先判 question） |
| question 待答 | state.question[sid] 非空 | 目录 store | server | **A** | question.asked | replied/rejected | 阻塞型 | 不定 | session | QuestionCard；working 态整体置 false | 覆盖一切 | 最高 | 无 orb | — | 子会话的 blocker 只有 WorkStatusPanel 可见 |
| connectionPhase≠connected | useConfigStore | useConfigStore.ts:1016 | client transport | **A**（本地连接事实） | init/断线 | 握手成功 | 低频 | 亚秒~长（断线期） | app 全局 | Mobile splash、picker Loading 态 | 理论上可与 busy 并存（断线时 busy 冻结） | 建议阈值后才覆盖（§8） | connecting | High | |
| dictation recording/uploading | useDictation | useDictation.ts:20 | client | **A** | 用户按麦 | confirm/cancel/fail | 用户触发 | 秒~分钟 | composer | DictationWaveform + 麦克风按钮 | 与 session 活动正交（可同时） | composer 上下文内最高 | listening | High | uploading 阶段语义弱 |
| queue 非空 | messageQueueStore | messageQueueStore.ts | client | **A**（本地队列事实） | 用户入队发送 | 自动补发于 busy→idle 边沿 | 中 | 至回合结束 | session | Composer 队列条目 UI | 与 busy 并存 | 非 activity，不进 orb | 无 | — | 徽标语义，不是运行态 |
| MCP failed/needs_auth | state.mcp | types.gen.d.ts:1429 | server | **A** | 连接失败 | 重连/修复 | 低 | 持续直至修复 | directory/server | McpDropdown / WorkStatusPanel MCP 行 | 与会话活动正交 | 静态徽标 | 无 | — | 不是"正在发生"的活动 |
| 子会话(subagent) busy | 子 session 自己的 SessionStatus | global index + parentID 过滤 | server | **A** | task 工具创建子会话并运行 | 子会话 idle | 与主回合并行 | 分钟级 | child session | WorkStatusSubagentsSection（busy 计数、blocked/asked 标注）；转写 Task 卡片 | 与父会话所有状态并存 | 独立展示，不并入父 orb（§6） | weaving（父视角，Medium） | Medium-High | 子会话是独立 lifecycle |
| todo in_progress | state.todo | sync/types.ts | server（模型写） | **A** | todowrite | todowrite | 低 | 任务级 | session | StatusRow 右侧任务摘要 | 与活动并存 | 不参与 | 无 | — | 是计划内容不是活动 |
| 通用 working（无任何 part 信号） | busy 且 parts 无活跃项 | useAssistantStatus | derived | **D** | 回合早期/工具间隙 | 任一具体信号出现或回合结束 | 高 | 短~中 | session | WORKING_PHRASES 风味文案 | 兜底 | 最低 | working | High | |
| plan 模式可用 | 文本嗅探 | usePlanDetection.ts | client 推断 | **H** | plan_enter 合成消息 | 手动清除 | 低 | 持久标志 | session | Header Plan tab | — | — | shaping（弱，不建议） | Low | 仅作风险示例保留 |

统计：Authoritative 12 项；Derived 4 项（activity 枚举、parsedStatus、全局聚合、尾消息兜底）；Heuristic 2 项（文案表、plan 嗅探）；其余为 Visual-only。

---

## 4. State Ownership

| 状态域 | Owner | 说明 |
|---|---|---|
| 回合 busy/retry/idle | server 发布；UI 侧唯一写入口为目录事件 reducer + 快照 reconcile，跨目录视图经 `global-session-status.ts` 索引 | UI 不得从历史数据推断活动（sync skill 规则） |
| part/tool/reasoning/text | 目录子 store `state.part`，由 `message.part.*` 事件驱动 | 活动判读（end 缺失）发生在 `useAssistantStatus.createParsedStatus`，属读侧派生 |
| permission/question | 目录子 store + VS Code 场景的 auto-accept 运行时 | 阻塞回复路由必须走 session 所属目录 |
| 连接 | `useConfigStore` initializeApp/transport 回调 | |
| 听写 | `useDictation` 状态机（composer 局部） | 未入全局 store；如需 orb 全局可见需提升或经 context |
| 队列 | `messageQueueStore` | |
| 活动文案 | `useAssistantStatus`（TOOL_STATUS_PHRASES/WORKING_PHRASES） | Heuristic 层，未来 semantic layer 应取代其对判定的输入地位 |

结论：**当前真正的 Agent activity source of truth 是「目录子 store 的 `session_status`（server SessionStatus）+ `state.part`（ToolPart.state / time.end）」两条权威流**；`useSessionActivity` → `useAssistantStatus` 是它们的唯一正规派生链。

---

## 5. Current UI Status Indicators

| 位置 | 文件 | 显示内容 | 数据源 |
|---|---|---|---|
| 转写区底部状态行 | `ChatContainer.tsx:388` → `StatusRowContainer.tsx` → `StatusRow.tsx:331` → `WorkingPlaceholder` | 模型名+状态文案+BusyDots；retry 倒计时；aborted | `useAssistantStatus().working` |
| 阻塞卡片 | `ChatContainer.tsx:376-380` | PermissionCard / QuestionCard（在状态行上方） | permission/question maps |
| Reasoning 头部 | `ReasoningPart.tsx:347-351` | "Thinking…" + BusyDots（仅 isStreaming 时） | 该 part time.end 缺失 |
| Composer 底行 | `ChatInput.tsx:2709` | `showAssistantStatus={false}`：只显 todos/pending changes | todosPersist 等 |
| 会话侧栏行 | `SessionNodeItem.tsx:448-456,688-708` | 静态圆点（primary=活动，info=未读）+ 活动时长 | `useGlobalSessionStatus` |
| 折叠分组 | `collapsedActivityIndicator.tsx` | 单个静态点 | active/unread 聚合 |
| WorkStatusPanel | work-status/* 各 section | 子代理行（working/blocked/asked/done 文案值）、MCP、usage 等静态行 | statuses + permission/question maps |
| 移动端 splash | `MobileApp.tsx:1195-1210` | "Connecting to …" + BusyDots | autoConnectPhase |
| AutoReview banner | `AutoReviewBanner.tsx:48` | review 运行中文案 + BusyDots | autoReview store |
| 听写 | `dictation/ComposerDictation.tsx` + `DictationWaveform.tsx` | 波形（录音电平实时） | subscribeLevel |

---

## 6. Concurrent State Analysis

OpenChamber 一回合内的真实并发形态：

```
Session busy (server)
 ├─ ToolPart#1 running (grep)      ─┐
 ├─ ToolPart#2 running (task→子会话) │ 倒序扫描只取数组中"最新的活跃 part"
 ├─ ReasoningPart streaming         │ → 其余不可见于状态行
 └─ TextPart streaming             ─┘
```

逐条回答：

1. **Orb 表示谁？** 表示"当前选中会话的这一回合"（per-session）。全局多会话活动不属于单个 orb 的职责。
2. **总体状态还是 foreground activity？** 两者分层：`SessionStatus.busy` 是总体事实；part 级信号是其内部的 foreground 细节。Orb 应消费"细化后的单一 primary activity"，而不是原始 busy。
3. **Tool 是否覆盖 Agent？** 不覆盖，是细化。tool running 蕴含 session busy；busy 而 tool 无活跃 → 上浮到 reasoning/composing/generic working。
4. **Subagent 是否独立显示？** 是，且现状已经如此：子会话拥有独立 SessionStatus，WorkStatusPanel 子代理区逐行显示。父 orb 不应吸收子会话状态；仅当父会话自身活跃 part 是 `task` 工具时，父 orb 可表达"编排中"。
5. **多 Tool 并发？** 现状：倒序扫描使"最新活跃 part"独占状态行，早先仍在跑的工具对状态行不可见（各自卡片仍显示）。这是既有的、经过性能权衡的选择（签名缓存避免每 delta 重扫）。Orb 沿用同一选择即可，不必发明并发聚合。
6. **tool 完成后多久恢复上层？** 立即：completed/error 事件到达后该 part 不再活跃，倒序扫描自然落到下一个活跃 part 或上层状态。另有 `session.idle` 后尾部的 settled-running-tool 兜底刷新（sync DOCUMENTATION.md:220）。
7. **streaming 属于 composing 还是 transport？** 代码里两者都有：`isWorking/isStreaming` 来自 phase（transport/回合级），`composing` 文案来自活跃 text part（语义级）。Orb 语义层应把"回合在跑"归 working，把"正在输出正文"归 composing——后者才是 composing 的诚实边界。
8. **reasoning 与 tool 同时活跃谁优先？** 现状没有显式优先级，由 part 数组顺序决定（最新者赢）。实践中模型通常先 reasoning 后 tool call，tool 开始时 reasoning 已闭合，冲突罕见。保持"最新赢"即可，不要为此引入新规则。

**禁止 last-event-wins 的全局推论**：part 层的最新赢是数组序（有界、可缓存），可以接受；但跨域（connection、dictation、permission）绝不能靠事件先后，必须用显式 precedence 表（§7）。

---

## 7. Proposed AgentActivity Semantic Layer

建议在 `useAssistantStatus` 现有产物之上收敛一个 OpenChamber 自有的纯函数层（不新建 store）：

```
session_status + parts + permission/question + connectionPhase + dictation
        ↓  resolveAgentActivity(...)   ← 纯函数、可单测
AgentActivity
        ↓  adapter（后续阶段实现）
ThinkingOrb state / 其他指示器
```

```ts
// 结构示意，最终集合以本节理由裁剪后为准
type AgentActivity =
  | 'idle'
  | 'connecting'      // transport 未就绪/重连（阈值后）
  | 'retrying'        // SessionStatus.retry（保留 attempt/next）
  | 'blocked'         // permission/question 待用户（orb 应让位而非表达）
  | 'listening'       // dictation recording
  | 'working'         // busy 且无更细信号（含 bash 等执行类工具）
  | 'searching'       // 信息获取类工具：read/grep/glob/list/webfetch/websearch/codesearch
  | 'reasoning'
  | 'composing'       // 活跃 text part
  | 'editing'         // edit/write/multiedit/apply_patch
  | 'orchestrating'   // 活跃 part 为 task 工具（子代理运行中）
```

设计依据：

- `working/searching/reasoning/composing/editing/listening/connecting` 都能从 §3 的 Authoritative/Derived 信号确定性推出；不依赖 tool name 之外的新字符串猜测——工具族划分是把现有 `TOOL_STATUS_PHRASES` 的启发映射**升级为显式分类表**，集中一处、可测试、未知工具安全回退 `working`。
- 不设独立 `executing/bash` 态：bash 的语义是"跑命令"，与 generic working 在 orb 层无法区分出更有价值的视觉差异，归 `working`（§8 Q4）。
- `orchestrating` 单列是因为它有独立的下游可见物（子会话列表），值得一个语义槽位；若 Phase 1 想再砍，可先并入 `working`。
- `blocked` 不是 orb 视觉态，而是"让位"指令（见 precedence）。

### Precedence（高→低）

1. **blocked**（permission > question，与 `useAssistantStatus` 现序一致）：orb 隐藏/冻结，让位给 PermissionCard/QuestionCard。理由：阻塞需要用户动作，任何"忙碌"动画都会误导等待预期。
2. **listening**：用户主动的麦克风活动，在 composer 语境下压倒 agent 状态。理由：它是用户自己引发的即时反馈回路。
3. **connecting**：仅在 `connectionPhase !== 'connected'` **持续超过阈值（建议 ≥2s）** 后出现，否则维持上一活动态。理由：短暂抖动闪"connecting"比说谎式"working"更糟；阈值防抖见 §8。
4. **retrying**：provider 退避期，保留现有倒计时文案为主，orb 可选弱映射。
5. **foreground tool family**：searching / editing / orchestrating（最新活跃 part 决定）。
6. **reasoning**。
7. **composing**。
8. **working**（generic busy 兜底）。

理由要点：

- Permission/Question 必须覆盖一切 agent 态——它们改变的是"接下来要不要人"，不是"机器在干什么"。
- Listening 覆盖全部 agent 态只在听写进行时成立，且听写与回合天然互斥（composer 占用），不会产生真实冲突。
- Connecting 只在真实连接缺口出现，且加阈值；绝不因单次网络抖动打断叙事。
- Search 族统一 searching：read/grep/glob/list/webfetch/websearch/codesearch 对用户的感知都是"在找/在读资料"。webfetch 偏"取"而非"搜"，但视觉上区分价值低，统一处理。
- Edit/write 归 editing 而非 composing：composing 保留给"模型在写正文"（text part），文件编辑是结构化产出，对应 orb 的 shaping 更贴切。
- Reasoning → breathing（库内该态默认标签就是 "Thinking…"，语义由官方锚定，非我方猜测）。
- Streaming 正文 → composing。

### Phase 1 落地记录

Phase 1 已实现并通过验证（纯函数层，无 UI 接线）：

- 实现：`packages/ui/src/lib/agent-activity.ts` —— `AgentActivity` 类型、`deriveAgentActivity`、`findLatestActiveAssistantPart`（最新活跃 part 规则）、`classifyAgentToolFamily`（searching/editing/orchestrating 集中分类表，unknown→working）。
- 测试：`packages/ui/src/lib/agent-activity.test.ts`，26 用例覆盖 idle↔working、reasoning/searching 回退、editing/orchestrating、listening/connecting/retrying/blocked 抢占链、并行 part 取最新、completed/error 失活、synthetic 消息、subagent 不污染 parent、未知工具与显示字符串不参与判定。
- 与 §7 的两处实现级收敛：question 与 permission 统一为单一 `blocked`（粗粒度语义层；文案区分仍由调用方持有原始数组）；part 域内部采用「最新活跃 part 赢」而非类别优先（§6 结论的代码化）。时间稳定策略（connecting ≥2s、min-display 等）按设计留在 presentation 层，未进纯函数。
- 全部 11 个状态均由可靠信号推出，无一被取消或降级为 heuristic；heuristic 仅存在于集中分类表的 fallback 语义（unknown 工具 → working），不在 UI 散落。

### Phase 2 落地记录（Thinking Orbs Adapter + 首个 UI 接入）

**依赖**：`thinking-orbs@0.3.1`（npm，MIT © Jakub Antalik，peer react>=18，本仓库 react 19.1.1 ✓），装入 `packages/ui` dependencies。构建产物独立 chunk：15.01 kB / gzip 6.20 kB。实际安装包类型确认 `OrbSize = 64 | 20` 为类型级锁定（审计中"任意尺寸运行时崩溃"的风险已被库类型消除）；`OrbState` 九态联合直接从包导出复用，adapter 未重复定义。

**Adapter**（`packages/ui/src/lib/agent-activity-orb.ts`，映射集中于 `resolveOrbState`）：

| AgentActivity | OrbState | 备注 |
|---|---|---|
| working | working | |
| searching | searching | |
| reasoning | breathing | 库默认标签 "Thinking…" |
| composing | composing | |
| listening | listening | |
| connecting | connecting | |
| editing | shaping | |
| orchestrating | weaving | |
| retrying | **working** | 政策决定：保留现有 retry 倒计时期间的动画 affordance（原 BusyDots 在 retry 分支也动画），generic working 诚实表达"回合仍在跑"；不用 connecting 以免与 transport 断连混淆。特异性置信度 Low、诚实性 High |
| idle / blocked | null（无 orb） | blocked 回落 BusyDots，保持既有 permission/question 等待视觉 |

`solving` 未使用（无对应语义阶段）。

**UI 链路**：`useConfigStore.connectionPhase` + 目录 store 的 status/parts/permission/question → 新 hook `hooks/useAgentActivity.ts`（唯一新增订阅层，纯组装 `AgentActivityInput`）→ `deriveAgentActivity` → `StatusRowContainer` 传入新可选 prop → `WorkingPlaceholder.resolveOrbState` → 新组件 `parts/ActivityIndicator.tsx`（orbState 非空渲染 20px `<ThinkingOrb theme 默认 auto aria-hidden>` 包裹 span，null 时回落 `<BusyDots/>`）。状态文字、1200ms 文案防抖队列、role="status"/aria-live、retry 倒计时全部未动；orb 纯为 aria-hidden 装饰层，文字仍是唯一语义载体。

**BusyDots 替换范围**：仅 WorkingPlaceholder 的两处活动指示点（正常分支+retry 分支）。AutoReviewBanner、MobileApp splash 及其他 BusyDots 使用点不变（有 source 断言测试锁定）。

**Presentation stabilization**：Phase 2 未加任何新稳定层（按指令先观察真实切换）。既有 WorkingPlaceholder 1200ms 文案防抖继续生效；orb 状态本身随 derive 直变，实测未见闪烁问题（工具窗口秒级以上）。

**Sandbox 恢复与隔离验证**：从 `feat/ui-motion-foundation` 提交 664d9d7c5 精确恢复 6 个纯 sandbox 文件（`.gitignore`、根 `package.json` 三脚本、`electron-dev.mjs`、`electron-dev.test.mjs`、`main.mjs`、electron README），零 motion 内容混入。命令名保持 `web:sandbox` / `electron:sandbox` / `electron:sandbox:clean`。runtime 全部位于 `<repo>/.dev-sandbox/`（HOME/XDG/TMPDIR/OpenChamber data/managed registry/Electron userData·sessionData·cache·logs），git 已忽略，clean 移入 `.dev-sandbox-backups/` 不删除。验证通过：sandbox userData/cache ≠ 生产路径；sandbox session（directory=.dev-sandbox/workspace）不出现在生产；settings 写入 sandbox home；端口 5173/3901/65141 由 sandbox 进程树独占持有且关闭后释放；生产 OpenChamber(PID 43934)/OpenCode(43977) 全程存活未被触碰；生产 `~/.config/openchamber` 文件数与 registry 前后一致（33 个文件、仅 43977.json）。

**Runtime 实测**（web:sandbox + 内置浏览器面板，真实模型回合驱动）：
- weaving/orchestrating ✅：2m54s 多工具任务含 Explore 子代理期间 `canvas[aria-label="Weaving…"]` 持续显示，回合结束 canvas 移除。
- working ✅：`sleep 30` bash 运行期显示 `Working…`。
- connecting ✅：回合运行中 SIGSTOP 沙盒 API 进程触发 SSE 心跳超时（30s 阈值）→ orb 切换 `Connecting…`，正确覆盖 working（precedence 生效）；SIGCONT 恢复后状态收敛、回合完成后卸载。
- 卸载/idle ✅：每个回合结束 canvas 均消失（多次验证），无 RAF 残留迹象。
- searching/composing/reasoning/blocked/listening/retrying：runtime 未直接观测到 aria-label（searching/composing 窗口短于探测往返；其余需麦克风/provider 退避等条件），映射由 31 个单测覆盖；working/weaving/connecting 三个端到端样本证明 derive→adapter→canvas 全链路正确。
- reduced-motion：runtime 无法模拟 media query（面板无 devtools 通道）；库源码级确认 `prefers-reduced-motion: reduce` → 单静态帧 t=0.6 无 RAF，符合要求。
- CPU：宿主进程采样 orb active 时 0.1–1.6%（含 SSE 流处理+markdown 渲染全部负载），settled 后 0.0%；GPU 无法独立测量（renderer 进程不可分离、powermetrics 需 root），但 20px 纯 2D arcs + DPR≤2 + IO/visibility 双暂停下无异常迹象，console 无 orb 相关错误。

**结论**：单个 20px orb 成本可忽略，性能预算（常驻 ≤2）远未触顶，建议进入 Phase 3（ReasoningPart 头部 breathing 20px + 必要的稳定化观察）。

### Phase 2.5 落地记录（Primary Agent Activity Visual Redesign）

Phase 2 的 20px inline 版本技术正确，但在 OpenChamber transcript 中视觉层级过低，退化为普通 loading icon。Phase 2.5 只重做首个主 activity indicator 的呈现，不改 semantic layer、derive、tool classifier、adapter mapping、precedence 或其他 BusyDots 使用点。

**布局**：`ActivityIndicator` 改为 Thinking Orbs 原生 `size={64}`（不是 CSS 放大），固定 `h-16 w-16 shrink-0`；WorkingPlaceholder 变为 `[64px Orb] [ActivityText]` 横向 activity group，最终视觉验收采用 8px gap、自然 transcript 宽度、无 card/背景/border/blur/glow。StatusRow 的固定 `h-8` 改为 `min-h-8`，只允许运行态按 64px 内容自然长高；settled/todo-only 路径仍保持原有紧凑高度。

**Typography / 信息层级**：primary 使用现有 `displayedText`（14px `text-sm`、medium、foreground）；secondary 仅在真实 `modelName` 存在时显示，使用既有 `typography-meta` + muted foreground，并保留原 provider logo。没有新增或拼造业务文案。aria-label 继续使用旧 `modelStatus` 组合文本，role=status / aria-live / blocked assertive 行为不变；orb 包裹仍 aria-hidden，文字是唯一语义载体。retry 分支同样使用 64px group，原倒计时/attempt 文案与 adapter `retrying→working` 不变；blocked/null 仍回落 BusyDots。

**稳定性**：同一个 64px canvas 位置跨 state 保持不变，只更新 `ThinkingOrb.state`；无 key/remount、尺寸变化或 reveal。WorkingPlaceholder 原 1200ms 文案 queue、idle return null、unmount cleanup、library reduced-motion/IO/visibility pause 均未动。

**Sandbox 视觉验证**：

- working：真实 `sleep 35/60/90` bash 回合，`canvas[aria-label="Working…"]` 实测 64×64；截图 `.openchamber/screenshots/phase25-working-64-active-2026-08-25T14-10-30-746.jpg`。
- searching / reasoning(breathing) / editing(shaping) / orchestrating(weaving)：使用临时 HMR-only isolated preview 强制 orb state、保持真实长回合与完整 WorkingPlaceholder 布局，逐态确认 64×64 和布局无位移；preview 入口在最终代码中已完全删除。截图：`phase25-searching-64-*`、`phase25-reasoning-64-*`、`phase25-editing-64-*`、`phase25-orchestrating-64-*`。
- 视觉结论：64px 版本把 Orb 提升为状态主体，primary/secondary 信息层级清楚；不占满 transcript、不形成卡片感；右侧 composer/todo 控件未移位，无重叠；活动组增加约 32px 运行态高度，但底部滚动仍锚定 composer，回合 settled 后 canvas 与额外高度同步移除。
- 20px vs 64px：20px 更像标点/loading glyph，状态之间图形差异难辨；64px 的 orbits/globe/ring/morph/braid 结构可辨，符合官方 chat-avatar scale 意图，仍保持 OpenChamber 的克制布局。

**性能复测**：单 64px orb active 时宿主进程 5×2s 采样为 0.0–0.1% CPU；settled 基线受浏览器宿主噪声影响为 0.1–0.6%，未观察到可归因的 CPU 增量。vendor chunk 不变（15.01 kB / gzip 6.20 kB）。GPU/FPS/layout/recalc 无可独立归因的 DevTools 通道：GPU 未报告伪精确数字；内置浏览器实际滚动/长回合无掉帧、持续 paint、layout shift 或 console orb 错误。settled 后 canvas 消失；hidden/reduced-motion 行为仍由库 IO/visibility/matchMedia 路径持有（本轮未改）。

**决定**：建议保留 64px 主 Orb。它已达到“明确的 Agent activity block”目标，单实例性能仍可接受。是否进入 Phase 3 增加第二个 Orb 暂不自动推进，需人工视觉验收；从视觉职责看，64px 主 Orb 已足够强，Phase 3 的 Reasoning header 小 Orb 可能重复表达，建议重新评估而非默认增加。

### Phase 2.6 落地记录（Agent Activity Presentation Stabilization）

Phase 2.6 在 `deriveAgentActivity()` 与 `resolveOrbState()` 之间新增独立 presentation controller：`authoritative activity + 当前 statusText` → `createAgentActivityPresentationStabilizer` → 单个 stabilized snapshot → label 与 Orb adapter。semantic layer、derive authority/precedence、tool family mapping 和 Thinking Orbs 内部代码均未修改，也未增加第二个 Orb。

**实际参数**：minimum visible duration = **500ms**；foreground tool fallback grace = **175ms**；maximum visual lag = **750ms**。controller 只保存当前显示快照和一个 latest pending 快照，并且始终只有一个 timer；不同 pending 更新覆盖旧目标，不累计 FIFO/timeout 队列。same-state 更新不改变 `displayedSince`，因此不会重启 Canvas state；同一 activity 内的具体 tool 文案可立即替换 label。

**切换规则**：

- `idle`、`blocked`、`listening`、`connecting`、`retrying` 是 lifecycle/critical 状态，无 timer 立即抢占并清空 pending。idle 因而继续立即卸载整个 WorkingPlaceholder；blocked 仍由 adapter 返回 null，保持原 no-orb/BusyDots policy；retrying 仍映射 working Orb 并由现有倒计时提供细节。
- `searching`、`editing`、`orchestrating` 是 foreground activity。它们立即抢占 reasoning/composing/working；直接 foreground→foreground 仍服从当前态 500ms minimum，避免工具族连续事件每次都改动画。
- foreground 结束后到 reasoning/composing/working 的回落至少等待 175ms。grace 期间 foreground 再次出现时取消 fallback；若新 foreground family 不同，则直接切到最新 family。非常短的 working/reasoning/composing 因此会被相邻工具阶段吞掉。
- 低信息态之间保留 latest pending，最早在当前态满 500ms 时显示。fallback churn 可重算 175ms grace，但从第一次 divergence 起最多延迟 750ms，达到上限即显示当时最新状态。
- label 与 activity 在同一个 `AgentActivityPresentation` 中提交。当前 authoritative activity 与 displayed activity 不同期间，旧 Orb 保留与它对应的旧 label；同态下 statusText 变化立即提交，所以 read→grep 的具体文案或 bash 完成后的 detail 不受 minimum delay。

**清理**：controller 的 `dispose()` 清空 pending 并取消唯一 timer；hook 在 component unmount 时调用 dispose。idle/blocked/listening/connecting/retrying 的立即切换也先取消 timer。没有 RAF、interval 或全局 store。

**Sandbox 实测**：在真实 sequential Grep→Read→Read→bash sleep 2→Grep 回合中临时记录 authoritative/stabilized 快照，验证后已从最终代码删除记录入口。

- Read/searching 显示 444ms 后 authoritative 回到 working；Orb/label 保持 searching 到 622ms，回落发生在 working 到达后 178ms，符合 500ms minimum + 175ms grace。
- `reasoning → working(34ms) → searching` 中，working 未显示，searching 直接抢占；没有 reasoning/working flash。
- bash 前 `reasoning → working` 在 reasoning 满约 500ms 后切换；bash 运行中 Orb 保持 working，label 从 `running command` 实时更新到后续 generic detail，没有 Canvas state 变化。
- retrying 在 provider 退避出现时立即抢占，恢复 working 同样立即清除 retry lifecycle；最终回合继续执行。

结论：Orb 从跟随每个内部 part 事件切换，变为稳定表达当前 foreground 工作阶段。保留 500/175/750 参数，不进入 Phase 3。

### Phase 3 落地记录（Reasoning Context Orb）

Phase 3 在 `ReasoningTimelineBlock` 的真实 header 中增加 Thinking Orbs 原生 `size={20}` breathing Orb。它只表达当前 reasoning part 的局部生命周期；64px Primary Orb 继续表达整个 foreground activity，两者不共享 presentation stabilizer。

**Authority / placement**：context Orb 的唯一条件是 `variant === 'thinking' && isStreaming && time.end 缺失 && isExpanded`。它紧跟现有 Thinking label，固定 `h-5 w-5`，不参与 reasoning body 的 height/motion/scroll 计算。`REASONING_ORB_STATE = 'breathing'` 由集中 adapter mapping 与 header 共用，没有第三套映射。

**重复抑制与清理**：采用 expanded-only 策略。active reasoning 展开时页面最多为 `1 × 64px + 1 × 20px`；折叠立即 unmount 20px，只保留 Primary；重新展开时才恢复。`time.end` 或 stream completion 到达后 20px 同步 unmount，不等待 Primary 的 500/175/750 stabilizer；completed/hydrated reasoning 后续折叠或展开都不会重启。wrapper 为 `aria-hidden="true"`，reasoning label/summary 仍是唯一语义来源。RAF、reduced-motion、visibility、IntersectionObserver 与 unmount cleanup 均继续由 Thinking Orbs 持有。

**Sandbox A–F 验证**：A active+expanded 为 64×64 与 20×20 两个 canvas；B active+collapsed 只剩 64×64；C active re-expand 恢复 20×20；D completion 后 20px 在下一次检查前已消失；E completed 状态 collapse/re-expand 不重启；F source/test 扫描确认 production TSX 只有 Primary 与 Reasoning 两个 `<ThinkingOrb>` 实例。free-model live path 能验证 Primary 的 warming/tool/settle，但没有产出 reasoning part；因此 A–E 使用临时 sandbox-only fixture 驱动真实 `ReasoningTimelineBlock`，fixture 已从最终源码完全删除。视觉截图：`.openchamber/screenshots/phase3-active-two-orbs-2026-08-26T00-42-15-942.jpg`。

**Production profile**：同一 production build、相同 8s settle + 15s recording，各运行两次。单 64px 与 64px+20px 的中位 main-thread busy 均约 4.90%；script 为 2.66% vs 2.68%，style recalc 为 0.17% vs 0.18%，layout 均 0%，frame liveness 均 61 FPS。CPU sampling busy 为 5.97% vs 5.72%，没有稳定变差方向；总 RAF callback 观测值也均为 61 次。结论只能是新增 20px Orb 的开销低于当前测量噪声，不能宣称零成本。GPU 工作无法从当前 renderer/native attribution 中可靠独立，未报告伪精确数字。

**决定**：保留 expanded-only 20px contextual Orb；维持页面最多两个 animated Orb，不自动扩展到其他 surface。Phase 4 后续只做候选审查。

### Phase 4 落地记录（Candidate Review，仅调查）

Phase 4 只审查候选位置，没有修改运行时代码、增加 Orb 或替换其他 BusyDots。结论沿用 Phase 3 的预算：页面最多 `1 × 64px Primary + 1 × 20px Reasoning = 2` 个 animated canvas。列表中的实例数不得随 session、task 或 subagent 行数增长。

#### 候选决策

| # | 候选 | Authority 与可见生命周期 | 现有 UI / 新信息 | Recommendation |
|---|---|---|---|---|
| 1 | retrying | 当前 session 的权威 `SessionStatus.retry{attempt,next,message}`；成功或最终 error 后退出 | Primary 保留 retry 文案和倒计时；`retrying → working` 只表达回合仍在运行 | **Implement（已覆盖）**：保留当前 mapping，不改成 connecting，不建第二套 countdown |
| 2 | connecting / reconnecting | app 级 `useConfigStore.connectionPhase`，不是 session 状态 | 只有 `isWorking` 为真时 Primary 才可见；断线与 retry 重叠时可能形成 Connecting Orb + Retrying 文案 | **Optional（需先修 authority）**：以后要么让连接态同时拥有可见性与文案，要么停止覆盖 Primary；本阶段不改 |
| 3 | parent orchestrating / weaving | parent busy 且最新 active part 的 `tool.trim() === 'task'`；child busy 不参与 parent 派生 | Primary 已显示 weaving；delegation 文案来自现有 status projection | **Implement（已覆盖）**：保留精确 `task` 触发，不按 title、child busy、Multi-run 或 display text 猜测 |
| 4 | blocked / permission / question | 当前 session 的 permission/question 请求数组；用户回复、拒绝或授权后退出 | PermissionCard / QuestionCard 已提供动作；动画会误导用户以为 Agent 仍在执行 | **Reject**：不提供 Orb，不把 child blocker 写入 parent activity |
| 5 | parent Task tool row | parent ToolPart 的 pending/running/completed/error；child join 优先读 `state.metadata.sessionId` | 已有 tool icon、shimmer、child 摘要和 Open subtask | **Reject**：与 parent Primary weaving 重复 |
| 6 | 单个 Work Status subagent row | child 自己的 session status；permission/question 也属于 child 所在目录 | 已显示 working、needs permission、asked question、done | **Reject animated Orb**：现有文字更精确；若未来展示 child foreground detail，只考虑静态补充并先修跨目录读取 |
| 7 | 多 subagents 列表 | 每个 direct child 都有独立 lifecycle，可同时 busy | section 已有 busy/total 聚合和逐行状态 | **Reject**：per-row canvas 令 RAF/observer 数随列表增长 |
| 8 | Electron MiniChat 正文 | MiniChat 有独立 window/session selection，但 activity 仍来自共享 session authority | 直接复用 `ChatContainer`，因此现有 Primary 和 Reasoning Orb 已自动生效 | **Implement（已覆盖）**：不新增 MiniChat 专用入口 |
| 9 | Electron MiniChat startup backdrop | React/sync/session 尚未 ready，无 Agent authority | 纯主题背景，ready 后淡出 | **Reject**：此时显示 Orb 会伪造 Agent activity |
| 10 | AutoReviewBanner | review-loop workflow 的 running/phase/iteration；phase 可能只是等待 reviewer/implementer session | spinner、BusyDots、phase 文案、Open/Stop 已完整表达 workflow | **Reject**：workflow progress 不等于单一 Agent foreground activity |
| 11 | Mobile native / React splash | 原生启动、字体、endpoint 连接和 session restore 状态；没有 Agent authority | 静态 splash、Logo、连接目标、BusyDots、恢复错误 UI | **Reject**：app bootstrap/connection setup 不是 Agent activity |
| 12 | Multi-run | 多个互相独立的 root sessions，无 `parentID` | 每个 session 自己有状态；group membership 目前由 title 约定解析 | **Reject weaving**：parallel root runs 不是 delegation/orchestration |
| 13 | Agent Manager aggregate | 成员 session status 的聚合 | group spinner、session ping 与内嵌 ChatContainer Primary 会重复 | **Reject Orb**：后续若精简动画，优先保留选中 session 的 Primary，聚合层改静态 dot/计数 |
| 14 | Static Orb 用作非活动徽标 | React API 只有 `paused`，切换时仍按 `performance.now()` 重画；reduced-motion 才固定 `t=0.6` | 底层 engine 可用固定 `t` 生成确定几何，但会绕过组件并增加维护面 | **Reject**：现有 icon/status dot 更简单；不要为非 live 状态引入 engine 渲染器 |
| 15 | `solving` state | OpenChamber 没有“正在求解”的权威协议字段或可靠派生事件 | reasoning、generic working 已有 breathing/working | **Reject mapping**：不为覆盖库的第九态制造 heuristic |

#### 9-state coverage 与 Static Orb

生产 adapter 覆盖 8 个库状态：`working`、`searching`、`listening`、`connecting`、`weaving`、`composing`、`breathing`、`shaping`。`solving` 保持未使用。其中 `listening` 目前只存在于 semantic/adapter 契约，生产 `useAgentActivity()` 尚未传入 dictation，因此当前数据链不可达。这不是增加第三个 Orb 或强造 mapping 的理由。

`paused` 只能停止后续 RAF，不能提供 deterministic frame。组件在 effect 开始时按当前 `performance.now()` 画一帧；恢复后跳到共享时间轴的当前相位。`prefers-reduced-motion: reduce` 才固定绘制 `t=0.6`。底层 `thinking-orbs/engine` 对固定 `state + size + t` 可生成可复现几何，但 Canvas 抗锯齿不保证跨浏览器逐像素一致。Phase 4 不新增 Static Orb。

#### Sandbox 观察

隔离 `web:sandbox` 中用真实 free-model 回合触发一个 Explore subagent。运行期同时可见 parent Task 卡及 child tool 摘要、Work Status `Subagents 1/1` 和 `is working` 行，以及一个 64px Primary Orb。该场景没有出现 row-level Orb，信息仍完整；新增 Task 或 subagent Orb 只会重复同一 lifecycle。Phase 2 已另行实测 task active 时 parent weaving，Phase 4 不再造 fixture。Sandbox 全程使用 `.dev-sandbox/workspace`，未连接 production runtime。

**决定**：Phase 4 不产生 UI 实现。保留两个 approved placements，MiniChat 正文通过共享 `ChatContainer` 自动覆盖；拒绝 splash、AutoReview、Task row、subagent row、Multi-run/Agent Manager aggregate、Static Orb 和 `solving` mapping。`connecting` 的 activity/文案 authority 分裂作为独立后续问题，不在候选审查中顺手修改。

### Phase 4.1 落地记录（Connecting Authority Unification）

修复前，`useAgentActivity()` 通过 `deriveAgentActivity()` 从 live session status、parts、permission/question 和 `connectionPhase` 推导 Orb activity；`useAssistantStatus()` 同时独立扫描 status/parts 并输出 `statusText`。`WorkingPlaceholder` 把前者作为 Orb 输入、后者作为 primary text 输入，因此 app reconnecting 可显示 Connecting Orb 与 running/retrying 的主文案。

现在唯一的主语义路径是：

```text
authoritative raw state
  -> deriveAgentActivity()
  -> useStabilizedAgentActivity()
  -> stabilized AgentActivity
     -> resolveOrbState()
     -> formatAgentActivityLabel()
```

`useAssistantStatus()` 不再决定 primary label。它继续提供 abort、permission waiting、model/provider、tool detail 和 retry `attempt/next`。detail 不经过 stabilizer：例如 Primary 为 `Working` 时可立即更新 `running command`，Primary 为 `Retrying` 时可立即更新 retry 倒计时。`formatAgentActivityLabel()` 位于 OpenChamber presentation 层，使用本地化 key；Thinking Orbs adapter 保持只做 `AgentActivity -> OrbState`。

`connectionPhase` 是 config store 的 app transport 事实，`connected | connecting | reconnecting` 仍由 `deriveAgentActivity()` 处理。当前 presentation stabilizer 没有连接专用的 >=2s threshold，connecting 和 retrying 都是 immediate activity。因此 Phase 4.1 没有新增阈值，只确保现有同一个 stabilized result 同时驱动 Orb 与 primary label。若以后重新引入连接阈值，它必须放在 presentation layer，且不能只延迟其中一个 consumer。

retrying 保持特殊但不分裂：stabilized activity 是 `retrying`，primary label 为 `Retrying`，adapter 仍可把 Orb 回退到 `working`。这是一种有意的 visual fallback，不是另一套 raw-state 推导。`blocked` 和 `idle` 没有 primary label、没有 Orb，StatusRow 不再保留 working placeholder，让 PermissionCard/QuestionCard 或 settled transcript 承担语义。

**验证**：新增 pure transition coverage，检查 connecting、working、searching、reasoning、editing、retrying、blocked、idle 和 rapid changes 的 label/Orb 同源；SSR 覆盖 connecting DOM、retry fallback、实时 detail 与 blocked/idle 卸载。Sandbox 的真实 `sleep 35` 回合显示 `Working` 主标签、`running command` detail 与 64px `Working...` canvas 一致。隔离环境中分别暂停 OpenChamber API 与 managed OpenCode，均未让当前 runtime 发布可观察的 reconnecting 状态，后者恢复后直接结算回合；不将该尝试写作 connecting runtime 通过。Sandbox 全程隔离，未接 production runtime。

---

## 8. Lifecycle / Debounce Strategy

Phase 2.6 后的现状：`WorkingPlaceholder` 原 1200ms 文案队列已删除。Orb 与 primary label 共用 `AgentActivityPresentation` 快照，由独立 controller 处理时间稳定，具体 tool/detail 文案在同态内实时更新。

| 机制 | 建议 | 理由 |
|---|---|---|
| minimum display duration | 500ms | 短态不闪，仍能及时表达真实阶段 |
| same-state coalescing | 相邻同态不重置 displayedSince/Canvas；label detail 可实时更新 | 保持动画连续且不冻结具体工具文案 |
| fallback grace | foreground tool → low-info 等待 175ms | 吞掉 tool 间的短 reasoning/working gap |
| transition priority | blocked/listening/connecting/retrying/idle 立即；foreground 抢占 low-info | 与真实 lifecycle 和用户动作优先级一致 |
| maximum visual lag | 从第一次 divergence 起 750ms | pending churn 不可无限维持过期状态 |
| parent-state fallback | parts 不可得时仍由现有 derive 映射 working/retrying | presentation 不猜 authority |

不做：全局 debounce store、RAF、定时器矩阵和 FIFO 状态动画队列。controller 只拥有一个 latest pending 和一个 timer。

---

## 9. UI Placement Candidates

| 候选位置 | 建议 | 尺寸 | 理由 |
|---|---|---|---|
| StatusRowContainer / WorkingPlaceholder（转写底部状态行） | **已接入** | 64px primary | 这是唯一的“当前会话正在做什么”权威出口；Orb 与文案共用 stabilized presentation snapshot |
| ReasoningPart 头部 | **已接入** | 20px contextual | 仅 active + expanded 可见；折叠或完成立即 unmount |
| Composer / Send 附近 | **不放** | — | 发送键自身已有状态形变；composer 底行刻意 `showAssistantStatus=false`，勿破坏 |
| WorkStatusPanel | **不放动画 orb**；维持静态行 | — | 面板是多区块信息卡，动画 orb 会变成第二个注意力中心 |
| Session Sidebar | **不放**（保持静态点） | — | N 个会话可能同时 busy，canvas 实例数失控（§15）；静态点信息密度已够 |
| Subagent/task rows | **不放** | — | 文字值（working/blocked）已足够精确 |
| Empty/new session hero | **不放** | — | 无活动可言 |
| MobileApp 连接 splash | **不放**（Phase 4 Reject） | — | app bootstrap/connection setup 不是 Agent activity |
| Electron Mini Chat 正文 | **已覆盖** | 64px / 20px | 复用 ChatContainer，无需专用入口；startup backdrop 不放 |

原则：全页面**一个持续动画的主 orb**（转写状态行），至多再加 reasoning 头部一个瞬时小 orb。不做"到处放 orb"。

---

## 10. Thinking Orbs Research

来源：官网 orbs.jakubantalik.com、仓库 github.com/Jakubantalik/Libraries（packages/thinking-orbs/README.md）、站点 bundle 逆向核对（`ThinkingOrb-*.js`、`main-*.js`）。

### States（9 个，官方语义原文）

| state | 视觉动机 | 官方描述 | 默认 aria-label |
|---|---|---|---|
| working | orbits | particles on tilted orbits | Working… |
| searching | globe | a scan meridian sweeps a dotted globe | Searching… |
| solving | rubik | bands scramble, then click back solved | Solving… |
| listening | wave | a waveform rolls through the rings | Listening… |
| connecting | web | a constellation wires itself | Connecting… |
| weaving | braid | three strands plait around the sphere | Weaving… |
| composing | ribbon | an undulating multi-band sash | Composing… |
| breathing | ring | a ring slowly morphing | **Thinking…** |
| shaping | morph | dotted outline: circle → triangle → square | Shaping… |

### API（React，npm 包 `thinking-orbs`）

```tsx
import { ThinkingOrb } from 'thinking-orbs';
<ThinkingOrb state="searching" size={64}
  theme="auto"      // auto|dark|light
  speed={1}         // 预设速度的乘数（demo 滑杆范围 0.25–3）
  paused={false}    // 停止后续 RAF；切换时仍按当前时钟重画
  aria-label="…"    // 覆盖默认标签
  {...canvasProps} />
```

- `role="img"`，默认 per-state 英文标签，可覆盖（i18n 入口）。
- **size 只接受预设 64 / 20**：内部 `kp[motif][size]` 直接查表（bundle 实证），传其他值会在取 `count` 时崩——两个尺寸是独立调参的设计（dot 数、dot 大小、速度各自调优），不是缩放。64=chat-avatar 级，20=inline-text 级。
- theme="auto" 三层解析：祖先 `data-theme` 属性或 `dark`/`light` class（MutationObserver 监听 documentElement subtree）→ `prefers-color-scheme` → SSR 安全。**OpenChamber 用 `html.dark` class（index.css:33,511），兼容，无需适配**。严格单色（深底浅墨/浅底深墨），不能着 OpenChamber 状态色。

### Animation lifecycle / pause / reduced-motion（bundle 实证）

- 每实例：1 canvas + 1 RAF 循环 + 1 IntersectionObserver + 1 visibilitychange 监听。
- 时间源 `performance.now()/1000*speed`。所有实例共享墙钟；暂停恢复后跳到墙钟的当前相位，不从冻结相位继续。
- 离屏（IntersectionObserver `isIntersecting=false`）或标签页隐藏 → cancelAnimationFrame；恢复条件二者都满足。
- `prefers-reduced-motion: reduce` → 只画一帧静态代表帧（t=0.6），无 RAF，主题仍跟随。监听 change 动态切换。
- effect 依赖 `[state,size,theme,speed,paused,reducedMotion]`，任一变化重建循环。

### Rendering / 性能特征

- 纯 2D canvas arcs：无 WebGL、无 ctx.filter、无 SVG filter。固定输入的几何可复现，但 Canvas 抗锯齿不保证跨浏览器逐像素一致。
- DPR 上限 2（`Math.min(2, devicePixelRatio)`）。
- 20px 预设 dot count 乘数约 0.03–0.25 于 64px（如 ring 0.028 vs 0.25），单帧绘制量显著更低。
- 注意：**库不做跨实例共享 RAF**——每个实例自己的 rAF 回调（时钟共享、循环不共享）。实例数多时是 N 个 rAF + N 个 IO，但离屏自动停，实际同时动画数受视口约束。

### License / 分发

- MIT © Jakub Antalik。npm `thinking-orbs`；SwiftUI port（ThinkingOrbsKit，SPM）；React Native port（beta，未上 npm）。安装属于新依赖，须主人批准后在实施阶段进行。

---

## 11. OpenChamber → Thinking Orbs Mapping Matrix

| OpenChamber activity（semantic） | Orb state | Confidence | Reason |
|---|---|---|---|
| working（generic busy，含 bash） | working | High | 官方语义"粒子轨道"=通用运转；bash 无更贴切态，归此 |
| searching（read/grep/glob/list/webfetch/websearch/codesearch） | searching | High | 官方"globe 扫描"与信息检索一一对应 |
| reasoning | breathing | High | 库默认标签即 Thinking…，官方锚定 |
| composing（text part 流式） | composing | High | 官方 sash=组织输出中的形态 |
| editing（edit/write/patch 族） | shaping | Medium-High | outline 变形 circle→square 与"把文件塑造成形"同构；无官方锚定故不给 High |
| listening（dictation recording） | listening | High | 官方 wave=波形滚动，正对麦克风 |
| connecting（transport 断连/初连，阈值后） | connecting | High | 官方 constellation wiring=建立连接 |
| retrying（provider 退避） | working | High（诚实性）/ Low（特异性） | 保留倒计时文案；working 只说明回合仍在跑，不与 app transport connecting 混淆 |
| orchestrating（task 工具运行） | weaving | Medium-High | 三股编辫与多子代理并行同构；无更强证据，不作为首批必上 |
| blocked（permission/question） | **无**（让位） | — | 库无阻塞/等待用户语义；强行映射会说谎 |
| idle / settled | **无**（卸载 orb） | — | 库全部是"进行中"态，无完成/空闲态 |
| queued（待发队列） | **无** | — | 徽标语义 |
| MCP failed / usage 配额 | **无** | — | 静态告警，非活动 |
| turn complete celebration | **无** | — | Fireworks 已承担，且 orb 无终止态 |
| plan mode | shaping | Low | 仅有文本嗅探证据（Heuristic），不为凑覆盖率而启用 |

覆盖率结论：adapter 覆盖 9 个 Orb state 中的 8 个；weaving 已由 active `task` 使用，solving **不映射**。`listening` 当前生产 hook 不可达，不能把契约覆盖写成运行时覆盖。反向：blocked/queued/MCP/celebration 四类 OpenChamber 状态没有也不应有 Orb。

---

## 12. Lifecycle / Debounce Strategy

见 §8 和 Phase 2.6 落地记录。当前核心是 500ms minimum + 175ms fallback grace + 750ms maximum lag + latest pending + lifecycle/foreground 抢占。

---

## 13. UI Placement Candidates

见 §9。

## 14. 20px vs 64px Usage

- **64px prominent**：当前唯一实例是 transcript StatusRow 的主 Agent Activity；Phase 2.5 已完成视觉验收。
- **20px inline**：ReasoningPart active+expanded header 使用 breathing Orb；折叠或完成立即 unmount，避免与 Primary 长时间重复表达。
- 禁止把任意 px 值传给组件（只接受 64/20，其他值崩溃）；需要视觉更大时用 CSS transform scale 包裹（代价：模糊风险，不如不放大）。

---

## 15. Performance / RAF / Canvas Budget

结合 OpenChamber 是长期运行开发工具（流式 ~60 events/s、长会话虚拟列表、Electron/Chromium、笔记本无风扇设备）：

| 项 | 评估/建议 |
|---|---|
| 单实例成本 | 1 canvas + 1 RAF + 1 IO + 1 listener；2D arcs 便宜，20px 每帧 dot 数少 |
| 页面同时动画 orb 上限 | **≤2**（状态行 1 + reasoning 头部 1），常态 1–2，离屏自动停 |
| Sidebar | 静态点，不上 canvas（N 会话并发 busy 时实例数不可控） |
| hidden panel / offscreen | 库自带 IO 暂停，无需额外处理；VS Code webview 隐藏等同 document.hidden 路径 |
| background window | 库监听 visibilitychange 自动停；Electron 最小化同样命中 |
| reduced-motion | 库渲染单帧静态图，符合仓库 motion policy（animate only while conveying live information；reduce 下 BusyDots 也是 none） |
| DPR | 库 cap 2，与主流 retina 环境一致 |
| 与流式热区共存 | ReasoningPart 的 orb 是固定尺寸 canvas，不触发布局；状态行在虚拟列表外的固定容器中，安全 |
| 主题切换 | MutationObserver 开销极低；OpenChamber 的 oc-theme-switching 过渡抑制机制不受影响 |

风险提示：库不共享 RAF loop；若未来出现第三个常驻动画场景，应先评估是否合并 surface 再增加实例。

---

## 16. Reduced Motion

- 库行为：`matchMedia('(prefers-reduced-motion: reduce)')` + change 监听；reduce 时画 t=0.6 静帧，主题照常。符合要求，无需包装。
- 仓库现状对照：`.animate-busy-pulse { animation: none }`（index.css:1745）、pill-tabs/transition 熔断、FadeInOnReveal 全局禁用——策略一致：reduce 下保留信息、去掉运动。orb 静帧仍传达"有活动"，配合状态文字不丢信息。
- 唯一注意：静帧是"代表性姿势"而非第一帧，视觉上与动画最后一帧不同属正常。

---

## 17. Interaction With Existing Motion Foundation

| 现有资产 | 关系 |
|---|---|
| semantic tokens（surface/status/interactive） | orb 单色自管墨色（auto 主题），不消费 token 也无需消费；它是活动指示，不是严重度指示 |
| reduced-motion 体系 | 直接兼容（§16） |
| live-operation motion policy（只动 transform/opacity、只为活信息动） | orb 为 canvas 重绘，不走 CSS 合成路径，但满足"只为活信息动画"（IO/visibility 双暂停） |
| BusyDots | **部分替代**：WorkingPlaceholder 与 ReasoningPart 两处的 BusyDots 由 orb 接管（方案 C：部分 surface 替代）；AutoReviewBanner、Mobile splash 的 BusyDots 保留（语义不同：review 流程/app 级连接） |
| WorkingPlaceholder | **共存增强而非替换**：文字保留，BusyDots 换成 orb；label 与 Orb 共用 Phase 2.6 presentation snapshot |
| spinner 类（sidebar animate-spin 等） | 不可替代：那些是操作进行（worktree 操作等），非 agent 活动 |
| Fireworks / ShineText / marquee | 不可替代：庆祝/装饰各司其职 |
| StateSwap | 仓库内不存在该组件（本轮检索无果）；若 transitions.dev 后续引入 text-states-swap，与本设计正交 |

结论：采用 **C（部分 surface 替代）**——状态行与 reasoning 头部换 orb，其余现状不动。

---

## 18. Suggested Implementation Phases

1. **Phase 0（已完成）**：本文档。
2. **Phase 1（已完成）**：Semantic layer。
3. **Phase 2 / 2.5 / 2.6（已完成）**：主入口接入、64px redesign、presentation stabilization。
4. **Phase 3（已完成）**：ReasoningPart active+expanded 头部 breathing 20px；折叠/完成直接 unmount。
5. **Phase 4（调查完成，无 UI 变更）**：候选审查见 Phase 4 落地记录。MiniChat 正文已由共享 ChatContainer 覆盖，其余候选不增加 Orb。
6. **Phase 4.1（已完成）**：Orb 与 Primary label 共用 stabilized AgentActivity；retry detail 保持实时，blocked/idle 不保留 placeholder。

---

## 19. Risks

| # | 风险 | 缓解 |
|---|---|---|
| 1 | size 只认 64/20，其他值运行时崩溃 | adapter 层 clamp 到两 preset；类型收窄 |
| 2 | 工具族分类是字符串表，MCP 自定义工具会落入 unknown | unknown → working 安全回退；分类表集中一处便于维护 |
| 3 | 状态快速翻转闪烁 | semantic layer 的 min-display + 抢占规则（§8） |
| 4 | 多实例 RAF 叠加 | placement 预算 ≤2 常驻；sidebar 明确禁用 |
| 5 | 单色限制丢失严重度颜色 | orb 只表活动，错误/警告仍由现有 status token UI 表达 |
| 6 | 默认 aria-label 为英文 | 接入时显式传 i18n label（WorkingPlaceholder 已有 t() 上下文） |
| 7 | 断线时 busy 冻结成"假工作" | connecting 阈值覆盖 + 库的 visibility 暂停兜底 |
| 8 | 新依赖引入（MIT、纯 canvas、零运行时依赖） | 仍按纪律在 Phase 2 前请示批准 |
| 9 | 文档漂移：parts/DOCUMENTATION.md 仍引用已删除的 SessionActiveSpinner.tsx、sync/DOCUMENTATION.md 引用不存在的 voice-store.ts | 本轮不顺手修；Phase 2 触碰相关文件时一并修正 |
| 10 | `useAssistantStatus.cooldown` 死分支与 `forming.characterCount` 恒 0 | Phase 1 收敛 semantic layer 时顺带确认去留（属重构范畴，需另行确认） |

---

## 20. Open Questions

Phase 4 已关闭 retry、blocked、MiniChat 和 weaving placement 问题：retry 保持 working Orb + 倒计时；blocked 不使用 Orb；MiniChat 正文复用现有 ChatContainer；weaving 只显示在 parent Primary，不增加动画面。

仍开放：

1. dictation recording/uploading 是否应接入生产 `useAgentActivity()`，还是继续只显示现有 waveform？
2. 是否暴露 speed 用户偏好？当前没有需求，默认 1 足够。
