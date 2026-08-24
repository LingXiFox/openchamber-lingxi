# OpenChamberTest 隔离测试环境说明

> 面向 Agent 的运行时/目录结构参考。  
> 根目录：`/Volumes/Development/Runtime/OpenChamberTest`

## 1. 这个目录是什么

`OpenChamberTest` 是用于 **OpenChamber LingXiFox 本地 macOS packaged `.app` 隔离验收** 的专用运行时目录。

它不是正式项目源码目录，也不是正式 OpenChamber/OpenCode 用户环境。它的目标是把未经验收的本地 `.app` 的运行状态、OpenChamber 数据、OpenCode 用户态数据、Electron/Chromium profile、测试输入/输出和测试 workspace 集中留在 `/Volumes/Development`，避免写回主用户正式环境。

核心原则：

- 测试 `.app` 不直接写正式 OpenChamber/OpenCode 数据。
- Electron/Chromium 测试 profile 不写正式 `~/Library/Application Support`。
- 测试产生的缓存、数据集、脚本、产物和 workspace 不散落到系统主卷。
- 可以把真实源码目录作为 OpenCode 工作目录，但运行状态仍留在本隔离区。
- 正式主用户数据默认禁止 Agent 触碰，除非任务明确要求。

## 2. 隔离启动映射

| 作用 | 环境变量 / 参数 | 路径 |
|---|---|---|
| 测试 HOME | `HOME` | `/Volumes/Development/Runtime/OpenChamberTest/home` |
| XDG 配置 | `XDG_CONFIG_HOME` | `/Volumes/Development/Runtime/OpenChamberTest/home/.config` |
| XDG 数据 | `XDG_DATA_HOME` | `/Volumes/Development/Runtime/OpenChamberTest/home/.local/share` |
| XDG 缓存 | `XDG_CACHE_HOME` | `/Volumes/Development/Runtime/OpenChamberTest/home/.cache` |
| OpenChamber 数据 | `OPENCHAMBER_DATA_DIR` | `/Volumes/Development/Runtime/OpenChamberTest/data` |
| OpenCode 工作目录 | `OPENCHAMBER_OPENCODE_CWD` | `/Volumes/Development/Projects/projects/openchamber-lingxi` |
| Electron/Chromium profile | `--user-data-dir` | `/Volumes/Development/Runtime/OpenChamberTest/electron-user-data` |

已验证的 packaged `.app` 启动方式：

```bash
env \
  HOME="/Volumes/Development/Runtime/OpenChamberTest/home" \
  XDG_CONFIG_HOME="/Volumes/Development/Runtime/OpenChamberTest/home/.config" \
  XDG_DATA_HOME="/Volumes/Development/Runtime/OpenChamberTest/home/.local/share" \
  XDG_CACHE_HOME="/Volumes/Development/Runtime/OpenChamberTest/home/.cache" \
  OPENCHAMBER_DATA_DIR="/Volumes/Development/Runtime/OpenChamberTest/data" \
  OPENCHAMBER_OPENCODE_CWD="/Volumes/Development/Projects/projects/openchamber-lingxi" \
  "/Volumes/Development/Projects/projects/openchamber-lingxi/packages/electron/dist/mac-arm64/OpenChamber LingXiFox.app/Contents/MacOS/OpenChamber LingXiFox" \
  --user-data-dir="/Volumes/Development/Runtime/OpenChamberTest/electron-user-data"
```

### 关键规则

**packaged `.app` 启动时绝对不要设置 `OPENCHAMBER_ELECTRON_DEV=1`。**

该变量会让 packaged 应用走 dev 资源路径，曾导致 `web-dist` 被错误解析到 `app.asar/dist-bundle/resources`。隔离应依赖 HOME/XDG/`OPENCHAMBER_DATA_DIR`/`--user-data-dir`，不是强制 dev mode。

---

## 3. 顶层结构

```text
OpenChamberTest/
├── app.log
├── artifacts/
├── data/
├── dataset/
├── electron-user-data/
├── home/
├── imports/
├── scripts/
└── workspace/
```

### `app.log`

测试或 wrapper 层日志。用于回看某次 isolated run；不是 OpenChamber 唯一日志来源。真正的 Electron/OpenChamber 日志还可能在 `home/Library/Logs/OpenChamber/main.log`。

### `artifacts/`

测试/benchmark 最终产物。

```text
artifacts/
└── p995-roundtrip.json
```

