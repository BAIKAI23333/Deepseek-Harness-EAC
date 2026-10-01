'use strict';
// 生产 node_modules 装配（P0：离线、可重复、不联网安装）。
//
// 背景（实测根因）：staged 树里跑 `npm ci` 是**注定失败**的，与网络无关 ——
// dsh-desktop/package-lock.json 中 234/280 个 `file:vendor/kernel/*.tgz` 条目的
// integrity 与磁盘上真实 tarball 不一致（tarball 被重打过，lock 没重算）。
// npm 因此抛 EINTEGRITY，并在回滚时对已写入的 node_modules 做 rmdir 触发
// EPERM（Windows 句柄/只读位），留下半截坏树。启动链路又从不执行 npm install，
// 于是装配彻底不可重复。
//
// 因此这里改为**从已经安装好的 `dsh-desktop/node_modules` 复制**生产依赖树：
//   - 完全离线，不需要 registry、不需要 cache；
//   - 可重复：同一 src 树 + 同一 lock → 同一 staged 树；
//   - 与「启动链路不跑 npm install」的既有纪律一致（AGENTS.md 关键陷阱）。
//
// 正确性不再依赖 npm 的 integrity，而是依赖本模块的**显式校验**：
//   1. lock 里所有非 optional 包必须在 src 树存在（跨平台 optional 变体允许缺失）；
//   2. 复制后逐包核对文件数，避免 copy 阶段的静默丢文件。
// 校验失败一律抛错（fail fast），绝不产出一个「能装上但运行期 ERR_MODULE_NOT_FOUND」的坏树。

import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/** 复制时排除的调试/缓存物：只影响体积，不影响模块解析。 */
const EXCLUDED_TOP_LEVEL = new Set(['.bin', '.cache', '.package-lock.json']);

export function readLockPackages(lockFile) {
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  return lock && typeof lock.packages === 'object' && lock.packages ? lock.packages : {};
}

/**
 * 校验 src node_modules 是否满足 lock 的**非 optional** 闭包。
 *
 * 只对非 optional 包严格要求：`@img/sharp-*`、`libreoffice-kit-*` 这类
 * 跨平台变体在 lock 里是 optional，安装在有对应原生包的平台上必然缺席，
 * 把它们的缺失当失败会误杀每一次 Windows 装配。
 */
export function missingRequiredPackages(sourceNodeModules, lockPackages) {
  const missing = [];
  for (const [key, meta] of Object.entries(lockPackages)) {
    if (!key.startsWith('node_modules/')) continue;
    if (meta && meta.optional) continue;
    if (!existsSync(path.join(sourceNodeModules, key.slice('node_modules/'.length)))) {
      missing.push(key.slice('node_modules/'.length));
    }
  }
  return missing;
}

/** 递归统计文件数（目录不计；与 bundle-integrity.js 的口径一致）。 */
function countFiles(dir) {
  let n = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) n += countFiles(path.join(dir, entry.name));
    else n += 1;
  }
  return n;
}

/** 顶层包（含 @scope/*）条目名，与 bundle-integrity 的清单口径一致。 */
function topLevelPackageNames(nodeModules) {
  const names = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (EXCLUDED_TOP_LEVEL.has(entry.name)) continue;
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(path.join(nodeModules, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) names.push(`${entry.name}/${scoped.name}`);
      }
      continue;
    }
    names.push(entry.name);
  }
  return names;
}

/**
 * 把 src 生产依赖树装配到 dest。
 *
 * @param {{ sourceNodeModules: string, destNodeModules: string, lockFile: string, expectedPlatform?: string, expectedArch?: string }} options
 * @returns {{ packages: number, files: number }}
 */
