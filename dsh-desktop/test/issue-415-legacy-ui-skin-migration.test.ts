// M2/#415 迁移面：AIO ≤ 9.6.3 升级用户的旧版桌面皮肤残留清理。
//
// 旧链（assets/skins 目录播种，目录自 v6 Task 3.1 起已删、M2 彻底退役）会把
// 10 款旧皮肤拷进 profile：包名 `@linxin666|@dsh-external/dsh-client-ui-skin-*`，
// patch 行 id 取皮肤包 skin.json 的 wiring.id（`ui-skin-*`，insert 内层行）。
// 旧链退役后这些行指向的包不再随包分发 —— 「行在包不在」会让 loader 找不到
// entry，「包在行不在」则残留旧皮肤继续加载，两者都会拖垮插件树。因此升级
// 迁移必须清掉这批精确的历史条目。
//
// 红线：绝不碰 M2 新皮肤平台 ——
//   · 新包：`@dsh-eac/ui-skin-loader`、`@dsh-eac/skin-*`（13 款公约皮肤）
//   · 新行：`dsh-ui-skin-loader`、`dsh-eac-skin-*`（bundle 补丁层 entry id）
//   · `@linxin666` / `@dsh-external` 作用域下的非皮肤插件（市场安装）也不得
//     被作用域级联删除误伤。
//
// 清理走既有退役通道（retireRemovedBuiltinPluginsGated）：同一版本内只执行
// 一次，用户在同版本内的手动调整不被每次启动强制改写（issue #74 门控语义）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const runtimePaths = require(join(root, 'lib', 'desktop', 'runtime-paths.js')) as {
  init(d: unknown): void;
};
const companion = require(join(root, 'lib', 'desktop', 'companion-sync.js')) as {
  init(d: unknown): void;
  retireRemovedBuiltinPluginsGated(profileDir: string): void;
  RETIRED_BUILTIN_PLUGINS: { id: string; name: string }[];
  COMPANION_PLUGINS: { id: string; name: string }[];
};
const profileModule = require(join(root, 'lib', 'desktop', 'profile.js')) as {
  BUNDLED_BUILTIN_PLUGINS: string[];
};

/** 旧链在 profile 里的 10 款皮肤（行 id ← skin.json wiring.id；包名 ← package.json）。 */
const LEGACY_SKINS = [
  { id: 'ui-skin-blue-fantasy', name: '@linxin666/dsh-client-ui-skin-blue-fantasy' },
  { id: 'ui-skin-dragon-heir', name: '@linxin666/dsh-client-ui-skin-dragon-heir' },
  { id: 'ui-skin-maid-atelier', name: '@dsh-external/dsh-client-ui-skin-maid-atelier' },
  { id: 'ui-skin-miku', name: '@linxin666/dsh-client-ui-skin-miku' },
  { id: 'ui-skin-minecraft', name: '@linxin666/dsh-client-ui-skin-minecraft' },
  { id: 'ui-skin-qq98', name: '@linxin666/dsh-client-ui-skin-qq98' },
  { id: 'ui-skin-ths', name: '@linxin666/dsh-client-ui-skin-ths' },
  { id: 'ui-skin-trading', name: '@linxin666/dsh-client-ui-skin-trading' },
  { id: 'ui-skin-whale-song', name: '@linxin666/dsh-client-ui-skin-whale-song' },
  { id: 'ui-skin-xp', name: '@linxin666/dsh-client-ui-skin-xp' },
] as const;

/** M2 新皮肤平台（不得被迁移清理误伤）。 */
const CONVENTION_PACKAGES = ['@dsh-eac/ui-skin-loader', '@dsh-eac/skin-miku', '@dsh-eac/skin-xp'];
const CONVENTION_ROWS = ['dsh-ui-skin-loader', 'dsh-eac-skin-miku', 'dsh-eac-skin-xp'];

/** 老 profile：旧皮肤 insert 行（部分已由旧 skin-switch 改写）+ 新皮肤平台行 + 无关插件行。 */
const LEGACY_PATCH = `# dsh web profile patch（由 DSH Desktop 维护）

- insert:
    - id: ui-skin-miku
      name: '@linxin666/dsh-client-ui-skin-miku'
      disabled: true
    - id: dsh-ui-skin-loader
      name: '@dsh-eac/ui-skin-loader'
    - id: ui-skin-maid-atelier
      name: '@dsh-external/dsh-client-ui-skin-maid-atelier'
      disabled: true
    - id: dsh-eac-skin-miku
      name: '@dsh-eac/skin-miku'
- insert:
    - id: ui-skin-xp
      name: '@linxin666/dsh-client-ui-skin-xp'
      disabled: true
- insert:
    - id: ui-skin-trading
      name: '@linxin666/dsh-client-ui-skin-trading'
      disabled: true
    - id: dsh-eac-skin-xp
      name: '@dsh-eac/skin-xp'
- id: dsh-terminal
  name: '@deepseek-ai/dsh-terminal'
  disabled: true
`;

interface Fixture {
  home: string;
  profile: string;
  userData: string;
}

