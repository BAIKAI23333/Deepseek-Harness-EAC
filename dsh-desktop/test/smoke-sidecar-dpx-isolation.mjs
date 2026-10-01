// 端到端：sidecar 是否真的进入 dpx 隔离环境（V4 运行时验证）。
//
// 用 spawnSync 而不是异步 spawn：本机 harness 下异步 spawn 的 stdio 管道
// 在部分环境会被拒（EPERM），而 spawnSync 直接可用且天然带超时。
// 每一步都有硬超时；失败时打印已收集输出，绝不静默挂住。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NODE = process.env.EAC_TEST_NODE || 'C:/Program Files/study apps/node.exe';
const REPO = 'D:/AI_Coding/Deepseek-Harness-EAC';
const TIMEOUT_MS = Number(process.env.EAC_SMOKE_TIMEOUT_MS || 60000);

const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eac-sidecar-iso-'));
const dataRoot = path.join(productRoot, '产品 Data Root');
const fakeHost = path.join(productRoot, 'fake-host');
const legacyProfile = path.join(fakeHost, '.dsh', 'profiles', 'web-desktop');
fs.mkdirSync(legacyProfile, { recursive: true });
fs.writeFileSync(path.join(legacyProfile, 'old-plugin.txt'), '旧插件');

const envRoot = path.join(dataRoot, 'dpx', 'dsh-environments', 'eac-beta');
const manifest = path.join(envRoot, '.dpx-environment.json');

const isolationEnv = {
  ...process.env,
  DSH_EAC_DATA_ROOT: dataRoot,
  DSH_EAC_DPX_REGISTRY_HOME: path.join(productRoot, 'registry'),
  DSH_EAC_CHANNEL: 'beta',
  USERPROFILE: fakeHost,
  HOME: fakeHost,
  LOCALAPPDATA: fakeHost,
  // 污染变量：验证 dpx 的 runtimeEnvironment 会清掉它们。
  // 注意 NODE_OPTIONS 不能在这里设 —— spawnSync 会让它同时作用于本进程的
  // node 子进程（internal/preload），把测试自己打死。它改由「断言 runtime
  // 里不含该键」和 dsh-desktop 单测覆盖。
  NPM_CONFIG_PREFIX: '/host/prefix',
  NPM_CONFIG_CACHE: '/host/cache',
  HTTP_PROXY: 'http://host-proxy',
  NODE_PATH: '/host/modules',
};

