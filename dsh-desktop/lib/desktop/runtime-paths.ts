'use strict';

// 运行时定位：内置 Node / npm CLI / dsh CLI 二进制（ADR 0002 L2 业务服务层；
// Wave 1 自 runtime-paths.js 类型化迁出，行为零变更）。
// 优先级：用户已批准的官方更新 overlay > 随包内置副本。

import path = require('node:path');
import fs = require('node:fs');
import cp = require('node:child_process');
import { nodeExecutableName } from './platform';
import { writeJsonAtomic } from '../atomic-json';

// 应用根目录（本模块位于 <root>/lib/desktop/ 下）。
export const APP_ROOT = path.resolve(__dirname, '..', '..');

/** 注入接口：由宿主（Tauri sidecar）在启动时提供。 */
export interface RuntimePathsCtx {
  log(tag: string, msg: string): void;
  getUserDataDir(): string;
  isPackaged?(): boolean;
  resourcesPath?(): string;
  appRoot?(): string;
  platform?: NodeJS.Platform;
}

interface UpdCtx {
  userDataDir: string;
  nodeExe: () => string;
  npmCli: () => string;
  log(tag: string, msg: string): void;
}

// updater.js 尚未类型化（Wave 3 收编），先以窄签名消费。
const updater = require('../../updater') as {
  overlayBinPath(c: UpdCtx): string | null;
  activeVersion(c: UpdCtx): string | null;
  overlayVersion(c: UpdCtx): string | null;
  bundledVersion(): string | null;
  compareVersions(a: string, b: string): number;
};

let ctx!: RuntimePathsCtx;
let overlayRejected = false;
export function init(d: RuntimePathsCtx): void {
  ctx = d;
  overlayRejected = false;
}
// 壳环境注入缺省时按开发态处理（保持原防御语义）。
function isPackaged(): boolean {
  return typeof ctx.isPackaged === 'function' ? !!ctx.isPackaged() : false;
}
function resourcesDir(): string {
  return typeof ctx.resourcesPath === 'function' ? ctx.resourcesPath() : '';
}
function runtimePlatform(): NodeJS.Platform {
  return ctx.platform ?? process.platform;
}

function appRoot(): string {
  return typeof ctx.appRoot === 'function' ? ctx.appRoot() : APP_ROOT;
}

export function nodeExe(): string {
  const executable = nodeExecutableName(runtimePlatform());
  // Tauri 布局：应用树 = <DSH_RESOURCE_ROOT>/dsh-desktop（= APP_ROOT），内置
  // Node 在 vendor/node/ 下；isPackaged 真实判定（5.3.3 批次 D）后打包分支
  // 必须优先走这里 —— 5.3.2 恒 false 掩盖了该差异（打包态其实一直在用
  // 开发分支的路径）。旧 Electron 布局 resources/node/ 保留为兼容候选。
  const tauriBundled = path.resolve(appRoot(), 'vendor', 'node', executable);
  if (isPackaged()) {
    if (fs.existsSync(tauriBundled)) return tauriBundled;
    return path.join(resourcesDir(), 'node', executable);
  }
  return tauriBundled;
}

export function npmCli(): string {
  const tauriBundled = path.resolve(appRoot(), 'vendor', 'npm', 'bin', 'npm-cli.js');
  if (isPackaged()) {
    if (fs.existsSync(tauriBundled)) return tauriBundled;
    return path.join(resourcesDir(), 'npm', 'bin', 'npm-cli.js');
  }
  return tauriBundled;
}

// Context shared with the updater module.
export function updCtx(): UpdCtx {
  return {
    userDataDir: ctx.getUserDataDir(),
    nodeExe,
    npmCli,
    log: ctx.log,
  };
}

interface OverlayHealthMarker {
  version: string;
  validatedAt: string;
}

function overlayDir(): string { return path.join(ctx.getUserDataDir(), 'agent'); }
function overlayHealthPath(): string { return path.join(overlayDir(), '.eac-agent-health.json'); }

function hasHealthyOverlayMarker(version: string | null): boolean {
  if (!version) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(overlayHealthPath(), 'utf8')) as OverlayHealthMarker;
    return marker.version === version && typeof marker.validatedAt === 'string';
  } catch { return false; }
}

function writeHealthyOverlayMarker(version: string): void {
  writeJsonAtomic(overlayHealthPath(), { version, validatedAt: new Date().toISOString() });
}