- `p995-roundtrip.json`：p995 / roundtrip 类测试结果。
- 属于可归档结果，不是运行依赖。

---

## 4. `data/` — OpenChamber 隔离数据根

`OPENCHAMBER_DATA_DIR` 指向这里。

```text
data/
├── agent-tool/
│   └── openchamber-plugin.js
├── backgrounds/
│   └── 7b2ecb6a-bba6-45cf-9579-5f13efb6bea0.jpg
├── discovered-apps.json
├── IMG_6383.JPG
├── opencode/
│   ├── log/
│   │   └── opencode.log
│   └── repos/
├── opencode-perf.db
├── opencode-perf.db-shm
├── opencode-perf.db-wal
├── quota/
│   └── sub2api.json
├── settings.json
├── settings.json.tmp-52652-1787537663123-z6ixd1
├── settings.json.tmp-54911-1787538229156-tgsvsl
└── settings.json.tmp-96573-1787493229586-4iysde
```

### `data/agent-tool/`

Agent/OpenChamber bridge 运行文件。

- `openchamber-plugin.js`：OpenChamber 提供给 Agent/OpenCode 的插件/桥接脚本。
- 不要把运行时副本当正式源码直接 patch；修改前先确认生成来源。

### `data/backgrounds/`

测试实例自定义背景资源。删除会影响测试实例对应背景，不属于缓存。

### `data/discovered-apps.json`

应用发现/扫描结果状态。排查 app discovery 时应保留；一般可由程序重新生成。

### `data/IMG_6383.JPG`

测试环境中的图片资源。不是 OpenChamber 核心运行文件。

### `data/opencode/log/opencode.log`

managed OpenCode 运行日志，用于排查启动、端口、工具、运行时等问题。

### `data/opencode/repos/`

repo 相关运行数据/索引区域。当前树未显示更深内容。不要误认为正式项目源码；正式源码仍在 `/Volumes/Development/Projects/...`。

### `data/opencode-perf.db*`

OpenCode performance/state 类 SQLite 文件及其 WAL/SHM。

**不要把 `opencode-perf.db` 误认为 OpenCode session 主数据库。**

隔离环境真正的 OpenCode 用户态 DB 通常位于：

```text
/Volumes/Development/Runtime/OpenChamberTest/home/.local/share/opencode/opencode.db
```

由于当前 `tree.txt` 没有 `-a`，隐藏目录不会显示在快照里。

SQLite 规则：

- 主 DB、`-wal`、`-shm` 应当整体看待。
- 运行期间不要手工删 WAL/SHM。
- 冷复制前先退出 OpenCode/OpenChamber，或使用 SQLite 正确备份方式。

### `data/quota/sub2api.json`

Sub2API quota / wallet / usage 类测试状态。用于 quota UI/provider 测试，不是正式生产 quota 数据。

### `data/settings.json`

隔离测试实例的 OpenChamber settings，属于重要测试配置。

### `data/settings.json.tmp-*`

`settings.json` 原子写入过程中产生的临时文件/残留。App 已退出且长期残留时可清理；运行中不要删。

---

## 5. `dataset/`

测试数据集的加工/筛选结果。

```text
dataset/
├── swe-smith-scan.json
├── swe-smith-selected.json
└── swe-smith-top20.jsonl
```

按文件名：

- `swe-smith-scan.json`：扫描/候选结果。
- `swe-smith-selected.json`：筛选后的样本集合。
- `swe-smith-top20.jsonl`：Top 20 JSONL 样本。

不是 OpenChamber 核心运行时；优先由 `scripts/` 中对应脚本生成。

---

## 6. `imports/`

测试输入/外部导入数据。

```text
imports/
├── swe-smith-max.json
└── swe-smith-p995.json
```

职责边界：

```text
imports/   = 输入
dataset/   = 加工后的数据集
artifacts/ = 测试执行结果
```

---

## 7. `scripts/`

OpenChamberTest 专用测试基础设施。

```text
scripts/
├── convert_swe_smith.py
├── fetch_selected_swe_smith.py
├── inspect_selected.py
├── inspect_swe_smith.py
├── openchamber-test
├── opencode-test
└── scan_swe_smith.py
```

按命名用途：

