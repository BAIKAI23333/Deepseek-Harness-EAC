# Phase A/C 报告 — 收口提交 + 实机皮肤切换验证（M7 跳过）

日期：2026-09-27 ｜ 执行：接续 v3 总体规划的下一会话
结论：**Phase A 完成（5 仓库本地提交+3 tag，未 push）；Phase C 完成（13/13 皮肤实机激活+零残留，A27/A28 达成）；实机验证揪出并修复 2 个会让 M8 发布直接翻车的 P0 级缺陷。M7 按用户裁定跳过。**

---

## 1. Phase A — 收口提交（全部本地，未 push）

按 R12 顺序执行，提交前跑了 243/243 全量测试作门槛。保护路径（`probe-remote-session.cjs`、`tauri-shell/release/`、`sidecar/phone-bridge.js`、`sidecar/rescue-integration.js`）全程未 stage。

| 仓库 | 提交 | 内容 |
| --- | --- | --- |
| `DSH-Desktop-EAC` @ feat/eac-ecosystem-m0-m8 | `e620992` | M2/M3 收口：161 文件（14 皮肤/loader 预装目录、dsh-skin-switch 退役、.sync 全链路、#416 三层分级、s7 官方安装器/账号契约、vendored dsh-tool-bash 至 0.1.7-rc.2 + optional-escalation 补丁重放） |
| `dsh-ui-skin-loader` @ main | `59d67b5` + tag `v1.1.0` | 13 款公约皮肤（8 新 + 5 既有补 LICENSE/NOTICE/T-N） |
| `dsh-our-free-model` @ main | `13dc267` + tag `v1.3.0` | adapter/kernel.js 接缝、managed 模式、manifest 0.15、id 统一 |
| `dsh-mojobox` @ main | `13e72e1` | 47 catalog 记录、eac.recommended.v1 Pack/Lock、19 evidence、coverage 门禁 |
| `dsh-eac-pack-installer`（原非 git 仓库） | `8a5816f`（root）+ tag `v1.0.0` | git init + .gitignore（node_modules/dist/.verify）+ 全量首提交（lib/ 按 files 字段入库，148K） |

## 2. Phase C — 实机验证基础设施

- **`dsh-desktop/.verify/live-skin/live-boot.mjs`**（未跟踪 scratch，可直接复用）：复用 minimal-boot-smoke 的 RPC 装配，隔离 `DSH_HOME` 启动 staged 运行时，`boot.start` 拿 webUrl+token cookie，输出 state.json 后常驻（STOP 哨兵文件关机）。
- 浏览自动化：agent-browser（CDP）。loader 控制台入口 = 侧栏 footer-action `[data-usl-role=footer-action]`；皮肤卡片 `[data-usl-skin-id]`，`data-usl-skin-status` ∈ discovered/active/fault/suspect-residue；故障日志落盘于 `<DSH_HOME>/profiles/web-desktop/cordis.patch.yml` 的 `faultLog`。
- **此前 M2 的"26/26 冒烟"只做服务端断言（HTML/`__DSH_BOOT__` 解析），从未在真实浏览器渲染过 —— 这正是两个 P0 缺陷漏网的原因。**

## 3. 缺陷一（P0）：0.1.7-rc.2 移除 settingsScope → web boot 全屏失败

- **现象**：首屏直接 "Failed to load plugins: 2 entries did not activate（waiting for service: settingsScope）"，整个 UI 不可用。
- **根因**：settingsScope 服务 0.1.3 由 ui-settings 域提供（vendor tarball 全量 grep 实证），0.1.7-rc.2 全部 323 个 tarball 零引用（换成 settingsSchema/configForms）。Task 3.3 接回的 dsh-compact / dsh-easy-setup 仍 inject 它 → 永不激活 → dsh-app-boot 失败屏。**M0 升级时埋雷，243 测试全绿也测不出来（服务面漂移无人断言）。**
- **修复**（`60a2dab`）：
  - dsh-compact：`ctx.settingsScope.bind({namespace})` → `ctx.configForms.get(namespace)`（ConfigFormController 具备同构 getSnapshot/subscribe/set 面，diff 仅 2 行）；inject settingsScope→configForms。
  - dsh-easy-setup：inject 移除 settingsScope；visionScope 仅被 `if(false)` 死分支引用，连同分支一并移除。
  - 门禁：`test/kernel-service-compat.test.ts` —— 动态枚举内核服务面（super(ctx,"X") + runner 服务目录 + provide() + EAC SERVICE_NAME），断言随包插件 inject 无"无提供方"服务 + 回归钉死。lock 的两条 treeSha256 用 plugin-sync.mjs 导出原语独立重算。

