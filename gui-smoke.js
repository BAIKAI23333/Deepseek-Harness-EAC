'use strict';
// P2 GUI 冒烟（一次性）：真实启动 Tauri 壳 → CDP 断言桥与 chrome → 浮窗
// （硬门槛① per-webview data_directory）→ 菜单退出 → 零孤儿进程。
// WebView2 经 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 开 CDP 端口。
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const repo = path.resolve(__dirname);
const tmpHome = path.join(repo, 'tmp-p2boot', 'gui-home');
fs.mkdirSync(tmpHome, { recursive: true });
const CDP_PORT = 9333;
const EXE = path.join(repo, 'tauri-shell', 'target', 'debug', 'dsh-eac-shell.exe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpGetJson = (url) => new Promise((resolve, reject) => {
  http.get(url, { timeout: 4000 }, (r) => {
    let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// --- 最小 CDP 客户端（Node ≥21 内置 WebSocket） ---------------------------
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = (e) => rej(new Error('ws error')); });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
    }
  };
  return {
    ready,
    call(method, params) {
      return ready.then(() => new Promise((res, rej) => {
        const id = ++seq; pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      }));
    },
    async evalJs(expr) {
      const r = await this.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('page js: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    close() { try { ws.close(); } catch {} },
  };
}

async function waitForTarget(matchFn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await httpGetJson(`http://127.0.0.1:${CDP_PORT}/json`);
      const hit = list.find(matchFn);
      if (hit) return hit;
    } catch { /* 端口未就绪 */ }
    await sleep(700);
  }
  throw new Error('target not found in time');
}

async function listOrphans() {
  return new Promise((resolve) => {
    const p = spawn('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'tmp-p2boot' } | Select-Object -ExpandProperty ProcessId`],
      { windowsHide: true });
    let out = ''; p.stdout.on('data', (d) => (out += d));
    p.on('exit', () => resolve(out.trim()));
  });
}

(async () => {
  console.log('[gui-smoke] launching shell with DSH_HOME=' + tmpHome);
  const shell = spawn(EXE, [], {
    env: {
      ...process.env,
      DSH_HOME: tmpHome,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let shellOut = '';
  shell.stdout.on('data', (d) => { shellOut += d.toString(); process.stdout.write('[shell] ' + d); });
  shell.stderr.on('data', (d) => { shellOut += d.toString(); process.stderr.write('[shell-err] ' + d); });

  try {
    // 1) 主窗 target 出现且导航到真实 Web UI（非 /loading）
    const main = await waitForTarget((t) => t.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(t.url) && !t.url.includes(`:${CDP_PORT}`), 180000);
    const c = cdp(main.webSocketDebuggerUrl);
    await c.ready;
    check('主窗导航到真实 Web UI', true, main.url);

    // 2) 桥 + 玻璃栏
    const hasBridge = await c.evalJs('typeof window.dshDesktop === "object" && typeof window.dshDesktop.getInfo === "function" && typeof window.dshDesktop.rescue.getState === "function"');
    check('window.dshDesktop 全量桥注入', hasBridge);
    const hasBar = await c.evalJs('!!document.getElementById("__dsh_desktop_chrome__")');
    check('36px 玻璃栏注入', hasBar);
    const barH = await c.evalJs('document.documentElement.getAttribute("data-dsh-title-bar-height")');
    check('标题栏高度声明（better-sidebar 依赖）', barH === '36', String(barH));

    // 3) getInfo（sidecar chrome.init 真实数据）
    const info = await c.evalJs('window.dshDesktop.getInfo()');
    check('getInfo 返回真实数据', !!(info && info.appVersion === '4.6.0' && info.agentVersion), JSON.stringify({ v: info && info.appVersion, agent: info && info.agentVersion }));

    // 4) 窗口控制（Rust 拦截路径）
    const max1 = await c.evalJs('window.dshDesktop.windowControls.isMaximized()');
    await c.evalJs('window.dshDesktop.windowControls.toggleMaximize()');
    await sleep(900);
    const max2 = await c.evalJs('window.dshDesktop.windowControls.isMaximized()');
    check('窗口控制（最大化往返）', max1 === false && max2 === true, `${max1}→${max2}`);
    await c.evalJs('window.dshDesktop.windowControls.toggleMaximize()');
    await sleep(600);

    // 5) 心跳在飞（WS send 帧被壳层消费，无回复不算错——检查 WS 连接本身）
    const wsOpen = await c.evalJs('!!window.dshDesktop._call');
    check('桥 WS 通道可用', wsOpen);

    // 6) 浮窗（硬门槛①：第二 WebviewWindow + per-webview data_directory）。
    //    独立 data_directory = 独立浏览器进程，不能共用 CDP 端口 —— 用生产信号
    //    路径验证：浮窗桥就绪后经 WS 广播 float.ready，主窗 _onNotify 可观测。
    const readyPromise = c.evalJs(`new Promise(function(resolve, reject) {
      var t = setTimeout(function() { reject(new Error('float.ready 15s 超时')); }, 15000);
      window.dshDesktop._onNotify(function(m, p) {
        if (m === 'float.ready') { clearTimeout(t); resolve(p); }
      });
      window.dshDesktop.floatWindow.open('smoke-session-1').catch(reject);
    })`);
    const floatReady = await readyPromise;
    check('浮窗独立创建并桥就绪（per-webview 隔离）', !!(floatReady && /smoke-session-1/.test(String(floatReady.win))), JSON.stringify(floatReady));
    // 浮窗标题栏模式：主窗不该变成浮窗条
    const mainBarStill = await c.evalJs('!!document.getElementById("__dsh_desktop_chrome__")');
    check('主窗仍为 36px 完整栏（浮窗模式未串扰）', mainBarStill);

    // 7) 菜单壳动作：quit（Rust 拦截 → app.exit → 优雅退出链）
    await c.evalJs('window.dshDesktop.menu.action("quit")');
    const exited = await new Promise((res) => {
      const t0 = Date.now();
      const tick = () => (shell.exitCode !== null ? res(true) : Date.now() - t0 > 20000 ? res(false) : setTimeout(tick, 500));
      tick();
    });
    check('菜单退出（进程收口）', exited, 'exitCode=' + shell.exitCode);

    // 8) 零孤儿：DSH_HOME 指向 tmp 的 node/dsh 进程应已回收
    await sleep(3500);
    const orphans = await listOrphans();
    check('零孤儿进程（sidecar/dsh web 均回收）', orphans === '', orphans || '(none)');

    c.close();
  } catch (e) {
    check('GUI 冒烟执行流', false, e.message);
    try { shell.kill(); } catch {}
  }

  console.log(failures === 0 ? '[gui-smoke] ALL PASS' : `[gui-smoke] ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})();