- `convert_swe_smith.py`：转换 SWE-Smith 数据。
- `fetch_selected_swe_smith.py`：拉取/整理已选样本。
- `inspect_selected.py`：检查筛选样本。
- `inspect_swe_smith.py`：检查 SWE-Smith 数据。
- `scan_swe_smith.py`：扫描 SWE-Smith 数据。
- `openchamber-test`：OpenChamberTest 启动/测试 wrapper；执行或修改前先阅读内容，确认 HOME/XDG/数据目录隔离参数。
- `opencode-test`：OpenCode 隔离测试 wrapper；执行前确认是否会启动 managed OpenCode、修改 DB 或覆盖状态。

`scripts/` 不是缓存，不要因“清理”而删除。

---

## 8. `workspace/`

专用测试工作区。

```text
workspace/
└── swe-smith/
    └── README.md
```

- `workspace/swe-smith/`：SWE-Smith 测试工作区。
- `workspace/swe-smith/README.md`：工作区说明。
- 不是正式源码根目录；真实 `openchamber-lingxi` 在 `/Volumes/Development/Projects/projects/openchamber-lingxi`。
- workspace 内临时变更不能直接视为正式项目改动。

---

## 9. `home/` — 隔离伪 HOME

当前可见树：

```text
home/
└── Library/
    └── Logs/
        └── OpenChamber/
            └── main.log
```

### `home/Library/Logs/OpenChamber/main.log`

测试 OpenChamber 的 Electron/main-process 日志。排查 resource resolution、server、managed OpenCode 等问题时优先保留。

### 隐藏 HOME 目录

当前 `tree.txt` 是普通 `tree` 输出，默认不显示 dot-directories。因此 `home/` 可见树不是完整 HOME。

此前该隔离环境已经确认存在的隐藏路径包括：

```text
home/
├── .cache/
│   └── opencode/
├── .config/
│   ├── openchamber/
│   └── opencode/
├── .local/
│   ├── share/
│   └── state/
├── .npm/
│   └── _cacache/
└── Library/
    └── Logs/
        └── OpenChamber/
            └── main.log
```

用途：

- `home/.config/openchamber/`：隔离 OpenChamber 配置。
- `home/.config/opencode/`：隔离 OpenCode 配置。
- `home/.local/share/opencode/`：隔离 OpenCode 用户态持久数据，通常包括 session DB。
- `home/.local/state/`：CLI/OpenCode state。
- `home/.cache/opencode/`：隔离 OpenCode 可重建缓存。
- `home/.npm/_cacache/`：隔离 HOME 下 npm cache。

**测试库不是正式主用户数据库。不要因为测试环境缺少历史会话而直接替换、共享或修改正式 DB。**

---

## 10. `electron-user-data/` — Electron/Chromium 隔离 profile

启动参数：

```text
--user-data-dir=/Volumes/Development/Runtime/OpenChamberTest/electron-user-data
```

作用：避免 packaged 测试 App 使用正式 Chromium/Electron profile。

### 顶层职责

| 路径 | 用途 | 可否重建 |
|---|---|---|
| `blob_storage/` | Chromium Blob storage | 通常可 |
| `Cache/` | HTTP cache | 可 |
| `Code Cache/` | JS/WASM 编译缓存 | 可 |
| `Cookies*` | Cookie DB/journal | 会影响测试登录态 |
| `DawnGraphiteCache/` | Dawn/Graphite 图形缓存 | 可 |
| `DawnWebGPUCache/` | WebGPU/Dawn 缓存 | 可 |
| `DIPS` | Chromium privacy/bounce-tracking 状态 | profile state |
| `GPUCache/` | GPU/renderer cache | 可 |
| `Local State` | Chromium global profile state | 不要运行中修改 |
| `Local Storage/leveldb/` | Web UI Local Storage | 状态数据 |
| `Network Persistent State` | 网络栈持久状态 | profile state |
| `Preferences` | profile preferences | 状态数据 |
| `Session Storage/` | sessionStorage LevelDB | 状态数据 |
| `Shared Dictionary/` | 压缩 shared dictionary | 多数可重建 |
| `SharedStorage` | Chromium Shared Storage | profile state |
| `Trust Tokens*` | Private State/Trust Token 状态 | profile state |
| `Partitions/openchamber-browser/` | 内置 browser panel 独立 partition | 独立 profile 分区 |

### `Cache/`

```text
Cache/
├── Cache_Data/
│   ├── <大量 hash>_0
│   ├── index
│   └── index-dir/
│       └── the-real-index
└── No_Vary_Search/
    ├── journal.baj
    └── snapshot.baf
```

- `Cache_Data/`：HTTP cache objects。
- `index` / `index-dir/the-real-index`：缓存索引。
- `No_Vary_Search/`：相关 cache metadata。
- App 完全退出后可整体清理。

