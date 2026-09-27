# DSH-EAC 生态整合包与发行链路重建 · 总体规划 v3

> 本文件是交给下一段开发对话的执行蓝图。读完本文件即可开工，无需重新调研。
> 编写日期：2026-09-27 ｜ 基线：`DSH-EAC/DSH-Desktop-EAC` `feat/eac-ecosystem-m0-m8`（未提交工作树，内核 0.1.7-rc.2）
> 上级计划：同目录 `2026-09-26-dsh-eac-ecosystem-packaging-plan-v2.md`（已过时）
> 配套文件：`987-prompt.md`（切换模型的开发提示词）
> 全部证据：`D:\DeepSeek Harness\dsh max\.trae\sdd\plan\`

---

## 0. 一句话状态

**M0-M6 全部完成，M7 未开始，M8 全部待授权。14 款皮肤已迁、loader 已预装、#415/#416 已落地、安装器已就绪、Mojobox 已刷新、free-model 已标准化。** 所有改动均为**本地未提交**，push/release/close issue 一律等用户授权。

---

## 1. 各阶段完成状态与缺陷清单

### M0 — 上游同步 + 内核升级 rc2 ✅ 已完成

- 分支 `feat/eac-ecosystem-m0-m8` @ `c0fdec5`；内核 0.1.5-rc.2 → 0.1.7-rc.2
- `npm test` 180/180 → 243/243（含后续 M2/M3 测试）全绿

### M1 — 皮肤全面公约化 ✅ 已完成（含 2 项 DEFERRED）

**已完成**：loader v1.1.0，14 款皮肤（loader + aurora/inkwash/dragon-heir/trading/whale-song/blue-fantasy/maid-atelier/miku/minecraft/qq98/ths/xp/deep-whale-day-night），204 测试全绿，14 个 release-ready tgz + SHA-256 清单。

**DEFERRED（2 项）**：

| 皮肤 | 状态 | 原因 |
| --- | --- | --- |
| `dsh-theme-endfield` | **DEFERRED** | 完整 host/client 插件（音频运行时 + 诊断写入 + 411KB client + 独立 settings 命名空间），不是纯皮肤；迁移 = 产品级重平台，需单独决策 |
| ~~deep-whale-day-night~~ | ~~已迁~~ | 报告初版 defer，后续修正后成功迁移（唯一身份 `dsh-eac.skin.deep-whale-day-night`，CC BY-NC-SA-4.0） |

**已知缺陷**：
- D1-1：**无 live DSH 运行时切换验证**。本机无 `dsh` CLI，新 7 款皮肤（尤其是 deep-whale-day-night/maid-atelier 等体积大的）未在真实 DSH 环境做 V5（切换零残留）+ V11（公约自检表）实机验证。M8 前必须在干净 Windows 环境补做。
- D1-2：**peer 钉与内核升级耦合**。14 个包 `peerDependencies["@deepseek-ai/dsh"]` 精确钉 `0.1.7-rc.2`，内核升级而皮肤包未同步发版时会被静默 skip。M8 前需把「内核升级 ⇒ loader/skin peer 同步」写进升级清单。
- D1-3：**deep-whale-day-night 与 maid-atelier 上游身份关联**。deep-whale 的 vendored bundle 中残留 9 个 `maid-atelier` body-marker 字符串（R3 碰撞未完全消除），loader 控制台同时展示两款皮肤时，deep-whale 激活后可能误扫 maid-atelier 的 chrome。当前靠 loader 全局互斥规避，但两款皮肤不能同时激活不等于 deep-whale 的 CSS 选择器干净。M8 发布前建议目验验证。

### M2 — #415 执行 ✅ 已完成

**已完成**：`dsh-skin-switch` 删除（staged）、旧 `assets/skins/` 未复活、ADR 0010 shell recovery fallback 保留但未变成用户选择器、14 款皮肤预装（`assets/plugins/` 新增 14 目录 + 装配面 + bundles 播种 + 台账/注册表全链路）。

**验证**：staged-runtime PASS + minimal-boot-smoke PASS + 隔离 home 冒烟 26/26 绿。

**已知缺陷**：
- D2-1：**client bundle 全量预载体积 22.9 MiB**。14 个 client bundle 全进 `__DSH_BOOT__` 预载批，首屏负担大。若要降温需产品决策（精简包 + L2 推荐）。
- D2-2：**严格 CLI 在精简体不可运行**。`generate-registry --check` / `generate-lock` 需要完整树；本次用独立重算 + 逐字节契约替代。M8 前需在完整树复核一次。
- D2-3：**旧 `assets/skins` 溯源记录仍在 `SOURCES.json` 中**（C049–C058），`plugin-ledger.mjs` 对它们报"路径不存在"（M2 前既有）。未阻塞，但台账不绿。
- D2-4：**Tauri 壳二进制 / NSIS 安装器未跑**。本机无 Rust 构建链路，staged 冒烟覆盖运行面，打包链路留给 M8。

### M3 — #416 执行 ✅ 已完成

**已完成**：`distributionClass` 运行时/UI 三层行为落地（L1 builtin 锁定启用、L2 recommended 可选安装+启用选择、L3 external 默认禁用），202/202 桌面测试 + 15/15 隔离 home 冒烟绿。

**已知缺陷**：
- D3-1：**CLI 安装路径的第三方包同样默认禁用**（A11 语义），若认为 CLI 安装应「装完即启用」需 M8 前裁定。
- D3-2：**市场安装不再热挂载**（避免绕过关闭行），安装后需手动到设置页启用——UX 变化已生效。
- D3-3：**生成器严格路径在精简体不可运行**，与 D2-2 同源。

### M4 — Mojobox Pack 收口 ✅ 已完成（审计修复后）

**已完成**：47 plugins / 5 Packs / 5 Locks / 19 evidence；`eac.recommended.v1` Pack/Lock（archify + meow-smooth）；14 款 loader/skin v1.1.0 catalog 刷新；coverage doc + guard script；`npm test` + `npm run test:eac` + `.dshpack` 复现全绿。

**已修复（审计后）**：
- C1：meow-smooth 实际已发布 npm（之前误判为 unpublished），已补 artifact + 入 Lock + 改台账
- I1：Pack ID 从裸 `eac.recommended.v1` 改为 `dev.dsh-eac.recommended.v1`
- I2：`check-eac-coverage.mjs` 死代码修复（`Set<Promise>` → `Set<string>`）

**已知缺陷**：
- D4-1：**builtin/skins/free-model Pack 仍为 draft/source-pending**（无 publishable npm artifact）。解锁条件：M8 发布 loader/skin npm + free-model 公开后升级。
- D4-2：**Mojobox 未提交未推送**。所有改动本地保留，等 M8 授权。

### M5 — 整合包安装器插件 ✅ 已完成

**已完成**：`dsh-eac-pack-installer` 本地仓库，host/client 两半，offline Mojobox snapshot（47 plugins / 6 packs / 60.4 KiB），tier policy，settings-section GUI（Pack 卡片墙 + 分级标签 + 勾选确认），93/93 测试绿，typecheck/lint/build/smoke/pack 全绿。

**已知缺陷**：
- D5-1：**GitHub 仓库未创建**（`DSH-EAC/dsh-eac-pack-installer` 404）。需用户授权建库 + push。
- D5-2：**官方账号/OAuth 未接线**。rc2 默认不 ship `platformOrigin`，安装器 adapter 诚实上报 sign-in unavailable；配置 origin 后自动启用。
- D5-3：**离线 snapshot 是 deterministic floor**，在线 catalog 读取为可选增强。

### M6 — free-model 收口 ✅ 已完成（审计修复后）

**已完成**：`dsh-our-free-model` v1.3.0（adapter/kernel.js、managed 模式、16/16 测试绿、manifest 0.15 + provenance/integrity 记录、版本一致性全仓 1.3.0）。

**已修复（审计后）**：
- C1：catalog id 从 `dev.zouyuxuan122.our-free-model` 改为 `dev.zouyuxuan122.dsh-our-free-model`（与 Mojobox 一致）
- I1：revision 检查从 `git rev-parse HEAD` 改为 "最近一次触及发布内容的 commit"，避免提交即死锁
- I2：版本从 1.2.2 升到 1.3.0，全部清单同源再生

**已知缺陷**：
- D6-1：**未提交未推送未发布**。等 M8 授权。
- D6-2：**Mojobox 侧未收录**。C1 修复后 id 已统一，但尚未拷贝进 Mojobox `catalog/plugins/`。
- D6-3：**artifactDigest 仍为 null**。须待 M8 真实发布 tgz 后从实际制品计算。

### M7 — 宣发素材 ⬜ 未开始

### M8 — 发布 ⬜ 全部待授权

---

## 2. 剩余工作（按依赖排序）

### Phase A：收口提交（需用户授权 push）

| 仓库 | 改动量 | 当前状态 | 下一步 |
| --- | --- | --- | --- |
| `DSH-EAC/DSH-Desktop-EAC` | 25 修改 + 14 新增 + 4 删除 | 本地未提交 | `git add` + `git commit` + `git push origin feat/eac-ecosystem-m0-m8` |
| `DSH-EAC/dsh-ui-skin-loader` | 14 包 tgz + manifest（gitignored）+ worktree 修改 | 本地未提交 | commit v1.1.0 + tag + GitHub Release（14 tgz） |
| `DSH-EAC/dsh-mojobox` | 47 records / 5 Packs / 19 evidence + coverage doc | 本地未提交 | commit + push（M4 审计修复已含） |
| `zouyuxuan122/dsh-our-free-model` | 17 修改 + 6 新增 | 本地未提交 | commit v1.3.0 + tag + release |
| `DSH-EAC/dsh-eac-pack-installer` | 完整新仓库 | 本地-only | 新建 GitHub 仓库 + push + release |

### Phase B：Mojobox 与安装器联动（依赖 Phase A）

1. loader v1.1.0 GitHub Release 发布后 → Mojobox 14 条 skin 记录更新 `artifact.path` 为真实 URL + 重测 digest
2. free-model v1.3.0 发布后 → Mojobox 补 `artifactDigest` + 从 source-pending 升级
3. free-model 拷贝进 Mojobox `catalog/plugins/` + `npm test`
4. `eac.free-model.v1` Pack 从 draft 升级（若发布 npm）或保持 source-pending
5. 安装器 snapshot 重新生成（消费最新 Mojobox catalog）

### Phase C：实机验证（必须在发布前）

| 验证项 | 阻塞原因 | 优先级 |
| --- | --- | --- |
| 新 7 款皮肤真实 DSH 切换（V5 残留 + V11 自检表） | 本机无 `dsh` CLI | Critical |
| deep-whale-day-night 与 maid-atelier 共存目验（R3 碰撞） | 同上 | High |
| Tauri staged 打包 + NSIS 安装器完整流程 | 本机无 Rust 构建 | High |
| 官方桌面端安装器插件实机（GUI 勾选 → 安装 → 启用） | 需官方 DSH Desktop 环境 | High |
| 跨内核升级 peer 兼容性（0.1.7-rc.2 → 未来版本） | 需未来内核版本 | Medium |

### Phase D：宣发（M7）

- README 双轨口径更新
- 换肤控制台截图（亮/暗）
- 整合包安装器 GUI 截图
- free-model 使用界面截图
- Release Notes 撰写

### Phase E：发布（M8，需用户逐项授权）

1. 推送 `feat/eac-ecosystem-m0-m8` → main
2. 发布 loader v1.1.0 GitHub Release
3. 发布 free-model v1.3.0
4. 新建 `DSH-EAC/dsh-eac-pack-installer` 仓库并发布 v1.0.0
5. 推送 Mojobox catalog 更新
6. 构建 Tauri Setup/Portable
7. 发布 EAC 桌面新版
8. 关闭 issue #415、#416

---

## 3. 全局裁定更新（新增 v3）

R11: **实机验证是发布硬门槛**。无 live DSH 切换验证的 7 款新皮肤不得进入 M8 发布；deep-whale-day-night 的 R3 碰撞必须在真实切换中目验确认无异常。

R12: **收口提交顺序**。Desktop EAC 优先（它是一切的上游消费者），然后是 loader + free-model（发布物），然后是 Mojobox（消费发布物的 digest），最后是 installer（消费 Mojobox snapshot）。

R13: **M7 宣发不得早于 Phase C 实机验证**。截图和演示视频必须在验证通过的真实环境中录制，否则可能录到布局破损或残留问题。

---

## 4. 验收标准更新

| ID | 标准 | 状态 | 阻塞 |
| --- | --- | --- | --- |
| A1-A4 | M1 皮肤迁移 | ✅ | — |
| A5-A8 | M2 #415 | ✅ | — |
| A9-A12 | M3 #416 | ✅ | — |
| A13-A15 | M4 Mojobox | ✅ | D4-1 draft Pack 待 M8 |
| A16-A19 | M5 安装器 | ✅ | D5-1 仓库未创建 |
| A20-A21 | M6 free-model | ✅ | D6-2 Mojobox 未收录 |
| A22-A23 | M7 宣发 | ⬜ | 未开始 |
| A24-A26 | M8 发布 | ⬜ | 全部待授权 |
| A27（新增） | 新皮肤实机切换零残留 | ⬜ | 无 dsh CLI |
| A28（新增） | deep-whale R3 碰撞目验通过 | ⬜ | 同上 |
| A29（新增） | Tauri 打包/安装器完整流程 | ⬜ | 无 Rust 构建 |

---

## 5. 给下一段对话的交接说明

1. **当前是“全部就绪、只等授权”状态**。不要重新做 M0-M6 的任何工作；所有产出已本地验证。
2. **下一个决策点**：用户是否授权 push + release？若授权，按 Phase A→B→C→D→E 顺序执行。
3. **若用户不立即授权**：可先推进 M7 宣发素材准备（文案、截图脚本），但截图必须在实机验证后录制（R13）。
4. **若用户要求先验证再发布**：优先解决 Phase C（找一台有 `dsh` CLI 的环境或装一个隔离 DSH_HOME 的 0.1.7-rc.2 实例）。
5. **全部报告证据在** `.trae/sdd/plan/`，任何细节疑问可直接读对应 report，无需重新调研。
