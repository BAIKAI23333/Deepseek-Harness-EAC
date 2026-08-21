'use strict';

// 子进程回收与环境构造（自 main.js 原样迁出，ADR 0002 L2 业务服务层）。
// 依赖通过 init() 注入，保持本模块与 Electron/UI 零耦合。

const { spawn } = require('node:child_process');

const IS_WIN = process.platform === 'win32';

let ctx = {};
function init(d) { ctx = d; }

function killTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (IS_WIN) {
      // M2 修复：先优雅（无 /F）给进程收尾机会（避免撕裂 session.jsonl.zstd），
      // 短等待后仍存活再强杀。
      spawn('taskkill', ['/pid', String(proc.pid), '/T'], { windowsHide: true, stdio: 'ignore' });
      const pid = proc.pid;
      setTimeout(() => {
        try {
          const query = 'tasklist /FI "PID eq ' + pid + '" /FO CSV /NH';
          const alive = require('node:child_process').execSync(query, { encoding: 'utf8', windowsHide: true });
          if (alive.includes(String(pid))) {
            spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          }
        } catch { /* 进程已退出或查询失败 */ }
      }, 1500);
    } else {
      try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); }
    }
  } catch (err) {
    ctx.log('killTree', String(err));
  }
}

// V4 修复「退出后残留一对进程」：退出路径专用的有界同步回收。
// 旧实现在 before-quit 里调用 killTree —— 强杀补刀挂在 1500ms 的
// setTimeout 上，而 Electron 在 before-quit 后数百毫秒内就退出，定时器
// 随主进程湮灭；无 /F 的 taskkill 对控制台进程（node.exe 没有顶层窗口，
// 无处投递 WM_CLOSE）基本无效。结果是 dsh web 的 node.exe 连同它的
// conhost.exe 每次退出都原样残留（用户实测三次，三次成对）。
// 这里：优雅 taskkill → 等待 graceMs → 仍存活则 taskkill /T /F → 再等
// hardMs，全程有界，绝不无限阻塞退出。
async function killTreeAndWait(proc, { graceMs = 1200, hardMs = 4000 } = {}) {
  if (!proc || !proc.pid || proc.exitCode !== null) return;
  const pid = proc.pid;
  try {
    if (IS_WIN) {
      spawn('taskkill', ['/pid', String(pid), '/T'], { windowsHide: true, stdio: 'ignore' });
      await waitForProcExit(proc, graceMs);
      if (proc.exitCode !== null) return;
      try {
        const alive = require('node:child_process').execSync(
          'tasklist /FI "PID eq ' + pid + '" /FO CSV /NH', { encoding: 'utf8', windowsHide: true });
        if (!alive.includes('"' + pid + '"')) return;
      } catch { return; }
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await waitForProcExit(proc, hardMs);
    } else {
      try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch {} }
      await waitForProcExit(proc, graceMs);
      if (proc.exitCode !== null) return;
      try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch {} }
      await waitForProcExit(proc, hardMs);
    }
  } catch (err) {
    ctx.log('killTree', String(err));
  }
}

// Environment for the dsh child: drop harness/session leftovers so the
// desktop instance boots clean, keep everything else (proxy, API keys, ...).
function childEnv() {
  const env = { ...process.env };
  for (const k of ['DSH_WEB_URL', 'DSH_SESSION_ID', 'DSH_SESSION_JSONL', 'DSH_SHELL', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) {
    delete env[k];
  }
  const dshHome = ctx.getDshHome();
  if (dshHome) env.DSH_HOME = dshHome;
  // 桌面端标记 + 实际 profile：配套插件的 host 半边（插件市场 / Skills 与
  // MCP 等）据此把安装/读写落到桌面专属 profile，而不是原生的 web profile。
  env.DSH_DESKTOP = '1';
  env.DSH_DESKTOP_PROFILE = ctx.getDesktopProfile();
  env.NO_COLOR = '1';
  return env;
}

// 等待一个子进程真正退出（taskkill 先优雅后强杀，锁住的 DLL 要等进程
// 终止才释放）。轮询 tasklist，超时后放行由调用方自行处理。
function waitForProcExit(proc, timeoutMs) {
  return new Promise((resolve) => {
    if (!proc || !proc.pid) return resolve();
    const pid = proc.pid;
    const started = Date.now();
    const isAlive = () => {
      if (proc.exitCode !== null) return false;
      if (!IS_WIN) {
        try { process.kill(pid, 0); return true; } catch { return false; }
      }
      try {
        const out = require('node:child_process').execSync(
          'tasklist /FI "PID eq ' + pid + '" /FO CSV /NH', { encoding: 'utf8', windowsHide: true });
        return out.includes('"' + pid + '"');
      } catch { return false; }
    };
    const check = () => {
      if (!isAlive()) return resolve();
      if (Date.now() - started >= timeoutMs) {
        ctx.log('service', '等待旧服务进程退出超时（PID ' + pid + '），继续');
        return resolve();
      }
      setTimeout(check, 200);
    };
    check();
  });
}

module.exports = { init, killTree, killTreeAndWait, childEnv, waitForProcExit };
