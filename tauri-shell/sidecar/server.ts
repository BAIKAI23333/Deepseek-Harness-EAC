'use strict';

// L2 Node sidecar 实体化（ADR 0002；T3-a 第二阶段）。
// 职责：
//   1. stdio 行分隔 JSON-RPC 分发器（协议与 ping.js 一致，Rust L1 唯一对话面）
//   2. 挂载 dsh-desktop/lib/desktop/* 全部 13 个模块（ctx 注入按宿主语义提供）
//   3. 白名单方法注册表 + mod.call 通用逃生舱（白名单模块内具名导出直调）
//
// 纪律：stdout 只走协议帧；一切日志/兜底输出走 stderr。

import path = require('node:path');
import os = require('node:os');
import fs = require('node:fs');
import readline = require('node:readline');

const DSH_DESKTOP_ROOT = path.resolve(__dirname, '..', '..', 'dsh-desktop');
const LIB = (m: string): string => path.join(DSH_DESKTOP_ROOT, 'lib', 'desktop', m);

function say(s: string): void { process.stderr.write('[sidecar] ' + s + '\n'); }

// ---- 宿主语义（对齐 Electron main.js 的注入值） --------------------------
const APP_NAME = 'Deepseek Harness EAC';
const appDataDir = path.join(os.homedir(), 'AppData', 'Roaming');
const userDataDir = path.join(appDataDir, APP_NAME);
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const log = (tag: string, msg: string): void => say('[' + tag + '] ' + msg);

let pkgVersion = '0.0.0';
try {
  pkgVersion = JSON.parse(fs.readFileSync(path.join(DSH_DESKTOP_ROOT, 'package.json'), 'utf8')).version || pkgVersion;
} catch { /* 保持缺省 */ }

type Mod = { init: (d: unknown) => void } & Record<string, unknown>;
const mount = (name: string): Mod => require(LIB(name)) as Mod;

const procMod = mount('proc');
const pathsMod = mount('runtime-paths');
const profileMod = mount('profile');
const guardBoxMod = mount('guard-box');
const runtimePatchesMod = mount('runtime-patches');
const companionSyncMod = mount('companion-sync');
const pluginOpsMod = mount('plugin-ops');
const marketMod = mount('market');
const shortcutsMod = mount('shortcuts');
const junctionPatrolMod = mount('junction-patrol');
const clientUpdateMod = mount('client-update');
const previewMod = mount('static-preview');
const fileRootsMod = mount('file-roots');
const bootMod = mount('boot-server');

const MOUNTED = ['proc', 'runtime-paths', 'profile', 'guard-box', 'runtime-patches', 'companion-sync', 'plugin-ops', 'market', 'shortcuts', 'junction-patrol', 'client-update', 'static-preview', 'file-roots', 'boot-server'];

// ---- ctx 注入（与 main.js 注入块逐项对齐；GUI 类能力走兜底/委托） --------
const desktopProfileFn = profileMod.desktopProfile as () => string;
const showBoxFallback = async (opts: { title?: string; message?: string }) => {
  say('[dialog] ' + ((opts && opts.title) || '') + ': ' + ((opts && opts.message) || ''));
  return { response: 0 };
};
const notifyFallback = (n: { title: string; body: string }) => say('[notify] ' + n.title + ': ' + n.body);
// .lnk 驱动占位：P2 Rust LinkDriver 就位后经 WS 替换。
const linkUnsupported = (): never => { throw new Error('LinkDriver not available in sidecar yet (P2)'); };