### `Code Cache/`

```text
Code Cache/
├── js/
│   ├── index
│   └── index-dir/the-real-index
└── wasm/
    ├── index
    └── index-dir/the-real-index
```

V8/Chromium JS 与 WASM 编译缓存，可重建。

### `DawnGraphiteCache/` / `DawnWebGPUCache/` / `GPUCache/`

都由 Chromium/Electron 图形栈生成；属于可重建缓存。不要在应用运行中手工拆删内部 `data_*` 或 index。

### `Local Storage/leveldb/`

```text
Local Storage/
└── leveldb/
    ├── 000005.ldb
    ├── 000017.log
    ├── 000019.ldb
    ├── CURRENT
    ├── LOCK
    ├── LOG
    ├── LOG.old
    └── MANIFEST-000001
```

Chromium Local Storage 的 LevelDB。可能保存 OpenChamber Web UI 本地状态。不要单独删除 `.ldb`、manifest、CURRENT、LOCK 等内部文件；要重置就退出 App 后整体重置对应 profile/Local Storage。

### `Session Storage/`

```text
Session Storage/
├── 000003.log
├── CURRENT
├── LOCK
├── LOG
├── LOG.old
└── MANIFEST-000001
```

Chromium sessionStorage LevelDB。不要运行时手工拆删。

### `Shared Dictionary/`

```text
Shared Dictionary/
├── cache/
│   ├── index
│   └── index-dir/
│       └── the-real-index
├── db
└── db-journal
```

Chromium Shared Dictionary 状态/缓存。

---

## 11. `electron-user-data/Partitions/openchamber-browser/`

OpenChamber 内置 browser panel 的独立 Electron Session Partition。

```text
Partitions/
└── openchamber-browser/
    ├── blob_storage/
    │   └── d8a55c80-c8fd-4398-9120-5fdc388fa91f/
    ├── Cache/
    │   ├── Cache_Data/
    │   └── No_Vary_Search/
    ├── Code Cache/
    │   ├── js/
    │   │   ├── index
    │   │   └── index-dir/
    │   │       └── the-real-index
    │   └── wasm/
    │       ├── index
    │       └── index-dir/
    │           └── the-real-index
    ├── Local Storage/
    │   └── leveldb/
    │       ├── 000003.log
    │       ├── CURRENT
    │       ├── LOCK
    │       ├── LOG
    │       ├── LOG.old
    │       └── MANIFEST-000001
    ├── Network Persistent State
    ├── Preferences
    ├── Shared Dictionary/
    │   ├── cache/
    │   │   ├── index
    │   │   └── index-dir/
    │   │       └── the-real-index
    │   ├── db
    │   └── db-journal
    ├── SharedStorage
    ├── Trust Tokens
    └── Trust Tokens-journal
```

规则：

- 这里是 browser panel 的独立 cookie/storage/cache 区，不是主 OpenChamber UI profile。
- 测试网页登录态、cookie、Local Storage 时优先检查这里。
- 重置 browser panel 时应在 App 完全退出后整体清理该 partition，不要去动正式浏览器 profile。

---

## 12. Agent 操作规则

### 允许

- 读取本目录用于测试诊断。
- 在 `workspace/` 创建测试工作副本。
- 在 `imports/` 放输入。
- 在 `dataset/` 生成加工数据。
- 在 `artifacts/` 写测试结果。
- 维护 `scripts/` 中明确属于 OpenChamberTest 的测试脚本。
- 在 App 完全退出后，按任务需要整体清理明确的 Chromium cache。
- 读取日志定位 packaged `.app` 问题。

### 默认禁止

- 把 `OpenChamberTest` 当正式项目源码目录。
- 把测试 OpenCode DB 替换成正式用户 DB。
- 为显示历史会话而直接修改 `/Users/lingxifox/.local/share/opencode/opencode.db`。
- 把测试配置复制回正式 `~/.config/openchamber` 或 `~/.config/opencode`。
- packaged `.app` 启动时设置 `OPENCHAMBER_ELECTRON_DEV=1`。
- 运行中删除 SQLite `-wal` / `-shm`。
- 运行中拆删 LevelDB 内部文件。
- 因测试失败而移除 HOME/XDG/`OPENCHAMBER_DATA_DIR`/`--user-data-dir` 隔离。
- 将测试缓存/workspace 改写到系统主卷来规避问题。
- 直接修改 `electron-user-data` 内部数据库/索引来“修复 UI”。

