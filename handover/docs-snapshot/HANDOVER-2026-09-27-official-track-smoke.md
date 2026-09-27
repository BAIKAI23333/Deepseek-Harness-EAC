# 交接文档 — 官方端轨道真实验证（冒烟）进行中

> 交接日期：2026-09-27 ｜ 上一会话在「官方端轨道整合包真实验证」中途按用户要求停止并交接（用户要切模型）
> 上游文档：`.trae/documents/2026-09-26-dsh-eac-ecosystem-packaging-plan-v3.md`（总体规划 v3）
> 已完成报告：`.trae/sdd/plan/s9-phase-c-live-verification-report.md`（Phase A 收口提交 + Phase C 皮肤实机验证 + 2 个 P0 修复）
> 台账：`.trae/sdd/plan/progress.md`（Phase A/C 条目已追加）

---

## 0. 一句话状态

**M0-M6 ✅ / Phase A 收口提交 ✅（5 仓库本地 commit + 3 tag，未 push）/ Phase C 皮肤实机验证 ✅（13/13 零残留，A27/A28 达成）/ M7 跳过（用户裁定）/ NSIS 应用本体已构建成功 / 官方端轨道整合包真实验证 🔶 进行到约 80%，卡在最后一环（pluginManager 服务在冒烟 home 中未挂载），下一动作已明确（见 §3）。M8 发布全部待用户授权。**

---

## 1. 已交付（全部本地，未 push）

### 1.1 Git 提交与 tag

| 仓库 | 分支 | 提交 | 内容 |
| --- | --- | --- | --- |
| `DSH-Desktop-EAC` | feat/eac-ecosystem-m0-m8 | `e620992` | M2/M3 收口（161 文件：14 皮肤/loader 预装、dsh-skin-switch 退役、.sync 全链路、#416 三层分级、官方安装器/账号契约） |
| 同上 | 同上 | `60a2dab` | P0 修复一：settingsScope→configForms 迁移 + 内核服务面漂移门禁测试（247/247 绿） |
| `dsh-ui-skin-loader` | main | `59d67b5` + tag v1.1.0 | 13 款公约皮肤 |
| 同上 | main | `2bc5da2` | P0 修复二：5 款生成器皮肤 CSS 映射表作用域修复 |
| `dsh-our-free-model` | main | `13dc267` + tag v1.3.0 | v1.3.0 标准化 |
| `dsh-mojobox` | main | `13e72e1` | 47 catalog 记录 + Pack/Lock + evidence |
| `dsh-eac-pack-installer` | main（**本会话 git init**） | `8a5816f` + tag v1.0.0 | 安装器全量首提交 |

### 1.2 发布就绪产物（绝对路径）

