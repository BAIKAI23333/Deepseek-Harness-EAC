import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// M3/#416 三层分级的运行时与 UI 契约。裁定（v2 计划 §0.5）：以既有
// `.sync/plugin-distribution.json` 的 `distributionClass` 为 canonical，
// 不新增 `tier` 字段 —— 行为落在三处：
//   1. 生成注册表（plugin-sync-registry）把 distributionClass 带到运行时；
//   2. 插件管理行（plugin-manager-state）暴露分级 + 内置行锁定 +
//      外部行默认禁用规划（companion-sync 走既有 patch 手术落盘）；
//   3. 插件管理 UI（dsh-plugin-manager/lib/client.js）按分级分组/打标签。
// 外部插件默认禁用复用既有「插件市场安装路径」与「插件管理 IPC」，不新增安装器。

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), 'utf8');
const json = <T>(...parts: string[]): T => JSON.parse(read(...parts)) as T;

const ledgerText = read('.sync', 'plugin-distribution.json');
const ledger = json<{ plugins: { id: string; distributionClass: string }[] }>('.sync', 'plugin-distribution.json');
const policies = json<{ pluginDistribution: { expectedCounts: Record<string, number> } }>('.sync', 'policies.json');

const state = await import('../plugin-manager-state.js');
const registry = await import('../lib/desktop/plugin-sync-registry.js');
const { expectedRegistryText } = await import('../scripts/plugin-sync.mjs');

const opsSource = read('dsh-desktop', 'lib', 'desktop', 'plugin-ops.ts');
const syncSource = read('dsh-desktop', 'lib', 'desktop', 'companion-sync.ts');
const clientSource = read('dsh-desktop', 'assets', 'plugins', 'dsh-plugin-manager', 'lib', 'client.js');
const marketHost = read('dsh-desktop', 'assets', 'plugins', 'dsh-unified-market', 'lib', 'host.js');

const classes = registry.PLUGIN_DISTRIBUTION_CLASSES as Record<string, string>;
const RECOMMENDED_PACK = 'dev.dsh-eac.desktop-recommended';

function classCounts(): Record<string, number> {
  const out: Record<string, number> = { builtin: 0, recommended: 0, external: 0 };
  for (const value of Object.values(classes)) out[value] = (out[value] || 0) + 1;
  return out;
}

function rows(entries: unknown[], ctx: Record<string, unknown>): any[] {
  return state.collectPluginRows(entries, ctx) as any[];
}

// ---------------------------------------------------------------------------
// 1. canonical 字段与生成注册表
// ---------------------------------------------------------------------------

test('distribution ledger keeps distributionClass as the only tier field (#416 ruling)', () => {
  assert.doesNotMatch(ledgerText, /"tier"\s*:/, '不得引入 tier 字段（v2 §0.5 裁定）');
  const allowed = new Set(['builtin', 'recommended', 'external']);
  for (const entry of ledger.plugins) {
    assert.ok(allowed.has(entry.distributionClass), `${entry.id} 的 distributionClass 非法: ${entry.distributionClass}`);
  }
  const schema = read('.sync', 'plugin-distribution.schema.json');
  assert.doesNotMatch(schema, /"tier"/, 'schema 不得声明 tier');
  const counts = { builtin: 0, recommended: 0, external: 0 } as Record<string, number>;
  for (const entry of ledger.plugins) counts[entry.distributionClass] += 1;
  assert.deepEqual(counts, policies.pluginDistribution.expectedCounts,
    'policies.expectedCounts 必须与 ledger 分级计数一致');
});

test('generated registry carries the ledger classes into the runtime', () => {
  assert.ok(classes && typeof classes === 'object', 'PLUGIN_DISTRIBUTION_CLASSES 必须由生成器产出');
  assert.deepEqual(classCounts(), policies.pluginDistribution.expectedCounts);
  for (const entry of ledger.plugins) {
    assert.equal(classes[entry.id], entry.distributionClass, `${entry.id} 的分级必须与 ledger 一致`);
  }
  assert.equal(registry.RECOMMENDED_PACK_ID, RECOMMENDED_PACK);
  assert.deepEqual(
    registry.RECOMMENDED_PACK_PLUGIN_IDS,
    ledger.plugins.filter((p) => p.distributionClass === 'recommended').map((p) => p.id).sort(),
    '推荐 id 清单与 ledger 的 recommended 集合一致',
  );
});