procMod.init({ log, getDshHome: () => dshHome, getDesktopProfile: desktopProfileFn });
pathsMod.init({ log, getUserDataDir: () => userDataDir, isPackaged: () => false, resourcesPath: () => '' });
profileMod.init({ log, getDshHome: () => dshHome });
guardBoxMod.init({
  log,
  getDshHome: () => dshHome,
  getDesktopProfile: desktopProfileFn,
  getDshBin: () => (pathsMod.dshBin as () => string)(),
});
runtimePatchesMod.init({ log, getDshHome: () => dshHome, getUserDataDir: () => userDataDir });
shortcutsMod.init({
  log,
  showBox: showBoxFallback,
  getUserDataDir: () => userDataDir,
  getDshHome: () => dshHome,
  isPackaged: () => false,
  systemPath: (kind: string) => (kind === 'appData' ? appDataDir : kind === 'desktop' ? path.join(os.homedir(), 'Desktop') : ''),
  links: { read: linkUnsupported, write: linkUnsupported },
});
junctionPatrolMod.init({
  log,
  isQuitting: () => false,
  isRestartingServer: () => false,
  getServerProc: () => null,
  showMainWindow: () => say('showMainWindow (host-delegated)'),
  notify: notifyFallback,
});
clientUpdateMod.init({
  log,
  showBox: showBoxFallback,
  isQuitting: () => false,
  getAppVersion: () => pkgVersion,
  getUserDataDir: () => userDataDir,
  getDshHome: () => dshHome,
  // 更新窗口/进度推送是 GUI 能力：P2 起由 Rust 宿主实现后接入。
  showUpdateWindow: () => null,
  makeUpdateProgressPusher: () => ({ client: () => {}, agent: () => {}, force: () => {} }),
  prepareQuitForClientUpdate: async () => { say('prepareQuitForClientUpdate (host-coordinated later)'); },
  exitProcess: () => process.exit(0),
  getExecDir: () => path.dirname(process.execPath),
});
previewMod.init({ log, showBox: showBoxFallback, exitDamaged: () => process.exit(1), isPackaged: () => false, resourcesPath: () => '' });
marketMod.init({ log, getDshHome: () => dshHome, getUserDataDir: () => userDataDir });
pluginOpsMod.init({ log });
companionSyncMod.init({
  log,
  getDshHome: () => dshHome,
  getUserDataDir: () => userDataDir,
  applyLegacySkinChoice: () => (shortcutsMod.applyLegacySkinChoice as () => void)(),
  showMainWindow: () => say('showMainWindow (host-delegated)'),
  notify: notifyFallback,
});

// ---- boot-server（P2：dsh web 服务编排） --------------------------------
// settings 兼容层：与 updater.js 的 userData/settings.json 同文件同语义
// （load 回退 {}，save 2 空格缩进 + 尾换行），端号偏好双壳共享。
let quitting = false;
const settingsFile = path.join(userDataDir, 'settings.json');
function loadSettings(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>; } catch { return {}; }
}
function saveSettings(s: Record<string, unknown>): void {
  try { fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2) + '\n'); } catch (e) { say('保存 settings 失败: ' + String(e)); }
}

/** 无 id 的 JSON-RPC 通知帧（Rust 侧经 WS 广播给页面，并自行订阅壳层事件）。 */
function notify(method: string, params: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params: params == null ? {} : params }) + '\n');
}

bootMod.init({
  log,
  getUserDataDir: () => userDataDir,
  getDesktopProfile: desktopProfileFn,
  desktopProfileDir: () => (profileMod.desktopProfileDir as () => string)(),
  nodeExe: () => (pathsMod.nodeExe as () => string)(),
  dshBin: () => (pathsMod.dshBin as () => string)(),
  loadSettings,
  saveSettings,
  isQuitting: () => quitting,
  onServerDied: (info: unknown) => notify('boot.server-died', info),
});

say('modules mounted; dshHome=' + dshHome + '; profile=' + desktopProfileFn());

// ---- 方法注册表 -----------------------------------------------------------
interface RpcReq { id: number | null; method: string; params?: Record<string, unknown> }
type RpcResult = Record<string, unknown>;
type RpcParams = Record<string, unknown> | undefined;

const MODULES_BY_NAME: Record<string, Mod> = {
  profile: profileMod,
  'runtime-paths': pathsMod,
  proc: procMod,
  'file-roots': fileRootsMod,
  'guard-box': guardBoxMod,
  'runtime-patches': runtimePatchesMod,
  'companion-sync': companionSyncMod,
  'plugin-ops': pluginOpsMod,
  market: marketMod,
};

// 逃生舱白名单：只放纯计算/纯文件类模块；带进程副作用的
// （shortcuts/junction-patrol/client-update/static-preview）必须走显式方法。
const CALLABLE = new Set(Object.keys(MODULES_BY_NAME));