- **皮肤包 14 tgz + SHA256SUMS**：`D:\丰富履历专用文件夹\皮肤管理插件\loader\.verify\pkgs-v1.1.0-final\`（5 款重打过，发布以此目录为准）
- **free-model**：`D:\our free model\dsh-our-free-model-1.3.0.tgz`（本会话 npm pack 出的本地包）
- **安装器**：`D:\DeepSeek Harness\dsh max\dsh-eac-pack-installer-1.0.0.tgz`（本会话 npm pack）
- **`.dshpack`**：`D:\DeepSeek Harness\dsh max\dsh-mojobox\dist\generated\downloads\`（含 dev.dsh-eac.recommended.v1-0.1.0.dshpack 等 5 个）
- **应用本体 NSIS（本会话构建成功）**：`D:\DeepSeek Harness\dsh max\dsh_desktop\tauri-shell\target\release\bundle\nsis\Deepseek Harness EAC_6.0.0_x64-setup.exe`（210.79 MiB）
  - 本机 **有 Rust 工具链**（cargo/rustc 1.98.0，target/ 缓存 3.0G）——v3 计划里"本机无 Rust 链"已过时，A29 可在本机解锁
  - 构建命令：`cd tauri-shell && TMP/TEMP 重定向到 D 盘后 npx @tauri-apps/cli build`（约 7 分钟增量）
  - 便携版：`node tauri-shell/make-portable.mjs`（**未跑**；注意输出目录避开受保护的 `tauri-shell/release/`）
- 重要：`tauri-shell/staged-resources` 已用修复后皮肤重建过；`dsh_desktop` 工作树当前未提交改动 = **无**（只剩 4 个保护路径 + 未跟踪的 `.verify/` 验证基建）

---

## 2. 官方端轨道真实验证 — 已完成的部分

目标：证明「官方桌面端 + 装 1 个 dsh-eac-pack-installer 插件 = 勾选装齐 EAC 全部插件与皮肤」，全程真实 GUI 驱动，不是单测。

### 2.1 已跑通的链路

1. **官方 CLI 安装安装器插件** ✅：`dsh plugin --profile web-desktop add <installer tgz>` 成功（本质是 pnpm add + 写入 profile 的 `dsh.profile.bundles`）。
2. **发现并修复安装器激活缺陷（真 bug！）**：安装器自带的 `cordis.patch.yml` 有自插行（`- insert: [{id: dsh-eac-pack-installer, name: ...}]`），而 `dsh plugin add` 又把包放进 bundles → **双重装载 → `service "eacPackInstaller" has been registered` → web boot 整屏失败**。皮肤包同结构但 host 半是 no-op 所以从未暴露。**官方 CLI 安装路径必然踩中，这是 M5 交付物的真缺陷，必须修**（见 §4 待办 1）。
3. 临时修复（已验证）：把已安装副本的 `node_modules/@dsh-eac/pack-installer/cordis.patch.yml` 改为 `[]` 后，**UI 完整启动、无失败屏**，installer 进入 boot 图（90 entries）。
4. 本地 HTTP 站点已就绪：`D:\tmp\pack-smoke\site`（真实 Mojobox `catalog.json`，14 条皮肤 artifact.path 已改写为 `http://127.0.0.1:18888/skins/<file>.tgz`；archify/meow-smooth 保持真实 npm registry URL；服务脚本 `D:\tmp\pack-smoke\serve.mjs`，端口 18888）。
5. 冒烟 home 已备好：`D:\tmp\pack-smoke\dsh-home`（installer 已装、内核 peers 已手动播种：cordis/schemastery/cosmokit/dsh-typert-protocol/dsh-plugin-manager 及其闭包）。

### 2.2 卡住的最后一环（当前阻塞点）

插件管理页显示 **「本部署没有可管理的 profile」**。内核逻辑：`managementAvailable = ctx.get("pluginManager") !== undefined`（`dsh-host-plugin-inventory/lib/index.js:137`）；pluginManager 服务由 `@deepseek-ai/dsh-plugin-manager` 提供，`static inject = ["loader", "profileContext"]`。

已试未果：在用户 patch（`cordis.patch.yml`）加 `- id: dsh-plugin-manager, name: '@deepseek-ai/dsh-plugin-manager'` 行 → 仍不挂载（该包已在 profile node_modules，require 独立测试通过）。

