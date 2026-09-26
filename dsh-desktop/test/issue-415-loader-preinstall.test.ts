// M2/#415 第二半：皮肤加载器预装契约。
//
// #415 的退役面（dsh-skin-switch + assets/skins 播种）由
// issue-415-skin-switch-retirement.test.ts 守卫；本文件守卫「换肤职责去哪了」：
// `@dsh-eac/ui-skin-loader` 与 13 款公约皮肤包必须以 EAC 内置资产形态随包预装、
// 经 profile bundles 装载、由 loader 作为唯一用户可见换肤控制面，且默认（未选择
// 任何皮肤）= 宿主原生观感（无任何覆盖）。
//
// 边界（ADR 0010）：壳层 ui-skin manager 的 boot/recovery 回退资源不在换肤控制面
// 内（不可被用户选择），仍随包；本文件只断言它没有被换成「用户选择器」。

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), 'utf8');
const json = <T>(...parts: string[]): T => JSON.parse(read(...parts)) as T;

const LOADER_DIR = 'dsh-ui-skin-loader';
const LOADER_ID = 'dsh-ui-skin-loader';
const LOADER_PACKAGE = '@dsh-eac/ui-skin-loader';
const CONVENTION = 'dsh.ecosystem.ui-skin-loader/v1';

/** 13 款已本地验证的 v1.1.0 公约皮肤（tarball → 目录名 / 包名 / 行 id / 皮肤 id / 许可）。 */
const SKINS = [
  { dir: 'dsh-eac-skin-aurora', row: 'dsh-eac-skin-aurora', skin: 'dsh-eac.skin.aurora', license: 'MIT' },
  { dir: 'dsh-eac-skin-blue-fantasy', row: 'dsh-eac-skin-blue-fantasy', skin: 'dsh-eac.skin.blue-fantasy', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-deep-whale-day-night', row: 'dsh-eac-skin-deep-whale-day-night', skin: 'dsh-eac.skin.deep-whale-day-night', license: 'CC-BY-NC-SA-4.0' },
  { dir: 'dsh-eac-skin-dragon-heir', row: 'dsh-eac-skin-dragon-heir', skin: 'dsh-eac.skin.dragon-heir', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-inkwash', row: 'dsh-eac-skin-inkwash', skin: 'dsh-eac.skin.inkwash', license: 'MIT' },
  { dir: 'dsh-eac-skin-maid-atelier', row: 'dsh-eac-skin-maid-atelier', skin: 'dsh-eac.skin.maid-atelier', license: 'MIT AND CC-BY-NC-SA-4.0' },
  { dir: 'dsh-eac-skin-miku', row: 'dsh-eac-skin-miku', skin: 'dsh-eac.skin.miku', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-minecraft', row: 'dsh-eac-skin-minecraft', skin: 'dsh-eac.skin.minecraft', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-qq98', row: 'dsh-eac-skin-qq98', skin: 'dsh-eac.skin.qq98', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-ths', row: 'dsh-eac-skin-ths', skin: 'dsh-eac.skin.ths', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-trading', row: 'dsh-eac-skin-trading', skin: 'dsh-eac.skin.trading', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-whale-song', row: 'dsh-eac-skin-whale-song', skin: 'dsh-eac.skin.whale-song', license: 'MIT AND BSD-3-Clause' },
  { dir: 'dsh-eac-skin-xp', row: 'dsh-eac-skin-xp', skin: 'dsh-eac.skin.xp', license: 'MIT AND BSD-3-Clause' },
] as const;

const ALL_DIRS = [LOADER_DIR, ...SKINS.map((s) => s.dir)];
const ALL_PACKAGES = [LOADER_PACKAGE, ...SKINS.map((s) => `@dsh-eac/skin-${s.skin.slice('dsh-eac.skin.'.length)}`)];
const ALL_ROWS = [LOADER_ID, ...SKINS.map((s) => s.row)];

const assetDir = (name: string): string => join(root, 'dsh-desktop', 'assets', 'plugins', name);
const packageJson = (name: string): Record<string, any> =>
  json(...(['dsh-desktop', 'assets', 'plugins', name, 'package.json'] as [string, string, string, string, string]));

const companionSyncSource = read('dsh-desktop', 'lib', 'desktop', 'companion-sync.ts');
const profileSource = read('dsh-desktop', 'lib', 'desktop', 'profile.ts');
const stageScript = read('tauri-shell', 'stage-resources.mjs');
const registrySource = read('dsh-desktop', 'lib', 'desktop', 'plugin-sync-registry.ts');

const profile = await import('../lib/desktop/profile.js');
const companion = await import('../lib/desktop/companion-sync.js');
const registry = await import('../lib/desktop/plugin-sync-registry.js');

// ---------------------------------------------------------------------------
// 1. 随包资产面：14 个包目录就位
// ---------------------------------------------------------------------------

test('loader 与 13 款公约皮肤随包预装（assets/plugins/<dir>）', () => {
  for (const dir of ALL_DIRS) {
    const base = assetDir(dir);
    assert.equal(existsSync(join(base, 'package.json')), true, `${dir}/package.json 必须随包`);
    assert.equal(existsSync(join(base, 'lib', 'index.js')), true, `${dir}/lib/index.js 必须随包（host 半）`);
    assert.equal(existsSync(join(base, 'lib', 'client.js')), true, `${dir}/lib/client.js 必须随包（client 半）`);
    assert.equal(existsSync(join(base, 'cordis.patch.yml')), true, `${dir}/cordis.patch.yml 必须随包（bundle 补丁层）`);
  }
  const loaderPkg = packageJson(LOADER_DIR);
  assert.equal(loaderPkg.name, LOADER_PACKAGE);
  assert.equal(loaderPkg.version, '1.1.0', '预装的是本地已验证的 v1.1.0 产物');
  assert.equal(loaderPkg.dsh.bundle.patch, './cordis.patch.yml');
});

test('皮肤包的公约身份自洽且全局唯一（行 id / 皮肤 id / 包名 / 体命名空间）', () => {
  const seenSkin = new Map<string, string>();
  const seenRow = new Map<string, string>();
  const seenPackage = new Map<string, string>();
  const seenMarker = new Map<string, string>();
  for (const skin of SKINS) {
    const pkg = packageJson(skin.dir);
    assert.equal(pkg.name, `@dsh-eac/skin-${skin.skin.slice('dsh-eac.skin.'.length)}`, `${skin.dir} 包名`);
    assert.equal(pkg.version, '1.1.0', `${skin.dir} 版本`);
    assert.equal(pkg.license, skin.license, `${skin.dir} 许可声明`);
    assert.equal(pkg.dsh.manifestVersion, 1, `${skin.dir} manifestVersion`);
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml', `${skin.dir} 必须声明 bundle 补丁层`);
    assert.equal(pkg.dsh.skin.apiVersion, CONVENTION, `${skin.dir} 必须声明皮肤公约版本`);
    assert.equal(pkg.dsh.skin.id, skin.skin, `${skin.dir} 皮肤 id`);
    // 行 id == settings 命名空间（公约 §8.1）；三套名字必须一一对应。
    const patch = read('dsh-desktop', 'assets', 'plugins', skin.dir, 'cordis.patch.yml');
    assert.match(patch, new RegExp(`- id: ${skin.row}\\b`), `${skin.dir} 补丁层必须插入行 ${skin.row}`);
    assert.match(patch, new RegExp(`name: "@dsh-eac/skin-`), `${skin.dir} 补丁层必须绑定包名`);
    const marker = pkg.dsh.skin.bodyAttr;
    for (const [seen, value, label] of [
      [seenSkin, pkg.dsh.skin.id, '皮肤 id'],
      [seenRow, skin.row, 'patch 行 id'],
      [seenPackage, pkg.name, '包名'],
    ] as const) {
      assert.equal(seen.has(value), false, `${label} 重复: ${value}（${skin.dir} 与 ${seen.get(value)}）`);
      seen.set(value, skin.dir);
    }
    if (typeof marker === 'string' && marker) {
      assert.equal(seenMarker.has(marker), false, `body 命名空间重复: ${marker}（${skin.dir} 与 ${seenMarker.get(marker)}）`);
      seenMarker.set(marker, skin.dir);
    }
  }
  assert.equal(seenSkin.size, SKINS.length);
});

test('每个包都随行许可与出处文本（NOTICES 齐全）', () => {
  for (const dir of ALL_DIRS) {
    assert.equal(existsSync(join(assetDir(dir), 'LICENSE')), true, `${dir}/LICENSE 必须随包`);
  }
  for (const skin of SKINS) {
    const tpn = read('dsh-desktop', 'assets', 'plugins', skin.dir, 'THIRD-PARTY-NOTICES.md');
    assert.ok(tpn.length > 200, `${skin.dir}/THIRD-PARTY-NOTICES.md 必须记录上游出处与许可全文`);
    assert.equal(existsSync(join(assetDir(skin.dir), 'NOTICE')), true, `${skin.dir}/NOTICE 必须随包`);
  }
  assert.equal(existsSync(join(assetDir(LOADER_DIR), 'NOTICE')), true);
  assert.equal(existsSync(join(assetDir(LOADER_DIR), 'THIRD-PARTY-NOTICES.md')), true);
});

// ---------------------------------------------------------------------------
// 2. 装配面（stage-resources）与预装面（profile bundles + 配套包同步）
// ---------------------------------------------------------------------------

test('装配清单携带 loader 与 13 款皮肤（且不再携带退役插件）', () => {
  const builtin = /const BUILTIN_PLUGIN_DIRS = \[([\s\S]*?)\];/.exec(stageScript);
  assert.ok(builtin, 'BUILTIN_PLUGIN_DIRS 清单必须存在');
  const builtinDirs = (builtin![1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  assert.ok(builtinDirs.includes(LOADER_DIR), `内置装配清单必须含 ${LOADER_DIR}`);
  assert.equal(builtinDirs.includes('dsh-skin-switch'), false, '退役插件不得再随包装配');

  const skins = /const SKIN_PACKAGE_DIRS = \[([\s\S]*?)\];/.exec(stageScript);
  assert.ok(skins, 'SKIN_PACKAGE_DIRS 清单必须存在（13 款公约皮肤随包）');
  const skinDirs = (skins![1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  assert.deepEqual([...skinDirs].sort(), SKINS.map((s) => s.dir).sort(), '装配清单必须与 13 款已验证皮肤逐一对应');
  // ADR 0010：壳层回退资源仍在（非用户可选的 shell recovery），不因本接入而移除。
  assert.match(stageScript, /ui-skin-manager/);
});

test('loader 与皮肤经 profile bundles 预装（bundle 补丁层，不写 overlay 行）', () => {
  assert.deepEqual(profile.BUNDLED_BUILTIN_PLUGINS, ALL_PACKAGES,
    'BUNDLED_BUILTIN_PLUGINS 必须按 loader → 13 款皮肤的顺序列出全部包名');
  // profile.ts 是唯一播种来源：BUNDLED_BUILTIN_PLUGINS → DESKTOP_PROFILE_BUNDLES → seedBundledPlugins
  assert.match(profileSource, /DESKTOP_PROFILE_BUNDLES = \[[\s\S]*?\.\.\.BUNDLED_BUILTIN_PLUGINS\]/);

  const defs = (companion.COMPANION_PLUGINS as { id: string; name: string; dir?: string }[])
    .filter((p) => ALL_ROWS.includes(p.id));
  assert.deepEqual(defs.map((p) => p.id), ALL_ROWS, 'loader + 13 款皮肤必须都在内置配套插件清单（包拷贝来源）');
  assert.deepEqual(defs.map((p) => p.name), ALL_PACKAGES);
  assert.deepEqual(defs.map((p) => p.dir), ALL_DIRS, '每项必须声明 assets/plugins 下的真实目录名');

  // 已进 bundles 的包不得再写 overlay insert 行（否则 duplicate loader entry id 拖垮插件树）。
  const syncBody = companionSyncSource.slice(companionSyncSource.indexOf('export function syncCompanionPlugins'));
  assert.match(syncBody, /if \(bundled\.includes\(p\.name\) \|\| declaredBundleIds\.has\(p\.id\)\) continue;/,
    '配套行写入必须跳过已进 bundles 的包（bundle 补丁层是它们唯一登记点）');
});

test('loader/皮肤不得落到 L3 外部层（否则每次启动会被自动写关闭行）', async () => {
  const classes = registry.PLUGIN_DISTRIBUTION_CLASSES as Record<string, string>;
  for (const id of ALL_ROWS) {
    assert.equal(classes[id], 'builtin', `${id} 必须是 L1 内置分级（canonical ledger 来源）`);
  }
  const plan = companionSyncSource.includes('externalDefaultDisabledPlan');
  assert.equal(plan, true, 'L3 默认禁用规划仍必须存在（不得为接入皮肤而删除）');
  const builtinIds = registry.DISTRIBUTION_BUILTIN_PLUGIN_IDS as readonly string[];
  for (const id of ALL_ROWS) assert.ok(builtinIds.includes(id), `${id} 必须在 builtin 集合内`);
});

test('L3 默认禁用规划不得给皮肤平台 bundles 写关闭行', async () => {
  // 规划的 id 空间来自 **bundle 包名的短名**（@dsh-eac/ui-skin-loader → ui-skin-loader），
  // 而皮肤平台的行 id 是 DSH 行 id（dsh-ui-skin-loader）—— 两者不同名。若不把
  // 配套插件清单的包名一并排除，规划的「外部层新装默认禁用」会给每个皮肤包写一条
  // `- id: ui-skin-loader … disabled: true` 行：既让 loader 变成「外部/默认禁用」
  // 的假象，又与 bundle 自己的补丁层形成 duplicate loader entry id 风险。
  const state = await import('../plugin-manager-state.js') as {
    externalDefaultDisabledPlan(o: Record<string, unknown>): { id: string; name: string }[];
  };
  const derived = (name: string): string => (name.includes('/') ? name.slice(name.indexOf('/') + 1) : name);
  const plan = state.externalDefaultDisabledPlan({
    bundles: profile.BUNDLED_BUILTIN_PLUGINS,
    isRegistered: () => false,
    distributionClasses: registry.PLUGIN_DISTRIBUTION_CLASSES,
    builtinIds: registry.DISTRIBUTION_BUILTIN_PLUGIN_IDS,
    recommendedIds: registry.RECOMMENDED_PACK_PLUGIN_IDS,
    skipIds: ALL_PACKAGES.map(derived),
  });
  assert.deepEqual(plan, [],
    '皮肤平台 14 个包已由配套插件同步负责，规划必须一个都不碰');
  // 反例：真正的外部 bundle 仍要被规划（守卫不得被削成恒空）。
  const withExt = state.externalDefaultDisabledPlan({
    bundles: [...profile.BUNDLED_BUILTIN_PLUGINS, 'dsh-community-probe'],
    isRegistered: () => false,
    distributionClasses: registry.PLUGIN_DISTRIBUTION_CLASSES,
    builtinIds: registry.DISTRIBUTION_BUILTIN_PLUGIN_IDS,
    recommendedIds: registry.RECOMMENDED_PACK_PLUGIN_IDS,
    skipIds: ALL_PACKAGES.map(derived),
  });
  assert.deepEqual(withExt.map((p) => p.id), ['dsh-community-probe']);
  // 且 companion-sync 必须真的把这些包名传给规划。
  const syncBody = companionSyncSource.slice(companionSyncSource.indexOf('export function syncCompanionPlugins'));
  assert.match(syncBody, /skipIds:/, 'sync 必须把配套包（含皮肤平台）的 id 空间交给规划排除');
});

// ---------------------------------------------------------------------------
// 3. 身份与默认回退（loader = 控制面；无激活皮肤 = 宿主原生观感）
// ---------------------------------------------------------------------------

test('默认状态不激活任何皮肤（宿主原生观感）', async () => {
  const host = await import(pathToFileURL(join(assetDir(LOADER_DIR), 'lib', 'index.js')).href) as {
    Config?: { dict?: Record<string, { meta?: { default?: unknown; volatile?: boolean } }> };
    SETTINGS_NAMESPACE?: string;
  };
  const activeSkin = host.Config?.dict?.activeSkin?.meta;
  assert.ok(activeSkin, 'loader host 半必须导出 Config.activeSkin 定义');
  assert.equal(activeSkin!.default, 'default',
    'loader 默认 activeSkin 必须是 default（无激活皮肤 = 不引入任何覆盖）');
  assert.equal(activeSkin!.volatile, true,
    'activeSkin 必须是 volatile（默认不落 profile 配置，避免隐式覆盖宿主观感）');
  assert.equal(host.SETTINGS_NAMESPACE, LOADER_ID, 'loader 设置命名空间必须等于补丁行 id（公约 §8.1）');
  // 皮肤包自身的补丁层只是登记行：不得携带 config（不得在装载时强制激活）。
  for (const dir of ALL_DIRS) {
    const patch = read('dsh-desktop', 'assets', 'plugins', dir, 'cordis.patch.yml');
    assert.doesNotMatch(patch, /^\s+config:/m, `${dir} 的补丁行不得带 config（激活由 loader 控制面决定）`);
    assert.doesNotMatch(patch, /activeSkin/, `${dir} 不得在补丁层写 activeSkin`);
  }
});

test('loader 是唯一换肤控制面（皮肤经 loader 服务注册，不各自为政）', () => {
  const loaderClient = read('dsh-desktop', 'assets', 'plugins', LOADER_DIR, 'lib', 'client.js');
  assert.match(loaderClient, /uiSkinLoader/, 'loader client 半必须提供 uiSkinLoader 服务');
  assert.match(loaderClient, new RegExp(CONVENTION.replace(/[./]/g, '\\$&')), 'loader client 半必须实现公约版本');
  for (const skin of SKINS) {
    const client = read('dsh-desktop', 'assets', 'plugins', skin.dir, 'lib', 'client.js');
    assert.match(client, /uiSkinLoader|register/, `${skin.dir} client 半必须经 loader 服务注册（唯一控制面）`);
  }
  // loader 设置页策略：由 loader 自己声明设置面（不接管宿主设置页）。
  const loaderHost = read('dsh-desktop', 'assets', 'plugins', LOADER_DIR, 'lib', 'index.js');
  assert.match(loaderHost, /settings\.configure/, 'loader host 半必须声明设置页策略');
});

test('peer 引脚与 EAC 内核钉一致（否则内核会静默跳过 bundle）', () => {
  const pkg = json<{ dependencies: Record<string, string> }>('dsh-desktop', 'package.json');
  const kernel = Object.values(pkg.dependencies)
    .filter((v) => v.startsWith('file:vendor/kernel/'))
    .map((v) => v.slice('file:vendor/kernel/'.length).split('/')[0]);
  assert.ok(kernel.length > 0, 'package.json 必须有内核钉');
  for (const dir of ALL_DIRS) {
    const peer = packageJson(dir).peerDependencies?.['@deepseek-ai/dsh'];
    assert.equal(peer, kernel[0], `${dir} 的 @deepseek-ai/dsh peer 必须钉住 EAC 内核版本 ${kernel[0]}`);
  }
});

// ---------------------------------------------------------------------------
// 4. 离线台账 / 生成注册表一致性（identity + 零漂移）
// ---------------------------------------------------------------------------

test('离线台账登记 loader 与 13 款皮肤，许可与版本与包内一致', () => {
  const manifest = json<{ plugins: { id: string; path: string; packageName: string; license: { expected: string }; request: { version: string }; validation: { entrypoints: string[] } }[]; skins: { path: string }[] }>(
    '.sync', 'plugins.json',
  );
  for (const skin of SKINS) {
    const id = skin.row;
    const entry = manifest.plugins.find((p) => p.id === id);
    assert.ok(entry, `.sync/plugins.json 必须登记 ${id}`);
    assert.equal(entry!.path, `dsh-desktop/assets/plugins/${skin.dir}`);
    assert.equal(entry!.packageName, `@dsh-eac/skin-${skin.skin.slice('dsh-eac.skin.'.length)}`);
    assert.equal(entry!.request.version, '1.1.0');
    assert.equal(entry!.license.expected, skin.license);
    assert.deepEqual(entry!.validation.entrypoints, ['lib/index.js']);
  }
  const loaderEntry = manifest.plugins.find((p) => p.id === LOADER_ID);
  assert.ok(loaderEntry, `.sync/plugins.json 必须登记 ${LOADER_ID}`);
  assert.equal(loaderEntry!.packageName, LOADER_PACKAGE);
  assert.equal(loaderEntry!.license.expected, 'MIT');
  // 台账不得再把已退役的 assets/skins 目录登记为在册皮肤（#415 已删除该目录）。
  for (const entry of manifest.skins) {
    assert.equal(entry.path.startsWith('dsh-desktop/assets/skins/'), false,
      `assets/skins 已退役，台账不得再登记 ${entry.path}`);
  }
});

test('分发台账与生成注册表把 14 个包记为 builtin，且产物零漂移', async () => {
  const distribution = json<{ plugins: { id: string; distributionClass: string }[] }>('.sync', 'plugin-distribution.json');
  const policies = json<{ pluginDistribution: { expectedCounts: Record<string, number> } }>('.sync', 'policies.json');
  const history = json<{ plugins: { id: string; path: string }[] }>('.sync', 'plugin-inventory-history.json');
  for (const id of ALL_ROWS) {
    const entry = distribution.plugins.find((p) => p.id === id);
    assert.ok(entry, `.sync/plugin-distribution.json 必须登记 ${id}`);
    assert.equal(entry!.distributionClass, 'builtin');
    assert.ok(history.plugins.some((p) => p.id === id), `.sync/plugin-inventory-history.json 必须登记 ${id}`);
  }
  const counts = distribution.plugins.reduce<Record<string, number>>(
    (acc, p) => ({ ...acc, [p.distributionClass]: (acc[p.distributionClass] || 0) + 1 }), {});
  assert.deepEqual(counts, policies.pluginDistribution.expectedCounts,
    'policies.expectedCounts 必须与分发台账计数一致');
  // 生成的 .ts 必须逐字节等于台账推导文本（重新生成而非手改）。
  const { expectedRegistryText } = await import('../scripts/plugin-sync.mjs') as {
    expectedRegistryText(root?: string): string;
  };
  assert.equal(registrySource, expectedRegistryText(root),
    'plugin-sync-registry.ts 必须与 ledger 推导文本逐字节一致（用 generate-plugin-registry 重新生成）');
});

test('SOURCES.json 为 14 个包登记 main 线出处', () => {
  const sources = json<{ components: { id: string; line: string; name: string; type: string; path?: string; origin?: string; audit?: unknown }[] }>(
    'dsh-desktop', 'assets', 'SOURCES.json',
  );
  for (const dir of ALL_DIRS) {
    const path = `dsh-desktop/assets/plugins/${dir}`;
    const matches = sources.components.filter((c) => c.line === 'main' && c.type === 'plugin' && c.path === path);
    assert.equal(matches.length, 1, `SOURCES.json main 线必须恰好一条 ${path}`);
    assert.equal(typeof matches[0]!.origin, 'string');
    assert.equal(typeof matches[0]!.audit, 'object', `${path} 必须有审计证据条目`);
  }
});

// ---------------------------------------------------------------------------
// 5. 未回归守卫（#415 退役面 / ADR 0010 边界 / adapter 边界）
// ---------------------------------------------------------------------------

test('未回归：无 dsh-skin-switch、无 assets/skins、无旧槽位选择器', () => {
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'plugins', 'dsh-skin-switch')), false);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'skins')), false, 'assets/skins 不得复活');
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'ui-skin')), false, '旧静态 registry/ui-skin 源不得复活');
  const offered = (companion.COMPANION_PLUGINS as { id: string }[]).map((p) => p.id);
  assert.equal(offered.includes('skin-switch'), false);
  assert.equal(offered.some((id) => id.startsWith('ui-skin-')), false, '旧版 ui-skin-* 皮肤行不得回归');
  assert.equal(registrySource.includes('skin-switch'), false);
  const retired = companion.RETIRED_BUILTIN_PLUGINS as { id: string }[];
  assert.ok(retired.some((p) => p.id === 'skin-switch'), 'skin-switch 必须仍在退役清理清单');
});

