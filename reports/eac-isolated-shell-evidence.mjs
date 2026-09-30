// 视觉/运行验收：用**真实 release Tauri 壳**在隔离模式下启动，捕获其完整启动链路输出
// （托盘 → sidecar → web-ready），并核对隔离根落盘。
// 说明：本环境无法对该窗口做像素级截图（见报告），所以这里记录壳自报的启动链路
// 与隔离事实，作为可复核的运行证据。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXE = 'D:/AI_Coding/Deepseek-Harness-EAC/tauri-shell/target/release/dsh-eac-shell.exe';
const ROOT = 'D:/AI_Coding/Deepseek-Harness-EAC';
const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eac-shell-evi-'));
const dataRoot = path.join(productRoot, '产品 Data Root');
const fakeHost = path.join(productRoot, 'fake-host');
const legacyProfile = path.join(fakeHost, '.dsh', 'profiles', 'web-desktop');
fs.mkdirSync(legacyProfile, { recursive: true });
fs.writeFileSync(path.join(legacyProfile, 'old-plugin.txt'), '旧插件');

const child = spawn(EXE, [], {
  cwd: ROOT,
  env: {
    ...process.env,
    DSH_EAC_DATA_ROOT: dataRoot,
    DSH_EAC_DPX_REGISTRY_HOME: path.join(productRoot, 'registry'),
    DSH_EAC_CHANNEL: 'beta',
    USERPROFILE: fakeHost,
    HOME: fakeHost,
    LOCALAPPDATA: fakeHost,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
let err = '';
child.stdout.on('data', (d) => { out += String(d); });
child.stderr.on('data', (d) => { err += String(d); });

const deadline = Date.now() + 90000;
let navigated = null;
while (Date.now() < deadline) {
  const m = /navigate: (\S+)/.exec(out);
  if (m) { navigated = m[1]; break; }
  await new Promise((r) => setTimeout(r, 400));
}
// 再等一会儿让 profile 初始化落盘
await new Promise((r) => setTimeout(r, 4000));

const envRoot = path.join(dataRoot, 'dpx', 'dsh-environments', 'eac-beta');
const manifest = path.join(envRoot, '.dpx-environment.json');
const lines = { out: out.split(/\r?\n/).filter(Boolean), err: err.split(/\r?\n/).filter(Boolean) };

console.log('=== 真实壳启动链路（stdout）===');
console.log(lines.out.filter((l) => /tray|sidecar|ws\]|navigate|web-ready|boot\.start/i.test(l)).slice(0, 12).join('\n') || '(无)');
console.log('\n=== 隔离相关（stderr）===');
console.log(lines.err.filter((l) => /environment|dshHome|profile|隔离/i.test(l)).slice(0, 10).join('\n') || '(无)');

console.log('\n=== 视觉/运行结论 ===');
console.log('壳 navigated to web UI =', Boolean(navigated), navigated ? `(${navigated.slice(0, 48)}…)` : '');
console.log('隔离根存在             =', fs.existsSync(envRoot));
console.log('manifest kind          =', fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).kind : '(缺失)');
console.log('dsh-home 在隔离根内    =', fs.existsSync(path.join(envRoot, 'dsh-home')));
console.log('kernel 初始化了隔离 profile =', fs.existsSync(path.join(envRoot, 'dsh-home', 'profiles')));
console.log('宿主旧插件未被复制     =', !fs.existsSync(path.join(envRoot, 'dsh-home', 'profiles', 'web-desktop', 'old-plugin.txt')));
console.log('宿主旧 profile 原文     =', fs.readFileSync(path.join(legacyProfile, 'old-plugin.txt'), 'utf8'));
// sidecar 是壳的子进程，其 stderr 不进入本进程管道；改为直接读隔离根内的
// 事实文件，并核对该 dsh-home 确实属于本次注入的产品数据根。
const dshHome = path.join(envRoot, 'dsh-home');
console.log('dshHome 路径            =', dshHome);
console.log('dshHome 归属本次注入根  =', fs.existsSync(dshHome) && path.resolve(dshHome).startsWith(path.resolve(dataRoot)));

// P1：用适配层对刚跑起来的环境做只读诊断（证明「损坏环境可诊断」的入口
// 在真实隔离根上可用，且健康环境报告 0 问题）。
const checks = {
  navigated: Boolean(navigated),
  envRootExists: fs.existsSync(envRoot),
  manifestKind: fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).kind : null,
  dshHomeInsideRoot: fs.existsSync(dshHome) && path.resolve(dshHome).startsWith(path.resolve(dataRoot)),
  profileInitialized: fs.existsSync(path.join(envRoot, 'dsh-home', 'profiles')),
  legacyNotCopied: !fs.existsSync(path.join(envRoot, 'dsh-home', 'profiles', 'web-desktop', 'old-plugin.txt')),
  legacyUntouched: fs.readFileSync(path.join(legacyProfile, 'old-plugin.txt'), 'utf8') === '旧插件',
};
console.log('\n=== P1 诊断（environment.status 等价面）===');
try {
  // 适配层是就地编译的 CommonJS：import() 拿到的是 { default: exports, ... }，
  // 直接取 default 才是模块导出对象。
  const moduleNamespace = await import(pathToFileURL(path.join(ROOT, 'dsh-desktop', 'lib', 'desktop', 'environment.js')).href);
  const environment = moduleNamespace.default ?? moduleNamespace;
  const diagnosis = environment.diagnoseEacEnvironment({
    ...process.env,
    DSH_EAC_DATA_ROOT: dataRoot,
    DSH_EAC_DPX_REGISTRY_HOME: path.join(productRoot, 'registry'),
    DSH_EAC_CHANNEL: 'beta',
    USERPROFILE: fakeHost,
    HOME: fakeHost,
    LOCALAPPDATA: fakeHost,
  }, 'win32');
  console.log('诊断 registered        =', diagnosis.registered);
  console.log('诊断 removable         =', diagnosis.removable);
  console.log('诊断 registryReadable  =', diagnosis.registryReadable);
  console.log('诊断 manifestPresent   =', diagnosis.manifestPresent);
  console.log('诊断 problems 数       =', diagnosis.problems.length);
  console.log('诊断 legacyProfile 检测 =', diagnosis.legacyProfileDetected);
  checks.diagnosisHealthy = diagnosis.problems.length === 0 && diagnosis.registered === true;
  checks.legacyDetected = diagnosis.legacyProfileDetected === true;
} catch (error) {
  console.log('诊断失败（fail closed）:', String(error && error.message || error).slice(0, 200));
  checks.diagnosisHealthy = false;
}

