# Lingxi fork 维护指南

本仓库是 OpenChamber 的个人下游 fork。维护目标是持续接收上游更新，同时保留少量自有 patch；不重构上游结构，不重排目录，不删除上游功能。暂时不用的上游功能通过 feature flag 关闭。

## 分支模型

提交号会随同步和 patch 换底座而变化，以 `git branch -vv` 为准。长期结构如下：

```text
main                              上游同步基座；日常只合并人工确认过的 sync/* PR
 ├─ feat/background-transparency  活跃 patch
 ├─ chore/macos-remote-build      活跃 patch
 ├─ docs/lingxi-design-notes      设计与维护文档，纯新增
 └─ feat/sub2api-quota-v2         开发中的 patch

archive/sub2api-quota-pre-squash  冻结快照，不跟随 main
backup/*-20260822                 本地恢复点，并有同名 backup tag
```

`main` 只作为同步基座使用。除同步与 drift check 这类 fork 维护基建外，不再把自有功能 squash 进 `main`。

| 命名 | 用途 | 生命周期 |
|---|---|---|
| `feat/*` | 自有功能 | 长期存活，定期换到最新 `main` |
| `fix/*` | 修复上游 bug | 目标是尽快向上游提 PR；上游合并后删除本地 patch |
| `chore/*` | 身份、配置、构建相关的永久 patch | 长期存活，定期换底座 |
| `docs/*` | 设计文档与维护文档 | 只新增文件，保持零冲突区 |
| `archive/*` | 冻结历史快照 | 不 rebase，不参与 drift check 或 release |
| `backup/*` | 临时恢复点 | 与同名 tag 配套；可靠恢复点以 tag 为准 |
| `release/*` | 临时发版拼装分支 | 每次从 `main` 丢弃重建，不维护历史 |

新 patch 一律从 `main` 分叉。只有存在真实的代码依赖时才使用 stacked patch；不要为了提交顺序方便而堆叠分支。

## 同步流程

```bash
# 1. 每日 Action 建 sync/* PR，人工扫 diff 后 merge 进 main

# 2. 每条 patch 换底座
git checkout <branch> && git rebase main

# 3. 需要发版时重建 release
git checkout -B release/lingxi main
git merge --no-ff <patch-branches...>
```

`release/lingxi` 每次用 `-B` 丢弃重建，不维护其历史。某条 patch 冲突严重时可以暂时跳过，先发布一个不含该功能的版本。`archive/*` 与 `backup/*` 不换底座，也不参与 release 拼装。

## 冲突处理

下面三个动作都不是失败，而是不同的维护决定：

- `git rebase --continue`：解决冲突后继续。问题不是“把两段代码拼起来”，而是“这个 patch 当初要达成什么效果，在上游的新写法下怎样达成同样效果”。
- `git rebase --skip`：上游已经实现该功能，丢掉这条 patch。这是好消息，意味着少维护一条 patch。
- `git rebase --abort`：当前解不动就撤退。先发布一个不含该功能的 release，改天再修。

`bun.lock` 冲突永不手动合并，一律重新生成：

```bash
git checkout --theirs bun.lock
bun install
```

## 降低冲突面积

逻辑放在新文件里，在上游文件中只留最小接入点。

- 直接修改上游函数内部 5 行，上游改动该函数时就容易冲突。
- 新建一个文件，再在上游文件中加入 1 行调用，通常只需维护这个接入点。

已识别的高风险区是 11 个语种的设置文案：

```text
packages/ui/src/lib/i18n/messages/*.settings.ts
```

上游每加功能都可能修改这批文件。后续新增 i18n 字符串时，应放入独立的 `messages/lingxi/<locale>.*.ts` 文件，并在上游文件中只加 1 行 spread。

## 本仓库的坑

1. **`gh` 命令必须显式指定仓库。** 所有命令都带 `-R LingXiFox/openchamber-lingxi`。本仓库配置了 upstream remote，`gh` 默认可能解析到上游 `openchamber/openchamber`，曾差点对上游仓库执行操作。
2. **备份用 tag，不要依赖分支。** `rebase.updateRefs=true` 会移动任何指向改写范围内 commit 的本地分支，包括看似安全的 `backup/*`。本仓库已经发生过一次，现已将 `rebase.updateRefs` 设为 `false`。
3. **自有功能不要 squash 进 `main`。** Squash 会改变 patch 形状，原分支变成“幽灵”：内容已在 `main`，拓扑上仍显示领先，rebase 无法自动去重。Sub2API、桌面身份和主题基础都因此产生过困惑。
4. **判断 commit 是否已进入 `main`，以 tree hash 或 `git merge-tree` 预演为准。** `git cherry` 的 patch-id 包含上下文行，在 squash 场景下可能误报。基线不同的两个 commit 做整树比较会混入大量无关差异，也不构成证据。
5. **`git stash show` 默认不显示未追踪文件。** 看似空的 stash 可能包含整份新文档，必须加 `--include-untracked` 再判断。
6. **Fork 会继承上游机器人 workflow。** 其中 12 个 workflow 已在服务器端禁用，包括 bot-help、triage、stale、Release 和 Publish VS Code Extension 等。`stale` 尤其危险，它会自动关闭长期未处理的 sync PR。
7. **patch-drift-check 只探测，不执行。** `permissions: contents: read` 从令牌层面杜绝 push。CI 红了表示某条 patch 需要人工 rebase，不是仓库坏了；CI 绿了可以放心推迟同步。

## 常用命令

查看分支及其 tracking 状态：

```bash
git branch -vv
```

查看 patch 相对 `main` 的落后与领先提交数，输出依次是 behind 和 ahead：

```bash
git rev-list --left-right --count main...<branch>
```

手动触发 drift check，并查看最近运行：

```bash
gh workflow run patch-drift-check.yml --ref main -R LingXiFox/openchamber-lingxi
gh run list --workflow patch-drift-check.yml --limit 5 -R LingXiFox/openchamber-lingxi
```

检查某条 patch 换底座前可能产生的合并结果：

```bash
git merge-tree "$(git merge-base main <branch>)" main <branch>
```

需要发版时重新拼装：

```bash
git checkout -B release/lingxi main
git merge --no-ff feat/background-transparency
git merge --no-ff chore/macos-remote-build
# 按完成情况继续加入其他 patch；冲突严重的 patch 可以暂时跳过。
```
