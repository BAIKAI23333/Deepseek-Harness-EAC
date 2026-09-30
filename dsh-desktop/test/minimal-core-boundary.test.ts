import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), 'utf8');
// 递归收集目录下所有 .js 的仓库相对路径；目录不存在（已清除）返回空数组。
const listJs = (dir: string, ...parts: string[]): string[] => {
  const base = join(dir, ...parts);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const rel = join(...parts, entry.name);
    if (entry.isDirectory()) out.push(...listJs(dir, rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
};
const main = read('tauri-shell', 'src', 'main.rs');
const server = read('tauri-shell', 'sidecar', 'server.ts');
const stubs = read('tauri-shell', 'sidecar', 'capability-stubs.ts');
const stage = read('tauri-shell', 'stage-resources.mjs');
const build = read('tauri-shell', 'build.rs');
const platform = read('dsh-desktop', 'lib', 'desktop', 'platform.ts');
const skinAssets = [
  read('tauri-shell', 'host-profile.json'),
  read('tauri-shell', 'skin-manager-artifact.lock.json'),
  read('tauri-shell', 'artifacts', 'resolved', 'system.default', 'skin.json'),
  read('tauri-shell', 'artifacts', 'resolved', 'system.default', 'snapshot.json'),
].join('\n');

test('minimal shell has no recovery center entry points', () => {
  assert.doesNotMatch(main, /\/recovery-center|DSH_DESKTOP_RECOVERY|"rc\.open"|"shell\.relaunch-safe-mode"/);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'recovery-center.html')), false);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'recovery-center-preload.js')), false);
  assert.doesNotMatch(skinAssets, /recovery-center(?:\.html)?|恢复中心|safe-mode|card-raised/);
});

test('minimal sidecar does not register retired recovery RPC families', () => {
  assert.doesNotMatch(server, /DSH_DESKTOP_RECOVERY/);
  assert.doesNotMatch(server, /stubs\.(?:rcMethods|rescueMethods|guardMethods)/);
  assert.doesNotMatch(stubs, /['"](?:rc|rescue|guard)\.[\w-]+['"]\s*:/);
});

// v6 Task 3.3：插件系统接回后，平台抽象重新暴露插件能力矩阵。
// 原断言（pluginCapabilityDetails 不存在）随接回反转：现在锁住它必须存在，
// 且保持按平台判定可用性的语义。防呆方向由"必须不存在"改为"必须存在且完整"。
test('platform abstraction exposes plugin capability matrix after Task 3.3', () => {
  assert.match(platform, /pluginCapabilityDetails/);
  assert.match(platform, /PluginCapability/);
  assert.match(platform, /status: 'supported' \| 'external-dependency' \| 'unavailable'/);
  // 四个受能力矩阵管辖的插件必须全部有平台判定项。
  for (const id of ['computer-user', 'picturereader', 'dsh-dafeiyu', 'dsh-stt']) {
    assert.match(platform, new RegExp(`${id}`), `能力矩阵缺少 ${id}`);
  }
});

test('minimal shell has no float, update, about, or renderer heartbeat implementation', () => {
  assert.doesNotMatch(main, /"float\.(?:open|close)"|fn open_float_window|fn update_page|fn about_page/);
  assert.doesNotMatch(main, /"(?:client-update\.(?:show|hide)|shell\.about|shell\.exit-dismiss|log\.renderer-heartbeat)"/);
});

test('staging excludes retired recovery and isolation modules', () => {
  // v6 Task 3.3：插件治理闭包接回后，plugin-copy.js 重新进入装配面
  //（companion-sync 消费），故自退役清单移除；其余仍必须被排除。
  for (const retired of [
    'recovery-center.html',
    'recovery-center-preload.js',
    'state.js',
    'log.js',
    'logger.js',
    'shared/protocol.js',
  ]) {
    const escaped = retired.replaceAll('.', '\\.');
    // 词边界防止子串误匹配（如 plugin-manager-state.js 含 'state.js'）。
    assert.doesNotMatch(stage, new RegExp(`(^|[^-\\w])${escaped}`));
  }
  // 接回项必须真实进入装配清单，反向锁住 Task 3.3 不被回退。
  for (const revived of ['plugin-copy.js', 'companion-sync.js', 'guard-box.js', 'plugin-ops.js', 'file-roots.js']) {
    assert.match(stage, new RegExp(revived.replaceAll('.', '\\.')));
  }
});

test('minimal shell keeps boot recovery, native window actions, and system notification', () => {
  assert.match(server, /['"]boot\.start['"]\s*:/);
  assert.match(server, /['"]boot\.restart['"]\s*:/);
  assert.match(main, /fn died_page\(/);
  assert.match(main, /"win\.minimize"\s*=>/);
  assert.match(main, /"win\.open-browser"\s*=>/);
  assert.match(main, /"win\.viewport-beat"\s*=>/);
  assert.match(main, /"shell\.system-notification"\s*=>/);
});

test('WS JSON-RPC client remains a single staged source for the main window bridge', () => {
  assert.match(build, /\.join\("assets"\)[\s\S]*\.join\("ws-jsonrpc-client\.js"\)/);
  assert.match(build, /bridge-bundle\.js/);
  assert.match(main, /BRIDGE_JS: &str = include_str!/);
  assert.match(stage, /'ws-jsonrpc-client\.js'/);
});

test('bundle integrity remains in build manifest generation and startup verification', () => {
  assert.match(stage, /buildBundleManifest|bundle-integrity\.js/);
  assert.match(server, /verifyBundle/);
});

// ADR 0006 v4「源码删除」裁决：supervisor / extension-host / recovery-center 的进程隔离
// 运行时源码已剥出，本机残留的 tsc 编译产物（未被 git 跟踪）属死代码——require 闭包已断
// （host-bootstrap.js 未跟踪、shared/protocol.js 已列 RETIRED_PATHS）。此处锁死不得回归。
test('isolation runtime leaves no compiled .js residue', () => {
  const residue = ['supervisor', 'extension-host', 'recovery-center'].flatMap((retired) =>
    listJs(join(root, 'dsh-desktop'), 'lib', retired),
  );
  assert.deepEqual(residue, [], '隔离运行时源码已剥出，lib 下不得残留 .js 编译产物');
});
