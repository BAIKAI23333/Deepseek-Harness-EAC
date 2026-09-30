// P2：随包内核来源不变量回归。
//
// ADR 0004 的关键约束：EAC 用 dsh-dpx **只**做安装环境隔离，**不用 `dpx run`
// 启动内核** —— 内核仍按现有安装目录随包启动（`@deepseek-ai/dsh/lib/bin.js`
// 经 require.resolve 从安装树解析）。环境隔离改变的是「profile/sessions 落在
// 哪个根」，不是「内核从哪来」。
//
// 这组测试把这条不变量钉住：任何「把内核启动改走 dpx」的改动都会在这里失败。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ddRoot = path.join(repoRoot, 'dsh-desktop');

function readIfExists(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

test('环境适配层不实现、也不调用 dpx 的启动器（禁止 dpx run）', () => {
  const environment = fs.readFileSync(path.join(ddRoot, 'lib', 'desktop', 'environment.ts'), 'utf8');
  // dpx 的启动路径 API（launchSpec / launchTarget / runChild / locatePackage）
  // 一个都不该被隔离适配层使用。
  for (const api of ['launchSpec', 'launchTarget', 'launchTargets', 'runChild', 'locatePackage', 'npmCliPath', 'installDesktopLauncher', 'installPackagedDesktopLauncher']) {
    assert.doesNotMatch(environment, new RegExp(`\\b${api}\\b`), `隔离适配层不得使用 dpx 的 ${api}`);
  }
  // 也不该出现裸的 `dpx run` 调用。注意：文件里刻意写了「EAC 不用 dpx run」
  // 的说明注释，所以要**先剥掉注释**再断言，否则会把散文当成代码误报。
  const withoutComments = environment
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));
  assert.doesNotMatch(withoutComments, /dpx\s+run/);
});

test('sidecar 与壳都不把内核启动切到 dpx', () => {
  for (const relative of ['tauri-shell/sidecar/server.ts', 'tauri-shell/sidecar/bridge.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    assert.doesNotMatch(source, /dpx\s+run/, `${relative} 不得用 dpx run 启动内核`);
    for (const api of ['launchSpec', 'runChild', 'installDesktopLauncher']) {
      assert.doesNotMatch(source, new RegExp(`\\b${api}\\b`), `${relative} 不得调用 dpx 的 ${api}`);
    }
  }
  const mainRs = fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'src', 'main.rs'), 'utf8');
  assert.doesNotMatch(mainRs, /dpx\s+run/, 'Rust 壳不得用 dpx run 启动内核');
  // 壳只注入隔离身份变量，不注入 dpx 的启动器路径。
  assert.match(mainRs, /DSH_EAC_DATA_ROOT/);
  assert.match(mainRs, /DSH_EAC_CHANNEL/);
});

test('内核仍从安装树解析（require.resolve），且保留 overlay 语义', () => {
  const runtimePaths = fs.readFileSync(path.join(ddRoot, 'lib', 'desktop', 'runtime-paths.ts'), 'utf8');
  // 内核 bin 来自 require.resolve 的安装树路径。
  assert.match(runtimePaths, /require\.resolve\('@deepseek-ai\/dsh\/lib\/bin\.js'\)/);
  // overlay（用户目录已更新内核）语义必须保留，且优先级在随包内核之前。
  assert.match(runtimePaths, /effectiveOverlay/);
  assert.match(runtimePaths, /overlayBinPath/);
});

test('随包内核版本由 package.json 的 file:vendor/kernel 钉版决定（与 descriptor 同源）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ddRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const kernelDep = pkg.dependencies?.['@deepseek-ai/dsh'] ?? '';
  const pinned = /deepseek-ai-dsh-([\w.\-+]+)\.tgz/.exec(kernelDep)?.[1];
  assert.ok(pinned, `package.json 必须以 file:vendor/kernel 钉版内核，实际：${kernelDep}`);
  assert.match(kernelDep, /^file:vendor\/kernel\//, '内核依赖必须是仓库内 vendored tarball（离线可装配）');
  // 对应 tarball 必须真的在仓库里（否则装配后 require.resolve 必然失败）。
  const tarball = path.join(ddRoot, kernelDep.slice('file:'.length));
  assert.ok(fs.existsSync(tarball), `内核 tarball 必须存在：${tarball}`);
  // descriptor 生成器必须从同一个 dependencies 字段取版本（单一事实源）。
  const generator = fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'gen-distribution-descriptor.mjs'), 'utf8');
  assert.match(generator, /pkg\.dependencies\?\.\['@deepseek-ai\/dsh'\]/, 'descriptor 版本必须取自 package.json 依赖，不得另写一份');
});