function nextBrokenOverlayDir(): string {
  const base = path.join(ctx.getUserDataDir(), 'agent-broken-' + Date.now());
  let candidate = base;
  let suffix = 0;
  while (fs.existsSync(candidate)) candidate = base + '-' + (++suffix);
  return candidate;
}

/**
 * 在 overlay 首次参与启动前用内置 Node 做一次真实 CLI 加载探测。
 * npm 退出码为 0、入口文件存在仍可能留下缺 peer dependency 的运行时；
 * `--version` 会加载 dsh 的实际入口，能在触碰用户 profile 前暴露这类错误。
 */
export async function ensureHealthyOverlay(timeoutMs = 20_000): Promise<{ source: 'overlay' | 'bundled'; reason?: string }> {
  const c = updCtx();
  const bin = updater.overlayBinPath(c);
  const version = updater.overlayVersion(c);
  const bundled = updater.bundledVersion();
  if (!bin || !fs.existsSync(bin) || !version) return { source: 'bundled', reason: 'missing' };
  if (bundled && updater.compareVersions(version, bundled) < 0) return { source: 'bundled', reason: 'older-than-bundled' };
  if (hasHealthyOverlayMarker(version)) return { source: 'overlay' };

  const smokeHome = path.join(ctx.getUserDataDir(), '.agent-health-check-' + process.pid);
  try {
    fs.mkdirSync(smokeHome, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      cp.execFile(nodeExe(), [bin, '--version'], {
        cwd: overlayDir(),
        env: { ...process.env, DSH_HOME: smokeHome },
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (!err) return resolve();
        const lines = String(stderr || stdout || err.message).split(/\r?\n/).filter(Boolean);
        const diagnostic = lines.find((line) => /Cannot find|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(line));
        const summary = [diagnostic, ...lines.slice(-4)].filter(Boolean).join(' | ');
        reject(new Error(summary || err.message));
      });
    });
    writeHealthyOverlayMarker(version);
    ctx.log('update', `Agent overlay ${version} 启动探测通过`);
    return { source: 'overlay' };
  } catch (err) {
    overlayRejected = true;
    const reason = String((err as Error).message || err);
    try {
      const broken = nextBrokenOverlayDir();
      fs.renameSync(overlayDir(), broken);
      ctx.log('update', `Agent overlay ${version} 启动探测失败，已隔离到 ${broken}，改用内置版本：${reason}`);
    } catch (moveErr) {
      ctx.log('update', `Agent overlay ${version} 启动探测失败且无法隔离，本次运行强制改用内置版本：${reason}；隔离错误：${String((moveErr as Error).message || moveErr)}`);
    }
    return { source: 'bundled', reason };
  } finally {
    try { await fs.promises.rm(smokeHome, { recursive: true, force: true, maxRetries: 3 }); } catch { /* 尽力清理 */ }
  }
}

// Updated overlay takes precedence over the bundled copy — 除非 overlay 比
// 随包内置内核旧（应用升级后，过时的官方更新 overlay 不得遮蔽更新的内置内核；
// 平局仍取 overlay，保持既有语义）。未经首次 CLI 探测确认的 overlay 不得
// 参与启动，避免损坏的用户目录副本遮蔽健康的内置内核。
function effectiveOverlay(): string | null {
  const c = updCtx();
  const ov = updater.overlayBinPath(c);
  if (overlayRejected || !ov || !fs.existsSync(ov)) return null;
  const ovVer = updater.overlayVersion(c);
  const bundled = updater.bundledVersion();
  if (ovVer && bundled && updater.compareVersions(ovVer, bundled) < 0) return null;
  if (!hasHealthyOverlayMarker(ovVer)) return null;
  return ov;
}

export function dshBin(): string {
  const ov = effectiveOverlay();
  if (ov) return ov;
  return require.resolve('@deepseek-ai/dsh/lib/bin.js');
}

export function dshVersion(): string {
  const c = updCtx();
  if (effectiveOverlay()) return updater.overlayVersion(c) || updater.activeVersion(c) || '未知';
  return updater.bundledVersion() || '未知';
}

export function dshVersionSource(): string {
  return effectiveOverlay() ? '用户目录（已更新）' : '内置';
}

export function isUsingOverlay(): boolean { return effectiveOverlay() !== null; }
