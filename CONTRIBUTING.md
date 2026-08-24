# 为 OpenChamber 做贡献

## 开始使用

```bash
git clone https://github.com/openchamber/openchamber.git
cd openchamber
bun install
```

## 开发脚本

除非某一节另有说明，否则请从项目根目录运行命令。

### Web

| 脚本                     | 说明                                                         | 端口                           |
| ---------------------- | ---------------------------------------------------------- | ---------------------------- |
| `bun run dev`          | 默认的 Web HMR 开发流程。                                          | 自动选择开发端口                     |
| `bun run dev:web:full` | 构建监听器 + Express 服务器。无 HMR——修改后需要手动刷新。                      | `3001`（服务器 + 静态资源）           |
| `bun run dev:web:hmr`  | Vite 开发服务器 + Express API。**要使用 HMR，请打开 Vite URL，而不是后端地址。** | `5180`（Vite HMR）、`3902`（API） |
| `bun run start:web`    | 启动打包后的 Web 服务器。                                            | 默认 `3000`                    |

以上流程均可通过环境变量配置：`OPENCHAMBER_PORT`、`OPENCHAMBER_HMR_UI_PORT`、`OPENCHAMBER_HMR_API_PORT`。

### 桌面端（Electron）

```bash
bun run electron:dev          # HMR Web UI + Electron 外壳
bun run electron:dev:bundled  # Electron 外壳，使用已构建的 Web 资源
bun run electron:build        # 为当前平台打包桌面应用
```

桌面端支持 macOS、Windows 和 Linux。构建产物会写入 `packages/electron/dist`。

macOS 构建会创建 `dmg` 和 `zip` 文件。进行公证打包和图标资源处理需要 Xcode/构建工具。

Windows 构建会创建 NSIS 安装程序。如果未设置签名环境变量，构建脚本会生成未签名的安装程序。

Linux 构建会针对原生 x64 或 arm64 主机生成 AppImage。

有关桌面端的具体细节，请参阅 [`packages/electron/README.md`](./packages/electron/README.md)。

### VS Code 扩展

```bash
bun run vscode:dev      # 监听模式 + Extension Development Host
bun run vscode:build    # 构建扩展 + Webview
bun run vscode:package  # 创建本地 .vsix 包
```

`bun run vscode:dev` 会自动打开 Extension Development Host。你可以通过 `OPENCHAMBER_VSCODE_BIN` 和 `OPENCHAMBER_VSCODE_DEV_WORKSPACE` 覆盖编辑器或工作区。

示例：`OPENCHAMBER_VSCODE_BIN=cursor bun run vscode:dev`。

### 共享 UI（`packages/ui`）

没有独立的应用服务器。这是由 Web、桌面端和 VS Code 共用的源码级库。

常用的软件包命令：

```bash
bun run build:ui
bun run type-check:ui
bun run lint:ui
```

## 构建和打包命令

| 命令                       | 作用                           |
| ------------------------ | ---------------------------- |
| `bun run build`          | 构建所有工作区                      |
| `bun run build:web`      | 仅构建 `packages/web`           |
| `bun run build:ui`       | 仅构建 `packages/ui`            |
| `bun run build:electron` | 运行 Electron 包构建脚本，但不进行完整打包   |
| `bun run electron:build` | 为当前操作系统构建打包后的桌面应用            |
| `bun run vscode:build`   | 构建 VS Code 扩展                |
| `bun run vscode:package` | 将 VS Code 扩展打包为 `.vsix`      |
| `bun run pack:web`       | 为 `@openchamber/web` 创建软件包归档 |

## 平台构建说明

通常应当在目标平台上构建桌面端安装程序。

macOS：

```bash
bun run electron:build
bun run release:test:intel
bun run release:test:arm
```

Windows：

```bash
bun run electron:build
```

Linux x64 和 arm64 AppImage 会在对应架构的主机上进行原生打包。使用 Bun 安装依赖并协调打包流程：

```bash
OPENCHAMBER_TARGET_ARCH=x64 bun run electron:build
# 在 arm64 主机上：
OPENCHAMBER_TARGET_ARCH=arm64 bun run electron:build

bun run --cwd packages/electron verify:linux-appimage
```

最终的 AppImage 验证器会检查桌面应用标识，以及 Electron、捆绑的 OpenCode CLI 和已打包原生模块的架构。

## 提交前

```bash
bun run type-check   # 必须通过
bun run lint         # 必须通过
bun run test         # 必须通过
bun run build        # 必须成功
```

`bun run test` 会运行仓库中的所有测试套件：共享 UI、VS Code、Electron、Web/服务器以及根目录脚本。UI、VS Code 和 Electron 测试套件会保留模块级单例，因此 `scripts/run-isolated-tests.mjs` 会让每个测试文件在各自独立的进程中运行，避免测试结果由模块加载顺序决定。迭代开发时，可以直接运行单个文件（`bun test <file>`）。

如果只是修改文档，进行以下验证可能就足够了：

```bash
bun run docs:validate
```

## 代码风格

* 仅使用函数式 React 组件
* TypeScript 严格模式——除非有充分理由，否则不得使用 `any`
* 使用 `packages/ui/src/lib/theme/` 中已有的主题颜色/字体样式——不要新增
* 组件必须同时支持浅色和深色主题
* 优先使用提前返回以及 `if/else`/`switch`，避免嵌套三元表达式
* 使用 Tailwind v4 进行样式设计；排版通过 `packages/ui/src/lib/typography.ts` 处理

## Pull Request

Pull Request 是一次面向审查者的工作交接，而不仅仅是一份 diff。审查者必须能够理解预期行为、评估风险并验证结果，而无需自行重新梳理贡献者完成的工作。

