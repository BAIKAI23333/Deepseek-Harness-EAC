# T4 Beta 桌面交付完成报告

## 结论

`codex/beta-t4-delivery` 已完成 Windows x64 桌面交付实现和本机隔离验收。应用版本为 6.0.0，内核为 0.1.7-rc.2。最终 NSIS 安装包和便携 ZIP 已生成并计算 SHA256；本轮变更将提交并推送至该分支，随后创建面向 `beta` 的远程 PR；不发布、不打标签、不关闭 Issue。

本轮 V5 结论为 `partial`：已完成真实安装树、便携树、WebView2、窗口控制、标准会话、皮肤、人设设置、重启和卸载数据保护验证；干净 Windows、跨版本接管、故障注入、便携自动更新事务和真实模型请求仍未验证。

## 实现内容

- 为 6 款皮肤的法务文件补充精确 LF 规则，修复 Windows 检出后的摘要门禁失败。
- 将 `dsh-easy-setup` host/client codec 迁移到当前 Typert 的 `create()` 工厂，并加入真实 Cordis/Typert 注册回归测试。
- 补齐桌面桥 `updates.status()` 与 `updates.open()`，使 rc.2 设置插件能够在 Tauri WebView 中激活。
- 将 `dsh-ptc-runtime`、`dsh-llm-deepseek`、`dsh-deepseek-account` 纳入应用依赖闭包，修复默认标准会话的运行时 peer 缺失。
- 更新 `.sync/plugins.lock.json`、依赖锁文件和交接文档。

## 验证结果

- Node 全量测试：280/280；TypeScript 类型检查、语法检查通过。
- Rust native：supervisor 10 项、snapshot 16 项；Tauri 壳 11 项全部通过。
- 最终 staging：591 个包，33 个必需文件和 9 个退役路径检查通过。
- 真实桌面：13/13 皮肤激活/恢复；标准会话创建并持久化；窗口最大化、隐藏、单实例唤回；人设保存与重启回读；两轮无 CDP 原生启动退出通过。
- 安装器：中文空格路径、完整版/精简版选择、同版本覆盖、非空外部目录拒绝、卸载和用户数据保留通过。

完整日志、截图和断言结果位于 `D:/AI_Coding/eac-t4-evidence-20260927/`。最终产物位于该目录的 `final-artifacts/`，对应哈希见其中的 `SHA256SUMS.txt`。

## 风险与后续

- 技能分类器仍将 `.sync/plugins.lock.json` 判为 unmatched-code，并引用 beta 已删除的测试；按用户授权记录为过期交接问题，未修改技能规则。
- 一次固定 CDP 端口的立即重启出现 WebView 时序异常；断开旧 CDP、换端口并间隔启动后通过，随后无调试参数的两轮原生复核通过，仍保留为间歇风险。
- T2 依赖 `beta-pack` 提供含 `lib/types/types.js` 和 `./types` 导出的安装器 tgz；本报告不宣称 T2 已完成。