test('未回归：EAC 自身模块边界不引入 @deepseek-ai 依赖（adapter 解耦规则）', () => {
  const boundaryFiles: string[] = [];
  for (const dir of ['dsh-desktop/lib/desktop', 'dsh-desktop/lib']) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) boundaryFiles.push(`${dir}/${entry.name}`);
    }
  }
  assert.ok(boundaryFiles.length > 10, '边界文件清单必须非空（防呆）');
  // 只匹配真实的模块取值依赖（import/require/dynamic import 的说明符）；
  // 包名常量、路径拼接与 require.resolve 的宿主解析锚点不属于依赖。
  const dependency = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]@deepseek-ai\//g;
  for (const file of boundaryFiles) {
    const text = readFileSync(join(root, ...file.split('/')), 'utf8');
    const offenders = (text.match(dependency) || []);
    assert.deepEqual(offenders, [], `${file} 不得直接依赖 @deepseek-ai/*（只允许宿主注入/字符串常量）`);
  }
});

test('应用自己播种的 bundle 不算市场残留（否则每次启动都误触发「接管」手术）', async () => {
  const { marketDuplicateEvidence } = companion as {
    marketDuplicateEvidence(o: Record<string, unknown>): boolean;
  };
  assert.equal(typeof marketDuplicateEvidence, 'function', 'companion-sync 必须导出可单测的判定函数');
  const appSeeded = ['@dsh-eac/ui-skin-loader', '@dsh-eac/skin-aurora'];
  // 应用播种的 bundles 条目：不是证据
  for (const name of appSeeded) {
    assert.equal(marketDuplicateEvidence({ name, inBundles: true, appSeededBundles: appSeeded }), false);
  }
  // 第三方（非播种）bundles 条目：仍是证据
  assert.equal(marketDuplicateEvidence({ name: 'dsh-community-probe', inBundles: true, appSeededBundles: appSeeded }), true);
  // 市场版依赖与非自写行仍是证据（皮肤平台不得因此豁免真实残留清理）
  assert.equal(marketDuplicateEvidence({ name: '@dsh-eac/skin-aurora', dependencySpec: '^1.0.0' }), true);
  assert.equal(marketDuplicateEvidence({ name: '@dsh-eac/skin-aurora', foreignPatchRows: true }), true);
  // link:/file: 自建链接保留（既有语义）
  assert.equal(marketDuplicateEvidence({ name: '@dsh-eac/skin-aurora', dependencySpec: 'link:D:/dev/skin' }), false);
  assert.equal(marketDuplicateEvidence({ name: '@dsh-eac/skin-aurora', dependencySpec: 'file:../skin' }), false);
  // 默认播种清单就是 profile.ts 的 BUNDLED_BUILTIN_PLUGINS
  for (const name of ALL_PACKAGES) {
    assert.equal(marketDuplicateEvidence({ name, inBundles: true }), false,
      `${name} 是应用播种的 bundle，不得被误判为市场残留`);
  }
});
