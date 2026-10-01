#!/usr/bin/env node
/**
 * 插件来源台账校验（零依赖，CI 可直接跑）
 *
 * 校验 assets/SOURCES.json 与仓库实际状态一致：
 *  1. 台账结构：枚举值、必填字段、(id,line) 唯一、pathBaseline 格式
 *  2. main 线路径存在性 + package.json 版本/包名一致性
 *     （带 pathBaseline 的历史基线条目不校验存在性：其 path 相对的是
 *     该线在指定 commit 的树，条目描述的是已从本检出树剥离/外迁的资产）
 *  3. 完整性：当前树受控目录（assets/plugins）下每个目录都有台账条目
 *  4. origin 约束：upstream 必须有 upstream.repository；unresolved 必须有 candidates
 *
 * 用法：node scripts/plugin-ledger.mjs [--report]
 *   --report  只输出汇总不校验版本细节（调试用）
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 台账路径相对仓库根（脚本位于 dsh-desktop/scripts/）
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEDGER = join(repoRoot, 'dsh-desktop', 'assets', 'SOURCES.json');
const REPORT_ONLY = process.argv.includes('--report');

const ORIGINS = ['upstream', 'eac-original', 'unresolved', 'unverified'];
const TYPES = ['plugin', 'skin', 'preset', 'sdk-sample', 'source-copy', 'seed', 'host-fused'];
const LINES = ['main', 'aio-v1'];
// path 基准：缺省 = 当前检出树（main 线路径必须存在）；
// 显式声明 `<line>@<40位 commit>` = path 相对该线在该 commit 的历史树
// （条目已从当前树剥离/外迁，存在性不再适用，但线别必须与 line 一致）。
const BASELINE_RE = /^(main|aio-v1)@[0-9a-f]{40}$/;
// 当前检出树受控目录 → 台账必须覆盖（只声明真实存在的 root；
// assets/{skins,agent-presets,sdk-plugins} 已随皮肤平台外迁/精简树剥离）
const SCOPES = [
  'dsh-desktop/assets/plugins',
];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

let ledger;
try {
  ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
} catch (e) {
  console.error(`[plugin-ledger] 台账 JSON 解析失败: ${e.message}`);
  process.exit(1);
}

if (ledger.version !== 1) fail(`台账 version 必须为 1，当前 ${ledger.version}`);
if (!ledger.audit?.mainBaseline) fail('缺少 audit.mainBaseline');
const comps = Array.isArray(ledger.components) ? ledger.components : [];
if (!comps.length) fail('components 为空');

// --- 结构校验 ---
const seen = new Set();
for (const c of comps) {
  const tag = `${c.line || '?'}/${c.name || c.id || '?'}`;
  const key = `${c.id}|${c.line}`;
  if (seen.has(key)) fail(`重复条目 ${key}`);
  seen.add(key);
  if (!ORIGINS.includes(c.origin)) fail(`${tag}: origin 非法 "${c.origin}"`);
  if (!TYPES.includes(c.type)) fail(`${tag}: type 非法 "${c.type}"`);
  if (!LINES.includes(c.line)) fail(`${tag}: line 非法 "${c.line}"`);
  if (!c.path && c.type !== 'host-fused') fail(`${tag}: 缺 path`);
  if (c.pathBaseline !== undefined) {
    if (typeof c.pathBaseline !== 'string' || !BASELINE_RE.test(c.pathBaseline)) {
      fail(`${tag}: pathBaseline 非法 "${c.pathBaseline}"（须为 <line>@<40位 commit>）`);
    } else if (c.pathBaseline.split('@')[0] !== c.line) {
      fail(`${tag}: pathBaseline 线别 ${c.pathBaseline.split('@')[0]} 与 line ${c.line} 不一致`);
    }
  }
  if (c.origin === 'upstream' && !c.upstream?.repository) {
    fail(`${tag}: origin=upstream 必须提供 upstream.repository`);
  }
  if (c.origin === 'unresolved' && !Array.isArray(c.candidates)) {
    fail(`${tag}: origin=unresolved 必须提供 candidates[]`);
  }
}

// --- main 线文件系统校验（只校验相对当前检出树的路径）---
let versionChecked = 0;
let baselinePinned = 0;
let treeChecked = 0;
for (const c of comps) {
  if (c.line !== 'main' || !c.path) continue;
  if (c.pathBaseline) {
    // 历史基线行：path 相对该线的历史树，目录本就不在当前检出树里。
    baselinePinned++;
    continue;
  }
  treeChecked++;
  const abs = join(repoRoot, c.path);
  if (!existsSync(abs)) {
    fail(`${c.id}/${c.name}: 路径不存在 ${c.path}`);
    continue;
  }
  const pkgPath = join(abs, 'package.json');
  if (!['plugin', 'skin', 'source-copy', 'sdk-sample'].includes(c.type)) continue;
  if (!existsSync(pkgPath)) {
    warn(`${c.id}/${c.name}: 类型 ${c.type} 但目录无 package.json`);
    continue;
  }
  if (REPORT_ONLY) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    fail(`${c.id}/${c.name}: package.json 解析失败 ${e.message}`);
    continue;
  }
  if (pkg.name !== c.name) {
    fail(`${c.id}: 台账 name "${c.name}" ≠ package.json name "${pkg.name}"`);
  }
  if (c.version && pkg.version !== c.version) {
    fail(`${c.id}/${c.name}: 台账版本 ${c.version} ≠ package.json ${pkg.version}（改版必须同步台账）`);
  }
  versionChecked++;
}

// --- 完整性：目录 → 台账 ---
const covered = new Set(
  comps.filter((c) => c.line === 'main' && c.path).map((c) => c.path.replace(/\\/g, '/')),
);
for (const scope of SCOPES) {
  const absScope = join(repoRoot, scope);
  if (!existsSync(absScope)) continue;
  for (const dir of readdirSync(absScope)) {
    const p = `${scope}/${dir}`;
    if (!statSync(join(repoRoot, p)).isDirectory()) continue;
    if (!covered.has(p)) fail(`目录缺台账条目: ${p}`);
  }
}

// --- dsh-plugin.json（std v0.15 manifest）门禁 ---
// 随包 manifest 是描述性身份清单（见 scripts/gen-plugin-manifests.mjs 头注）；
// 存在即校验：必填字段、name/version 与台账一致、entry 文件存在。
let manifestChecked = 0;
for (const c of comps) {
  if (c.line !== 'main' || !c.path) continue;
  const mPath = join(repoRoot, c.path, 'dsh-plugin.json');
  if (!existsSync(mPath)) continue;
  let m;
  try {
    m = JSON.parse(readFileSync(mPath, 'utf8'));
  } catch (e) {
    fail(`${c.id}: dsh-plugin.json 解析失败 ${e.message}`);
    continue;
  }
  const tag = `${c.id}/${c.name}`;
  for (const key of ['manifestVersion', 'id', 'name', 'version', 'facets', 'source']) {
    if (m[key] === undefined) fail(`${tag}: manifest 缺必填字段 ${key}`);
  }
  if (m.manifestVersion !== '0.15') fail(`${tag}: manifestVersion 须为 0.15`);
  // manifest.name 是展示名（composer 先例），身份一致性由 id/version/entry 承担。
  if (m.version && c.version && m.version !== c.version) {
    fail(`${tag}: manifest version ${m.version} ≠ 台账 ${c.version}`);
  }
  const entry = m.facets?.host?.entry;
  if (entry && !existsSync(join(repoRoot, c.path, String(entry).replace(/^\.\//, '')))) {
    fail(`${tag}: manifest facets.host.entry 不存在: ${entry}`);
  }
  manifestChecked++;
}

// --- 汇总 ---
const byOrigin = {};
const byType = {};
for (const c of comps) {
  byOrigin[c.origin] = (byOrigin[c.origin] || 0) + 1;
  byType[c.type] = (byType[c.type] || 0) + 1;
}
const manifestCount = comps.filter(
  (c) => c.line === 'main' && c.path && existsSync(join(repoRoot, c.path, 'dsh-plugin.json')),
).length;

console.log(`[plugin-ledger] 组件 ${comps.length} 条（main ${comps.filter((c) => c.line === 'main').length} / aio-v1 ${comps.filter((c) => c.line === 'aio-v1').length}）`);
console.log(`[plugin-ledger] 路径：当前树校验 ${treeChecked} 条 / 历史基线条目 ${baselinePinned} 条（已剥离出本树，不校验存在性）`);
console.log(`[plugin-ledger] origin: ${JSON.stringify(byOrigin)}`);
console.log(`[plugin-ledger] type:   ${JSON.stringify(byType)}`);
console.log(`[plugin-ledger] 版本校验 ${versionChecked} 个 package.json；manifest 校验 ${manifestChecked} 份 / 共 ${manifestCount} 份随包`);

if (warnings.length) {
  for (const w of warnings) console.warn(`[plugin-ledger][警告] ${w}`);
}
if (errors.length) {
  for (const e of errors) console.error(`[plugin-ledger][错误] ${e}`);
  console.error(`[plugin-ledger] 校验失败：${errors.length} 项错误`);
  process.exit(1);
}
console.log('[plugin-ledger] 校验通过');