console.log('\n=== 通过项汇总 ===');
for (const [name, value] of Object.entries(checks)) console.log(`  ${value ? 'PASS' : 'FAIL'}  ${name}`);

// 打包装配事实（P0）：bundle-manifest 与隔离 payload 必须随包装配到位。
const releaseDesktop = path.join(ROOT, 'tauri-shell', 'target', 'release', 'dsh-desktop');
const releaseDpx = path.join(ROOT, 'tauri-shell', 'target', 'release', 'dpx', 'src', 'index.js');
console.log('\n=== 打包装配事实（P0）===');
console.log('release bundle-manifest 存在 =', fs.existsSync(path.join(releaseDesktop, 'bundle-manifest.json')));
console.log('release dpx/src/index.js 存在 =', fs.existsSync(releaseDpx));
console.log('release node_modules 顶层包数 =', fs.existsSync(path.join(releaseDesktop, 'node_modules')) ? fs.readdirSync(path.join(releaseDesktop, 'node_modules')).length : 0);

const reportFile = path.join(ROOT, 'reports', 'eac-isolated-shell-launch.log');
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, `# 隔离模式真实壳启动日志\n\n## 通过项\n${Object.entries(checks).map(([k, v]) => `- ${v ? 'PASS' : 'FAIL'} ${k}`).join('\n')}\n\n## stdout\n${out}\n\n## stderr\n${err}\n`);
console.log('\n启动日志已保存 =', reportFile);

const allPassed = Object.values(checks).every(Boolean);
try { child.kill(); } catch { /* 已退出 */ }
await new Promise((r) => setTimeout(r, 800));
try { fs.rmSync(productRoot, { recursive: true, force: true }); } catch { /* 句柄占用 */ }
process.exit(allPassed ? 0 : 1);