function writePackage(dir: string, name: string, extra: Record<string, unknown> = {}): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...extra }, null, 2) + '\n');
}

/** 造一个含旧皮肤残留 + 新皮肤平台的 profile（含 node_modules 副本与 package.json 依赖）。 */
function makeProfile(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'dsh-legacy-skin-'));
  const userData = join(home, 'userdata');
  const profile = join(home, 'profiles', 'web-desktop');
  mkdirSync(profile, { recursive: true });
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(profile, 'cordis.patch.yml'), LEGACY_PATCH);

  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'web-desktop',
    dependencies: {
      '@deepseek-ai/dsh-base': '0.1.7-rc.2',
      '@linxin666/dsh-client-ui-skin-miku': '^9.6.3',
      '@dsh-external/dsh-client-ui-skin-maid-atelier': '^9.6.3',
      '@linxin666/dsh-client-ui-skin-xp': '^9.6.3',
      '@dsh-eac/ui-skin-loader': '1.1.0',
      '@dsh-eac/skin-miku': '1.1.0',
      '@dsh-eac/skin-xp': '1.1.0',
      '@linxin666/dsh-other-plugin': '^1.0.0',
    },
  }, null, 2) + '\n');

  const modules = join(profile, 'node_modules');
  // 旧皮肤包（skin.json 是旧链的识别标志，迁移清理不看它也必须删干净）
  writePackage(join(modules, '@linxin666', 'dsh-client-ui-skin-miku'), LEGACY_SKINS[3].name, { dsh: { client: { platform: 'web' } } });
  writeFileSync(join(modules, '@linxin666', 'dsh-client-ui-skin-miku', 'skin.json'), JSON.stringify({ id: 'miku', wiring: { id: 'ui-skin-miku' } }));
  writePackage(join(modules, '@dsh-external', 'dsh-client-ui-skin-maid-atelier'), LEGACY_SKINS[2].name, { dsh: { client: { platform: 'web' } } });
  writeFileSync(join(modules, '@dsh-external', 'dsh-client-ui-skin-maid-atelier', 'skin.json'), JSON.stringify({ id: 'maid-atelier', wiring: { id: 'ui-skin-maid-atelier' } }));
  writePackage(join(modules, '@linxin666', 'dsh-client-ui-skin-xp'), LEGACY_SKINS[9].name);
  writePackage(join(modules, '@linxin666', 'dsh-client-ui-skin-trading'), LEGACY_SKINS[7].name);
  // 作用域下的非皮肤插件（市场安装）：不得被作用域级联删除误伤
  writePackage(join(modules, '@linxin666', 'dsh-other-plugin'), '@linxin666/dsh-other-plugin');
  // M2 新皮肤平台：loader + 公约皮肤，必须原样保留
  for (const name of CONVENTION_PACKAGES) {
    writePackage(join(modules, ...name.split('/')), name);
  }
  return { home, profile, userData };
}

function initCompanion(fixture: Fixture): void {
  runtimePaths.init({ log: () => {}, getUserDataDir: () => fixture.userData });
  companion.init({
    log: () => {},
    getDshHome: () => fixture.home,
    getUserDataDir: () => fixture.userData,
    showMainWindow: () => {},
    notify: () => {},
  });
}

function readJson(file: string): Record<string, any> {
  return JSON.parse(readFileSync(file, 'utf8'));
}