在创建 Pull Request 之前：

1. 阅读 [`AGENTS.md`](./AGENTS.md)、所有与本次变更性质相匹配的项目 Skill，以及最近的软件包 README 和模块 `DOCUMENTATION.md`。
2. 保持变更聚焦。将无关的清理或重构拆分出去。
3. 执行适用项目指南要求的验证，而不仅仅是上面列出的通用命令。
4. 使用具体且最新的证据完整填写 Pull Request 模板。

### Pull Request 契约

每个 Pull Request 都必须说明：

* **意图（Intent）：** 要解决的用户或维护者问题，以及最终产生的行为。
* **非目标（Non-goals）：** 当范围可能存在歧义时，明确说明哪些邻近行为有意保持不变。
* **受影响范围（Affected surfaces）：** 受本次变更影响的软件包、运行时、持久化/外部契约以及用户可见状态。
* **仓库指南（Repository guidance）：** 哪些 Skill 和归属文档适用于此次变更、为什么适用，以及实现如何满足其中的重要约束。
* **验证（Validation）：** 实际执行的自动和手动检查、准确结果，以及任何尚未验证的内容。仅提供命令名称而没有结果不能算作证据。
* **风险和失败行为（Risk and failure behavior）：** 有意义的失败、回滚、清理、兼容性、安全性、性能或跨运行时注意事项。

不得仅凭类型检查或 lint 就声称某个运行时、平台、中继路径、性能特征或交互行为是正确的。如果无法执行必要验证，必须明确说明这一点并解释原因。

### 可视化证据

用户可见的变更必须提供证据，使审查者能够比较变更前后的行为。静态状态请附截图；涉及动画、手势、拖放、焦点或多步骤交互时，请附一段简短录屏。

关于性能、内存、CPU、渲染、启动时间或类似实测行为的声明，必须提供相关的变更前后测量结果。

根据受影响的行为选择证据：

* 包含变更前和变更后的状态。如果无法捕获有意义的变更前状态，请说明原因。
* 当共享 UI 或响应式 UI 受到影响时，同时提供窄屏/移动端和桌面端状态。
* 当颜色、样式、界面表面或视觉状态发生变化时，同时提供浅色和深色状态。
* 当变更会影响加载、空状态、错误、禁用、长内容或高对比度状态时，提供相应状态。
* 对于 Settings 变更，展示相关的窄屏和宽屏设置面板状态。

证据必须对应当前 Pull Request 的 HEAD。实现发生可能影响所展示行为的变更后，应重新生成证据，或者说明现有证据为什么仍然有效。如果确实没有任何用户可见变更，请明确说明并提供具体理由；删除证据章节并不能构成豁免。

### 审查执行机制

自动审查器会统一审查正确性、仓库指南合规性、Pull Request 质量和证据。它会根据当前 diff 的变更性质独立判断哪些项目 Skill 适用，读取这些 Skill 及其要求的参考资料，然后依据它们检查实现。

审查器会记录它实际检查的准确 HEAD，并返回以下一种结论：

* `PASS`：未发现阻塞性的正确性、合规性或证据问题。
* `NEEDS_EVIDENCE`：未发现正确性、仓库指南或贡献契约方面的阻塞问题，但所需的截图、交互录屏或实测数据缺失、过时、相互矛盾或不充分。
* `BLOCKED`：存在具体的正确性、安全性、仓库规则或贡献契约违规，必须修复。
* `HUMAN_REVIEW_REQUIRED`：变更影响了审查策略或其他自动化不得自行批准的边界，需要人工审查。

工作流会使用且仅使用一个 readiness 标签表示当前状态：

`review:pending`、`review:ready`、`review:needs-evidence`、`review:blocked`、`review:human-required` 或 `review:automation-failed`。

开始新的审查时，会先移除之前的 readiness 标签；只有 `review:ready` 表示 Pull Request 已准备好进入维护者审查队列。Draft Pull Request 不具有 readiness 标签。

AI 审查结论仅作为建议，永远不会让 Pull Request 检查本身失败。就绪状态只通过 `review:*` 标签和不可变的审查评论传达。只有当工作流本身无法完成或无法验证出可信结果时，`automation` job 才会失败，此时会应用 `review:automation-failed`。

每次完成审查都会创建一条与被审查 HEAD 绑定的新评论，以保持讨论记录的时间顺序。之前的审查评论不会被改写。

### 保持 PR 活跃

过时的 PR 会增加审查负担，也让人难以判断哪些工作仍在继续，因此 stale bot 会保持开放 PR 列表处于最新状态。PR 连续 28 天没有活动时会自动添加 `stale` 标签；如果之后继续保持不活跃，则会在 7 天后关闭。要保持 PR 开放：

* 推送更新或回复审查反馈
* 如果正在等待审查者，请留一条评论
* 添加 `pinned`、`security` 或 `help wanted` 标签，让长期运行的 PR 不受 stale bot 影响

如果已经关闭的 PR 后来重新变得相关，可以重新打开。

## 项目结构

```text
packages/
  ui/
  web/
  electron/
  vscode/
  mobile/
  docs/
```

各包职责边界见 [AGENTS.md](./AGENTS.md) 的「运行时边界」一节。

## 不是开发者？

你仍然可以提供帮助：

* 报告 bug 或 UX 问题——即使只是“这里让我觉得很困惑”，也是有价值的反馈
* 在不同设备、浏览器或操作系统版本上进行测试
* 通过 issue 提出功能或改进建议
* 在 Discord 中帮助其他人

## 有问题？

创建一个 [issue](https://github.com/openchamber/openchamber/issues)，或者在 [Discord](https://discord.gg/ZYRSdnwwKA) 中提问。 