test('内核版本与隔离环境根彼此独立（隔离不改内核来路）', () => {
  // 隔离适配层不得引用内核包路径/版本 —— 那是 runtime-paths 与 descriptor 的职责。
  const environment = fs.readFileSync(path.join(ddRoot, 'lib', 'desktop', 'environment.ts'), 'utf8');
  assert.doesNotMatch(environment, /@deepseek-ai\/dsh\b/, '隔离适配层不得解析内核包');
  assert.doesNotMatch(environment, /vendor\/kernel/, '隔离适配层不得引用内核 tarball');
  // 反过来：环境适配层声明的路径字段必须来自 dpx 的 pathsFor（单一事实源）。
  assert.match(environment, /pathsFor\(/, '环境路径必须来自 dpx 的 pathsFor');
});

test('stage 装配把内核 tarball 缓存带进安装包（file: 依赖可解析）', () => {
  const stage = fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'stage-resources.mjs'), 'utf8');
  assert.match(stage, /vendor\/kernel/, 'stage 必须装配 vendor/kernel');
  assert.match(stage, /copyKernelCacheForTarget/, 'stage 必须按目标平台裁剪内核缓存');
  // 内核缓存缺失必须 fail fast（否则装出一个跑不起来的内核）。
  assert.match(stage, /vendor\/kernel 缺失/);
});

// P0 打包缺口回归（2026-09-28 实测发现）：dsh-dpx payload 曾被 stage 正确装配到
// staged-resources/dpx/，却**没有列进 tauri.conf.json 的 resources 映射** ——
// 结果是「smoke 通过、正式安装包里的隔离 fail closed」（打包后
// <resources>/dpx/src/index.js 不存在）。这条断言把「谁随包」变成显式契约。
test('tauri 资源映射必须把 dpx payload 打进安装包（否则正式包隔离必然失败）', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'tauri.conf.json'), 'utf8')) as {
    bundle?: { resources?: Record<string, string> };
  };
  const resources = conf.bundle?.resources ?? {};
  const mappings = Object.entries(resources).map(([from, to]) => `${from} -> ${to}`);

  // dpx 的 JS API 必须随包（stage 装配面 = src/*.js + package.json + LICENSE）。
  const dpxEntry = Object.entries(resources).find(([from]) => /staged-resources\/dpx\//.test(from));
  assert.ok(dpxEntry, `tauri.conf.json 必须映射 staged-resources/dpx/（当前映射：${mappings.join(', ')}）`);
  assert.equal(dpxEntry![1], 'dpx/', 'dpx 必须映射到资源根下的 dpx/（environment.dpxModuleFile 按此定位）');

  // 与 adapter 的打包态查找路径保持同一约定：<resources>/dpx/src/index.js。
  const environment = fs.readFileSync(path.join(ddRoot, 'lib', 'desktop', 'environment.ts'), 'utf8');
  assert.match(environment, /'dpx',\s*'src',\s*'index\.js'/, '适配层必须按 <resources>/dpx/src/index.js 查找');
  assert.match(environment, /DSH_RESOURCE_ROOT/, '打包态必须经 DSH_RESOURCE_ROOT 定位资源根');

  // 其余随包面也都是必需项，一并锁住（缺任一个都会让壳跑不起来）。
  for (const required of ['sidecar/', 'dsh-desktop/', 'ui-skin-manager/']) {
    assert.ok(
      Object.values(resources).includes(required),
      `tauri.conf.json 必须映射 ${required}（当前：${mappings.join(', ')}）`,
    );
  }
});
