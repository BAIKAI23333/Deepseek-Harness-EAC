'use strict';

// 插件保护中心入口（自 main.js 原样迁出，ADR 0002 L2 业务服务层）：
// 快照 / 回滚 / 静态体检 / 自动修复 / 守护启动 / 事故报告。
// 实例延迟创建（依赖 dshHome 与 settings 就绪）。

const { createGuard } = require('../../plugin-guard');

let ctx = {};
function init(d) { ctx = d; }

let guardInstance = null;
function ensureGuard() {
  if (!guardInstance) {
    guardInstance = createGuard({
      getHome: () => ctx.getDshHome() || require('node:path').join(require('node:os').homedir(), '.dsh'),
      getProfile: () => ctx.getDesktopProfile(),
      dshBin: () => ctx.getDshBin(),
      log: ctx.log,
    });
  }
  return guardInstance;
}

module.exports = { init, ensureGuard };
