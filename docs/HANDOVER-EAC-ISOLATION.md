# EAC 安装环境隔离（dsh-dpx）— 交接与人工测试步骤

对应 ADR：`docs/adr/0004-eac-install-environment-isolation.md`
适用提交：`codex/beta-t4-delivery` 工作树（含 P0–P3 修复）

## 1. 这套东西在做什么

EAC 不再直接用宿主 `%USERPROFILE%\.dsh`，而是把 DSH profile/sessions/skills 放进
一个由 `dsh-dpx`（固定提交，`third_party/dsh-dpx`）管理的**隔离环境根**：

```text
<产品数据根>  Windows: %LOCALAPPDATA%\Deepseek Harness EAC  （或 DSH_EAC_DATA_ROOT）
├── dpx\
│   └── dsh-environments\
│       └── eac-beta\                 ← 环境根（每通道一个）
│           ├── .dpx-environment.json ← dpx 身份清单（kind: DPXEnvironment）
│           ├── dsh-home\             ← DSH_HOME（profiles / sessions / skills）
│           └── home\ appdata\ localappdata\ tmp\ xdg-*\ npm-prefix\ workspace\
└── DSH\DPX\registry.json             ← 机器级注册表（DPX_HOME）
```

分层职责（改动时不要越界）：

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| L1 Rust 壳 `tauri-shell/src/main.rs` | 只注入 `DSH_EAC_DATA_ROOT` + `DSH_EAC_CHANNEL`（通道来自 `DSH_EAC_CHANNEL` → `environment-policy.json` → 默认） | 任何 dpx 路径/注册表策略 |
| L2 sidecar `lib/desktop/environment.ts` | 调 dpx JS API 创建/诊断/移除环境，把 runtime 应用到进程 | 复制 dpx 的注册表、锁、清单、变量治理逻辑 |
| L3 dsh 内核 | 零修改 | — |

## 2. 关键不变量（回归测试锁定）

1. **fail closed**：dpx 初始化失败（注册表损坏、非空未注册目录、模块缺失）时 sidecar 记日志并 `exit(2)`，**绝不回退宿主 `~/.dsh`**。
2. **runtime 是全量替换**：`applyRuntimeEnvironment` 必须**删除**被 dpx 清理的继承变量（`NODE_OPTIONS` / `NODE_PATH` / 代理 / `NPM_CONFIG_PREFIX` / `NPM_CONFIG_CACHE`），只赋值不删除等于隔离失效。
3. **不迁移旧数据**：宿主旧 `.dsh` 只做存在性检测与日志提示，不迁移、不删除、不覆盖。
4. **未登记非空目录拒绝接管**（创建/计划/执行三阶段）。
5. **同通道复用实例**：重复安装复用同一 `instanceId` 与环境根，不清空既有数据；不同通道（`beta`/`rc`）是不同环境根。
6. **内核来路不变**：内核仍从安装树 `require.resolve('@deepseek-ai/dsh/lib/bin.js')` 启动，**不使用 `dpx run`**；隔离只改 profile 落点。
7. **路径支持空格与中文**：全程 `path` 拼接，无 shell 转义中间态。
8. **装配完全离线**：打包不跑 `npm ci`（见下节）。

## 2.1 dpx 的理念边界（务必先读，别期望错的保证）

我们**采用** dpx 的隔离模型，因此也接受它的边界。dpx 的理念是**「收容默认解析」，不是「写入沙箱」**：

> 只要调用方不显式指定绝对路径，各类工具的默认读写即落在 `<环境根>` 下。

机制是**环境变量重定向**，**不是文件系统边界**。以下三个逃逸口是 dpx 明确声明不在保证范围内的，我们原样接受：

| 逃逸口 | 表现 |
| --- | --- |
| 显式绝对路径 | `npm install -g --prefix C:\Users\...` 直接写宿主 |
| `PATH` 是**前置**而非替换（`PATH = [环境 npm-prefix, 继承 PATH]`） | 环境里没装的工具静默回落宿主同名二进制 |
| 无写入拦截 | 不挂文件过滤驱动，有写权限即可写宿主任意绝对路径 |

需要真正的文件系统边界时，应在沙箱/容器层实现 —— **不要指望 EAC 或 dpx 提供。**

**我们对 dpx 做了两处收紧**（原因见 ADR 0004 的「dpx 的理念，以及我们为什么要收紧两处」）：

| 收紧 | 一句话 |
| --- | --- |
| runtime「替换」而非「赋值」 | dpx 的 `runtimeEnvironment` 只**决定保留什么**，删继承变量是**调用方责任**；不删则宿主 `NODE_OPTIONS` 仍生效，隔离是假的 |
| fail closed 而非「报错可重试」 | GUI 一旦静默回退宿主 `~/.dsh`，就重演旧 profile 污染 + 白屏，且用户看不到线索 |

