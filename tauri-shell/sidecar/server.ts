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

const MOUNTED = ['proc', 'runtime-paths', 'profile', 'guard-box', 'runtime-patches', 'companion-sync', 'plugin-ops', 'market', 'shortcuts', 'junction-patrol', 'client-update', 'static-preview', 'file-roots'];

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

say('modules mounted; dshHome=' + dshHome + '; profile=' + desktopProfileFn());

// ---- 方法注册表 -----------------------------------------------------------
interface RpcReq { id: number | null; method: string; params?: { name?: string; fn?: string; args?: unknown[] } }
type RpcResult = Record<string, unknown>;

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

const methods: Record<string, () => RpcResult> = {
  'shell.info': () => ({
    sidecar: 'server.ts',
    node: process.version,
    platform: process.platform,
    pid: process.pid,
    dshHome,
    version: pkgVersion,
    modules: MOUNTED,
  }),
  'profile.name': () => ({ name: desktopProfileFn() }),
  'profile.dir': () => ({ dir: (profileMod.desktopProfileDir as () => string)() }),
  'runtime.nodeExe': () => ({ exe: (pathsMod.nodeExe as () => string)() }),
  'runtime.dshBin': () => ({ bin: (pathsMod.dshBin as () => string)() }),
  'plugins.removedIds': () => ({ ids: (companionSyncMod.removedPluginIds as () => unknown[])() }),
  'guard.ensure': () => ({ ok: !!(guardBoxMod.ensureGuard as () => unknown)() }),
};

function respond(msg: RpcResult): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function modCall(name: string, fn: string, args: unknown[]): unknown {
  if (!CALLABLE.has(name)) throw new Error('module not callable: ' + name);
  const f = MODULES_BY_NAME[name][fn];
  if (typeof f !== 'function') throw new Error('no export: ' + name + '.' + fn);
  return (f as (...a: unknown[]) => unknown)(...(Array.isArray(args) ? args : []));
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line: string) => {
  const text = line.trim();
  if (!text) return;
  let req: RpcReq;
  try { req = JSON.parse(text); } catch {
    return respond({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
  }
  const { id, method, params } = req;
  try {
    if (method === 'ping') return respond({ jsonrpc: '2.0', id, result: { pong: true, ts: Date.now() } });
    if (method === 'shutdown') { respond({ jsonrpc: '2.0', id, result: { bye: true } }); process.exit(0); }
    const fixed = methods[method];
    if (fixed) return respond({ jsonrpc: '2.0', id, result: fixed() });
    if (method === 'mod.call') {
      const value = modCall(String(params && params.name), String(params && params.fn), (params && params.args) || []);
      return respond({ jsonrpc: '2.0', id, result: { ok: true, value: value === undefined ? null : value } });
    }
    respond({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
  } catch (e) {
    respond({ jsonrpc: '2.0', id, error: { code: -32000, message: String(((e as Error).message) || e) } });
  }
});
rl.on('close', () => process.exit(0));
