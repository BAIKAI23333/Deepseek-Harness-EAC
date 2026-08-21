'use strict';

// V4 运行时补丁（自 main.js 原样迁出，ADR 0002 L2 业务服务层，幂等）：
// 覆盖三处运行副本 —— profile 共享 junction 根、内置 app 副本
// （__dirname/node_modules）、用户更新过的 agent overlay
// （<userData>/agent/node_modules）。agent 更新会换掉 overlay 整树，
// 补丁随 syncCompanionPlugins 每次启动重放。

const path = require('node:path');
const fs = require('node:fs');
const { patchSessionManage } = require('../../scripts/patch-session-manage');
const { APP_ROOT } = require('./runtime-paths');

let ctx = {};
function init(d) { ctx = d; }

function runtimePatchRoots() {
  const home = ctx.getDshHome() || path.join(require('node:os').homedir(), '.dsh');
  return [
    path.join(home, 'profiles', 'node_modules'),
    path.join(APP_ROOT, 'node_modules'),
    path.join(ctx.getUserDataDir(), 'agent', 'node_modules'),
  ];
}

// 对话删除 / 归档管理（dsh-session-manager 插件的前置依赖）：
// dsh-workspace + dsh-host-apiproxy + dsh-session + dsh-client-connection +
// dsh-client-ui-workspace 的外科手术式扩展（详见 scripts/patch-session-manage.js
// 头注释）。锚点不匹配（官方包结构变化）时自动跳过，绝不损坏文件。
function applySessionManageFix() {
  for (const root of runtimePatchRoots()) {
    if (!root || !fs.existsSync(root)) continue;
    try {
      const n = patchSessionManage(root, (m) => ctx.log('boot', m));
      if (n > 0) ctx.log('boot', '对话删除补丁: 已应用到 ' + root);
    } catch (err) {
      ctx.log('boot', '对话删除补丁失败(' + root + '): ' + err.message);
    }
  }
}

module.exports = { init, runtimePatchRoots, applySessionManageFix };
