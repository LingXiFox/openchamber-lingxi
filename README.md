[简体中文](README.md) | [English](README.en.md)

# <picture><source media="(prefers-color-scheme: dark)" srcset="docs/references/badges/openchamber-logo-dark.svg"><img src="docs/references/badges/openchamber-logo-light.svg" width="32" height="32" align="absmiddle" /></picture> OpenChamber 泠溪小狐狸版

> [!IMPORTANT]
> **OpenChamber 泠溪小狐狸版** 是 [OpenChamber](https://github.com/openchamber/openchamber) 的独立下游发行版。
> 本项目持续跟踪上游，同时加入泠溪小狐狸专属的集成、工作流与产品改动。本项目并非 OpenChamber 官方发行版。


[![GitHub stars](https://img.shields.io/github/stars/LingXiFox/openchamber-lingxi?style=flat&labelColor=100F0F&color=66800B)](https://github.com/LingXiFox/openchamber-lingxi/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/LingXiFox/openchamber-lingxi?style=flat&labelColor=100F0F&color=205EA6)](https://github.com/LingXiFox/openchamber-lingxi/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join.svg?style=flat&labelColor=100F0F&color=8B7EC8&logo=discord&logoColor=FFFCF0)](https://discord.gg/ZYRSdnwwKA)
[![Support the project](https://img.shields.io/badge/Support-Project-black?style=flat&labelColor=100F0F&color=EC8B49&logo=ko-fi&logoColor=FFFCF0)](https://ko-fi.com/G2G41SAWNS)

## 运行 Agent，保持掌控，随时随地交付。

**OpenChamber 是一个开源工作空间，用于在桌面端、浏览器、编辑器和移动设备上运行、监督并审查 AI 编程任务。**

OpenChamber 将 Agent 调度、改动理解和发布流程集中在同一个工作空间中。即使切换设备或暂时离开，你的项目与任务仍会持续保持可用。

![OpenChamber Chat](docs/references/chat_example.png)

<details>
<summary>更多截图</summary>

<p>
<img src="docs/references/pwa_chat_example.png" width="45%" alt="OpenChamber PWA chat">
<img src="docs/references/pwa_diff_example.png" width="45%" alt="OpenChamber PWA diff review">
</p>

</details>

## OpenChamber 能做什么

### 自动持续推进的目标

通过 **Session Goals（会话目标）** 为会话设定明确的完成条件。OpenChamber 会在每一轮结束后检查结果，并让 Agent 持续工作，直到目标完成、遇到阻塞，或达到你设定的限制——即使你已经关闭应用。

### 对比并合并多次运行

使用 **Multi-run（多模型并行运行）**，可以把同一个任务同时交给最多五个模型，每个模型拥有独立会话，并可选择使用独立 worktree。你可以查看每个模型实际完成了什么、选择最佳结果，或使用 **Fusion** 将多个结果中最优秀的部分整合到一个新会话中。

### 引导式代码改动讲解

**Changes Walkthrough（改动讲解）** 会把大型 diff 转化为由 AI 引导的改动导览。它会将相关修改按步骤分组，以更容易理解的顺序组织，并解释各部分改动之间是如何关联的。

### 检查正在运行的应用

使用 **Preview（预览）**，可以在会话旁边直接打开你的应用。选中某个界面元素后，可将它的截图、样式、位置以及浏览器错误一并发送给 Agent，让“这里这个东西”不再缺少上下文。桌面版还可以通过内置浏览器，把同样的工作流应用到任意网页。

### 从 Issue 到 Pull Request 的 GitHub 上下文

可以直接从 GitHub Issue 或 Pull Request 创建会话，并自动携带相关上下文。你也可以把失败的检查结果或代码审查意见发送回 Agent，再直接从 OpenChamber 中更新或合并 Pull Request。

### 在其他设备上继续工作

可以从桌面端、Web/PWA、iOS 或 Android 打开同一个项目和会话。你可以随时查看进度、回答问题、审查改动，并重新连接到仍在运行的终端。

### 私有远程访问

通过一次性二维码完成设备配对后，可以使用 **Private Relay（私有中继）** 进行连接，无需开放端口，也无需暴露公网服务器。连接采用端到端加密，并可随时撤销。同时也支持直接连接、局域网/VPN、Cloudflare/Ngrok 隧道以及 SSH。

### 跨项目跟踪工作

可以查看各个会话当前是运行中、等待中、已完成还是失败，同时掌握审批、计划任务、Provider 限额、Token 使用量和成本等信息。你还可以使用文件夹整理会话，并在项目旁集中保存笔记、待办事项以及可复用的项目操作。

### 安排周期性任务

可以让一个 Prompt 单次运行，也可以按每天、每周或 Cron 计划周期执行。计划任务同样支持 **Session Goals（会话目标）**，因此 Agent 可以持续朝目标推进，而不是完成一次回复后就停止。

## 在你常用的平台上使用

| 平台 | 用途 |
| --- | --- |
| **桌面端** | 面向 macOS、Windows 和 Linux 的完整工作空间，支持多窗口、Mini Chat、远程机器、SSH 和原生通知 |
| **Web / PWA** | 在浏览器中打开工作空间，也可安装为应用，并通过后台通知持续获取最新状态 |
| **VS Code** | **暂不支持。** 泠溪小狐狸版目前尚未提供自己的 VS Code 扩展 |
| **iOS / Android** | 离开电脑后继续审查和指导任务，接收完成通知，并使用适配触控操作的终端 |
| **CLI / Server** | 在工作站或服务器上运行 OpenChamber，安排计划任务、管理远程访问，并让服务在登录后持续可用 |

## 快速开始

### 桌面端 — macOS、Windows 与 Linux

从 [GitHub Releases](https://github.com/LingXiFox/openchamber-lingxi/releases/latest) 下载最新的 OpenChamber 泠溪小狐狸版。桌面端会自带匹配版本的 OpenCode CLI，无需另外安装 OpenCode。

Linux 版本提供 x86_64 和 ARM64 两种 AppImage。下载后需要先赋予 AppImage 可执行权限，并将其放在具有写入权限的位置，以便应用内更新：

```bash
chmod +x OpenChamber-*.AppImage
./OpenChamber-*.AppImage
```

Linux AppImage 需要 FUSE（`libfuse.so.2`）。如果系统未安装 FUSE，可以通过设置 `APPIMAGE_EXTRACT_AND_RUN=1` 来运行。

### VS Code

> [!NOTE]
> **泠溪小狐狸版目前暂不支持 VS Code 扩展。**
> Visual Studio Marketplace 上的 OpenChamber 扩展属于上游官方版本，不包含 LingXiFox 专属改动。

### CLI — Web 与 PWA

> [!NOTE]
> **泠溪小狐狸版目前尚未提供独立发布的 CLI/Web 安装包。**
> 下方一键安装命令安装的是 OpenChamber 上游官方 `@openchamber/web` 包，不包含 LingXiFox 专属改动。泠溪小狐狸版目前请通过源码或本仓库发布的桌面版本使用。

上游 CLI/Web 需要 Node.js 22 或更高版本，并会使用你本机已经安装的 [OpenCode CLI](https://opencode.ai)。

```bash
curl -fsSL https://raw.githubusercontent.com/openchamber/openchamber/main/scripts/install.sh | bash
openchamber --ui-password be-creative-here
```

常用操作：

```bash
openchamber status
openchamber connect-url --qr
openchamber tunnel start --provider cloudflare --mode quick --qr
openchamber startup enable
openchamber logs
openchamber stop
openchamber update
```

OpenChamber 默认只监听 localhost。仅应在可信网络中使用 `--lan`，并使用 `--ui-password` 保护浏览器访问。

## 使用指南

通过以下指南进一步了解 OpenChamber：

- [快速开始](packages/docs/content/docs/quickstart.mdx)
- [安装](packages/docs/content/docs/install.mdx)
- [连接设备](packages/docs/content/docs/connect-devices.mdx)
- [私有中继](packages/docs/content/docs/private-relay.mdx)
- [多模型并行运行](packages/docs/content/docs/multi-run.mdx)
- [会话目标](packages/docs/content/docs/session-goals.mdx)
- [改动讲解](packages/docs/content/docs/walkthrough.mdx)
- [预览与开发服务器](packages/docs/content/docs/preview.mdx)
- [GitHub 工作流](packages/docs/content/docs/github.mdx)
- [移动端](packages/docs/content/docs/mobile.mdx)
- [安全](packages/docs/content/docs/security.mdx)
- [故障排查](packages/docs/content/docs/troubleshooting.mdx)

有关自托管的详细说明，请参阅[反向代理指南](docs/REVERSE_PROXY.md)。如需制作自定义主题，请参阅[自定义主题指南](docs/CUSTOM_THEMES.md)。

## 为什么选择 OpenCode？

OpenChamber 使用 [OpenCode](https://opencode.ai) 作为其编程 Agent 的基础。我们选择它，是因为我们认为 OpenCode 提供了目前最优秀的开源 Agent 编程体验之一：能力强、可扩展，并且从设计上保持开放。

在这一基础之上，OpenChamber 将 Agent 运行前、中、后的工作整合到一起——决定要尝试什么、让任务保持在正确方向上、审查结果、从任意位置连接，并最终推动改动完成交付。

OpenChamber 是一个独立项目，与 OpenCode 团队不存在隶属或官方关联。

## 参与贡献

开发环境配置与贡献规范请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。文档编写说明位于 [`packages/docs`](packages/docs/README.md)。

## 致谢

特别感谢：

- [OpenCode](https://opencode.ai)：提供优秀的 API 与可扩展的开源架构
- [Pierre](https://pierrejs-docs.vercel.app/)：提供快速的 diff 查看器与语法高亮
- [Ghostty-web](https://github.com/coder/ghostty-web)：提供 Ghostty Web 渲染器
- [Yulia Ivashko](https://github.com/yulia-ivashko)：制作了每次成功 push 后播放的烟花庆祝效果
- 所有通过代码、想法与对细节的关注共同塑造 OpenChamber 的贡献者

## 许可证

本项目基于 [MIT License](LICENSE) 发布。

OpenChamber 上游项目的原始版权声明与许可条款保持不变。**OpenChamber 泠溪小狐狸版**由 [LingXiFox](https://github.com/LingXiFox) 维护。