const methods: Record<string, (p: RpcParams) => unknown> = {
  'shell.info': (): RpcResult => ({
    sidecar: 'server.ts',
    node: process.version,
    platform: process.platform,
    pid: process.pid,
    dshHome,
    version: pkgVersion,
    modules: MOUNTED,
  }),
  'profile.name': (): RpcResult => ({ name: desktopProfileFn() }),
  'profile.dir': (): RpcResult => ({ dir: (profileMod.desktopProfileDir as () => string)() }),
  'runtime.nodeExe': (): RpcResult => ({ exe: (pathsMod.nodeExe as () => string)() }),
  'runtime.dshBin': (): RpcResult => ({ bin: (pathsMod.dshBin as () => string)() }),
  'plugins.removedIds': (): RpcResult => ({ ids: (companionSyncMod.removedPluginIds as () => unknown[])() }),
  'guard.ensure': (): RpcResult => ({ ok: !!(guardBoxMod.ensureGuard as () => unknown)() }),
  // ---- boot.*（P2：dsh web 服务编排，Rust 壳的启动主链路） ----
  'boot.start': async (p): Promise<RpcResult> => {
    const overlays = Array.isArray(p && p.overlays) ? (p!.overlays as string[]) : [];
    // 前置文件树准备（= main.js boot() 在 startAndShowGuarded 之前的序列，
    // 摘除 GUI 项）：市场排队 → 退役清理 → 配套插件/技能同步 → 模块遮蔽
    // 修复 → 构建产物回填。koffi 预检与 junction 巡检属 P3 壳层集成。
    try {
      await (marketMod.processPendingMarketOps as () => Promise<void>)();
      (companionSyncMod.retireRemovedBuiltinPlugins as (dir: string) => void)((profileMod.desktopProfileDir as () => string)());
      (companionSyncMod.syncCompanionPlugins as () => void)();
      (marketMod.syncBundledSkills as () => void)();
      (companionSyncMod.healProfileModules as () => void)();
      await (marketMod.restoreKeptArtifacts as (profile: string) => Promise<void>)(desktopProfileFn());
    } catch (e) {
      say('boot 前置准备失败（继续尝试拉起服务）: ' + String(((e as Error).message) || e));
    }
    const r = await (bootMod.startAndWait as (o: string[]) => Promise<{ webUrl: string; port: number }>)(overlays);
    notify('boot.web-ready', r);
    return r;
  },
  'boot.stop': async (): Promise<RpcResult> => {
    await (bootMod.stopServer as () => Promise<void>)();
    return { ok: true };
  },
  'boot.state': (): RpcResult => (bootMod.state as () => unknown)() as RpcResult,
  // ---- chrome.init（getInfo；字段集对齐 main.js chrome:init handler） ----
  'chrome.init': (): RpcResult => {
    const s = loadSettings() as {
      closeToTray?: boolean; exitAction?: string; shortcutPolicy?: string;
      notifyOnTurnEnd?: boolean; repos?: { github?: string; gitee?: string };
    };
    let iconDataUri = '';
    try {
      const buf = fs.readFileSync(path.join(DSH_DESKTOP_ROOT, 'assets', 'icon.png'));
      if (buf.length > 0 && buf[0] === 0x89 && buf[1] === 0x50) {
        iconDataUri = 'data:image/png;base64,' + buf.toString('base64');
      }
    } catch { /* 无图标不致命 */ }
    const exitAction = s.exitAction === 'ask' || s.exitAction === 'minimize' || s.exitAction === 'quit'
      ? s.exitAction
      : s.closeToTray === false ? 'quit' : s.closeToTray === true ? 'minimize' : 'ask';
    let repos = { github: '', gitee: '' };
    try {
      const cu = require(path.join(DSH_DESKTOP_ROOT, 'client-updater.js')) as { resolveRepos(r: unknown): { github: string; gitee: string } };
      repos = cu.resolveRepos(s.repos);
    } catch { /* 回退空串（菜单隐藏更新源区） */ }
    return {
      appVersion: pkgVersion,
      agentVersion: (pathsMod.dshVersion as () => string)(),
      agentSource: (pathsMod.dshVersionSource as () => string)(),
      notifyOnTurnEnd: s.notifyOnTurnEnd !== false,
      closeToTray: s.closeToTray !== false,
      exitAction,
      shortcutPolicy: s.shortcutPolicy === 'never' ? 'never' : 'auto',
      iconDataUri,
      repoUrls: { github: repos.github ? 'https://github.com/' + repos.github : '', gitee: repos.gitee ? 'https://gitee.com/' + repos.gitee : '' },
      staticPort: 0,
    };
  },
  // 原地重启（= main.js restartWebServiceCore）：无锁窗口内消费市场排队 →
  // 同步配套插件 → 修复模块遮蔽 → 恢复保留产物 → 重新拉起。
  'boot.restart': async (): Promise<RpcResult> => {
    const running = (bootMod.state as () => { running: boolean })().running;
    if (!running) return { ok: false, error: 'not-running' };
    log('service', '请求重启 dsh web 服务');
    (bootMod.setIsRestarting as (v: boolean) => void)(true);
    try {
      await (bootMod.killAndWaitForRestart as () => Promise<void>)();
      await (marketMod.processPendingMarketOps as () => Promise<void>)();
      (companionSyncMod.syncCompanionPlugins as () => void)();
      (companionSyncMod.healProfileModules as () => void)();
      await (marketMod.restoreKeptArtifacts as (profile: string) => Promise<void>)(desktopProfileFn());
      const r = await (bootMod.startAndWait as (o: string[]) => Promise<{ webUrl: string; port: number }>)([]);
      log('service', 'dsh web 服务已重启: ' + r.webUrl);
      notify('boot.web-ready', r);
      return { ok: true, webUrl: r.webUrl, port: r.port };
    } catch (e) {
      log('service', '重启失败: ' + String(((e as Error).message) || e));
      return { ok: false, error: String(((e as Error).message) || e) };
    } finally {
      (bootMod.setIsRestarting as (v: boolean) => void)(false);
    }
  },
};