function runSidecar(env, input) {
  return spawnSync(NODE, ['../tauri-shell/sidecar/server.js'], {
    cwd: path.join(REPO, 'dsh-desktop'),
    env,
    input,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
}

// ---- 1) 隔离模式：sidecar 必须在 dpx 环境里初始化 ----
const isolated = runSidecar(isolationEnv, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shell.info', params: {} }) + '\n');
console.log('=== 1) 隔离模式 shell.info ===');
console.log('status  =', isolated.status, 'err =', isolated.error ? isolated.error.code : null);
console.log('stdout  =', (isolated.stdout || '').trim() || '(empty)');
console.log('stderr  =', (isolated.stderr || '').split(/\r?\n/).filter((l) => /environment|dshHome|dpx|fail/i.test(l)).join('\n') || '(无关键行)');

const info = (() => {
  try { return JSON.parse(String(isolated.stdout || '').trim()); } catch { return null; }
})();
// shell.info 只报身份与挂载面，不含 dshHome；实际生效的 dshHome 在 stderr 的
// `modules mounted ... dshHome=<path>` 行里，从那里取真值。
const mountedLine = String(isolated.stderr || '').split(/\r?\n/).find((l) => /modules mounted/.test(l)) || '';
const reportedDshHome = /dshHome=([^;]+);/.exec(mountedLine)?.[1];

console.log('\n=== 2) dpx 隔离根落盘 ===');
console.log('envRoot        =', envRoot);
console.log('exists         =', fs.existsSync(envRoot));
if (fs.existsSync(manifest)) {
  const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  console.log('manifest kind  =', parsed.kind);
  console.log('manifest name  =', parsed.name);
  console.log('manifest root  =', parsed.root);
  console.log('entries        =', fs.readdirSync(envRoot).sort().join(', '));
  console.log('dsh-home 存在  =', fs.existsSync(path.join(envRoot, 'dsh-home')));
  console.log('workspace 存在 =', fs.existsSync(path.join(envRoot, 'workspace')));
  console.log('tmp 存在       =', fs.existsSync(path.join(envRoot, 'tmp')));
}

console.log('\n=== 3) 宿主旧数据不被迁移/改动 ===');
const legacyCopied = fs.existsSync(path.join(envRoot, 'dsh-home', 'profiles', 'web-desktop', 'old-plugin.txt'));
const legacyText = fs.existsSync(path.join(legacyProfile, 'old-plugin.txt'))
  ? fs.readFileSync(path.join(legacyProfile, 'old-plugin.txt'), 'utf8') : '(缺失)';
console.log('legacy 未迁移  =', !legacyCopied);
console.log('legacy 原文    =', legacyText);
console.log('宿主被识别     =', /检测到宿主机旧 \.dsh/.test(String(isolated.stderr || '')));

// ---- 4) 非隔离模式回归：显式 DSH_HOME 的开发/测试启动仍保持兼容 ----
const plainHome = path.join(productRoot, 'plain-dsh-home');
const plain = runSidecar({
  ...process.env,
  DSH_HOME: plainHome,
  HOME: fakeHost,
  USERPROFILE: fakeHost,
  LOCALAPPDATA: fakeHost,
}, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shell.info', params: {} }) + '\n');
console.log('\n=== 4) 非隔离模式（显式 DSH_HOME）回归 ===');
console.log('status              =', plain.status);
console.log('dshHome 走 DSH_HOME =', String(plain.stderr || '').includes(plainHome));
console.log('不创建 dpx 环境     =', !fs.existsSync(path.join(productRoot, 'plain-host')));

// ---- 5) fail closed：产品数据根指向缺失的 dpx 模块时必须退场，不回退宿主 ~/.dsh ----
const failClosed = runSidecar({
  ...isolationEnv,
  DSH_DPX_ROOT: path.join(productRoot, 'no-such-dpx'),
}, '');
console.log('\n=== 5) fail closed（dpx 模块缺失）===');
console.log('status        =', failClosed.status, '(期望 2)');
console.log('stderr        =', (failClosed.stderr || '').split(/\r?\n/).filter(Boolean).slice(-3).join('\n') || '(empty)');
console.log('未回退宿主    =', !/dshHome=.*\.dsh;/.test(String(failClosed.stderr || '')));

const assertions = [
  ['隔离模式 sidecar 正常退出', isolated.status === 0],
  ['shell.info 返回结果', info !== null && info.result !== undefined],
  ['dpx 环境根已创建', fs.existsSync(envRoot)],
  ['manifest 为 DPXEnvironment', fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).kind === 'DPXEnvironment'],
  ['dsh-home 落在隔离根内', fs.existsSync(path.join(envRoot, 'dsh-home'))],
  ['sidecar 报出的 dshHome 落在隔离根内', typeof reportedDshHome === 'string' && path.resolve(reportedDshHome).startsWith(path.resolve(envRoot))],
  ['宿主旧插件未被迁移', !legacyCopied],
  ['宿主旧 profile 原文未改', legacyText === '旧插件'],
  ['非隔离模式仍兼容显式 DSH_HOME', plain.status === 0 && String(plain.stderr || '').includes(plainHome)],
  ['fail closed 退出码为 2', failClosed.status === 2],
  ['fail closed 未回退宿主 ~/.dsh', !/dshHome=.*\.dsh;/.test(String(failClosed.stderr || ''))],
];

console.log('\n=== 断言汇总 ===');
let failed = 0;
for (const [label, passed] of assertions) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failed += 1;
}
console.log(`\n=== 结果：${failed === 0 ? 'PASS' : `FAIL（${failed} 项）`} ===`);
try { fs.rmSync(productRoot, { recursive: true, force: true }); } catch { /* 句柄占用 */ }
process.exit(failed === 0 ? 0 : 1);