另外**明确不采用** dpx 的桌面启动器（`dpx run` / `launchSpec` / 内置 WebView）：EAC 有自己的 L1 Tauri 壳，只取 dpx 的环境管理面。

## 3. 打包装配（P0 修复要点）

**不要**把 `npm ci` 放回 staged 树。原因：`package-lock.json` 里 234/280 个
`file:vendor/kernel/*.tgz` 的 integrity 与磁盘 tarball 不一致（内核 tarball 在
构建期被 `fetch-kernel.js` 重打，字节依赖打包环境），`npm ci` 必然 EINTEGRITY，
回滚时又撞 EPERM 留下半截坏树。

现在的装配方式（`tauri-shell/stage-node-modules.mjs`）：

- 从已安装好的 `dsh-desktop/node_modules` **离线复制**生产依赖；
- 校验 lock 中所有**非 optional** 包存在（跨平台 optional 变体允许缺席）；
- 复制后逐包核对文件数，排除 `.bin`/`.cache`/`.package-lock.json`；
- 异平台原生包护栏；
- 源树缺失 → fail fast，提示先在 `dsh-desktop/` 下 `npm ci`（首次需要网络）。

新机器/新检出准备顺序：

```powershell
cd dsh-desktop
npm ci                 # 首次需要网络，生成源 node_modules 源树
cd ..\tauri-shell
cargo fetch --locked   # WebView2Loader.dll 来源（win32 必需）
cd ..
node tauri-shell/check-dpx-pin.mjs          # submodule pin 门禁
node tauri-shell/stage-resources.mjs        # 离线装配（可重复）
```

## 4. 自动化验证

在 `dsh-desktop/` 下（用**本地** node_modules，不要 `npm exec`）：

```powershell
./node_modules/.bin/tsc -p tsconfig.json          # typecheck + build
node --test test/eac-environment-isolation.test.ts # 隔离 + P1/P2（28 项）
node --test test/stage-node-modules.test.ts        # P0 装配（10 项）
node --test test/eac-kernel-source.test.ts         # P2 内核来路（6 项）
node --test test/eac-ci-fail-fast.test.ts          # P3 门禁（6 项）
node --test test/eac-dpx-payload.test.ts           # dpx payload 闭包
```

Rust 壳（在 `tauri-shell/` 下，本地 cargo，不联网拉 crate 即可，需已 `cargo fetch`）：

```powershell
cargo check --locked
cargo test --locked
```

## 5. 人工验收步骤

### 5.1 隔离启动（真实壳）

1. 准备一个**假的宿主 profile**，证明它不会被读取：

   ```powershell
   $fake = "$env:TEMP\eac-host"
   New-Item -ItemType Directory -Force "$fake\.dsh\profiles\web-desktop" | Out-Null
   '旧插件' | Set-Content "$fake\.dsh\profiles\web-desktop\old-plugin.txt"
   ```

2. 用隔离变量启动 release 壳：

   ```powershell
   $env:DSH_EAC_DATA_ROOT = "$env:TEMP\eac-data-产品 根"     # 故意含空格与中文
   $env:DSH_EAC_DPX_REGISTRY_HOME = "$env:TEMP\eac-registry"
   $env:DSH_EAC_CHANNEL = 'beta'
   $env:USERPROFILE = $fake; $env:HOME = $fake; $env:LOCALAPPDATA = $fake
   .\tauri-shell\target\release\dsh-eac-shell.exe
   ```

   也可直接跑 `node reports/eac-isolated-shell-evidence.mjs`（脚本化版本，自动核对并写日志）。

