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
import cp = require('node:child_process');
import readline = require('node:readline');

// 资源根：开发态 tauri-shell/sidecar → 仓库根/dsh-desktop；
// 打包态 resources/sidecar → resources/dsh-desktop（少一级）。
function resolveDesktopRoot(): string {
  const upTwo = path.resolve(__dirname, '..', '..', 'dsh-desktop');
  if (fs.existsSync(path.join(upTwo, 'package.json'))) return upTwo;
  const upOne = path.resolve(__dirname, '..', 'dsh-desktop');
  if (fs.existsSync(path.join(upOne, 'package.json'))) return upOne;
  return upTwo;
}
const DSH_DESKTOP_ROOT = process.env.DSH_RESOURCE_ROOT
  ? path.join(process.env.DSH_RESOURCE_ROOT, 'dsh-desktop')
  : resolveDesktopRoot();
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
// .lnk 驱动（硬门槛④）：PowerShell WScript.Shell COM 实现，接口对齐 Electron
// shell.readShortcutLink / writeShortcutLink（同步、失败抛错）。路径经环境
// 变量传入，规避引号/空格/中文转义；读取返回的 IconLocation 剥掉 ',N' 索引。
function psLnkRead(p: string): Record<string, unknown> {
  const script = String.raw`
$ErrorActionPreference='Stop'
try {
  $sh = New-Object -ComObject WScript.Shell
  $sc = $sh.CreateShortcut($env:DSH_LNK_PATH)
  $icon = [string]$sc.IconLocation
  if ($icon -match ',\s*\d+$') { $icon = $icon -replace ',\s*\d+$', '' }
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  @{ target = [string]$sc.TargetPath; args = [string]$sc.Arguments; cwd = [string]$sc.WorkingDirectory; description = [string]$sc.Description; icon = $icon } | ConvertTo-Json -Compress
} catch { exit 1 }
`;
  try {
    const out = cp.execFileSync('powershell', ['-NoProfile', '-Command', script], {
      env: { ...process.env, DSH_LNK_PATH: p },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    });
    return JSON.parse(out) as Record<string, unknown>;
  } catch (e) {
    throw new Error('lnk read failed: ' + p + ' (' + String(((e as Error).message) || e).slice(0, 120) + ')');
  }
}

function psLnkWrite(p: string, op: string, opts: Record<string, unknown>): void {
  const script = String.raw`
$ErrorActionPreference='Stop'
$lnk = $env:DSH_LNK_PATH
if (($env:DSH_LNK_OP -eq 'create') -and (Test-Path -LiteralPath $lnk)) { exit 2 }
try {
  $sh = New-Object -ComObject WScript.Shell
  $sc = $sh.CreateShortcut($lnk)
  $sc.TargetPath = $env:DSH_LNK_TARGET
  if ($env:DSH_LNK_ARGS) { $sc.Arguments = $env:DSH_LNK_ARGS }
  if ($env:DSH_LNK_CWD) { $sc.WorkingDirectory = $env:DSH_LNK_CWD }
  if ($env:DSH_LNK_DESC) { $sc.Description = $env:DSH_LNK_DESC }
  if ($env:DSH_LNK_ICON) { $sc.IconLocation = $env:DSH_LNK_ICON }
  $sc.Save()
  exit 0
} catch { exit 1 }
`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_LNK_PATH: p,
    DSH_LNK_OP: String(op || 'replace'),
    DSH_LNK_TARGET: String(opts.target || ''),
    DSH_LNK_ARGS: opts.args == null ? '' : String(opts.args),
    DSH_LNK_CWD: opts.cwd == null ? '' : String(opts.cwd),
    DSH_LNK_DESC: opts.description == null ? '' : String(opts.description),
    DSH_LNK_ICON: opts.icon == null ? '' : String(opts.icon),
  };
  const st = cp.spawnSync('powershell', ['-NoProfile', '-Command', script], { env, windowsHide: true, timeout: 10000 });
  if (!st || st.status !== 0) {
    throw new Error('lnk ' + String(op) + ' failed (' + String(st && st.status) + '): ' + p);
  }
}

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
  links: { read: psLnkRead, write: psLnkWrite },
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
  // 打包态取壳层 exe 目录（DSH_SHELL_EXE）；开发态 sidecar 的 node 不适用。
  getExecDir: () => (process.env.DSH_SHELL_EXE ? path.dirname(process.env.DSH_SHELL_EXE) : path.dirname(process.execPath)),
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
    balance: balanceCache,
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
    let r: { webUrl: string; port: number };
    try {
      r = await (bootMod.startAndWait as (o: string[]) => Promise<{ webUrl: string; port: number }>)(overlays);
    } catch (e) {
      // 崩溃循环计数（= main.js recordBootFailureNow）：连续失败达阈值后，
      // 救援页据 rescue.state.crash 引导安全模式。
      rescueIntegration.recordBootFailureNow(String(((e as Error).message) || e));
      notify('boot.failed', { error: String(((e as Error).message) || e) });
      throw e;
    }
    rescueIntegration.clearRescueState?.();
    notify('boot.web-ready', r);
    startBalanceLoop(); // 服务就绪后启动 15min 余额轮询（= main.js startBalanceLoop）
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
// 剩余：向导窗口/恢复页/救援链（P3 壳层 GUI 能力）、更新检查与日志导出（P4）。
const PENDING_BRIDGE_METHODS = ['wizard.open'];
for (const m of PENDING_BRIDGE_METHODS) {
  methods[m] = (): null => null;
}

