# beta 分支 · 团队接手总览

> 生成：2026-09-27 ｜ 本分支 = DSH-Desktop-EAC 主仓的 `beta` 接手分支
> 基线：`feat/eac-ecosystem-m0-m8` 全部历史 + 本快照提交（未提交工作树、验证基建、接手文档、安装器源码快照）
> 仓库：https://github.com/DSH-EAC/DSH-Desktop-EAC（`beta` 分支）｜ 上游文档：`.trae/documents/2026-09-26-dsh-eac-ecosystem-packaging-plan-v3.md`（副本见 `handover/docs-snapshot/`）

---

## 0. 一句话状态

**M0-M6 + Phase A/C 已完成；T4 Windows x64 桌面交付已完成本机隔离验收（V5 `partial`，详见 [T4 完成报告](T4-DELIVERY-2026-09-27.md) 与 [完成报告](../reports/completion/T4-BETA-COMPLETION-2026-09-27.md)）；T2 仍等待 `beta-pack` 修复后的安装器包，M8 发布序列待逐项授权。**

## 1. 分支地图（接手者在这里开发）

主仓 `DSH-Desktop-EAC` 现有三条接手分支，**一条分支 = 一个工作流 = 一名接手者**，可并行开发：

| 分支 | 内容 | 对应工作流 | 源仓对应关系 |
| --- | --- | --- | --- |
| **`beta`** | 本体全量：内核 vendored + Tauri 壳 + sidecar + 全部内置插件源码 + 13 款皮肤资产 + 测试 + `.verify` 验证基建 + `handover/` 总览与文档快照 | 主应用开发（T4 交付态、内核兼容垫片、壳面） | 即 `feat/eac-ecosystem-m0-m8` 的收口 |
| **`beta-skins`** | 皮肤包仓全量：13 款公约皮肤源码 + 构建脚本 + `.verify/pkgs-v1.1.0-final/`（14 tgz + SHA256SUMS 发布产物） | 皮肤包开发/修复/重打包 | = `DSH-EAC/dsh-ui-skin-loader` main@afa9472 + tag v1.1.0 |
| **`beta-pack`** | 整合包生态：根目录 = 安装器源码（真实历史）+ `mojobox/`（47 插件 catalog + Pack/Lock + dist dshpack）+ `dsh-our-free-model/`（v1.3.0 源码） | 安装器（T1 修 lib/types、T2 冒烟）+ catalog 维护 | 安装器 = 本分支根目录（tag v1.0.0）；mojobox 源仓 main@13e72e1 已同步；free-model 源仓（所有者个人仓，**不迁组织**）main@13dc267 已同步 |

**回推约定**：`beta-skins` 的改动可直接 push 回 `DSH-EAC/dsh-ui-skin-loader` main（同历史）；`beta-pack` 根目录（安装器）同历史可直推其正式仓（M8 待建 `DSH-EAC/dsh-eac-pack-installer`）；`mojobox/`、`dsh-our-free-model/` 是**快照目录**，改动需人工搬回各自源仓（free-model 为所有者个人仓，不迁组织）。

## 1.1 资产清单（5 仓库 × 推送状态，2026-09-27 已全部上 GitHub）

| 仓库 | 本地路径 | 远端 | 分支/HEAD | 未推送内容 |
| --- | --- | --- | --- | --- |
| DSH-Desktop-EAC（主仓） | `D:\DeepSeek Harness\dsh max\dsh_desktop` | DSH-EAC/DSH-Desktop-EAC | `feat/eac-ecosystem-m0-m8` @ c0fdec5→e620992→60a2dab | **整条分支未推过**（内核 0.1.7-rc.2 升级 + M2/M3 收口 + P0 修复）→ 本会话已以 `beta` 分支推送 |
| dsh-ui-skin-loader | `D:\丰富履历专用文件夹\皮肤管理插件\loader` | DSH-EAC/dsh-ui-skin-loader | main @ 59d67b5+2bc5da2，tag v1.1.0 | 2 提交 + tag |
| dsh-our-free-model | `D:\our free model\dsh-our-free-model` | zouyuxuan122 个人仓（**不迁组织**） | main @ 13dc267，tag v1.3.0 | ✅ 已推送（本会话） |
| dsh-mojobox | `dsh max\dsh-mojobox` | DSH-EAC/dsh-mojobox | main @ 13e72e1 | 1 提交 |
| dsh-eac-pack-installer | `dsh max\dsh-eac-pack-installer` | **无正式远端**（主仓 `beta-pack` 分支即其全部历史） | main @ 8a5816f+f4685c7，tag v1.0.0 | M8 应建正式仓 `DSH-EAC/dsh-eac-pack-installer` 并从 beta-pack 直推 |