**下一步假设（按优先级）**：
1. 对照 EAC 正常 home（`D:\tmp\dsh-live-skin-b6sMyb\dsh-home`，还活着，勿删）的 patch 行形态——它的行是 companion-sync 写的，可能带 `insert:` 包裹或特定 id。EAC 行：`- id: plugin-package-inventory-deepseek, name: '@deepseek-ai/dsh-plugin-package-inventory-deepseek', config: {enabled: false}` 等。**先 `grep -B3 -A3 'dsh-plugin-manager' D:/tmp/dsh-live-skin-b6sMyb/dsh-home/profiles/web-desktop/cordis.patch.yml` 看确切行结构，逐字节照抄**。
2. 怀疑 pluginManager 需要 profileContext 服务：`ctx.profileContext`/`startedBundles` —— 查 `dsh-cordis-host-runner`/`profileContext` 谁提供、是否要求 profile 以特定方式初始化（`ensureDesktopProfileInit` 只在 EAC 壳内跑；冒烟 home 是手工建的，对比差异）。
3. 若服务挂载仍失败：直接读 kernel 日志 `D:\tmp\pack-smoke\appdata\Deepseek Harness EAC\logs\dsh-web.log`（每次 boot 后 tail），看 pluginManager 是否 attempted/failed。
4. 注：`dsh-web.log` 里另有 5 个**可选**内核服务 failed to import（deepseek-account/ptc-runtime/llm-* 等）——是冒烟 home 缺内核闭包所致，与 installer 无关，UI 正常启动，不阻塞。

### 2.3 环境恢复（新会话重启冒烟）

```bash
# 1. 本地 catalog/tgz 站点（后台）
node D:\tmp\pack-smoke\serve.mjs        # 端口 18888
# 2. 冒烟运行时（复用固定 home，后台）
cd "D:\DeepSeek Harness\dsh max\dsh_desktop\dsh-desktop"
node .verify/live-skin/live-boot.mjs "D:\DeepSeek Harness\dsh max\dsh_desktop\tauri-shell\staged-resources" ".verify\live-skin\pack-smoke-state.json" --home="D:\tmp\pack-smoke"
# 3. 浏览器：读 pack-smoke-state.json 的 webUrl（带 token）直接 open
```

- **harness 陷阱**：`live-boot.mjs` 默认每次 `mkdtemp` 全新 home——必须带 `--home=D:\tmp\pack-smoke` 才会用准备好的 home（本会话因此白查了 3 轮）。PATH 已在 harness 内自动加 staged `.bin`（提供 dsh CLI）。
- **浏览器自动化**：agent-browser 守护进程会随机 relaunch（页面丢失回 about:blank）。对策：全链路用 `eval` 驱动（先 `open` + `wait`，然后一个 eval 里做完"关内测声明→进设置→切 section→读 DOM"），不要用 snapshot/find（会撞 `_mask_` 遮罩层）。
- **内核日志**：`D:\tmp\pack-smoke\appdata\Deepseek Harness EAC\logs\dsh-web.log`（harness 把 APPDATA 指到 `<home 参数目录>\appdata`）。

### 2.4 管理页通了之后的验证剧本（写好了照做）

1. 插件页应出现 installer 的行（pack-installer / 整合包）。
2. installer 的 GUI 是 settings-section（Pack 卡片墙）：设置页 nav 应出现「整合包/EAC 安装」类条目（若懒加载不自动出现，从插件管理页点击该插件的设置/详情触发 lazy client 加载——client 的 `dsh.client.immediately=false`）。
3. GUI 内对 `dev.dsh-eac.recommended.v1` Pack 勾选确认 → 真实安装：archify + meow-smooth 走**真实 npm registry**下载。
4. 再装皮肤 Pack（14 款走本地 HTTP tgz——注意这些在 EAC staged 树里是预装 bundle，GUI 可能显示已安装；真实 tarball 安装路径已由 archify/meow-smooth 验证，同一 InstallerPort 代码）。
5. 断言：`D:\tmp\pack-smoke\dsh-home\profiles\web-desktop\node_modules\@tt-a1i\archify-dsh` 与 `meow-smooth` 目录出现、插件管理页行出现、L2 分级标签正确、截图存档。
6. 全程截图存 `.verify/live-skin/`，报告写 `.trae/sdd/plan/s10-official-track-smoke-report.md`。

---

## 3. 必修缺陷清单（M8 前必须改代码）

