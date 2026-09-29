#!/usr/bin/env node
// Live skin-switch verification harness: boot staged runtime with isolated home,
// keep it alive, publish webUrl + auth cookie for browser automation.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const stageRoot = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tauri-shell', 'staged-resources');
const stateFile = process.argv[3];
const root = path.resolve(stageRoot);
const sidecar = path.join(root, 'sidecar', 'server.js');
const desktop = path.join(root, 'dsh-desktop');
if (!existsSync(sidecar) || !existsSync(path.join(desktop, 'package.json'))) {
  console.error(`[live-boot] staged runtime incomplete: ${root}`);
  process.exit(1);
}

// --home=<dir> 复用固定隔离 home（官方端轨道冒烟：预先装好 installer 插件的 profile）；
// 缺省仍每次 mkdtemp（皮肤验证用）。
const homeArg = process.argv.find((a) => a.startsWith('--home='));
const isolated = homeArg ? homeArg.slice('--home='.length) : mkdtempSync(path.join(tmpdir(), 'dsh-live-skin-'));
const dshHome = path.join(isolated, 'dsh-home');
const home = path.join(isolated, 'home');
const xdg = path.join(isolated, 'xdg');
const child = spawn(process.execPath, [sidecar], {
  cwd: desktop,
  env: {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_RESOURCE_ROOT: root,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: xdg,
    XDG_CACHE_HOME: path.join(isolated, 'cache'),
    XDG_DATA_HOME: path.join(isolated, 'data'),
    APPDATA: path.join(isolated, 'appdata'),
    LOCALAPPDATA: path.join(isolated, 'localappdata'),
    // 打包态由安装器把 dsh CLI 放进 PATH；live 冒烟直接挂 staged 树的 .bin
    PATH: path.join(root, 'dsh-desktop', 'node_modules', '.bin') + path.delimiter + (process.env.PATH || ''),
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderrTail = '';
child.stderr.on('data', (c) => { stderrTail = (stderrTail + c.toString()).slice(-8000); });

const pending = new Map();
let nextId = 0;
const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (typeof msg.id !== 'number' || !pending.has(msg.id)) return;
  const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer); p.resolve(msg);
});
function call(method, params = {}, timeoutMs = 60_000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function mintCookie(webUrl) {
  const first = await fetch(webUrl, { redirect: 'manual' });
  if (first.status !== 303) throw new Error(`token redirect expected 303 got ${first.status}`);
  const location = first.headers.get('location');
  const setCookie = first.headers.get('set-cookie');
  const cookie = setCookie.split(';', 1)[0];
  const target = new URL(location, webUrl);
  const second = await fetch(target, { redirect: 'manual', headers: { cookie } });
  await second.body?.cancel();
  if (second.status !== 200) throw new Error(`authenticated UI expected 200 got ${second.status}`);
  return cookie;
}

try {
  const info = await call('shell.info', {}, 15_000);
  if (info.result?.sidecar !== 'server.ts') throw new Error(`sidecar identity: ${JSON.stringify(info)}`);
  const boot = await call('boot.start', {}, 120_000);
  if (boot.error || typeof boot.result?.webUrl !== 'string') {
    throw new Error(`boot.start failed: ${JSON.stringify(boot)}\n${stderrTail}`);
  }
  const webUrl = boot.result.webUrl;
  const cookie = await mintCookie(webUrl);
  const state = { webUrl, cookie, dshHome, isolated, pid: child.pid, bootedAt: new Date().toISOString() };
  if (stateFile) writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log('[live-boot] READY');
  console.log(JSON.stringify({ webUrl, cookie, dshHome }, null, 2));
  console.log('[live-boot] create STOP sentinel or SIGINT to shut down');
  // stay alive until STOP sentinel file appears or SIGINT (stdin is closed in background runs)
  const stopSentinel = stateFile ? stateFile + '.STOP' : null;
  const stopped = new Promise((resolve) => {
    const t = setInterval(() => {
      if (stopSentinel && existsSync(stopSentinel)) { clearInterval(t); resolve('stop-sentinel'); }
    }, 500);
  });
  const sig = new Promise((resolve) => process.on('SIGINT', () => resolve('sigint')));
  const childExit = new Promise((resolve) => child.once('exit', (code) => resolve(`exit:${code}`)));
  const why = await Promise.race([stopped, sig, childExit]);
  console.log(`[live-boot] shutting down (${why})`);
  try { await call('boot.stop', {}, 30_000); } catch {}
  try { await call('shutdown', {}, 15_000); } catch {}
  if (stateFile) writeFileSync(stateFile, JSON.stringify({ ...state, stoppedAt: new Date().toISOString(), why }, null, 2));
  process.exit(0);
} catch (err) {
  console.error('[live-boot] FAIL:', err?.stack || String(err));
  if (stderrTail) console.error('[live-boot] sidecar stderr tail:\n' + stderrTail);
  try { child.kill('SIGKILL'); } catch {}
  process.exit(1);
}