// ---- 真实现面（P3：对齐 main.js 各 ipcMain.handle 语义，去 GUI 化） --------
const balance = require(path.join(DSH_DESKTOP_ROOT, 'balance.js')) as {
  queryBalance(home: string): Promise<Record<string, unknown> & { prices?: Record<string, unknown> }>;
  readActiveModel(home: string): string;
  DEFAULT_PRICES: Record<string, unknown>;
  FALLBACK_PRICES: Record<string, unknown>;
  computePricingState(peakWindows?: unknown): { period: string } & Record<string, unknown>;
  tierPrices(base: unknown, override: unknown, tier: string): Record<string, number>;
  sanitizePrices(prices: unknown): { peak: Record<string, number>; offpeak: Record<string, number> };
};
const pluginUpdater = require(path.join(DSH_DESKTOP_ROOT, 'plugin-updater.js')) as Record<string, (...a: unknown[]) => unknown>;

function home(): string { return dshHome; }

let balanceTimer: NodeJS.Timeout | null = null;
let balanceCache: unknown = null;

async function refreshBalance(): Promise<unknown> {
  const s = loadSettings() as { pricing?: { peakWindows?: unknown }; balancePrices?: Record<string, unknown> };
  let result: Record<string, unknown> & { prices?: Record<string, unknown> };
  try {
    result = await balance.queryBalance(home()) as typeof result;
  } catch (e) {
    result = { ok: false, error: String(((e as Error).message) || e), balances: [] };
  }
  const model = balance.readActiveModel(home()) || 'deepseek-v4-pro';
  const table = result.prices || balance.DEFAULT_PRICES;
  const pricing = balance.computePricingState(s.pricing && s.pricing.peakWindows);
  const base = (table as Record<string, unknown>)[model] || balance.FALLBACK_PRICES;
  const ov = (s.balancePrices && s.balancePrices[model]) || {};
  const tier = (src: string): Record<string, number> => balance.tierPrices(base, ov, src);
  result.prices = tier(pricing.period) as Record<string, unknown>;
  result.pricing = { ...pricing, prices: { peak: tier('peak'), offpeak: tier('offpeak') } };
  balanceCache = result;
  // 推送（= Electron 的 webContents.send('dsh:balance')；桥转发成 window 事件）。
  notify('dsh.balance', result);
  return result;
}

function startBalanceLoop(): void {
  if (balanceTimer) return;
  void refreshBalance().catch(() => {});
  balanceTimer = setInterval(() => { void refreshBalance().catch(() => {}); }, 15 * 60 * 1000);
  if (balanceTimer.unref) balanceTimer.unref();
}