1. **安装器自插行双重注册（本会话发现）**：`dsh-eac-pack-installer` 的 `cordis.patch.yml` 自插行 + `dsh plugin add` 的 bundle 成员资格 = 服务双注册 = 官方 CLI 安装路径整屏失败。修法二选一：(a) 删掉安装器源仓库 `cordis.patch.yml` 的 insert 行（若市场安装路径会由 unified-market/manager 写行，删了不缺）；(b) 保留 insert 行但让 `dsh plugin add` 不进 bundles（不可行，CLI 行为改不了）。**倾向 (a)**，改完重打 tgz、重测双路径（CLI add + 手工 patch row 安装）。
2. **Mojobox 5 款皮肤 evidence digest 过期**：tgz 重打后 digest 变了（`catalog/evidence/dev.eac.skin-{miku,minecraft,qq98,ths,xp}-1.1.0.parsed.json`）——M8 发布刷新 artifact 时一并重算。
3. 皮肤包 tgz 以 `loader\.verify\pkgs-v1.1.0-fixed5`（已合并回 `-final`）为准；发布 README/Release Notes 时注明 1.1.0 含激活修复。

---

## 4. M8 待授权清单（用户逐项点头后才动）

1. push 5 仓库（顺序 R12：Desktop EAC → loader → free-model → Mojobox → installer；installer 还需**建 GitHub 仓库** `DSH-EAC/dsh-eac-pack-installer`）
2. loader v1.1.0 GitHub Release（上传 14 tgz + SHA256SUMS，从 `.verify/pkgs-v1.1.0-final/`）
3. free-model v1.3.0 release
4. Mojobox catalog 刷新（5 款皮肤 digest + artifact URL 指向真实 Release）+ 严格 CLI 复核
5. Tauri 便携包（`make-portable.mjs`，未跑）+ （可选）正式 tag 重打包
6. 安装态冒烟：**双击/静默装 NSIS → 冒烟**（新会话可仿照 5.3.6 的安装态冒烟套路）
7. 关 issue #415、#416（附 commit 引用）

---

## 5. 关键路径速查

| 东西 | 路径 |
| --- | --- |
| 验证 harness（皮肤/通用） | `dsh_desktop\dsh-desktop\.verify\live-skin\live-boot.mjs`（支持 `--home=`） |
| 冒烟 home（installer 已装） | `D:\tmp\pack-smoke\dsh-home` |
| 本地 catalog 站点 | `D:\tmp\pack-smoke\site` + `serve.mjs`（:18888） |
| EAC 正常 home 对照（勿删） | `D:\tmp\dsh-live-skin-b6sMyb\dsh-home` |
| 内核日志 | `<home 参数目录>\appdata\Deepseek Harness EAC\logs\dsh-web.log` |
| 台账/报告 | `.trae/sdd/plan/progress.md`、`s9-*.md`（本会话）、规划 v3 |
| 保护路径（勿动） | `probe-remote-session.cjs`、`tauri-shell/release/`、`sidecar/phone-bridge.js`、`sidecar/rescue-integration.js`、真实 `C:/Users/HUAWEI/.dsh` |
| memory | `dsh-ecosystem-m0-m8-progress.md`（已更新至本状态） |

## 6. 本会话教训（给下一个会话）

- 服务端 200 ≠ UI 可用：**任何内核升级/插件接入必须真实浏览器渲染冒烟**（本会话两个 P0 全是这么抓出来的）。
- 内核 bundle 加载顺序：`dsh.profile.bundles`（package.json）→ 各 bundle 的 `cordis.patch.yml` → 用户 `cordis.patch.yml`；patch 行 `insert` 会创建新装载行，配置行只覆盖——**同一包两路装载会双注册服务**。
- profile 手工搭建需要手动补内核 peers（EAC 壳的 companion-sync 平时会自动播种；冒烟 home 没有）。
- 排查 boot 失败三板斧：① 页面失败屏文本（entries 状态）② CDP 抓 console（`node_modules/cdp-capture.mjs` 用法见文件头）③ `dsh-web.log`（host 侧激活异常在这，页面侧被吞）。
