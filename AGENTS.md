# OpenChamber Agent 指南

## 目的

OpenChamber 为 OpenCode 提供共享的 Web、桌面端、VS Code、托管移动端和原生移动端 UI 界面。

本文件仅包含始终生效的仓库规则和路由规则。详细工作流程归属于项目 Skills 和模块文档。

## 指令顺序

以下步骤为强制要求。在进行编辑之前，你**必须**：

1. 遵循此根级指南。
2. 加载所有与任务匹配的项目 Skill，以及这些 Skill 中任务所要求的所有参考资料。
3. 如果存在，则阅读距离最近的 `DOCUMENTATION.md` 和对应包的 `README.md`。
4. 遵循本地已有的代码和测试惯例。

如果这些来源之间存在实质性冲突，应停止操作并解决冲突，而不是悄悄选择其中一个。

如果匹配的 Skill 或所要求的参考资料尚未阅读，不得开始编辑。加载 Skill 是任务的必需环节，而不是可选建议。

## 运行时边界

* `packages/ui`：共享 React UI、状态、同步和运行时契约。
* `packages/web`：Web 界面、OpenChamber 服务器、托管/外部 OpenCode 生命周期，以及 CLI。
* `packages/electron`：原生桌面外壳和具有特权的 Electron 边界。
* `packages/vscode`：扩展宿主、Webview 和运行时桥接层。
* `packages/mobile`：Capacitor iOS/Android 外壳；打包移动 Web 界面并连接到现有的 OpenChamber 服务器。
* `packages/docs`：产品文档；不属于 Bun workspace。

共享 UI 通过 `@opencode-ai/sdk/v2` 调用官方 OpenCode API。OpenChamber 自有能力使用 `RuntimeAPIs`、`runtimeFetch` 以及共享的浏览器/实时传输辅助工具。服务端的上游集成可以使用其所属的运行时模块。

Electron 会在进程内启动 OpenChamber 后端，绝不将其作为 sidecar 启动。开发环境可以加载回环地址/HMR UI；打包版本通过 `openchamber-ui://` 加载已暂存的资源，同时回环服务器仍作为 API 后端。除非某项行为天然属于原生端，否则应将领域后端逻辑保留在 Web/运行时模块中。

共享契约必须针对所有适用的运行时明确定义预期行为：Web、桌面端、VS Code、托管移动端和 Capacitor 移动端。

## 始终生效的约束

* 不要修改 `../opencode`；它是一个独立仓库。
* 除非用户明确要求，否则不要运行 git 或 GitHub 命令。
* 除非明确要求，否则不要添加依赖。
* 绝不要添加或记录密钥、Bearer Token、配对凭据或敏感用户数据。
* 保持改动最小化，并保留工作树中与当前任务无关的修改。
* 在核心/运行时逻辑中落实安全性和正确性，而不能只依赖 UI 可见性或提示信息。
* 保持入口点和桥接层精简；将领域逻辑放在职责明确的归属模块中。
* 当模块归属、契约或不变量发生变化时，更新对应的归属文档。

## 正确性不变量

* 优先使用权威状态，而非启发式判断。
* 从实时通道推导实时活动，而不是从持久化历史记录中推导。
* 将临时回退方案严格限制在较小范围内，并在权威状态到达后将其清除。
* 绝不要让获取失败伪装成权威的“空结果成功”。
* 明确定义部分结果、回滚、清理和陈旧数据的行为。
* 单个实体失败不得清除或阻塞其他无关且完整的实体。
* 运行时特有的差异必须是有意设计的，并且应在代码中清晰可见。

## 文档发现

修改某个模块前，搜索距离最近的 `DOCUMENTATION.md`；进行包级工作前，阅读其 `README.md`。应在 `packages/**/DOCUMENTATION.md` 下动态发现文档，而不是依赖静态且试图穷举全部内容的映射表。

高价值入口：

* 同步：`packages/ui/src/sync/DOCUMENTATION.md`
* Stores：`packages/ui/src/stores/DOCUMENTATION.md`
* CLI：`packages/web/bin/lib/DOCUMENTATION.md`
* 性能测量工具：`scripts/perf/DOCUMENTATION.md`
* VS Code 运行时：`packages/vscode/src/DOCUMENTATION.md`
* Electron：`packages/electron/README.md`
* 移动端：`packages/mobile/README.md`
* 本地打包 `.app` 隔离验收沙箱（启动映射、目录职责、清理与禁止边界）：仓库根目录的 `OpenChamberTest-README.md`；启动/验收打包应用、操作 `OpenChamberTest` 运行时目录，或涉及测试数据与正式用户数据的边界时先读它

## 项目 Skills

项目 Skills 位于 `.agents/skills/*/SKILL.md` 下。在进行编辑之前，你**必须**加载所有与改动性质匹配的 Skill；可能同时适用多个 Skill，其中也包括其他 Skill 所要求的配套 Skill。必须阅读这些 Skill 中指定的所有任务所需参考资料。对于详细工作流程和检查清单，Skills 是规范性来源。将下表视为可选建议属于流程违规。