**发布就绪产物（在接手者本机不可见，需按 §5 重产或向原机索取）：**- 皮肤包 14 tgz + SHA256SUMS：`loader\.verify\pkgs-v1.1.0-final\`（发布以此目录为准；1.1.0 含 5 款生成器皮肤激活修复）
- NSIS 安装包：`tauri-shell\target\release\bundle\nsis\Deepseek Harness EAC_6.0.0_x64-setup.exe`（210.79 MiB，本机已构建成功）
- 安装器 tgz / free-model tgz / Mojobox dshpack（`dsh-mojobox\dist\generated\downloads\`）

## 2. 快速接手（clone 之后做什么）

```bash
git clone https://github.com/DSH-EAC/DSH-Desktop-EAC.git
cd DSH-Desktop-EAC
git switch beta        # 或 beta-skins / beta-pack，按你认领的工作流（见 §1 分支地图）
# 1) 读本文档 §3（必读——两处误诊纠正 + 一个新 P0）
# 2) 台账与背景：handover/docs-snapshot/（progress 台账、s9 报告、规划 v3、ADR 相关引用）
# 3) 构建（Windows + Rust 1.9x + Node 24；仅 beta 分支需要）：
cd dsh-desktop && npm install        # 内核 vendored 依赖
cd ../tauri-shell && npx @tauri-apps/cli build   # TMP/TEMP 重定向到非 C 盘！
```

构建链既有知识：`stage-resources → npx @tauri-apps/cli build → make-portable.mjs`；makensis 撞 C 盘满 = TEMP 重定向；robocopy/zip 反斜杠坑。详见 `handover/docs-snapshot/` 与 ADR。

## 3. 本会话关键发现（⚠️ 纠正前一份交接的两条结论）

### 3.1 误诊纠正一：安装器「自插行双注册」不是官方路径缺陷

前一份交接（HANDOVER-2026-09-27-official-track-smoke.md §3.1）判定"官方 CLI 安装路径必然踩中双重装载"——**实证否定了它**：

- `dsh plugin add` = pnpm add + `reconcileProfilePlugins`（内核 app-boot）把声明 `dsh.bundle` 的依赖自动追加进 `dsh.profile.bundles`；官方 `pluginManager.installBundle → selectBundle` 同样**只写 bundles**；unified-market 走的也是 `dsh plugin add`。
- bundle 成员的**唯一**装载路径就是它自己 `cordis.patch.yml` 的 insert 行（bundle 层），以上三条官方路径都**不写用户层 insert 行** → 单装载，安全。皮肤包同构亦然（`--dump-config` 实证单条目）。
- 真正的双注册成因：**手工往用户层 `cordis.patch.yml` 再写一条同名 insert 行**（上一会话模仿 EAC companion 行形态手写过）。两条 insert = 装载两次 = `service "eacPackInstaller" has been registered` = 整屏失败。
- **结论**：安装器源仓 `cordis.patch.yml` 的自插行**必须保留**（文件头已加注释说明，快照 commit f4685c7）；任何人都不要再为 bundle 成员手写用户层 insert 行。

### 3.2 误诊纠正二：「插件管理页没有可管理的 profile」不是 patch 行写法问题

- `@deepseek-ai/dsh-plugin-manager` 有两个形态：EAC `assets/plugins/` 下是 **13 行 no-op stub**（EAC 壳桥接管管理，历史设计）；安装闭包 `staged node_modules` 里是 **1380 行完整版**（真注册 `pluginManager` Remote 服务）。
- 装载行本来就在 `@deepseek-ai/dsh-base/cordis.patch.yml`：`- id: plugin-manager … disabled: !!js "!ctx.get('profileContext')"`。官方 `dsh --profile web` 根命令 boot 会 provide `profileContext`（profile-boot:273）→ 行启用。
- 上一会话把 stub 手动播种进 profile node_modules 想补"内核 peers"——方向反了：干净官方 home **不需要**任何手工播种，靠的是解析层自动落到安装闭包完整版。
- 冒烟断言链（T2 要用）：管理页可用 ⇐ `ctx.get("pluginManager")` 存在 ⇐ profileContext 已提供 + 行未禁用 + 解析到**完整版**（勿让 stub 遮蔽）。

### 3.3 新 P0 缺陷（阻塞官方端冒烟）：安装器 tgz 缺 `lib/types/types.js`

- client 的 typert 描述符引用 `@dsh-eac/pack-installer/types#CatalogResult` 等 6 个 schema 引用，但 npm 包只含 `lib/client.js + lib/index.js`，`package.json exports` 也**没有 `./types`** → typert-registry 解析 schema 引用失败 → **client half fiber failed → fail-loud 整屏失败**（注意：host half 此时实际已激活，失败的是浏览器端 client half）。
- 旧冒烟 home 里 installer 被用户层 `disabled: true` 行禁用，所以此前从未暴露。
- 修复方向（T1）：构建管线补齐 `lib/types/`（typert 生成器或从 `src/protocol.ts` 抽 schema 常量模块）+ `package.json exports` 加 `./types` → `npm pack` 重打 → 重测。