3. 期望现象：
   - 壳打出 `[environment] 隔离已生效：name=eac-beta root=...`；
   - `boot.state` / `environment.status` 报告 `isolated: true` 与隔离根；
   - `$env:TEMP\eac-data-产品 根\dpx\dsh-environments\eac-beta\.dpx-environment.json` 存在且 `kind = DPXEnvironment`；
   - 隔离根 `dsh-home\profiles\` 下**没有** `old-plugin.txt`；
   - 宿主旧 profile 内容**原样未变**。

### 5.2 损坏环境可诊断（P1）

1. 让环境跑起来一次（生成注册表），退出壳。
2. 手工把注册表写坏：`Set-Content "$env:TEMP\eac-registry\registry.json" '{坏'`
3. 再启动壳：**期望 fail closed** —— sidecar 打出 `dsh-dpx 环境初始化失败`，进程退出，主窗走 `/died` 恢复页；**不得**回退到宿主 `.dsh`。
4. `/died` 页会出现**环境面板**（形态 1 自愈），显示隔离根、问题文案、已登记状态。期望：
   - 面板列出 `损坏：…\registry.json（…JSON 解析失败…）` 这类**可读中文原因**，而不是空态；
   - `removable=false` → 「清理并重建环境」按钮**隐藏**，并显示人工出路提示；
   - 环境根数据**未被删除**。
5. 也可直接用打包态脚本核对（**必须带 `DSH_RESOURCE_ROOT`**，否则适配层在安装树上找不到 dpx）：

   ```powershell
   cd D:\AI_Coding\Deepseek-Harness-EAC\tauri-shell\target\release
   $env:DSH_RESOURCE_ROOT = (Get-Location).Path
   .\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=status
   ```
   期望输出单行 JSON，含 `diagnosis.registryReadable=false`、`problems[0].code='damaged'`。

### 5.3 清理与重装（P1）

1. 计划（不落盘）：`environment.remove({dryRun:true,purge:true})` → 返回 `plan.root.action='delete'`，磁盘无变化。
2. 只摘记录保数据：`environment.remove({purge:false})` → `purged:false`，环境根仍在、用户数据仍在、`registered:false`。
3. 彻底清理：`environment.remove({purge:true})` → `purged:true`，环境根消失；随后重新启动壳应**干净重建**。
4. 打包态等价命令（`/died` 页按钮走的就是这条）：

   ```powershell
   $env:DSH_RESOURCE_ROOT = (Get-Location).Path
   .\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=repair
   .\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=plan   --purge
   .\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=remove --purge
   ```

### 5.4 拒绝接管别人的目录（P1）

1. 在 `dsh-environments\` 下手工建一个**非空且未注册**目录（如 `eac-stray`，放一个 `user-data.txt`）。
2. 以 `DSH_EAC_CHANNEL=stray` 启动：期望拒绝认领并 fail closed。
3. 调 `environment.remove`：期望拒绝（未登记），且 `user-data.txt` 原样保留。

### 5.5 双重卡死的人工恢复（实测边界）

注册表损坏时 dpx 拒绝删除（不可信注册表上不做破坏性操作）；若再手工删掉注册表，目录又变成「非空且未注册」，dpx 仍拒绝认领。此时 `/died` 页会显示人工出路提示，恢复步骤：

1. 把整个环境根目录**改名**（不要直接删，先留现场）：
   `…\Deepseek Harness EAC\dpx\dsh-environments\eac-beta` → `eac-beta.broken-<日期>`
2. 重启应用 → dpx 干净重建环境 → 需**重新登录**（按 ADR 0004 不迁移旧凭据）。
3. 确认新环境可用后，再自行删除 `*.broken-*` 备份。

## 6. 已知限制与残余风险

- `/died` 页已有**环境自愈面板**（形态 1，走 L1 的 `diagnose_environment` / `repair_environment`，不依赖 sidecar 存活）；但设置页内的 `environment.*` 面板仍未接。
- **壳层页面调 L1 命令有三个前提**（2026-09-30 实测全踩过）：① 页面用壳注入的 `window.dshShell.invoke`（本壳不开 `withGlobalTauri`，`window.__TAURI__` 恒为 undefined）；② 命令在 `build.rs` 的 `AppManifest::commands()` 里声明（Tauri v2 自定义命令默认被 ACL 拒，**连 `shell_ping` 也一样**）；③ `capabilities/default.json` 授权且 `"local": false` + `"remote.urls"` 为**壳桥端口段正则** `http://127.0.0.1:(1987[3-9]|1988[0-9]|1989[0-8])/*`（页面是外部 HTTP origin，不是 Tauri local；**不得用通配端口**，那会把 L1 命令面授权给内核 Web UI 的动态端口）。详见 ADR 0004 同名小节。
- **改这两个文件后必须重新 `tauri build`**：`build.rs` / `capabilities/*.json` 的变化在运行期生效，不重建则页面只报 `Command X not allowed by ACL`。
- **注册表损坏 + 目录残留**属于双重卡死：dpx 拒绝在不可信注册表上删除，删掉注册表后又因「非空未注册」拒绝认领。当前**只给人工指引**，未实现自动强修（那需要绕过 dpx 的注册表保护，边界待定）。恢复步骤见 §5.5。
- 宿主旧 `.dsh` 的**显式迁移入口**未实现（策略仍是只检测、不迁移）。
- 摘记录（`purge:false`）后再启动会被 dpx 拒绝重新认领（非空未注册）——这是刻意的 fail-closed，不是 bug；出路是显式 `purge:true`。
- 诊断子进程**必须收到 `DSH_RESOURCE_ROOT`**（L1 已注入）。若有人新增调用点忘了传，打包态下自愈会静默失效——已有回归测试锁定。
- 本地检出的 `package-lock.json` integrity 与磁盘 tarball 不一致是**预期**的（CI 会经 `fetch-kernel.js` 同步）；离线装配因此不依赖 integrity。若有人把 `npm ci` 放回 stage，会立刻复现 EINTEGRITY。
- 无像素级截图能力时，运行验收以壳自报链路 + 隔离根落盘事实 + `/died` 页 HTML 核验作为等效证据（见 `reports/eac-isolated-shell-launch.log`）。**要验证 `/died` 页真实行为**，须给 WebView2 传 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` 并用 CDP 读取（浏览器渲染看不到真实结果）。