export function stageProductionNodeModules(options) {
  const { sourceNodeModules, destNodeModules, lockFile } = options;
  if (!existsSync(sourceNodeModules)) {
    throw new Error(
      `[stage] 源 node_modules 不存在：${sourceNodeModules}`
      + '\n        先运行 npm ci / npm install 生成生产依赖树（首次需要网络），之后装配即可完全离线重复。',
    );
  }
  if (!existsSync(lockFile)) {
    throw new Error(`[stage] 缺少 package-lock.json：${lockFile}`);
  }

  const lockPackages = readLockPackages(lockFile);
  const missing = missingRequiredPackages(sourceNodeModules, lockPackages);
  if (missing.length) {
    throw new Error(
      `[stage] 源 node_modules 缺少 ${missing.length} 个非 optional 包（lock 要求），拒绝装配半截依赖树：\n`
      + missing.slice(0, 20).map((name) => `          - ${name}`).join('\n')
      + (missing.length > 20 ? `\n          … 其余 ${missing.length - 20} 个` : '')
      + '\n        先在该目录补装依赖（npm ci），再重跑装配。',
    );
  }

  // 先删后拷：残留的旧包（升级后已消失的依赖）会被 Tauri 增量资源复制带进安装包。
  rmSync(destNodeModules, { recursive: true, force: true });
  cpSync(sourceNodeModules, destNodeModules, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(sourceNodeModules, src);
      if (!relative) return true;
      const top = relative.split(path.sep)[0];
      return !EXCLUDED_TOP_LEVEL.has(top);
    },
  });

  // 复制完整性自检：逐包核对文件数。copy 阶段若因锁/长路径静默丢文件，
  // 会在这里暴露，而不是等运行期 ERR_MODULE_NOT_FOUND。
  let files = 0;
  const packages = topLevelPackageNames(sourceNodeModules);
  for (const name of packages) {
    const srcDir = path.join(sourceNodeModules, name);
    const destDir = path.join(destNodeModules, name);
    if (!existsSync(destDir)) {
      throw new Error(`[stage] 装配丢包：${name}（源存在，目标缺失）`);
    }
    const expected = countFiles(srcDir);
    const actual = countFiles(destDir);
    if (actual !== expected) {
      throw new Error(`[stage] 装配不完整：${name} 文件数 ${actual} ≠ 源 ${expected}`);
    }
    files += actual;
  }

  assertNoUnexpectedNativePlatform(destNodeModules, options.expectedPlatform, options.expectedArch);
  return { packages: packages.length, files };
}

/**
 * 防止把构建机的**异平台**原生包带进安装包（P0：跨平台装配护栏）。
 *
 * 只在目标平台/架构显式给出时检查：命中即失败，避免「本机能跑、发布包崩」。
 *
 * 判定用的是包名里的**平台 token**（`darwin` / `win32` / `linux` / `freebsd`），
 * 不是最后一段 —— `@img/sharp-darwin-arm64` 的最后一段是 arch（arm64），
 * 只看最后一段这个护栏永远不会命中（首版实现正是这么错的）。
 * 只有同时出现 arch token 的包才算「平台特化原生包」，避免误杀
 * `@types/node-linux-notes` 这类名字里恰好含平台词的非原生包。
 */
const NATIVE_PLATFORM_TOKENS = ['darwin', 'win32', 'linux', 'freebsd'];
const NATIVE_ARCH_TOKENS = ['arm64', 'x64', 'ia32', 'arm', 'wasm32'];

export function assertNoUnexpectedNativePlatform(nodeModules, platform, arch) {
  if (!platform || !arch) return;
  const segmentsOf = (name) => name.replace(/^@[^/]+\//, '').split('-');
  const foreign = [];
  for (const name of topLevelPackageNames(nodeModules)) {
    const segments = segmentsOf(name);
    const hasArch = segments.some((segment) => NATIVE_ARCH_TOKENS.includes(segment));
    if (!hasArch) continue;
    const platforms = segments.filter((segment) => NATIVE_PLATFORM_TOKENS.includes(segment));
    if (!platforms.length) continue;
    if (platforms.includes(platform)) continue;
    foreign.push(name);
  }
  if (foreign.length) {
    throw new Error(
      `[stage] 生产依赖里存在 ${platform}/${arch} 不可达的异平台原生包：${foreign.join(', ')}`,
    );
  }
}

/** staged 平台戳文件内容（targetPlatform-targetArch）。 */
export function platformStampValue(platform, arch) {
  return `${platform}-${arch}`;
}

/** 目录可读性探针：用于 WebView2 / dpx 等前置检查给出明确失败信息。 */
export function describeMissing(target, label) {
  try {
    const stat = statSync(target);
    if (!stat.isDirectory() && !stat.isFile()) return `${label} 类型异常：${target}`;
    return null;
  } catch (error) {
    const code = error && /** @type {any} */ (error).code;
    if (code === 'ENOENT') return `${label} 不存在：${target}`;
    if (code === 'EACCES' || code === 'EPERM') return `${label} 无访问权限：${target}`;
    return `${label} 无法访问（${code || error}）：${target}`;
  }
}
