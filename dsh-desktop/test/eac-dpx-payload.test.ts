// dsh-dpx 装配面契约（ADR 0004）：打包 stage 携带的 dpx payload 必须
//   1) 封闭（index.js 的相对导入闭包完整）——否则打包后 import() 会
//      ERR_MODULE_NOT_FOUND，隔离在每个正式包里 fail closed；
//   2) 精简（不带 .git / desktop EXE / tests）；
//   3) 真的能加载并创建环境。
// 这一组断言直接防住「漏装一个被 import 的模块」这类静默坏包。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const environment = require('../lib/desktop/environment.js') as {
  DPX_PINNED_COMMIT: string;
};
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const stageScript = fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'stage-resources.mjs'), 'utf8');
const dpxRoot = path.join(repoRoot, 'third_party', 'dsh-dpx');
const dpxAvailable = fs.existsSync(path.join(dpxRoot, 'src', 'index.js'));

/** 从 stage 脚本里取出声明式装配清单，避免测试与实现各写一份文件名。 */
function declaredSrcFiles(): string[] {
  const match = /const DPX_SRC_FILES = \[([^\]]+)\]/.exec(stageScript);
  assert.ok(match, 'stage-resources.mjs 必须声明 DPX_SRC_FILES');
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

test('stage 声明的 dpx 模块清单覆盖 index.js 的完整相对导入闭包', { skip: !dpxAvailable && 'submodule 未初始化' }, () => {
  const declared = new Set(declaredSrcFiles());
  const required = new Set(['index.js']);
  const walk = (file: string): void => {
    const source = fs.readFileSync(path.join(dpxRoot, 'src', file), 'utf8');
    for (const match of source.matchAll(/from\s+'\.\/([A-Za-z0-9._-]+)'/g)) {
      const dependency = match[1]!;
      if (required.has(dependency)) continue;
      required.add(dependency);
      walk(dependency);
    }
  };
  walk('index.js');
  for (const file of required) {
    assert.ok(declared.has(file), `stage 必须装配 src/${file}（index.js 导入闭包的一部分）`);
  }
  // 反向：声明了但没在闭包里的文件说明清单漂移了。
  for (const file of declared) {
    assert.ok(required.has(file), `stage 声明了多余的 src/${file}`);
  }
});

test('stage 校验 pinned submodule 提交且拒绝脏工作树', () => {
  assert.match(stageScript, /git rev-parse HEAD/);
  // P3：失败信息已中文化并补齐可执行修复指引（原英文串保留在语义里即可）。
  assert.match(stageScript, /dsh-dpx 提交不匹配/);
  assert.match(stageScript, /git status --porcelain/);
  assert.match(stageScript, /dsh-dpx 工作树脏/);
  // 三类前置条件都必须给出可执行的修复命令。
  assert.match(stageScript, /git submodule update --init --recursive third_party\/dsh-dpx/);
  // 固定提交必须与适配层常量一致（同一事实源）。
  assert.match(stageScript, new RegExp(environment.DPX_PINNED_COMMIT));
  // 独立的 pin 门禁脚本读同一个常量（避免两套 pin）。
  const pinGate = fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'check-dpx-pin.mjs'), 'utf8');
  assert.match(pinGate, /DPX_PINNED_COMMIT/);
  assert.ok(!pinGate.includes('95f18221640ef36cc10e83dbfdf7c48d2744044c'), '门禁不得硬编码提交，必须读适配层常量');
});

