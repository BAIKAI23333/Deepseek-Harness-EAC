// 功能包能力缺失时的**优雅降级**契约（2026-10-01）。
//
// 背景：`feature-pack` 属 ADR 0006「增值功能，后续版本按需」的剥出面，
// 装配清单**有意**不含 `feature-pack.js` / `feature-pack-cli.js`。但内置插件
// `dsh-unified-market` 仍在装配面，且会去 spawn 那个 CLI —— 于是本版客户端上
// 一切功能包操作都会 `{ ok:false, error:"功能包 CLI 不可用（…缺少 …）" }`。
//
// 原实现把这个**内部路径错误**原样弹到 UI 上（"功能包 CLI 不可用：D:\…\feature-pack-cli.js（…）"），
// 并继续渲染一排点了必报错的按钮。改为：给一段说明现状的提示，并**隐藏**所有
// 依赖 CLI 的入口；不依赖 CLI 的「功能包市场」（纯索引浏览，走 pack.market）
// 保留可用。
//
// 本测试锁定该契约，防止有人「顺手把错误横幅加回来」或漏守卫某个区块。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const clientPath = path.join(repoRoot, 'dsh-desktop', 'assets', 'plugins', 'dsh-unified-market', 'lib', 'client.js');
const hostPath = path.join(repoRoot, 'dsh-desktop', 'assets', 'plugins', 'dsh-unified-market', 'lib', 'host.js');
const stagePath = path.join(repoRoot, 'tauri-shell', 'stage-resources.mjs');

const read = (p: string): string => fs.readFileSync(p, 'utf8');

test('feature-pack 保持剥出：装配清单不含它（ADR 0006 决定）', () => {
  const stage = read(stagePath);
  // 若有人把它加回装配面，这里会红 —— 那时应同时更新 ADR 0006 与本测试。
  assert.doesNotMatch(stage, /const LIB_DESKTOP[\s\S]*?'feature-pack\.js'/, 'feature-pack.js 不应出现在 LIB_DESKTOP');
  assert.doesNotMatch(stage, /const SCRIPTS[\s\S]*?'feature-pack-cli\.js'/, 'feature-pack-cli.js 不应出现在 SCRIPTS');
  // 但注释里应保留「为什么剥出 + 调用方须降级」的线索，避免后人误当遗漏补回去。
  assert.match(stage, /feature-pack/, '装配脚本应保留关于 feature-pack 剥出的说明');
  assert.match(stage, /优雅降级|降级/, '装配脚本应说明调用方需优雅降级');
});

test('插件端：CLI 缺失上报结构化原因，而不是抛异常', () => {
  const host = read(hostPath);
  // packCliStatus 必须返回 { cli: null, reason } 而非 throw。
  assert.match(host, /function packCliStatus\(\)/, '应保留 packCliStatus');
  assert.match(host, /return \{ cli: null, reason:/, 'CLI 缺失时应返回结构化 reason');
  // runPackCli 在无 CLI 时必须返回 { ok:false, error } —— 这是前端的 data.error 来源。
  assert.match(host, /if \(!cli\) return \{ ok: false, error: reason \}/, 'runPackCli 应返回结构化失败');
});

test('前端：CLI 不可用时展示说明并隐藏所有依赖 CLI 的入口', () => {
  const client = read(clientPath);

  // 1) 不得再把内部错误原文弹给用户（旧实现的行为）。
  assert.doesNotMatch(client, /'功能包 CLI 不可用：'\s*\+\s*data\.error/,
    '不得把内部 CLI 路径错误原样显示给用户');

  // 2) 必须有面向用户的降级说明。
  assert.match(client, /未随包提供「功能包」能力/, '应给出说明现状的降级提示');
  assert.match(client, /插件本身不受影响/, '应说明插件功能不受影响');

  // 3) 三个依赖 CLI 的区块都必须受 data.error 守卫。
  for (const [label, pattern] of [
    ['已安装功能包', /data\.error \? null : h\('div', \{ className: 'mkts-sec' \}, '已安装功能包'/],
    ['导入 / 安装', /data\.error \? null : h\('div', \{ className: 'mkts-sec' \}, '导入 \/ 安装'/],
    ['兼容性横幅', /data\.error \? null : compatBanner\.length > 0/],
  ] as const) {
    assert.match(client, pattern, `${label} 区块必须受 data.error 守卫（否则会出现点了必报错的按钮）`);
  }

  // 4) 不依赖 CLI 的市场浏览应保持可用（纯 pack.market 索引）。
  assert.match(client, /h\('div', \{ className: 'mkts-sec' \}, '功能包市场'/,
    '功能包市场（不依赖 CLI）应保留');
  const host = read(hostPath);
  assert.match(host, /if \(method === 'pack\.market'\)[\s\S]{0,200}?loadPacksIndex\(\)/,
    'pack.market 应只读索引，不 spawn CLI');
});