### 3.4 环境事实：profile 层插件的内核 peer 解析

- profile `node_modules` 里的插件导入 `@deepseek-ai/*`：本地有 → native 解析；本地无 → ResolutionRouter 拦截重定向到安装闭包（声明者锚点）。实测在本机组合（Node 24.11.1 + vendored 内核）下，拦截路径会让 client half 打包/装载挂起或失败。
- **EAC 壳靠 companion-sync 的 healProfileModules 播种内核 peers 绕开**——这就是它存在的真正原因。纯官方 CLI 直启的冒烟 home 需要等价物：
  ```cmd
  mklink /J <profile>\node_modules\@deepseek-ai <staged>\node_modules\@deepseek-ai
  ```
- 实证：pack-smoke2 建 junction 后 host half 立即激活，日志仅剩 5 个可选内核服务 failed to import（官方 account 栈未随 EAC staged 树分发，与 EAC 壳内一致，不阻塞）。

## 4. 官方端冒烟复现指南（T2 照此执行）

```bash
# 0) 变量
STAGED="…/tauri-shell/staged-resources/dsh-desktop"
DSH=<staged>/node_modules/@deepseek-ai/dsh/lib/bin.js
HOME2=D:/tmp/pack-smoke2          # 全新目录
# 1) 干净 home + 官方 CLI 安装（先完成 §3.3 T1 修复、重打 tgz）
DSH_HOME=$HOME2/dsh-home node $DSH plugin --profile web add <installer.tgz>
# 2) 内核 peer junction（§3.4）
cmd /c mklink /J $HOME2/dsh-home/profiles/web/node_modules/@deepseek-ai $STAGED/node_modules/@deepseek-ai
# 3) 直启内核（官方桌面端形态；--no-open 防弹浏览器）
DSH_HOME=$HOME2/dsh-home node $DSH --profile web --host 127.0.0.1 --port 18890 --no-open > boot.log 2>&1 &
#    就绪行 "dsh web: http://127.0.0.1:PORT/?token=…" 在 boot.log
# 4) 本地 catalog 站点（皮肤 14 tgz artifact 走它；archify/meow-smooth 走真实 npm）
node D:/tmp/pack-smoke/serve.mjs   # :18888，site 在 D:/tmp/pack-smoke/site
# 5) 浏览器验证（agent-browser；全链 eval 驱动，snapshot/find 会撞 _mask_ 遮罩）
#    断言：失败屏消失 → 侧栏插件页 managementAvailable=true → 设置页出现「整合包」section（order 91）
#    → 勾选 dev.dsh-eac.recommended.v1 → 真实安装 → node_modules 出现 archify/meow-smooth + 皮肤包 → 截图
```

诊断工具（`dsh-desktop/.verify/diag/`，需在 `dsh-desktop` 目录下运行以复用其 `ws` 依赖）：