## 4. 缺陷二（P0）：5 款生成器批次皮肤激活即 ReferenceError

- **现象**：miku/minecraft/qq98/ths/xp 点卡片无效果 → 卡片状态 fault。miku 在激活流程里先写入了 body 内联 background，回滚清不掉 → **V5 残留实锤**（83KB webp 背景穿越多次"恢复默认"）。
- **根因**（faultLog 落盘证据）：`activate of skin "minecraft" threw: minecraft_module_css_default is not defined`。生成器把 CSS 映射表 `var <name>_module_css_default = {...}` 留在 apply() 函数体内，引用它的 `const cls` 在模块作用域；esbuild 对函数内声明重命名为 `…_default2`（去冲突），引用不重命名 → 激活即抛。trading 同结构但名字一致所以幸存。
- **修复**（loader `2bc5da2`）：映射表整体上移到 apply() 之前的外层作用域 + 标识符改防冲突名 `<name>_skin_css_map`；5 包 `build-artifact.mjs` 重建；`.verify/pkgs-v1.1.0-final/` 五个 tgz 重打 + SHA256SUMS 再生（**M8 发布以该目录为准**）。桌面端 assets 同步重建 bundle。

## 5. 实机矩阵结果（修复后，隔离 DSH_HOME + 真实浏览器）

**13/13 激活成功 + 恢复默认零残留 + 零 console 错误**（协议：激活→快照→恢复默认→与基线逐字节比对 body style 声明名 + data-* 属性，失败自动重试一次）：

| 皮肤 | body 标记 | 结果 |
| --- | --- | --- |
| minecraft | data-dsh-minecraft | ✅ |
| qq98 | data-dsh-retro | ✅ |
| xp | data-dsh-xp | ✅ |
| trading | data-dsh-trading | ✅ |
| miku | data-dsh-miku | ✅（残留已修） |
| ths | data-dsh-ths | ✅ |
| aurora | data-skn-aurora-active | ✅ |
| inkwash | data-skn-inkwash-active | ✅ |
| maid-atelier | data-dsh-maid-atelier + data-maid-sidebar-size | ✅ |
| blue-fantasy | data-dsh-blue-fantasy | ✅ |
| whale-song | data-dsh-whale-song | ✅ |
| deep-whale-day-night | data-dsh-maid-atelier + data-maid-motion + data-maid-sidebar-size | ✅ |
| dragon-heir | data-dsh-dragon-heir | ✅ |

**A27 达成**（新皮肤实机切换零残留）。**A28 达成**（R3 目验）：deep-whale 与 maid-atelier 共享 body 标记（同一上游谱系，D1-3 已知）但互斥下无视觉串扰——deep-whale 呈鲸鱼娘昼夜工坊完整立绘（shot-08）、maid-atelier 呈华丽海军风主题（shot-09），退出后 html 主题态（data-ds-theme-source/color-scheme）逐字节还原。证据截图在 `.verify/live-skin/shot-0*.png`。

## 6. 测试与提交状态

- 桌面端：247/247 绿（243+4 门禁）。
- loader：全包 fail 0（loader 112 + aurora 21 + dragon-heir 13 + inkwash 9 + 其余各 3）。
- 提交：desktop `e620992` + `60a2dab`；loader `59d67b5` + `2bc5da2`；free-model `13dc267`；mojobox `13e72e1`；installer `8a5816f`。**全部未 push。**

## 7. 对 M8 的影响

- A27/A28/A29 中的 A27/A28 已解锁；A29（Tauri/NSIS 打包链）仍需 Rust 构建环境。
- D1-2 升级清单 + 本次教训：**内核升级必须跑 `kernel-service-compat` 门禁 + 一次真实浏览器渲染冒烟**（服务端 200 ≠ UI 可用）。
- Mojobox 的 5 款皮肤 evidence digest 因 tgz 重打而过期 —— Phase B 的"发布后刷新 digest"现改为"发布时必须刷新这 5 条 + free-model/loader"。
