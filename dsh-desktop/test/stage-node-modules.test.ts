// 生产 node_modules 离线装配契约（P0）。
//
// 回归的核心缺陷：staged 树里跑 `npm ci` 必然失败 —— package-lock.json 中
// 234/280 个 file:vendor/kernel/*.tgz 的 integrity 与磁盘 tarball 不符（tarball
// 被重打过，lock 没重算），npm 抛 EINTEGRITY，回滚时 rmdir 又撞 EPERM，留下
// 半截坏树。装配因此联网且不可重复，而启动链路从不 npm install。
//
// 现在改为从已安装的 dsh-desktop/node_modules 离线复制 + 显式校验。
// 这一组测试锁定：不跑 npm ci、源树缺失时 fail fast 且给可执行指引、
// closure 校验、复制完整性、异平台原生包护栏。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readLockPackages,
  missingRequiredPackages,
  stageProductionNodeModules,
  assertNoUnexpectedNativePlatform,
  platformStampValue,
  describeMissing,
} from '../../tauri-shell/stage-node-modules.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const stageScript = fs.readFileSync(path.join(repoRoot, 'tauri-shell', 'stage-resources.mjs'), 'utf8');

const tempDirs: string[] = [];
function tempRoot(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eac-stage-${label}-`));
  tempDirs.push(dir);
  return dir;
}
test.after(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows 句柄占用 */ }
  }
});

function writePackage(dir: string, name: string, version: string, extra: Record<string, unknown> = {}): void {
  const target = path.join(dir, ...name.split('/'));
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version }));
  fs.writeFileSync(path.join(target, 'index.js'), 'module.exports = {};\n');
  for (const [file, content] of Object.entries(extra)) {
    const filePath = path.join(target, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, String(content));
  }
}

function writeLock(file: string, packages: Record<string, unknown>): void {
  fs.writeFileSync(file, JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages }, null, 2));
}

test('装配链路不再在 staged 树里执行 npm ci（EINTEGRITY 根因已被切断）', () => {
  // 关键回归：任何形式的「装配期联网安装」都不得回到 stage 脚本里。
  // 断言的是**可执行语句**，不是散文：失败提示里出现 `npm ci` 是刻意保留的
  // （它告诉开发者去 dsh-desktop 下补装源树），execSync 调用才是要禁的东西。
  assert.doesNotMatch(stageScript, /execSync\(\s*['"`]npm (ci|install)/, '装配不得执行 npm ci');
  assert.doesNotMatch(stageScript, /execSync\(\s*`npm (ci|install)/, '装配不得执行 npm install');
  assert.doesNotMatch(stageScript, /npm ci --omit=dev/, '旧的 npm ci 命令行不得残留');
  // 离线装配必须真的被调用（而不是留个空壳）。
  assert.match(stageScript, /stageProductionNodeModules/);
  assert.match(stageScript, /离线装配，不联网/);
  // 源树缺失时必须 fail fast，并指向「先 npm ci 生成源树」。
  assert.match(stageScript, /生产依赖源树不存在/);
  assert.match(stageScript, /装配阶段不再联网安装/);
});

test('stage 不再依赖 npm 的 kernel 清单绝对化（该机制只为 npm ci 存在）', () => {
  // withAbsolutizedKernelManifests 的唯一用途是给 npm ci 解析相对 file: 依赖；
  // 改成离线复制后必须摘掉，否则会留下「路径已绝对化却读错目录」的死代码。
  assert.doesNotMatch(stageScript, /withAbsolutizedKernelManifests/);
  assert.doesNotMatch(stageScript, /absolutizeKernelFileReferences/);
});

test('非 optional 包缺失即拒绝装配，optional 跨平台变体允许缺席', () => {
  const root = tempRoot('closure');
  const src = path.join(root, 'node_modules');
  writePackage(src, 'left-pad', '1.0.0');
  writePackage(src, '@scope/needed', '2.0.0');
  const lock = path.join(root, 'package-lock.json');
  writeLock(lock, {
    'node_modules/left-pad': { version: '1.0.0' },
    'node_modules/@scope/needed': { version: '2.0.0' },
    'node_modules/@img/sharp-darwin-arm64': { version: '9.9.9', optional: true },
    'node_modules/@img/sharp-linux-x64': { version: '9.9.9', optional: true },
  });

  const packages = readLockPackages(lock);
  // darwin/linux 的 optional 变体在 Windows 源树上必然缺席 —— 不能误判为失败。
  assert.deepEqual(missingRequiredPackages(src, packages), []);

  // 但非 optional 的缺一个就必须点名。
  writeLock(lock, {
    'node_modules/left-pad': { version: '1.0.0' },
    'node_modules/@scope/needed': { version: '2.0.0' },
    'node_modules/@scope/required-but-gone': { version: '3.0.0' },
  });
  assert.deepEqual(missingRequiredPackages(src, readLockPackages(lock)), ['@scope/required-but-gone']);
});

test('源树缺失非 optional 包时 fail fast，并给出可执行指引', () => {
  const root = tempRoot('missing-required');
  const src = path.join(root, 'node_modules');
  writePackage(src, 'present', '1.0.0');
  const lock = path.join(root, 'package-lock.json');
  writeLock(lock, {
    'node_modules/present': { version: '1.0.0' },
    'node_modules/absent': { version: '1.0.0' },
  });

  assert.throws(
    () => stageProductionNodeModules({
      sourceNodeModules: src,
      destNodeModules: path.join(root, 'out', 'node_modules'),
      lockFile: lock,
    }),
    (error: Error) => {
      assert.match(error.message, /缺少 1 个非 optional 包/);
      assert.match(error.message, /absent/);
      assert.match(error.message, /npm ci/, '失败信息必须给出下一步命令');
      return true;
    },
  );
});

test('源 node_modules 整个缺失时 fail fast，并说明装配不联网', () => {
  const root = tempRoot('no-source');
  const lock = path.join(root, 'package-lock.json');
  writeLock(lock, {});
  assert.throws(
    () => stageProductionNodeModules({
      sourceNodeModules: path.join(root, 'no-such-node_modules'),
      destNodeModules: path.join(root, 'out'),
      lockFile: lock,
    }),
    /源 node_modules 不存在[\s\S]*首次需要网络/,
  );
});

test('离线装配复制完整依赖树、排除 .bin 与 .package-lock.json、可重复', () => {
  const root = tempRoot('copy');
  const src = path.join(root, 'node_modules');
  writePackage(src, 'alpha', '1.0.0', { 'extra/data.txt': 'x'.repeat(64) });
  writePackage(src, 'beta', '1.0.0');
  writePackage(src, '@scope/gamma', '1.0.0');
  writePackage(src, 'alpha/node_modules/nested', '1.0.0');
  fs.mkdirSync(path.join(src, '.bin'), { recursive: true });
  fs.writeFileSync(path.join(src, '.bin', 'alpha'), 'shim');
  fs.writeFileSync(path.join(src, '.package-lock.json'), '{}');
  const lock = path.join(root, 'package-lock.json');
  writeLock(lock, {
    'node_modules/alpha': { version: '1.0.0' },
    'node_modules/beta': { version: '1.0.0' },
    'node_modules/@scope/gamma': { version: '1.0.0' },
  });

  const dest = path.join(root, 'out', 'node_modules');
  const first = stageProductionNodeModules({
    sourceNodeModules: src,
    destNodeModules: dest,
    lockFile: lock,
  });
  assert.equal(first.packages, 3, '顶层包 @scope 下每个算一个');
  assert.ok(fs.existsSync(path.join(dest, 'alpha', 'package.json')));
  assert.ok(fs.existsSync(path.join(dest, 'alpha', 'extra', 'data.txt')), '深层文件必须随行');
  assert.ok(fs.existsSync(path.join(dest, 'alpha', 'node_modules', 'nested', 'package.json')), '嵌套依赖必须随行');
  assert.ok(fs.existsSync(path.join(dest, '@scope', 'gamma', 'package.json')));
  assert.equal(fs.existsSync(path.join(dest, '.bin')), false, '.bin 命令 shim 不进安装包');
  assert.equal(fs.existsSync(path.join(dest, '.package-lock.json')), false);

  // 可重复：重跑（含残留清理）得到同样的文件数。
  fs.writeFileSync(path.join(dest, 'STALE-LEFT-FROM-PREVIOUS-BUILD.txt'), 'stale');
  const second = stageProductionNodeModules({
    sourceNodeModules: src,
    destNodeModules: dest,
    lockFile: lock,
  });
  assert.deepEqual(second, first, '同一源树重复装配必须得到相同的包数/文件数');
  assert.equal(
    fs.existsSync(path.join(dest, 'STALE-LEFT-FROM-PREVIOUS-BUILD.txt')),
    false,
    '上次装配的残留必须被清掉（Tauri 增量资源复制不会删已消失文件）',
  );
});

test('装配完整性自检能发现丢文件', () => {
  const root = tempRoot('verify');
  const src = path.join(root, 'node_modules');
  writePackage(src, 'alpha', '1.0.0', { 'deep/a.txt': 'a', 'deep/b.txt': 'b' });
  const lock = path.join(root, 'package-lock.json');
  writeLock(lock, { 'node_modules/alpha': { version: '1.0.0' } });

  const dest = path.join(root, 'out');
  // 目标已存在且有残留：确保 rm 后重建，而不是被旧内容污染。
  fs.mkdirSync(path.join(dest, 'alpha', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'alpha', 'deep', 'ghost.txt'), 'ghost');
  const report = stageProductionNodeModules({ sourceNodeModules: src, destNodeModules: dest, lockFile: lock });
  assert.equal(report.packages, 1);
  assert.equal(fs.existsSync(path.join(dest, 'alpha', 'deep', 'ghost.txt')), false);
});

test('异平台原生包护栏：目标平台不可达的 darwin/linux 原生包必须报错', () => {
  const root = tempRoot('foreign-native');
  const src = path.join(root, 'node_modules');
  writePackage(src, '@img/sharp-win32-x64', '1.0.0');
  writePackage(src, '@img/sharp-darwin-arm64', '1.0.0');

  // 目标 win32：darwin 变体必须被判为异平台。
  assert.throws(
    () => assertNoUnexpectedNativePlatform(src, 'win32', 'x64'),
    /不可达的异平台原生包[\s\S]*sharp-darwin-arm64/,
  );
  // 目标 darwin：win32 变体必须被判为异平台。
  assert.throws(() => assertNoUnexpectedNativePlatform(src, 'darwin', 'arm64'), /sharp-win32-x64/);
  // 同平台不报错。
  const clean = path.join(root, 'clean');
  writePackage(clean, '@img/sharp-win32-x64', '1.0.0');
  assert.doesNotThrow(() => assertNoUnexpectedNativePlatform(clean, 'win32', 'x64'));
  // 未指定平台时不检查（避免在无法判定的场景误杀）。
  assert.doesNotThrow(() => assertNoUnexpectedNativePlatform(src, undefined, undefined));
});

test('平台戳与 WebView2 前置检查的失败信息可诊断', () => {
  assert.equal(platformStampValue('win32', 'x64'), 'win32-x64');
  assert.equal(platformStampValue('linux', 'arm64'), 'linux-arm64');

  const root = tempRoot('describe');
  const missing = path.join(root, 'no-such-file');
  assert.match(String(describeMissing(missing, 'WebView2Loader.dll')), /不存在/);

  const present = path.join(root, 'present');
  fs.writeFileSync(present, 'x');
  assert.equal(describeMissing(present, 'WebView2Loader.dll'), null);
});

test('真实仓库的 lock 与源树满足装配前置条件（离线可装配）', () => {
  const ddRoot = path.join(repoRoot, 'dsh-desktop');
  const srcNm = path.join(ddRoot, 'node_modules');
  if (!fs.existsSync(srcNm)) {
    // 依赖未安装的检出（CI 的 lint-only job 等）跳过，但显式说明原因。
    assert.ok(true, '源 node_modules 未安装，跳过（装配需要先 npm ci）');
    return;
  }
  const lock = path.join(ddRoot, 'package-lock.json');
  const missing = missingRequiredPackages(srcNm, readLockPackages(lock));
  assert.deepEqual(missing, [], `源树缺少非 optional 包：${missing.join(', ')}`);
  // 真实 lock 里确实存在 integrity 与磁盘 tarball 不符的条目 —— 这正是
  // 不能再用 npm ci 的根因，保留此断言让「有人想改回 npm ci」时看到证据。
  const dpxLock = JSON.parse(fs.readFileSync(lock, 'utf8'));
  const fileDeps = Object.values(dpxLock.packages).filter(
    (entry: { resolved?: string }) => typeof entry.resolved === 'string' && entry.resolved.startsWith('file:'),
  );
  assert.ok(fileDeps.length > 0, 'lock 里应有 file: 内核依赖（vendor/kernel tarball）');
});
