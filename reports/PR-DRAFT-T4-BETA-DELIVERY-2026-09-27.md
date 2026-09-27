# PR Draft: 修复 beta 桌面交付运行时兼容与依赖闭包

## 标题

`fix(tauri): 完成 beta Windows x64 桌面交付验收`

## 目的 Purpose

`beta` 在 Windows x64 真实 Tauri WebView 中仍有三类交付阻断：皮肤摘要受行尾影响、`dsh-easy-setup` 使用旧 Typert codec、rc.2 设置页需要的桌面更新桥方法缺失；默认标准会话还会因三个未装入的内核 peer 包而无法稳定创建。本 PR 修复这些问题，并补充回归测试和交接报告。

## 架构与范围 Architecture & Scope

- L1 Tauri/Rust：仅通过现有 bridge 暴露兼容方法，未新增原生业务。
- L2 bridge：补齐 `updates.status()` / `updates.open()`。
- L3 依赖：显式加入三个已钉版 vendor tarball，未修改 `@deepseek-ai/*` 源码。
- 插件/资产：修复 `dsh-easy-setup` codec 和皮肤法务文件行尾；同步插件锁摘要。
- 文档：更新 `TEAM-TAKEOVER-2026-09-27.md`，新增 T4 完成报告。

## 风险与兼容 Risks & Compatibility

- 用户 `DSH_HOME`、profile、sessions、skills、preset 和配置布局未改变。
- 未验证干净 Windows、跨版本升级、断电/文件锁故障注入、便携自动更新事务和真实模型请求。
- 技能分类器存在已记录的过期规则；未在本 PR 中扩大修复范围。

## 验证 Verification

- `npm run typecheck`：PASS。
- `node scripts/check-syntax.js`：PASS。
- `npm test`：280/280 PASS，无跳过。
- native supervisor/snapshot：10/10、16/16 PASS。
- Tauri `cargo test --locked`：11/11 PASS。
- 最终 staging：591 包；默认标准会话创建、13 款皮肤、安装/便携运行、重启和卸载数据保护均已在本机隔离目录验证。
- `git diff --check`：PASS。

## 配置与迁移 Configuration & Migration

不需要用户迁移。新增依赖来自现有 0.1.7-rc.2 vendor tarball；重新安装依赖时沿用仓库 `.npmrc` 的 `legacy-peer-deps=true`。

## 回退方式 Rollback

回退本 PR 即恢复原有 bridge、codec 和依赖清单；安装器升级失败时保留用户数据。正式发布前应重新生成 staging 和安装/便携产物，不复用本机证据目录中的旧产物。

## 审阅提示

本 PR 只覆盖 `beta` 的 T4 桌面交付。`beta-pack` 的安装器 T1/T2 仍是独立协作项；本 PR 不应关闭对应 Issue，也不应触发发布流程。
