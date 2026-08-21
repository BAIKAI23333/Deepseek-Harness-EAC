'use strict';

// 运行时定位：内置 Node / npm CLI / dsh CLI 二进制（自 main.js 原样迁出，
// ADR 0002 L2 业务服务层）。
// 优先级：用户已批准的官方更新 overlay > 随包内置副本。

const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const updater = require('../../updater');

// 应用根目录（本模块位于 <root>/lib/desktop/ 下）。
const APP_ROOT = path.resolve(__dirname, '..', '..');

let ctx = {};
function init(d) { ctx = d; }

function nodeExe() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'node', 'node.exe');
  return path.resolve(APP_ROOT, 'vendor', 'node', 'node.exe');
}

function npmCli() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js');
  return path.resolve(APP_ROOT, 'vendor', 'npm', 'bin', 'npm-cli.js');
}

// Context shared with the updater module.
function updCtx() {
  return { userDataDir: ctx.getUserDataDir(), nodeExe, npmCli, log: ctx.log };
}

// Updated overlay (user-approved official release) takes precedence over the
// bundled copy; the bundled copy is the fallback.
function dshBin() {
  const ov = updater.overlayBinPath(updCtx());
  if (ov && fs.existsSync(ov)) return ov;
  return require.resolve('@deepseek-ai/dsh/lib/bin.js');
}

function dshVersion() { return updater.activeVersion(updCtx()) || '未知'; }

function dshVersionSource() {
  return updater.overlayVersion(updCtx()) ? '用户目录（已更新）' : '内置';
}

module.exports = { APP_ROOT, init, nodeExe, npmCli, updCtx, dshBin, dshVersion, dshVersionSource };