### 应用运行时不要清理

```text
data/opencode-perf.db*
data/settings.json*
electron-user-data/Local Storage/
electron-user-data/Session Storage/
electron-user-data/Cookies*
electron-user-data/Partitions/
home/.local/share/opencode/
```

先退出相关 OpenChamber/OpenCode 进程。

---

## 13. 数据持久性分类

### A. 重要测试状态 / 默认保留

```text
data/settings.json
data/backgrounds/
data/quota/
home/.config/
home/.local/share/opencode/
electron-user-data/Preferences
electron-user-data/Local Storage/
electron-user-data/Partitions/openchamber-browser/Local Storage/
imports/
dataset/
scripts/
workspace/
artifacts/
```

### B. 日志 / 排障数据

```text
app.log
data/opencode/log/
home/Library/Logs/OpenChamber/
```

### C. 明确可重建缓存

```text
electron-user-data/Cache/
electron-user-data/Code Cache/
electron-user-data/GPUCache/
electron-user-data/DawnGraphiteCache/
electron-user-data/DawnWebGPUCache/
electron-user-data/Partitions/openchamber-browser/Cache/
electron-user-data/Partitions/openchamber-browser/Code Cache/
```

### D. 数据库/状态文件，不要“拆着删”

```text
data/opencode-perf.db
data/opencode-perf.db-wal
data/opencode-perf.db-shm

electron-user-data/Local Storage/leveldb/
electron-user-data/Session Storage/
electron-user-data/Partitions/openchamber-browser/Local Storage/leveldb/
```

---

## 14. 与正式环境的边界

```text
测试运行时：
/Volumes/Development/Runtime/OpenChamberTest

正式项目源码：
/Volumes/Development/Projects/projects/openchamber-lingxi

正式主用户 OpenCode 数据：
/Users/lingxifox/.local/share/opencode

正式主用户 OpenChamber/OpenCode 配置：
/Users/lingxifox/.config/openchamber
/Users/lingxifox/.config/opencode
```

Agent 应遵守：

```text
测试运行状态 → OpenChamberTest
项目源码     → /Volumes/Development/Projects
正式用户数据 → 默认不碰
```

---

## 15. 关于当前树快照的完整性

本次 `tree.txt` 显示 `56 directories, 258 files`，并完整列出了可见目录树；但它不是 `tree -a`，因此不能证明所有 dot-directories 都已枚举。

若以后要建立“包括所有隐藏目录”的机械可验证基线，请执行：

```bash
cd /Volumes/Development/Runtime
tree -a OpenChamberTest > OpenChamberTest-tree-full.txt
```

然后以该快照更新本文档。

---

## 16. Agent 一句话摘要

> `/Volumes/Development/Runtime/OpenChamberTest` 是 OpenChamber LingXiFox packaged macOS `.app` 的隔离验收沙箱：测试 HOME、XDG、OpenChamber 数据、OpenCode 用户态数据、Electron/Chromium profile、benchmark 输入/输出和测试 workspace 都应留在这里；真实源码位于 `/Volumes/Development/Projects/projects/openchamber-lingxi`，正式主用户 OpenChamber/OpenCode 数据默认禁止触碰。

---

## 附录 A：本次 `tree.txt` 原样快照

> 注意：普通 `tree` 默认不显示隐藏目录。