test('committed generated registry is byte-identical to the ledger-derived text', () => {
  // 生成产物零漂移：内容只由 .sync 三件套（manifest / distribution / 推荐包
  // draft）决定，与插件目录树无关，所以精简树里同样可验证（严格路径
  // `generate-registry --check` 需要完整目录树，见 expectedRegistryText 注释）。
  const expected = expectedRegistryText(root) as string;
  assert.equal(read('dsh-desktop', 'lib', 'desktop', 'plugin-sync-registry.ts'), expected,
    'plugin-sync-registry.ts 必须与 ledger 推导文本逐字节一致（重新生成而非手改）');
});

test('runtime class resolution reproduces the ledger for every entry', () => {
  for (const entry of ledger.plugins) {
    assert.equal(
      state.distributionClassOf(entry.id, 'other', classes),
      entry.distributionClass,
      `${entry.id} 的运行时分级必须等于 ledger 的 distributionClass`,
    );
  }
  // 非台账 id：内核骨架按内置，其余第三方一律外部（L3）。
  assert.equal(state.distributionClassOf('dsh-web-app', 'core', classes), 'builtin');
  assert.equal(state.distributionClassOf('brand-new-community-plugin', 'other', classes), 'external');
});

// ---------------------------------------------------------------------------
// 2. 行分级（纯函数）
// ---------------------------------------------------------------------------

test('builtin rows are default-enabled, non-disableable and labelled', () => {
  // coreIds 刻意留空：锁定必须来自 distributionClass，而不是调用方注入的核心集合。
  const [row] = rows([], {
    companion: [{ id: 'balance', name: '@deepseek-ai/dsh-balance' }],
    distributionClasses: classes,
    recommendedPack: RECOMMENDED_PACK,
  });
  assert.equal(row.distributionClass, 'builtin');
  assert.equal(row.tierLabel, '内置');
  assert.equal(row.enabled, true, '内置行默认启用');
  assert.equal(row.defaultEnabled, true);
  assert.equal(row.toggleable, false, '内置行不可停用');
  assert.equal(row.removable, false, '内置行不可移除');
  // 存量/手改的 disabled 行同样保持锁定（IPC 侧也拒绝停用内置插件）。
  const [locked] = rows([{ id: 'balance', disabled: true }], {
    companion: [{ id: 'balance', name: '@deepseek-ai/dsh-balance' }],
    distributionClasses: classes,
  });
  assert.equal(locked.toggleable, false);
  assert.equal(locked.distributionClass, 'builtin');
});

test('recommended rows stay installable and enable-choice aware', () => {
  const [row] = rows([], {
    companion: [{ id: 'dsh-navbar', name: '@vlln/dsh-navbar' }],
    distributionClasses: classes,
    recommendedPack: RECOMMENDED_PACK,
  });
  assert.equal(row.distributionClass, 'recommended');
  assert.equal(row.tierLabel, '推荐');
  assert.equal(row.enableChoice, true, '推荐插件安装后由用户选择是否启用');
  assert.equal(row.pack, RECOMMENDED_PACK);
  assert.equal(row.defaultEnabled, true);
  assert.equal(row.toggleable, true, '推荐插件保持可开关');
});

test('external rows are labelled and default-disabled', () => {
  const [row] = rows([], {
    bundles: ['dsh-community-thing'],
    distributionClasses: classes,
    recommendedPack: RECOMMENDED_PACK,
  });
  assert.equal(row.distributionClass, 'external');
  assert.equal(row.tierLabel, '外部');
  assert.equal(row.defaultEnabled, false, '外部插件新装默认禁用');
  assert.equal(row.enableChoice, false);
  assert.equal(row.pack, null);
  assert.equal(row.toggleable, true, '外部插件可手动启用');
  // 已登记且被关闭的外部插件：行显示关闭，但开关可用（手动启用）。
  const [off] = rows([{ id: 'dsh-community-thing', name: 'dsh-community-thing', disabled: true }], {
    bundles: ['dsh-community-thing'],
    distributionClasses: classes,
  });
  assert.equal(off.distributionClass, 'external');
  assert.equal(off.enabled, false);
  assert.equal(off.toggleable, true);
});

test('kernel skeleton bundle rows classify as builtin', () => {
  const [row] = rows([], { bundles: ['@deepseek-ai/dsh-web-app'], distributionClasses: classes });
  assert.equal(row.distributionClass, 'builtin');
  assert.equal(row.toggleable, false);
});

// ---------------------------------------------------------------------------
// 3. 外部层默认禁用的落盘规划（纯函数；写盘复用既有 patch 手术）
// ---------------------------------------------------------------------------