- `diag/check-resolution.mjs` — 复刻内核 createRuntimeResolution，核对安装闭包成员资格
- `diag/spy2.mjs` — `node --import` 预挂内部 loader 间谍，抓每次 resolve 的父 URL/结果（boot 全程）
- `diag/capture2.mjs` — CDP 抓 console + addScriptToEvaluateOnNewDocument 运行前钩子
- `dsh --profile web --dump-config > dump.yml` — 组合后装载树（判条目/行/自插形态的第一工具）

## 5. 建议任务拆分（与分支对应）

T4 本轮执行记录见 [桌面交付验收](T4-DELIVERY-2026-09-27.md)；以该报告的实际结果与未验证项判断本轮交付状态。

| # | 任务 | 分支 | 优先级 | 依赖 |
| --- | --- | --- | --- | --- |
| T1 | 修安装器 tgz 缺 `lib/types/types.js`（§3.3）→ 重打包 | `beta-pack`（根目录） | **P0** | 无 |
| T2 | 官方端轨道全流程冒烟（§4 剧本）→ 截图 + `s10-official-track-smoke-report.md` | `beta-pack` + `beta`（跑本体） | **P0** | T1 |
| T3 | M8 发布序列（**逐项找项目所有者授权**）：建 `DSH-EAC/dsh-eac-pack-installer` 正式仓推源码+tag → loader v1.1.0 GitHub Release（tgz+SHA256SUMS 已在 beta-skins）→ Mojobox catalog 刷新（重算 5 款皮肤 digest）+ 严格 CLI 复核 | `beta-pack` / `beta-skins` | P1 | T1 建议先落 |
| T4 | EAC 桌面端本体交付态：`make-portable.mjs` 便携包 + NSIS 安装态冒烟（新机按 5.3.6 套路） | `beta` | P1 | **本机完成；V5 partial** | 无 |
| T5 | 收尾：关 issue #415/#416（附 commit 引用）；free-model 保持所有者个人仓（不迁组织），回推改动由所有者代推或加 collaborator；检查皮肤包在市场路径写行时的同构风险（P2） | — | P2 | — |

## 6. 团队与权限

- DSH-EAC 组织成员（9）：zouyuxuan122（所有者）、metaone01（所有者）、BAIKAI23333、lanyun077、look-back-lysj、says693、ViscaOwO、zixin947、T-Auto（bot）。
- `beta` 分支为接手工作分支；正式改动仍按 v6 流程走 `dev`/PR。
- free-model（zouyuxuan122/dsh-our-free-model）是所有者个人仓，**不迁组织**：团队源码取自 beta-pack 快照目录，改动回推由所有者代推或由所有者添加 collaborator。
- v6 流程约定：分支从 `dev` 拉、PR 回 `dev`；ADR 0005–0008 在 dev 分支，动壳面前先读。

## 7. 换机必读（本机特有陷阱）

- C 盘常年 100%：构建前把 TMP/TEMP 重定向 D 盘；WebFetch 撞证书用 `curl --ssl-no-revoke`。
- 真实用户 home `C:\Users\HUAWEI\.dsh` 与 `tauri-shell/release/` 是保护路径，勿动勿删。
- 内核不可碰：`@deepseek-ai/*` vendored 源码只读，任何兼容性问题写垫片/测试（先例：`test/kernel-service-compat.test.ts`）。
- `node_modules`/`target`/构建产物不删（清理口径见台账）。
- 打包必须 `npx @tauri-apps/cli`；便携包输出避开受保护的 `tauri-shell/release/`。

## 8. 快照提交内容说明（beta 分支相对此前远端的全部增量）

- 23 个未提交修改：内核服务面漂移门禁扩展（kernel-service-compat +264 行）、installer-hooks.nsh（+70）、.sync 注册表、4 款皮肤 LICENSE/法务文件、companion-sync/plugin-sync-registry/plugin-manager-state 修订 —— 均为上一会话遗留的真实工作，本快照一并入库。
- 新增 5 个测试文件（compact 配置回写、#415 皮肤迁移/树摘要门禁、skin-miku 激活回滚、skin-trading 安全契约）。
- `dsh-desktop/.verify/`（2.3MB 实机验证基建：live-boot harness、live-skin 脚本、diag 探针）原本被 gitignore，本快照强制入库——团队接手依赖它。
- `handover/`：本文档 + `.trae` 文档副本 + 安装器源码快照（无 .git）。