test('升级迁移清掉旧 ui-skin-* 行、旧皮肤包副本与 package.json 依赖', () => {
  const fixture = makeProfile();
  try {
    initCompanion(fixture);
    companion.retireRemovedBuiltinPluginsGated(fixture.profile);

    const patch = readFileSync(join(fixture.profile, 'cordis.patch.yml'), 'utf8');
    assert.doesNotMatch(patch, /- id: ui-skin-/, '旧版皮肤行必须整行移除（含 insert 内层行）');
    assert.doesNotMatch(patch, /@linxin666\/dsh-client-ui-skin-|@dsh-external\/dsh-client-ui-skin-/, '旧皮肤包名不得再出现在 patch 里');
    assert.match(patch, /- id: dsh-terminal/, '无关插件行必须保留');
    assert.match(patch, /- id: dsh-eac-skin-xp/, '与旧行同块的公约皮肤行不得被连带删除');

    for (const skin of LEGACY_SKINS.slice(0, 4)) {
      const dir = join(fixture.profile, 'node_modules', ...skin.name.split('/'));
      assert.equal(existsSync(dir), false, `${skin.name} 的 profile 包副本必须清理`);
    }
    const pkg = readJson(join(fixture.profile, 'package.json'));
    for (const name of ['@linxin666/dsh-client-ui-skin-miku', '@dsh-external/dsh-client-ui-skin-maid-atelier', '@linxin666/dsh-client-ui-skin-xp']) {
      assert.equal(name in pkg.dependencies, false, `${name} 依赖必须清理`);
    }
    assert.equal(pkg.dependencies['@deepseek-ai/dsh-base'], '0.1.7-rc.2', '无关依赖必须保留');
  } finally {
    rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('迁移不得误伤新 loader/公约皮肤与同作用域的其他插件', () => {
  const fixture = makeProfile();
  try {
    initCompanion(fixture);
    companion.retireRemovedBuiltinPluginsGated(fixture.profile);

    const patch = readFileSync(join(fixture.profile, 'cordis.patch.yml'), 'utf8');
    for (const row of CONVENTION_ROWS) {
      assert.match(patch, new RegExp(`- id: ${row}\\b`), `公约皮肤平台行 ${row} 必须保留`);
    }
    for (const name of CONVENTION_PACKAGES) {
      const dir = join(fixture.profile, 'node_modules', ...name.split('/'));
      assert.equal(existsSync(join(dir, 'package.json')), true, `${name} 包副本必须保留`);
    }
    const pkg = readJson(join(fixture.profile, 'package.json'));
    for (const name of CONVENTION_PACKAGES) {
      assert.equal(name in pkg.dependencies, true, `${name} 依赖必须保留`);
    }
    // 作用域级联删除是明确的反例：同作用域的非皮肤插件必须活着。
    assert.equal(existsSync(join(fixture.profile, 'node_modules', '@linxin666', 'dsh-other-plugin', 'package.json')), true);
    assert.equal('@linxin666/dsh-other-plugin' in pkg.dependencies, true);
  } finally {
    rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('迁移目标与新旧皮肤命名空间零交集（精确条目，非前缀/作用域删除）', () => {
  const retired = companion.RETIRED_BUILTIN_PLUGINS.filter((p) => /^ui-skin-/.test(p.id));
  assert.deepEqual(
    retired.map((p) => `${p.id} ${p.name}`).sort(),
    LEGACY_SKINS.map((p) => `${p.id} ${p.name}`).sort(),
    '旧链 10 款皮肤必须逐一登记在退役清理清单里（迁移目标清单）',
  );
  for (const skin of LEGACY_SKINS) {
    assert.match(skin.id, /^ui-skin-[\w-]+$/);
    assert.match(skin.name, /^@(?:linxin666|dsh-external)\/dsh-client-ui-skin-/);
  }
  // 新皮肤平台的行 id / 包名不得与迁移目标同名 —— 精确清理下这是硬约束。
  for (const plugin of companion.COMPANION_PLUGINS) {
    assert.equal(retired.some((p) => p.id === plugin.id), false, `${plugin.id} 与迁移目标行 id 撞名`);
    assert.equal(retired.some((p) => p.name === plugin.name), false, `${plugin.name} 与迁移目标包名撞名`);
  }
  for (const name of profileModule.BUNDLED_BUILTIN_PLUGINS) {
    assert.equal(retired.some((p) => p.name === name), false, `${name} 与迁移目标包名撞名`);
    assert.equal(name.startsWith('ui-skin-'), false, `bundle 包名不得落进旧行名前缀：${name}`);
  }
  for (const row of CONVENTION_ROWS) {
    assert.equal(retired.some((p) => p.id === row), false, `${row} 与迁移目标行 id 撞名`);
    assert.equal(row.startsWith('ui-skin-'), false, `公约皮肤平台行不得以旧前缀开头：${row}`);
  }
});

test('迁移走退役门控：同一版本内只对齐一次，用户后续改动不被反复清除', () => {
  const fixture = makeProfile();
  try {
    initCompanion(fixture);
    companion.retireRemovedBuiltinPluginsGated(fixture.profile);

    const settingsFile = join(fixture.userData, 'settings.json');
    const settings = readJson(settingsFile);
    const appVersion = readJson(join(root, 'package.json')).version;
    assert.equal(settings.pluginTreeAlignedVersion, appVersion, '迁移必须记录已对齐的应用版本');
    assert.match(String(settings.pluginTreeRetiredListHash), /^[0-9a-f]{64}$/, '迁移必须记录退役清单指纹');

    // 用户在同版本内手工恢复一条旧行（例如从备份还原）——门控内不得再被清除。
    const patchFile = join(fixture.profile, 'cordis.patch.yml');
    writeFileSync(patchFile, `- id: ui-skin-xp\n  name: '@linxin666/dsh-client-ui-skin-xp'\n  disabled: true\n` + readFileSync(patchFile, 'utf8'));
    companion.retireRemovedBuiltinPluginsGated(fixture.profile);
    assert.match(readFileSync(patchFile, 'utf8'), /- id: ui-skin-xp\b/, '同版本内用户恢复的行必须保留（门控语义）');
  } finally {
    rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('退役清单指纹随迁移目标变化（升级后首次启动必然重跑清理）', () => {
  const hash = createHash('sha256').update(JSON.stringify(companion.RETIRED_BUILTIN_PLUGINS)).digest('hex');
  const fixture = makeProfile();
  try {
    initCompanion(fixture);
    companion.retireRemovedBuiltinPluginsGated(fixture.profile);
    assert.equal(readJson(join(fixture.userData, 'settings.json')).pluginTreeRetiredListHash, hash,
      '记录的指纹必须与当前退役清单逐字节对应（清单新增目标 → 指纹变化 → 重跑清理）');
  } finally {
    rmSync(fixture.home, { recursive: true, force: true });
  }
});