**每个任务开始时，都必须首先加载 `.agents/skills/communication-style/SKILL.md`，并且要在任何分析、工具调用或响应之前完成。其指导规则应应用于所有消息和书面输出，而不仅限于面向用户的文案或文档。**

| 触发条件                                                             | 必需 Skill                        |
| ---------------------------------------------------------------- | ------------------------------- |
| 源代码/依赖变更、导出或包契约、构建/生成资源，或模块归属                                    | `openchamber-change-discipline` |
| CLI 命令、提示、终端输出、非 TTY、`--quiet` 或 `--json` 行为                     | `clack-cli-patterns`            |
| 共享 UI 数据访问、OpenCode SDK 或服务器路由、`RuntimeAPIs`、运行时鉴权/URL、桥接层或运行时切换 | `ui-api-decoupling`             |
| Electron main/preload、IPC、原生 UI、更新器、深度链接、SSH/隧道、打包或子进程           | `desktop-shell`                 |
| Session 同步、初始化/重连、Reducer、轮询、乐观状态、队列、实时状态、协调，或目录作用域缓存            | `sync-state-invariants`         |
| 渲染/Store/事件热路径、大型列表、缓存/索引，或已报告的延迟、卡死、CPU/内存、启动或性能回退问题            | `performance-engineering`       |
| WebSocket、SSE、流式传输、运行时传输内部机制或私有中继                                | `relay-transport`               |
| UI 组件、样式、颜色、按钮或图标                                                | `theme-system`                  |
| 面向用户或无障碍 UI 文本、标签、aria、Toast、对话框或导航文案                            | `locale-ui-patterns`            |
| 设置 UI、设置对话框、配置界面或设置搜索                                            | `settings-ui-patterns`          |
| 可排序或拖拽重排行为，尤其是 `@dnd-kit` 以及触控/换行布局                              | `drag-to-reorder`               |
| iOS Simulator 构建、启动、预览、手势或 `serve-sim` 控制                        | `serve-sim`                     |
| 为 `[Unreleased]` 部分（主应用或 VS Code 扩展）起草或更新面向用户的 CHANGELOG 条目      | `changelog-authoring`           |
| 创建或编辑 Skills、`AGENTS.md`，或通过 Agent 指令/上下文指针访问到的文档                | `writing-for-agents`            |

表中每个 Skill 同时是其触发条件所列关注点的规范归属方：每条跨领域规则只有一个归属 Skill。在向某个 Skill 添加指导规则之前，先确定该规则的规范归属方；如果该规则由另一个 Skill 负责，则添加一个精确的配套引用，并且只写明本地领域的影响，不要复制规则。

单纯阅读代码或进行解释不需要加载实现类 Skills，除非为了理解某个专门的子系统而确有必要。

## 验证

* 将 `package.json` 中的脚本作为命令的权威来源。
* 对可执行源代码改动，优先运行针对性测试，以及包级作用域的类型检查/lint。
* 对跨 workspace 契约、根级工具、依赖或共享生成资源，使用 workspace 全局检查。
* 当添加/删除/重命名源文件，或者修改导出、类型、入口点或 import 形态时，运行 `bun run dead-code`；由于该检查不会阻塞流程，因此需要人工检查其报告。
* 对你创建或大幅重写的 TypeScript/JavaScript 文件运行 `bunx oxlint <changed-paths>`。这会运行项目内置的 `anti-slop` 插件，该插件会拒绝缺乏充分依据的类型处理方式：无正当理由的类型断言、`unknown`/`object`/`Record<string, unknown>` 契约、临时拼凑的 `typeof` 类型收窄，以及模块 Mock。修复你自己编写的代码中发现的问题。其他位置预先存在的问题属于已知积压项：不要大规模修复它们，也绝不要为了让检查通过而禁用规则、降低严重级别，或通过包装/洗白类型来规避规则。
* 不要假设 TypeScript/lint 能覆盖服务端 JS、CLI JS、Electron 辅助代码或原生行为；针对受影响的界面运行相应的针对性测试、语法检查、构建或运行时验证。
* 对仅修改文档或孤立配置的情况，运行范围最窄且相关的验证。
* 准确报告哪些内容已经验证、哪些没有验证。单纯的静态检查无法证明运行时、中继、性能或平台行为的正确性。

## Pull Request 交接

在创建或更新 Pull Request 之前，阅读 `CONTRIBUTING.md` 和 `.github/PULL_REQUEST_TEMPLATE.md`。使用针对最终 PR HEAD 的具体、最新证据完整填写模板；不要迫使审查者仅依靠 diff 自行还原改动意图、受影响界面、适用指导规则、验证情况、视觉行为，以及失败和回滚方面的考虑。