test('external default-disable plan targets only new third-party bundles', () => {
  const plan = state.externalDefaultDisabledPlan({
    bundles: [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-community-thing',
      '@scope/other-thing',
      'dsh-navbar',
      'balance',
    ],
    isRegistered: (id: string) => id === 'other-thing',
    distributionClasses: classes,
    skipIds: ['balance'],
  }) as { id: string; name: string }[];
  assert.deepEqual(plan, [{ id: 'dsh-community-thing', name: 'dsh-community-thing' }],
    '内核骨架 / 已登记 / 推荐与内置 / 配套插件都不进默认禁用清单');
});

test('external default-disable plan is empty without distribution knowledge', () => {
  const plan = state.externalDefaultDisabledPlan({
    bundles: ['dsh-community-thing'],
    isRegistered: () => false,
  }) as { id: string; name: string }[];
  assert.deepEqual(plan, [], '缺少分级表时不得擅自禁用第三方插件（fail-open）');
});

// ---------------------------------------------------------------------------
// 4. 运行时接线（source-level contract）
// ---------------------------------------------------------------------------

/** 源码契约断言：失败时只报缺失模式，不整文件回显。 */
function has(source: string, pattern: RegExp, message: string): void {
  assert.ok(pattern.test(source), message + '（缺失模式 ' + String(pattern) + '）');
}

test('plugin-ops feeds the ledger classes into rows and keeps builtin toggles refused', () => {
  has(opsSource, /PLUGIN_DISTRIBUTION_CLASSES/, 'plugin-ops 必须消费生成注册表的 canonical 分级表');
  has(opsSource, /distributionClasses\s*:\s*PLUGIN_DISTRIBUTION_CLASSES/, 'canonical 分级表必须注入 collectPluginRows');
  has(opsSource, /recommendedPack\s*:\s*RECOMMENDED_PACK_ID/, '推荐包 id 必须注入行（来自 ledger）');
  has(opsSource, /CORE_PLUGIN_IDS\.has\(id\)[\s\S]{0,120}核心插件不可停用/, '内置（核心）插件的停用拒绝必须保留');
});

test('companion-sync applies the external default-disable plan through the existing patch path', () => {
  has(syncSource, /externalDefaultDisabledPlan/, 'companion-sync 必须消费默认禁用规划');
  has(syncSource, /togglePluginInPatch\(patch, ext\.id, false, ext\.name\)/, '默认禁用必须复用既有 patch 手术（不新增安装器）');
  has(syncSource, /默认关闭（可在「设置 → 插件 → 管理」启用）/, '默认禁用需要可诊断的启动日志');
});

// ---------------------------------------------------------------------------
// 5. UI 契约（source-level）
// ---------------------------------------------------------------------------

test('plugin-manager client groups and labels builtin/recommended/external', () => {
  has(clientSource, /tierBuiltin:\s*"/, 'UI 必须提供内置分级标签');
  has(clientSource, /tierRecommended:\s*"/, 'UI 必须提供推荐分级标签');
  has(clientSource, /tierExternal:\s*"/, 'UI 必须提供外部分级标签');
  has(clientSource, /distributionClass/, 'UI 行模型必须携带 distributionClass');
  has(clientSource, /const tierOf = \(row\)/, 'UI 必须按分级推导分组');
  has(clientSource, /const tierGroups = \{/, 'UI 必须按三层分级分组渲染');
  has(clientSource, /tierBadge\(row\)/, '每行必须显示分级徽章');
  has(clientSource, /L\.tierRecommendedNote[\s\S]{0,120}L\.packPrefix/, '推荐组必须标注推荐包 id');
  has(clientSource, /chip\("builtin", L\.groupBuiltin/, '筛选项必须按分级给出计数');
});

// ---------------------------------------------------------------------------
// 6. 外部插件的常规安装路径（市场）默认禁用
// ---------------------------------------------------------------------------

test('market install path defaults non-shell-managed installs to disabled', () => {
  has(marketHost, /function isExternalInstall\(profile, pkgName\)/, '外部判定必须复用壳写入的内置清单标记');
  has(marketHost, /return !readBuiltinPlugins\(profile\)\.includes\(name\)/, '非壳同步面的包 = 外部插件');
  has(marketHost, /const disabled = op\.kind === 'uninstall' \|\| isExternalInstall\(op\.profile, pkgName\)/,
    '安装（外部包）默认禁用、卸载保持禁用');
  has(marketHost, /外部插件默认禁用[\s\S]{0,80}设置 → 插件 → 管理/, '安装输出必须告知默认禁用与手动启用位置');
  has(marketHost, /hotCtx !== null && !installDefaultDisabled/, '默认禁用的外部插件不得热挂载（否则绕过关闭行立即生效）');
});