// P3 渐进收编：尚未在 sidecar 落地的桥方法返回 null（桥/插件侧按「无数据」
// 降级，与桥断开时行为一致，不炸页面）。每收编一个真实现就从这里删除。
const PENDING_BRIDGE_METHODS = [
  'menu.action', 'balance.refresh', 'balance.prices-get', 'balance.prices-set', 'balance.prices-reset',
  'balance.models', 'guard.action', 'wizard.open', 'plugins.list', 'plugins.set-enabled',
  'plugins.set-removed', 'plugins.updates', 'plugins.update', 'plugins.auto-update', 'image-paste.save',
  'files.revert', 'files.open', 'recovery.state', 'recovery.reload', 'recovery.restart',
  'recovery.export-logs', 'rescue.state', 'rescue.confirm', 'rescue.diagnose', 'rescue.apply',
  'rescue.safe-mode', 'rescue.retry', 'rescue.auto-repair',
];
for (const m of PENDING_BRIDGE_METHODS) {
  methods[m] = (): null => null;
}

function respond(msg: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function modCall(name: string, fn: string, args: unknown[]): unknown {
  if (!CALLABLE.has(name)) throw new Error('module not callable: ' + name);
  const f = MODULES_BY_NAME[name][fn];
  if (typeof f !== 'function') throw new Error('no export: ' + name + '.' + fn);
  return (f as (...a: unknown[]) => unknown)(...(Array.isArray(args) ? args : []));
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line: string) => { void handleLine(line); });
rl.on('close', () => { void gracefulExit(); });

async function gracefulExit(): Promise<void> {
  quitting = true;
  try { await (bootMod.stopServer as () => Promise<void>)(); } catch { /* 尽力回收 */ }
  process.exit(0);
}

async function handleLine(line: string): Promise<void> {
  const text = line.trim();
  if (!text) return;
  let req: RpcReq;
  try { req = JSON.parse(text); } catch {
    return respond({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
  }
  const { id, method, params } = req;
  try {
    if (method === 'ping') return respond({ jsonrpc: '2.0', id, result: { pong: true, ts: Date.now() } });
    if (method === 'shutdown') {
      respond({ jsonrpc: '2.0', id, result: { bye: true } });
      rl.close();
      return;
    }
    const fixed = methods[method];
    if (fixed) {
      const result = await fixed(params);
      return respond({ jsonrpc: '2.0', id, result: result === undefined ? null : result });
    }
    if (method === 'mod.call') {
      const args = Array.isArray(params && params.args) ? (params!.args as unknown[]) : [];
      const value = modCall(String(params && params.name), String(params && params.fn), args);
      return respond({ jsonrpc: '2.0', id, result: { ok: true, value: value === undefined ? null : value } });
    }
    respond({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
  } catch (e) {
    respond({ jsonrpc: '2.0', id, error: { code: -32000, message: String(((e as Error).message) || e) } });
  }
}