// 剪贴板（PowerShell Set-Clipboard；Electron clipboard 的无 GUI 等价物）。
function writeClipboardText(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ps = cp.spawn('powershell', ['-NoProfile', '-Command', '$input | Set-Clipboard'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    ps.on('error', () => resolve(false));
    ps.on('exit', (code) => resolve(code === 0));
    ps.stdin.end(text, 'utf8');
  });
}

// 系统默认程序打开文件（= shell.openPath；explorer 解析关联）。
function openPathNative(p: string): Promise<string> {
  return new Promise((resolve) => {
    cp.exec(`start "" "${p.replace(/"/g, '')}"`, { windowsHide: true }, (err) => resolve(err ? String(err.message) : ''));
  });
}

const batch: Record<string, (p: RpcParams) => unknown> = {
  'balance.refresh': async (): Promise<unknown> => refreshBalance(),
  'balance.prices-get': (p): Record<string, unknown> => {
    const model = String((p && p.model) || '');
    const s = loadSettings() as { balancePrices?: Record<string, unknown> };
    const defaults = (balance.DEFAULT_PRICES as Record<string, unknown>)[model] || balance.FALLBACK_PRICES;
    const current = (s.balancePrices && s.balancePrices[model]) || null;
    return { ok: true, model, defaults, current };
  },
  'balance.prices-set': async (p): Promise<Record<string, unknown>> => {
    const m = String((p && p.model) || '');
    if (!m) return { ok: false, error: '模型名称不能为空' };
    try {
      const cleaned = balance.sanitizePrices(p && p.prices);
      const s = loadSettings();
      if (!s.balancePrices || typeof s.balancePrices !== 'object') s.balancePrices = {};
      (s.balancePrices as Record<string, unknown>)[m] = cleaned;
      saveSettings(s);
      await refreshBalance();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'balance.prices-reset': async (p): Promise<Record<string, unknown>> => {
    const m = String((p && p.model) || '');
    try {
      const s = loadSettings() as { balancePrices?: Record<string, unknown> };
      if (s.balancePrices && s.balancePrices[m]) {
        delete s.balancePrices[m];
        saveSettings(s as Record<string, unknown>);
      }
      await refreshBalance();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'balance.models': (): Record<string, unknown> => {
    // 与 main.js dsh:balance-models 同款轻量 YAML 扫描（llm-pi-ai.providers.models）。
    try {
      const settingsPath = path.join(home(), 'settings.yaml');
      if (!fs.existsSync(settingsPath)) return { ok: true, models: [] };
      const text = fs.readFileSync(settingsPath, 'utf8');
      const lines = text.split(/\r?\n/);
      const models: { id: string; name: string; provider: string }[] = [];
      let inProviders = false;
      let providerIndent = -1;
      let currentProvider = '';
      let inModels = false;
      let modelsIndent = -1;
      let currentModel: { id: string; name: string; provider: string } | null = null;
      for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = line.search(/\S/);
        if (/^llm-pi-ai\s*:/i.test(line)) { inProviders = true; providerIndent = -1; continue; }
        if (inProviders && /^\s+providers\s*:/i.test(line)) { providerIndent = indent; continue; }
        if (providerIndent >= 0) {
          if (indent <= providerIndent && line.trim()) {
            if (/^[a-z]/i.test(line.trim())) break;
            continue;
          }
          const providerMatch = line.match(new RegExp(`^\\s{${providerIndent + 2},${providerIndent + 6}}([a-z][\\w-]*)\\s*:`));
          if (providerMatch && !inModels && !['models', 'baseurl', 'apikeyenv', 'displayname', 'api'].includes(providerMatch[1].toLowerCase())) {
            currentProvider = providerMatch[1];
            continue;
          }
          if (/^\s+models\s*:/i.test(line) && indent > providerIndent) { inModels = true; modelsIndent = indent; continue; }
          if (inModels) {
            if (indent <= modelsIndent && line.trim()) {
              inModels = false;
              currentModel = null;
              const reProvider = line.match(new RegExp(`^\\s{${providerIndent + 2},${providerIndent + 6}}([\\w][\\w-]*)\\s*:`));
              if (reProvider) currentProvider = reProvider[1];
              continue;
            }
            const modelMatch = line.match(/^\s+-\s+id\s*:\s*(\S+)/);
            if (modelMatch) {
              const modelId = modelMatch[1].replace(/^["']|["']$/g, '');
              currentModel = { id: modelId, name: modelId, provider: currentProvider };
              models.push(currentModel);
              continue;
            }
            const nameMatch = line.match(/^\s+name\s*:\s*(.+)/);
            if (nameMatch && currentModel) {
              currentModel.name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
              continue;
            }
          }
        }
      }
      const seen = new Set<string>();
      const uniqueModels = models.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
      return { ok: true, models: uniqueModels };
    } catch (e) {
      return { ok: true, models: [] };
    }
  },
  'clipboard.write-text': async (p): Promise<Record<string, unknown>> => {
    const text = (p && p.text) as string;
    if (typeof text !== 'string' || !text || text.length > 2048) return { ok: false };
    return { ok: await writeClipboardText(text) };
  },
  'image-paste.save': (p): Record<string, unknown> => {
    try {
      return (pluginOpsMod.imagePasteSave as (d: string, n: string) => Record<string, unknown>)(String((p && p.dataUrl) || ''), String((p && p.name) || '粘贴图片'));
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'files.revert': (p): Record<string, unknown> => {
    const changes = (p && p.changes) as Array<{ path?: string; oldText?: string; newText?: string }>;
    if (!Array.isArray(changes) || changes.length === 0 || changes.length > 300) return { results: [] };
    const results: Record<string, unknown>[] = [];
    for (const c of changes) {
      const fp = String((c && c.path) || '');
      const oldText = String((c && c.oldText) ?? '');
      const newText = String((c && c.newText) ?? '');
      if (!path.isAbsolute(fp) || oldText.length > 400000 || newText.length > 400000) {
        results.push({ path: fp, status: 'invalid' });
        continue;
      }
      if (!(fileRootsMod.isUnderFileRoots as (x: string) => boolean)(fp)) {
        results.push({ path: fp, status: 'forbidden' });
        continue;
      }
      try {
        const exists = fs.existsSync(fp);
        const content = exists ? fs.readFileSync(fp, 'utf8') : null;
        if (oldText === '' && newText !== '') {
          if (content !== null && content === newText) { fs.rmSync(fp); results.push({ path: fp, status: 'reverted' }); }
          else results.push({ path: fp, status: content === null ? 'missing' : 'conflict' });
        } else if (newText === '' && oldText !== '') {
          if (content === null) { fs.writeFileSync(fp, oldText, 'utf8'); results.push({ path: fp, status: 'reverted' }); }
          else results.push({ path: fp, status: 'conflict' });
        } else {
          if (content !== null && content.includes(newText)) {
            fs.writeFileSync(fp, content.replace(newText, oldText), 'utf8');
            results.push({ path: fp, status: 'reverted' });
          } else if (content !== null && content === oldText) {
            results.push({ path: fp, status: 'skipped' });
          } else {
            results.push({ path: fp, status: content === null ? 'missing' : 'conflict' });
          }
        }
      } catch (err) {
        results.push({ path: fp, status: 'failed', error: String(((err as Error).message) || err) });
      }
    }
    log('file-revert', JSON.stringify(results.slice(0, 20)));
    return { results };
  },
  'files.open': async (p): Promise<Record<string, unknown>> => {
    const fp = (p && p.path) as string;
    if (typeof fp !== 'string' || !path.isAbsolute(fp)) return { ok: false, error: 'path must be absolute' };
    const skillsRoots = [
      path.join(home(), 'skills'),
      path.join(process.env.DSH_AGENTS_HOME || path.join(os.homedir(), '.agents'), 'skills'),
    ];
    const underSkillsRoot = skillsRoots.some((r) => {
      const rp = path.resolve(r);
      return fp === rp || fp.startsWith(rp + path.sep);
    });
    if (!underSkillsRoot && !(fileRootsMod.isUnderFileRoots as (x: string) => boolean)(fp)) {
      return { ok: false, error: 'path outside session workspace' };
    }
    if ((fileRootsMod.DANGEROUS_EXT as RegExp).test(fp)) {
      return { ok: false, error: 'executable files are not openable from the file view' };
    }
    try {
      if (!fs.existsSync(fp)) return { ok: false, error: 'file not found' };
      const msg = await openPathNative(fp);
      if (msg) return { ok: false, error: msg };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'plugins.list': (): Record<string, unknown> => {
    return { list: (pluginOpsMod.pluginManagerCollect as () => unknown[])() };
  },
  'plugins.set-enabled': (p): Record<string, unknown> => {
    return (pluginOpsMod.pluginManagerSetEnabled as (id: string, en: boolean) => Record<string, unknown>)(String((p && p.id) || ''), !!(p && p.enabled));
  },
  'plugins.set-removed': (p): Record<string, unknown> => {
    return (pluginOpsMod.pluginManagerSetRemoved as (id: string, rm: boolean) => Record<string, unknown>)(String((p && p.id) || ''), !!(p && p.removed));
  },
  'plugins.updates': async (p): Promise<Record<string, unknown>> => {
    try {
      const ctx = (pathsMod.updCtx as () => unknown)();
      const sources = (companionSyncMod.pluginUpdateSources as () => Array<{ id: string }>)();
      const list = await (pluginUpdater.checkPluginUpdates as (c: unknown, s: unknown[], o: unknown) => Promise<unknown[]>)(ctx, sources, {
        force: !!(p && p.force),
        profileDirP: (profileMod.desktopProfileDir as () => string)(),
      });
      return {
        list,
        autoUpdate: (pluginUpdater.isAutoUpdateEnabled as (c: unknown) => boolean)(ctx),
        checkedAt: (loadSettings() as { pluginUpdateCheckedAt?: string }).pluginUpdateCheckedAt || null,
      };
    } catch (e) {
      log('plugin-update', '插件更新清单加载失败: ' + String(((e as Error).message) || e));
      return { list: [], autoUpdate: false, error: String(((e as Error).message) || e) };
    }
  },
  'plugins.update': async (p): Promise<Record<string, unknown>> => {
    const sources = (companionSyncMod.pluginUpdateSources as () => Array<{ id: string }>)();
    const source = sources.find((s) => s.id === String(p && p.id));
    if (!source) return { ok: false, error: '未知或不可更新的内置插件: ' + String(p && p.id) };
    try {
      const res = await (pluginUpdater.applyBuiltinPluginUpdate as (c: unknown, s: unknown, o: unknown) => Promise<Record<string, unknown>>)((pathsMod.updCtx as () => unknown)(), source, {
        profileDirP: (profileMod.desktopProfileDir as () => string)(),
        guard: (guardBoxMod.ensureGuard as () => unknown)(),
        copyIntoProfile: (overlayDir: string, name: string) => (companionSyncMod.copyPluginPackage as (d: string, o: string, n: string) => void)((profileMod.desktopProfileDir as () => string)(), overlayDir, name),
      });
      if (!res.ok) return res;
      if (res.noop) return { ok: true, noop: true, current: res.current, latest: res.latest };
      log('plugin-update', '手动更新内置插件 ' + String(p && p.id) + ' → ' + res.latest + (res.restartRequired ? '（重启服务生效）' : ''));
      return { ok: true, version: res.latest, restartRequired: res.restartRequired };
    } catch (e) {
      log('plugin-update', '更新插件 ' + String(p && p.id) + ' 失败: ' + String(((e as Error).message) || e));
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'plugins.auto-update': (p): Record<string, unknown> => {
    try {
      const s = loadSettings();
      s.pluginAutoUpdate = !!(p && p.enabled);
      saveSettings(s);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'guard.action': (p): Record<string, unknown> => {
    const action = String((p && p.action) || '');
    const value = p && p.value;
    const g = (guardBoxMod.ensureGuard as () => Record<string, (...a: unknown[]) => unknown>)();
    switch (action) {
      case 'status': {
        const st = loadSettings() as { shareWebProfile?: boolean };
        return {
          ok: true,
          profile: desktopProfileFn(),
          shareWebProfile: st.shareWebProfile === true,
          snapshots: (g.listSnapshots as () => unknown[])().slice(0, 20),
          incidents: (g.listIncidents as () => unknown[])().slice(0, 20),
          lastGood: (g.lastGoodSnapshot as () => unknown)(),
        };
      }
      case 'snapshot': {
        const s = (g.snapshot as (r: string) => unknown)(String(value || 'manual'));
        return { ok: !!s, snapshot: s };
      }
      case 'restore': {
        const running = (bootMod.state as () => { running: boolean })().running;
        if (running) {
          return { ok: false, error: 'service-running', hint: '请先重启 Web 服务（或让回滚在重启间隙执行）' };
        }
        return (g.restore as (v: unknown) => Record<string, unknown>)(value) as Record<string, unknown>;
      }
      case 'check':
        return { ok: true, report: (g.healthCheck as () => unknown)() };
      case 'repair': {
        const r = (g.repair as () => { applied: unknown })();
        return { ok: true, applied: r.applied };
      }
      case 'incident':
        return (g.readIncident as (v: unknown) => Record<string, unknown>)(value) as Record<string, unknown>;
      case 'resolve-incident':
        return (g.resolveIncident as (v: unknown) => Record<string, unknown>)(value) as Record<string, unknown>;
      default:
        return { ok: false, error: 'unknown action' };
    }
  },
  'menu.action': async (p): Promise<Record<string, unknown> | null> => {
    const action = String((p && p.action) || '');
    const s = loadSettings() as { notifyOnTurnEnd?: boolean; shortcutPolicy?: string; exitAction?: string; closeToTray?: boolean };
    switch (action) {
      case 'toggle-notify': {
        s.notifyOnTurnEnd = s.notifyOnTurnEnd === false;
        saveSettings(s as Record<string, unknown>);
        return { notifyOnTurnEnd: s.notifyOnTurnEnd, exitAction: s.exitAction || 'ask' };
      }
      case 'toggle-shortcut-policy': {
        s.shortcutPolicy = s.shortcutPolicy === 'never' ? 'auto' : 'never';
        saveSettings(s as Record<string, unknown>);
        return { shortcutPolicy: s.shortcutPolicy, exitAction: s.exitAction || 'ask' };
      }
      case 'set-exit-action': {
        const v = String((p && p.value) || '');
        if (v !== 'ask' && v !== 'minimize' && v !== 'quit') return null;
        s.exitAction = v;
        s.closeToTray = v !== 'quit'; // 同步旧字段，降级回旧版时行为不回退
        saveSettings(s as Record<string, unknown>);
        return { notifyOnTurnEnd: s.notifyOnTurnEnd !== false, closeToTray: s.closeToTray !== false, exitAction: v };
      }
      case 'restart-service': {
        const r = await (methods['boot.restart'] as (p2?: unknown) => Promise<Record<string, unknown>>)({} as Record<string, unknown>);
        return r;
      }
      // check-agent-update / check-client-update / export-logs / about / feedback：
      // P4 更新链与 GUI 对话框就位前的优雅占位（菜单静默关闭，无报错）。
      default:
        return null;
    }
  },
};
Object.assign(methods, batch);

// ---- 救援链（硬门槛②；实现于 rescue-integration.ts，同产物编译） ----------
const rescueIntegration = require('./rescue-integration') as {
  initRescue(host: unknown): void;
  rescueMethods(): Record<string, (p: Record<string, unknown> | undefined) => unknown>;
  recordBootFailureNow(errText: string): void;
  shouldEnterRescueNow(): boolean;
  clearRescueState(): void;
};
rescueIntegration.initRescue({
  dshHome,
  userDataDir,
  pkgVersion,
  desktopProfile: desktopProfileFn,
  desktopProfileDir: () => (profileMod.desktopProfileDir as () => string)(),
  dshVersion: () => (pathsMod.dshVersion as () => string)(),
  dshVersionSource: () => (pathsMod.dshVersionSource as () => string)(),
  log,
  notify,
  mods: { boot: bootMod, guardBox: guardBoxMod, pluginOps: pluginOpsMod, companionSync: companionSyncMod, balance },
  bootRestart: () => (methods['boot.restart'] as (p?: unknown) => Promise<Record<string, unknown>>)({} as Record<string, unknown>),
});
Object.assign(methods, rescueIntegration.rescueMethods());

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