test('stage 的 dpx payload 明确只装配 API/元数据/许可证，不带 EXE 与 tests', { skip: !dpxAvailable && 'submodule 未初始化' }, () => {
  // 只装配 src/ 下的 JS 文件 + package.json + 手写 LICENSE：
  // desktop EXE 启动器（assets/windows、desktop-shell）与 test/ 都不在清单里。
  const declared = declaredSrcFiles();
  assert.ok(declared.every((file) => file.endsWith('.js')), '只应装配 src/*.js');
  assert.doesNotMatch(stageScript, /assets['"`\s,\]]*windows|desktop-shell/);
  assert.doesNotMatch(stageScript, /copyRequired\(path\.join\(DPX_ROOT, 'test'/);
  // 装配面自检里对 EXE / tests 有显式拒绝分支。
  assert.match(stageScript, /endsWith\('\.exe'\)/);
  assert.match(stageScript, /startsWith\('test\/'\)/);
  // 上游 desktop 启动器目录确实存在于 submodule，但必须不在装配清单里。
  assert.ok(fs.existsSync(path.join(dpxRoot, 'assets', 'windows')), '上游 assets/windows 应存在（用于证明它被排除）');
  assert.ok(!fs.existsSync(path.join(dpxRoot, 'src', 'assets')), '装配面只取 src/');
});

test('按 stage 的清单装配出的 dpx payload 可加载并创建环境', { skip: !dpxAvailable && 'submodule 未初始化' }, async () => {
  const declared = declaredSrcFiles();
  const required = new Set<string>(['index.js']);
  const walk = (file: string): void => {
    const source = fs.readFileSync(path.join(dpxRoot, 'src', file), 'utf8');
    for (const match of source.matchAll(/from\s+'\.\/([A-Za-z0-9._-]+)'/g)) {
      const dependency = match[1]!;
      if (required.has(dependency)) continue;
      required.add(dependency);
      walk(dependency);
    }
  };
  walk('index.js');
  for (const file of required) assert.ok(declared.includes(file), `payload 需要 src/${file}`);

  // 真正 import 一份「按清单复制」的副本，而不是仓库原件 —— 这样才验证了
  // 「装配结果可用」，而不是「仓库源码可用」。
  const stagingArea = fs.mkdtempSync(path.join(repoRoot, 'dsh-desktop', 'test', '.dpx-staging-'));
  try {
    fs.mkdirSync(path.join(stagingArea, 'src'), { recursive: true });
    for (const file of declared) {
      fs.copyFileSync(path.join(dpxRoot, 'src', file), path.join(stagingArea, 'src', file));
    }
    fs.copyFileSync(path.join(dpxRoot, 'package.json'), path.join(stagingArea, 'package.json'));

    const module = await import(pathToFileURL(path.join(stagingArea, 'src', 'index.js')).href) as {
      createEnvironment(opts: Record<string, unknown>): Promise<Record<string, unknown>>;
      pathsFor(root: string): Record<string, string>;
      runtimeEnvironment(paths: Record<string, string>, inherited: NodeJS.ProcessEnv, opts: Record<string, unknown>): NodeJS.ProcessEnv;
    };
    for (const api of ['createEnvironment', 'pathsFor', 'runtimeEnvironment']) {
      assert.equal(typeof module[api as keyof typeof module], 'function', `staged dpx 应导出 ${api}`);
    }

    const productRoot = path.join(stagingArea, '产品 data root');
    const registryHome = path.join(productRoot, 'registry');
    const record = await module.createEnvironment({
      name: 'eac-beta',
      storageRoot: path.join(productRoot, 'dpx'),
      home: registryHome,
      desktop: false,
      publishDiscovery: false,
      platform: 'win32',
    });
    assert.equal(record.kind, 'DPXEnvironment');
    const paths = module.pathsFor(String(record.root));
    assert.ok(paths.dshHome!.endsWith('dsh-home'), `dshHome 应以 dsh-home 结尾：${paths.dshHome}`);
    const runtime = module.runtimeEnvironment(paths, { PATH: process.env.PATH }, { name: 'eac-beta', registryHome });
    assert.equal(runtime.DSH_HOME, paths.dshHome);
    assert.equal('NPM_CONFIG_PREFIX' in runtime, false);
  } finally {
    fs.rmSync(stagingArea, { recursive: true, force: true });
  }
});
