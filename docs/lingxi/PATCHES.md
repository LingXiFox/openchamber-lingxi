# Lingxi patch 台账

本文件记录长期 patch、冻结快照，以及已经直接进入 `main` 的下游改动。维护流程见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

“是否已向上游提 PR”只记录能够从当前仓库确认的事实。现有本地提交和 fork 分支不能证明上游 PR 状态，因此相关项标为“待补”。

## 当前 patch

| 分支 | 解决什么问题 | 触碰的上游文件 | 是否已向上游提 PR | 备注 |
|---|---|---|---|---|
| `feat/background-transparency` | 为 Electron 桌面工作区增加背景图片、透明度和设置入口，并接入布局、样式、设置搜索与 11 个语种的文案。 | 22 个文件，见下方清单 | 待补 | 活跃 patch；当前为 1 个 commit |
| `chore/macos-remote-build` | 增加从当前环境调用远端 macOS 主机构建和签名的脚本与 package 命令。 | 5 个文件，见下方清单 | 待补 | 活跃永久 patch；当前为 1 个 commit |
| `feat/sub2api-quota-v2` | 继续开发 Sub2API quota provider。 | 待补，目前没有独有 commit | 待补 | 开发中；创建时等于当时的 `main` |
| `archive/sub2api-quota-pre-squash` | 保存 Sub2API quota provider 在 squash 前的完整实现和后续本地修复。 | 24 个文件，见下方清单 | 待补；fork 内 #8 不是上游 PR | 冻结快照；#8 squash 进入 `main` 后原 patch 拓扑无法自动去重，因此不再 rebase，后续开发转到 `feat/sub2api-quota-v2` |

### `feat/background-transparency`

来源提交：`08c1fe1d9 feat(desktop): add workspace background appearance`

- `packages/electron/README.md`
- `packages/electron/background-appearance.mjs`（新增）
- `packages/electron/background-appearance.test.mjs`（新增）
- `packages/electron/main.mjs`
- `packages/ui/src/components/layout/MainLayout.tsx`
- `packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx`
- `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- `packages/ui/src/components/views/SettingsWindow.tsx`
- `packages/ui/src/hooks/useDesktopBackgroundAppearance.ts`（新增）
- `packages/ui/src/lib/i18n/messages/de.settings.ts`
- `packages/ui/src/lib/i18n/messages/en.settings.ts`
- `packages/ui/src/lib/i18n/messages/es.settings.ts`
- `packages/ui/src/lib/i18n/messages/fr.settings.ts`
- `packages/ui/src/lib/i18n/messages/ja.settings.ts`
- `packages/ui/src/lib/i18n/messages/ko.settings.ts`
- `packages/ui/src/lib/i18n/messages/pl.settings.ts`
- `packages/ui/src/lib/i18n/messages/pt-BR.settings.ts`
- `packages/ui/src/lib/i18n/messages/uk.settings.ts`
- `packages/ui/src/lib/i18n/messages/zh-CN.settings.ts`
- `packages/ui/src/lib/i18n/messages/zh-TW.settings.ts`
- `packages/ui/src/lib/settings/search.ts`
- `packages/ui/src/styles/design-system.css`

### `chore/macos-remote-build`

来源提交：`c2bf653db feat(build): add remote macOS signing build workflow`

- `.gitignore`
- `package.json`
- `packages/electron/README.md`
- `scripts/build-macos-remote-worker.sh`（新增）
- `scripts/build-macos-remote.sh`（新增）

### `archive/sub2api-quota-pre-squash`

冻结 tip：`afbbd5e01`。清单来自该分支与 `main` 的 merge-base 到冻结 tip 的实际差异。

- `packages/electron/README.md`
- `packages/electron/ipc-sender-policy.mjs`（新增）
- `packages/electron/ipc-sender-policy.test.mjs`（新增）
- `packages/electron/main.mjs`
- `packages/ui/src/components/layout/Header.tsx`
- `packages/ui/src/components/layout/VSCodeLayout.tsx`
- `packages/ui/src/components/sections/usage/QuotaCredentials.tsx`
- `packages/ui/src/components/sections/usage/UsagePage.tsx`
- `packages/ui/src/components/sections/usage/UsageSidebar.tsx`
- `packages/ui/src/components/usage/usageGroups.ts`
- `packages/ui/src/hooks/useTraySync.ts`
- `packages/ui/src/lib/quota/index.ts`
- `packages/ui/src/lib/quota/providers/index.ts`
- `packages/ui/src/stores/useQuotaStore.test.ts`（新增）
- `packages/ui/src/stores/useQuotaStore.ts`
- `packages/ui/src/types/quota.ts`
- `packages/web/server/lib/quota/DOCUMENTATION.md`
- `packages/web/server/lib/quota/credentials/providers.js`
- `packages/web/server/lib/quota/credentials/store.js`
- `packages/web/server/lib/quota/credentials/store.test.js`
- `packages/web/server/lib/quota/providers/index.js`
- `packages/web/server/lib/quota/providers/sub2api.js`（新增）
- `packages/web/server/lib/quota/providers/sub2api.test.js`（新增）
- `packages/web/server/lib/quota/routes.js`

## 已进入 `main` 的自有改动

这些提交不是当前上游同步内容。保留记录是为了避免以后把它们误认成新出现的上游代码，或再次创建同类 patch。

| 来源 | `main` commit | 内容 | 备注 |
|---|---|---|---|
| fork #1 | `032d985a8` | Lingxi PR guardrails | fork 基建 |
| fork #2 | `56724ba11` | 上游更新检查 | fork 基建 |
| fork #3 | `1a819ef01` | 安全的 upstream sync workflow | fork 基建 |
| fork #4 | `10a9e42c2` | 每日 upstream sync 调度 | fork 基建 |
| fork #5 | `db1623a48` | LingXiFox 下游身份文档 | README 与身份文档 |
| fork #6 | `ae4880fb1` | docs-only CI fast path | fork 基建 |
| fork #7 | `b1a43ea11` | README 排版整理 | README 与身份文档 |
| fork #8 | `8e733a91c` | Sub2API quota provider | squash 进入 `main`，功能未完成；squash 前历史保存在 `archive/sub2api-quota-pre-squash` |
| fork #9 | `afd6b754a` | LingXiFox 桌面身份隔离 | squash 进入 `main` |
| fork #11 | `fb4dcc2c5` | 主题外观 schema、安全资源处理及顶部校验加固 | squash 进入 `main` |
| 本仓库维护提交 | `1acd4879a` | patch drift check | 只探测四条维护分支能否换到 `origin/main`，令牌权限为 `contents: read` |