```text
./OpenChamberTest
├── app.log
├── artifacts
│   └── p995-roundtrip.json
├── data
│   ├── agent-tool
│   │   └── openchamber-plugin.js
│   ├── backgrounds
│   │   └── 7b2ecb6a-bba6-45cf-9579-5f13efb6bea0.jpg
│   ├── discovered-apps.json
│   ├── IMG_6383.JPG
│   ├── opencode
│   │   ├── log
│   │   │   └── opencode.log
│   │   └── repos
│   ├── opencode-perf.db
│   ├── opencode-perf.db-shm
│   ├── opencode-perf.db-wal
│   ├── quota
│   │   └── sub2api.json
│   ├── settings.json
│   ├── settings.json.tmp-52652-1787537663123-z6ixd1
│   ├── settings.json.tmp-54911-1787538229156-tgsvsl
│   └── settings.json.tmp-96573-1787493229586-4iysde
├── dataset
│   ├── swe-smith-scan.json
│   ├── swe-smith-selected.json
│   └── swe-smith-top20.jsonl
├── electron-user-data
│   ├── blob_storage
│   │   └── bdcec9a7-fc4f-4559-b570-5f65e74fcb97
│   ├── Cache
│   │   ├── Cache_Data
│   │   │   ├── 00e8d7b5f2aba86e_0
│   │   │   ├── 01db7d78c8d4e9ea_0
│   │   │   ├── 027b59dee3d77cff_0
│   │   │   ├── 030458671fe9f390_0
│   │   │   ├── 039a9e72b233170a_0
│   │   │   ├── 03ba12ebd7e3097c_0
│   │   │   ├── 04bac5ffd8f5f7d8_0
│   │   │   ├── 051b608f92f4f6d7_0
│   │   │   ├── 142fa811cc5ee93a_0
│   │   │   ├── 179f7b01ffad3573_0
│   │   │   ├── 17c7d3078b85446a_0
│   │   │   ├── 1b33c071d74e1824_0
│   │   │   ├── 1b59f7e515522fac_0
│   │   │   ├── 1d1d9ca3a21815bc_0
│   │   │   ├── 1d58d17dab985724_0
│   │   │   ├── 1f08d8ca37c9258f_0
│   │   │   ├── 1f16ed3dc6ba923a_0
│   │   │   ├── 1f29cc05a22b3901_0
│   │   │   ├── 1f56fcac95875ec3_0
│   │   │   ├── 1f9fc65357cbed84_0
│   │   │   ├── 1fc7a6939303be13_0
│   │   │   ├── 20163f76d13adc9c_0
│   │   │   ├── 20e887cca652d094_0
│   │   │   ├── 21603d313a43d0ed_0
│   │   │   ├── 23163ef8fb9e64ec_0
│   │   │   ├── 25888e6b014eafc3_0
│   │   │   ├── 2667873aea2df958_0
│   │   │   ├── 2cf374130e9da615_0
│   │   │   ├── 2d2e2cbb2a5a0ab0_0
│   │   │   ├── 313165843ad8f38d_0
│   │   │   ├── 3327420e280b871b_0
│   │   │   ├── 335baf60526400e5_0
│   │   │   ├── 33833726db44fbd9_0
│   │   │   ├── 37dc9e7dfda06382_0
│   │   │   ├── 37dfadedc5cd6bfa_0
│   │   │   ├── 38a0d73529fe330b_0
│   │   │   ├── 3a53b4a86c6e5072_0
│   │   │   ├── 3ca59bcc7f8592bd_0
│   │   │   ├── 3db082af5fb676ea_0
│   │   │   ├── 400c4d0fa543f9fb_0
│   │   │   ├── 45ee139366905a8f_0
│   │   │   ├── 463800adf18a3380_0
│   │   │   ├── 46daa1276febf675_0
│   │   │   ├── 48c1de09abddc0f1_0
│   │   │   ├── 49ba51a8ec3ca5c8_0
│   │   │   ├── 4bafbc11b27fdb07_0
│   │   │   ├── 4c05d7df62a72759_0
│   │   │   ├── 4d932c70ba98cecc_0
│   │   │   ├── 4f9ed48959d08fb4_0
│   │   │   ├── 4ff35551e4dee1ad_0
│   │   │   ├── 52508d94071d58e3_0
│   │   │   ├── 5352e510dfb6bc49_0
│   │   │   ├── 553eb786efcdf06c_0
│   │   │   ├── 57ca640aee593822_0
│   │   │   ├── 5a4474b5f30afe1b_0
│   │   │   ├── 5bbb1ccc0ab30a00_0
│   │   │   ├── 5c0fbece80c2ab05_0
│   │   │   ├── 5f5d7ee59b136193_0
│   │   │   ├── 5fbfc44948891693_0
│   │   │   ├── 60bda8215bb4f929_0
│   │   │   ├── 6525393d18ac3bd0_0
│   │   │   ├── 66c99a3c4a5a3903_0
│   │   │   ├── 67774a3864a9f59c_0
│   │   │   ├── 6a308e23a68bbea8_0
│   │   │   ├── 6e53c6ccf98ce224_0
│   │   │   ├── 6e90ba5ad3e22e75_0
│   │   │   ├── 70fc0beafc18fd96_0
│   │   │   ├── 734298cc183219d5_0
│   │   │   ├── 740338b7d48f0882_0
│   │   │   ├── 74cac406d12f3d9c_0
│   │   │   ├── 7568ff9803787bbb_0
│   │   │   ├── 757ad3d8cd0a207f_0
│   │   │   ├── 775a11f0a9257b09_0
│   │   │   ├── 78238af11b34639b_0
│   │   │   ├── 78709a7697243242_0
│   │   │   ├── 787453e16d44a950_0
│   │   │   ├── 78c0f9c378670b81_0
│   │   │   ├── 7a4ca428c86b75d4_0
│   │   │   ├── 7a5bf25c07c108d0_0
│   │   │   ├── 7a7d4d10a14e5b38_0
│   │   │   ├── 7ac7591012374ec8_0
│   │   │   ├── 7be8c916ca3e8d00_0
│   │   │   ├── 7cffdc8b1dc596c4_0
│   │   │   ├── 7efa49226a1b13fa_0
│   │   │   ├── 80135603a2446e24_0
│   │   │   ├── 801360b4553a4e82_0
│   │   │   ├── 80e9339e2b74be7c_0
│   │   │   ├── 8117323b81316dba_0
│   │   │   ├── 822fc934a5019a37_0
│   │   │   ├── 841d4c61f5696163_0
│   │   │   ├── 85d2a93b93550dc9_0
│   │   │   ├── 860fb681974bdd61_0
│   │   │   ├── 86fd41755b3117d8_0
│   │   │   ├── 879789328ff57f26_0
│   │   │   ├── 885bd8ba7902807b_0
│   │   │   ├── 8886e1fcfc85d3b3_0
│   │   │   ├── 892a48da912f29a9_0
│   │   │   ├── 8b47166b16620b7c_0
│   │   │   ├── 8bafa577f465da31_0
│   │   │   ├── 8c17f082cda64a66_0
│   │   │   ├── 8f035d7709eb60e1_0
│   │   │   ├── 9042e80929e583ad_0
│   │   │   ├── 929524fb62fe4ac8_0
│   │   │   ├── 9d267e5e92fcf72a_0
│   │   │   ├── 9e8294b54c45e0a0_0
│   │   │   ├── 9f01114285fdc8c4_0
│   │   │   ├── a2362aac71b9b584_0
│   │   │   ├── a3062ba59c471061_0
│   │   │   ├── a7a26e2251a31d53_0
│   │   │   ├── a7b94f42c3a0b774_0
│   │   │   ├── a81c33e7b49fa5f4_0
│   │   │   ├── b121cbb50714b1ad_0
│   │   │   ├── b5859f685b56e43f_0
│   │   │   ├── b849c0d6de15d870_0
│   │   │   ├── bceea5ac74cffec8_0
│   │   │   ├── be02a3d2a3c697e2_0
│   │   │   ├── c0be234853dfb223_0
│   │   │   ├── c115f51a43b365ce_0
│   │   │   ├── c12c56e910b49a51_0
│   │   │   ├── c1b2721241356bd6_0
│   │   │   ├── c35238df43f44a35_0
│   │   │   ├── c37b019885a670f1_0
│   │   │   ├── c70fbbd3ad3e6781_0
│   │   │   ├── c83f6235c6694706_0
│   │   │   ├── c8574077bf13f3e5_0
│   │   │   ├── c8a3cac609a2275e_0
│   │   │   ├── c9ee81cd997a7c3d_0
│   │   │   ├── ce2ba956a0f9e899_0
│   │   │   ├── d11fe2320360f4fe_0
│   │   │   ├── d2c04d2ae86bc786_0
│   │   │   ├── d3f69c2cedc241ba_0
│   │   │   ├── d41b731e81c1d4e4_0
│   │   │   ├── d55f75b89396aea6_0
│   │   │   ├── d67d0530aa0a63a8_0
│   │   │   ├── d731035683b086fe_0
│   │   │   ├── d76d6c4cefe9cf53_0
│   │   │   ├── d83160ba03a23af8_0
│   │   │   ├── da3d3871657b6b1a_0
│   │   │   ├── daef254d078ffae2_0
│   │   │   ├── dde46bbdfdac3a8b_0
│   │   │   ├── de45a2a1d05d2aaf_0
│   │   │   ├── de86571ff257994f_0
│   │   │   ├── df3b289ef45ef26f_0
│   │   │   ├── e06023a0149c0466_0
│   │   │   ├── e0e42ece086c5e95_0
│   │   │   ├── e88d8e84e6072b9a_0
│   │   │   ├── e97127092f6050cd_0
│   │   │   ├── ea123533ccac2325_0
│   │   │   ├── ead54536fc7469d9_0
│   │   │   ├── eaeb909ddd0392b5_0
│   │   │   ├── ebed606ce815ba07_0
│   │   │   ├── f0fcafcfa30b91cc_0
│   │   │   ├── f1af2532f138b7ca_0
│   │   │   ├── f2a862d7e1be9d59_0
│   │   │   ├── f403951793cb5508_0
│   │   │   ├── f47cee8cd3e6f3bd_0
│   │   │   ├── f961cbe1b3e958b9_0
│   │   │   ├── fad0ba328ec58503_0
│   │   │   ├── fc92dbfbffc976f1_0
│   │   │   ├── fda4d007f549c608_0
│   │   │   ├── index
│   │   │   └── index-dir
│   │   │       └── the-real-index
│   │   └── No_Vary_Search
│   │       ├── journal.baj
│   │       └── snapshot.baf
│   ├── Code Cache
│   │   ├── js
│   │   │   ├── index
│   │   │   └── index-dir
│   │   │       └── the-real-index
│   │   └── wasm
│   │       ├── index
│   │       └── index-dir
│   │           └── the-real-index
│   ├── Cookies
│   ├── Cookies-journal
│   ├── DawnGraphiteCache
│   │   ├── data_0
│   │   ├── data_1
│   │   ├── data_2
│   │   ├── data_3
│   │   └── index
│   ├── DawnWebGPUCache
│   │   ├── data_0
│   │   ├── data_1
│   │   ├── data_2
│   │   ├── data_3
│   │   └── index
│   ├── DIPS
│   ├── GPUCache
│   │   ├── data_0
│   │   ├── data_1
│   │   ├── data_2
│   │   ├── data_3
│   │   └── index
│   ├── Local State
│   ├── Local Storage
│   │   └── leveldb
│   │       ├── 000005.ldb
│   │       ├── 000017.log
│   │       ├── 000019.ldb
│   │       ├── CURRENT
│   │       ├── LOCK
│   │       ├── LOG
│   │       ├── LOG.old
│   │       └── MANIFEST-000001
│   ├── Network Persistent State
│   ├── Partitions
│   │   └── openchamber-browser
│   │       ├── blob_storage
│   │       │   └── d8a55c80-c8fd-4398-9120-5fdc388fa91f
│   │       ├── Cache
│   │       │   ├── Cache_Data
│   │       │   └── No_Vary_Search
│   │       ├── Code Cache
│   │       │   ├── js
│   │       │   │   ├── index
│   │       │   │   └── index-dir
│   │       │   │       └── the-real-index
│   │       │   └── wasm
│   │       │       ├── index
│   │       │       └── index-dir
│   │       │           └── the-real-index
│   │       ├── Local Storage
│   │       │   └── leveldb
│   │       │       ├── 000003.log
│   │       │       ├── CURRENT
│   │       │       ├── LOCK
│   │       │       ├── LOG
│   │       │       ├── LOG.old
│   │       │       └── MANIFEST-000001
│   │       ├── Network Persistent State
│   │       ├── Preferences
│   │       ├── Shared Dictionary
│   │       │   ├── cache
│   │       │   │   ├── index
│   │       │   │   └── index-dir
│   │       │   │       └── the-real-index
│   │       │   ├── db
│   │       │   └── db-journal
│   │       ├── SharedStorage
│   │       ├── Trust Tokens
│   │       └── Trust Tokens-journal
│   ├── Preferences
│   ├── Session Storage
│   │   ├── 000003.log
│   │   ├── CURRENT
│   │   ├── LOCK
│   │   ├── LOG
│   │   ├── LOG.old
│   │   └── MANIFEST-000001
│   ├── Shared Dictionary
│   │   ├── cache
│   │   │   ├── index
│   │   │   └── index-dir
│   │   │       └── the-real-index
│   │   ├── db
│   │   └── db-journal
│   ├── SharedStorage
│   ├── Trust Tokens
│   └── Trust Tokens-journal
├── home
│   └── Library
│       └── Logs
│           └── OpenChamber
│               └── main.log
├── imports
│   ├── swe-smith-max.json
│   └── swe-smith-p995.json
├── scripts
│   ├── convert_swe_smith.py
│   ├── fetch_selected_swe_smith.py
│   ├── inspect_selected.py
│   ├── inspect_swe_smith.py
│   ├── openchamber-test
│   ├── opencode-test
│   └── scan_swe_smith.py
└── workspace
    └── swe-smith
        └── README.md

56 directories, 258 files
```
