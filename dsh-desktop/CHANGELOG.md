# Changelog — Deepseek Harness EAC（揽尽万象 · Embracing All Creation）

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。
版本路径：0.1.0（基础壳）→ 0.2.0（伴侣插件体系 + 自更新 + 会话工具链）→
1.0.0（本版：品牌升级 EAC + 界面皮肤 + 快速配置 + 插件市场 + 稳定性自愈）。

## [1.0.0] — 2026-08-15

### 品牌与新定位
- 项目更名 **Deepseek Harness EAC**（EAC = Embracing All Creation，揽尽万象）：
  Windows 桌面客户端正式释出，产物统一命名 `Deepseek-Harness-EAC-v1.0-Portable/Setup-x64.exe`。
- 自更新链路同步指向新仓库，产物命名与 electron-builder 配置对齐。

### 新增
- **界面皮肤体系**（`assets/skins/` + `dsh-skin-switch`）：内置 10 款 Web UI 皮肤
  （9 款 dsh-web-ui：xp/qq98/ths/blue-fantasy/dragon-heir/minecraft/trading/whale-song/miku，
  1 款 dsh-deep-whale maid-atelier），设置页卡片式互斥切换、默认不启用、重启生效；
  出处与许可随包标注（BSD-3-Clause / CC BY-NC-SA 4.0）。
- **快速配置插件**（`dsh-easy-setup`）：设置页视觉模型提供商/模型一键选择、
  `soul.md` 人设可视化编辑、从 Codex / Claude Code 目录一键迁移 skills + MCP + 记忆。
- **插件市场加固**（`dsh-plugin-marketplace`）：宿主 typert local store 显式注册
  远端端点，修复跨模块实例 SRC 标记不可见导致的 HTTP 404。
- **profile 模块遮蔽自愈**（`profile-module-heal.js`）：清理 web profile 中遮蔽
  fallback junction 的真实目录副本，修复 `prompt section already registered`、
  模型列表/模式切换失效等问题。
- **自动化测试**：`test/` 新增 easy-setup、skin-switch、profile-module-heal、
  persona-scope、skin-chrome-zindex 等单测（`npm test`）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\Deepseek Harness EAC v1.0\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。

## [0.2.0] — 2026-08-14

### 新增
- **伴侣插件体系（一切插件化）**：新增 `assets/plugins/` 机制——宿主启动时把
  配套插件同步进 web profile（`~/.dsh/profiles/web`）并幂等打 `cordis.patch.yml`
  补丁启用。本版随客户端分发的插件：
  - `dsh-terminal`：会话内终端标签页（与 对话/轨迹/文件 并列）。在当前会话项目目录
    启动持久 PowerShell（SSE 流式，非 PTY），命令历史/清屏/重启/断线重连（保留
    512KB 回放）；显式 UTF-8 mini-REPL 规避 PS 5.1 重定向 stdin 的代码页问题；
  - `dsh-file-changes` + `dsh-client-file-changes`：会话文件修改追踪与一键还原。
    「文件」标签页聚合当前会话 agent 修改过的全部文件（新建/修改/删除 + 行级 diff），
    支持逐文件/全部还原（桌面壳做内容精确匹配后替换，冲突安全提示）。数据只读复用
    会话日志已持久化的 `tool/result.meta.diffs`（fs 写前锁内全文 diff），零写入、
    零格式变更；另提供项目文件树（`/api/dsh-files/list`）、站内 HTML/端口预览
    （`/dsh-files/static/*`、`ports`、`check`），全部仅回环；
  - `dsh-balance`：对话底部统计栏内联「本轮 ¥X.XX · 余额 ¥Y.YY」小部件
    （桌面壳读 `~/.dsh/.credentials.yaml` 调 `api.deepseek.com/user/balance`，
    15 分钟刷新，可配置价格档）；
  - `dsh-plugin-marketplace`：插件市场入口。
- **客户端自更新**（`client-updater.js`）：GitHub Releases → Gitee Releases 双源回退
  （`DSH_DESKTOP_RELEASE_API` 可自定义镜像），Gitee 100MB 分片自动下载合并；
  便携版原地替换 + 自动重启，安装版引导新安装包；失败自动保留当前版本。
- **跟随官方更新**（`updater.js`）：检测 `@deepseek-ai/dsh` 新版本，经用户同意后
  用内置 node+npm 安装到数据目录 overlay，staging 原子切换、失败回退、
  启动失败一键回退内置版本；尊重 `NPM_CONFIG_REGISTRY`。
- **会话完成系统通知**：agent 任务跑完弹 Windows 通知，点击回到窗口。
- **快捷键自动维护**：便携版自动创建/重建桌面+开始菜单快捷方式（exe 移动后自愈）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\DSH Desktop\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。
