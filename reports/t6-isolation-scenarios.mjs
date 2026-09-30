'use strict';
// T6 隔离专项端到端场景验证（在**真实打包产物**上跑，不是单测替身）。
//
// 每个场景：独立临时根 → 用壳实际使用的同一套调用方式 → 断言行为契约。
// 覆盖：健康创建 / 复用实例 / 注册表损坏 fail-closed / 未注册非空目录拒绝接管
//       / channel 隔离 / purge 删根 / 非 purge 保数据 / 空格中文路径 / 宿主 .dsh 不被碰。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = 'D:/AI_Coding/Deepseek-Harness-EAC';
const RELEASE = path.join(ROOT, 'tauri-shell', 'target', 'release');
const NODE = path.join(RELEASE, 'dsh-desktop', 'vendor', 'node', 'node.exe');
const CLI = path.join(RELEASE, 'dsh-desktop', 'scripts', 'environment-diagnose.mjs');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ← ' + detail}`);
}

/** 用壳的真实调用方式跑 CLI（必须带 DSH_RESOURCE_ROOT）。 */
function cli(env, args) {
  try {
    const stdout = execFileSync(NODE, [CLI, ...args], { env, encoding: 'utf8' });
    return { code: 0, json: JSON.parse(stdout.trim()) };
  } catch (error) {
    const out = String(error.stdout ?? '').trim();
    return { code: error.status ?? 1, json: out ? JSON.parse(out) : null };
  }
}

function scenario(label, channel = 'beta') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `t6-${label}-`));
  const productRoot = path.join(base, '产品 Data 根');   // 故意含空格与中文
  fs.mkdirSync(productRoot, { recursive: true });
  const hostHome = path.join(base, 'fake-host');
  fs.mkdirSync(hostHome, { recursive: true });
  const env = {
    ...process.env,
    DSH_RESOURCE_ROOT: RELEASE,
    DSH_EAC_DATA_ROOT: productRoot,
    DSH_EAC_DPX_REGISTRY_HOME: path.join(base, 'registry'),
    DSH_EAC_CHANNEL: channel,
    USERPROFILE: hostHome,
    HOME: hostHome,
    LOCALAPPDATA: path.join(base, 'fake-la'),
  };
  return { base, productRoot, hostHome, env };
}

console.log('=== T6 隔离专项（真实打包产物）===\n');

// --- 场景 1：健康创建 + 落盘结构 ---
{
  const s = scenario('create');
  const r = cli(s.env, ['--action=repair']);
  const root = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  const manifest = path.join(root, '.dpx-environment.json');
  record('1 健康创建：repair 成功', r.code === 0 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 160));
  record('1 环境根落盘', fs.existsSync(root), root);
  record('1 身份清单 kind=DPXEnvironment',
    fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).kind === 'DPXEnvironment');
  record('1 dsh-home 在根内', fs.existsSync(path.join(root, 'dsh-home')));
  record('1 注册表已写入', fs.existsSync(path.join(s.env.DSH_EAC_DPX_REGISTRY_HOME, 'registry.json')));
}

// --- 场景 2：重复安装复用实例，不清数据 ---
{
  const s = scenario('reuse');
  cli(s.env, ['--action=repair']);
  const root = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  const marker = path.join(root, 'dsh-home', 'keep-me.txt');
  fs.writeFileSync(marker, '用户数据');
  const r2 = cli(s.env, ['--action=repair']);
  const reg = JSON.parse(fs.readFileSync(path.join(s.env.DSH_EAC_DPX_REGISTRY_HOME, 'registry.json'), 'utf8'));
  record('2 二次 repair 成功（复用）', r2.code === 0 && r2.json?.ok === true);
  record('2 数据未被清空', fs.readFileSync(marker, 'utf8') === '用户数据');
  record('2 注册表仅 1 条记录', reg.environments.length === 1, `实际 ${reg.environments.length}`);
}

// --- 场景 3：注册表损坏 → fail closed + 可诊断 ---
{
  const s = scenario('corrupt');
  cli(s.env, ['--action=repair']);
  const regFile = path.join(s.env.DSH_EAC_DPX_REGISTRY_HOME, 'registry.json');
  fs.writeFileSync(regFile, '{ 这不是合法 JSON');

  const repair = cli(s.env, ['--action=repair']);
  record('3 损坏注册表下 repair 失败（fail closed）', repair.code !== 0 && repair.json?.ok === false);

  const diag = cli(s.env, ['--action=status']);
  const d = diag.json?.diagnosis;
  record('3 诊断仍可返回（不抛）', diag.code === 0 && !!d);
  record('3 registryReadable=false', d?.registryReadable === false);
  record('3 报出可读问题文案', (d?.problems?.length ?? 0) > 0 && typeof d.problems[0].text === 'string');
  record('3 不可自动清理（removable=false）', d?.removable === false);
  record('3 环境数据未被删', fs.existsSync(path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta', '.dpx-environment.json')));
}

// --- 场景 4：未注册非空目录拒绝接管 ---
{
  const s = scenario('untakeover');
  const stray = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  fs.mkdirSync(stray, { recursive: true });
  const strayFile = path.join(stray, 'user-data.txt');
  fs.writeFileSync(strayFile, '不能被静默接管');

  const create = cli(s.env, ['--action=repair']);
  record('4 创建阶段拒绝认领', create.code !== 0 && create.json?.ok === false);
  const plan = cli(s.env, ['--action=plan', '--purge']);
  record('4 计划阶段拒绝', plan.code !== 0);
  const remove = cli(s.env, ['--action=remove', '--purge']);
  record('4 执行阶段拒绝', remove.code !== 0);
  record('4 别人的数据原样保留', fs.readFileSync(strayFile, 'utf8') === '不能被静默接管');
}

// --- 场景 5：channel 隔离 ---
{
  const s = scenario('channel', 'beta');
  const beta = { ...s.env, DSH_EAC_CHANNEL: 'beta' };
  const rc = { ...s.env, DSH_EAC_CHANNEL: 'rc' };
  cli(beta, ['--action=repair']);
  cli(rc, ['--action=repair']);
  const betaRoot = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  const rcRoot = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-rc');
  record('5 两个通道各自建根', fs.existsSync(betaRoot) && fs.existsSync(rcRoot));
  record('5 根路径不同', betaRoot !== rcRoot);

  fs.writeFileSync(path.join(betaRoot, 'dsh-home', 'beta-only.txt'), 'beta');
  record('5 通道间数据隔离', !fs.existsSync(path.join(rcRoot, 'dsh-home', 'beta-only.txt')));

  const reg = JSON.parse(fs.readFileSync(path.join(s.env.DSH_EAC_DPX_REGISTRY_HOME, 'registry.json'), 'utf8'));
  record('5 注册表含 2 条记录', reg.environments.length === 2, `实际 ${reg.environments.length}`);

  // 移除 beta 不影响 rc
  cli(beta, ['--action=remove', '--purge']);
  record('5 移除 beta 后 rc 仍在', fs.existsSync(rcRoot) && !fs.existsSync(betaRoot));
}

// --- 场景 6：purge vs 非 purge ---
{
  const s = scenario('purge');
  cli(s.env, ['--action=repair']);
  const root = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  fs.writeFileSync(path.join(root, 'dsh-home', 'user-data.txt'), '保留我');

  const plan = cli(s.env, ['--action=plan', '--purge']);
  record('6 dry-run 计划不落盘', plan.code === 0 && fs.existsSync(root)
    && plan.json?.remove?.plan?.root?.action === 'delete');

  const noPurge = cli(s.env, ['--action=remove']);   // 不带 --purge
  record('6 非 purge：摘记录', noPurge.code === 0 && noPurge.json?.ok === true);
  record('6 非 purge：保数据', fs.existsSync(root) && fs.readFileSync(path.join(root, 'dsh-home', 'user-data.txt'), 'utf8') === '保留我');
  record('6 非 purge：已登记的记录被摘除',
    JSON.parse(fs.readFileSync(path.join(s.env.DSH_EAC_DPX_REGISTRY_HOME, 'registry.json'), 'utf8')).environments.length === 0);

  // 新场景验证 purge 真删根
  const s2 = scenario('purge2');
  cli(s2.env, ['--action=repair']);
  const root2 = path.join(s2.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  const purged = cli(s2.env, ['--action=remove', '--purge']);
  record('6 purge：删根', purged.code === 0 && !fs.existsSync(root2));
}

// --- 场景 7：宿主旧 .dsh 只检测不迁移 ---
{
  const s = scenario('legacy');
  const legacyProfile = path.join(s.hostHome, '.dsh', 'profiles', 'web-desktop');
  fs.mkdirSync(legacyProfile, { recursive: true });
  const legacyMarker = path.join(legacyProfile, 'old-plugin.txt');
  fs.writeFileSync(legacyMarker, '旧插件');

  cli(s.env, ['--action=repair']);
  const diag = cli(s.env, ['--action=status']);
  const root = path.join(s.productRoot, 'dpx', 'dsh-environments', 'eac-beta');
  record('7 检测到宿主旧 profile', diag.json?.diagnosis?.legacyProfileDetected === true);
  record('7 旧插件未被复制进隔离根',
    !fs.existsSync(path.join(root, 'dsh-home', 'profiles', 'web-desktop', 'old-plugin.txt')));
  record('7 宿主旧文件原样未变', fs.readFileSync(legacyMarker, 'utf8') === '旧插件');
}

// --- 场景 8：环境变量清理（继承的宿主配置不得残留）---
{
  const s = scenario('envclean');
  const poisoned = {
    ...s.env,
    NODE_OPTIONS: '--require /host/evil.js',
    NODE_PATH: '/host/modules',
    HTTP_PROXY: 'http://host-proxy',
    NPM_CONFIG_PREFIX: '/host/prefix',
    NPM_CONFIG_CACHE: '/host/cache',
  };
  // CLI 的 isolation 输出不含 runtime；这里直接用适配层做同一断言（打包态 dsh-desktop 的 lib）
  const craft = `
    const env = require(${JSON.stringify(path.join(RELEASE, 'dsh-desktop', 'lib', 'desktop', 'environment.js'))});
    const e = JSON.parse(process.argv[1]);
    const ensured = env.ensureEacEnvironment(e, 'win32');
    const out = {};
    for (const k of ['NODE_OPTIONS','NODE_PATH','HTTP_PROXY','NPM_CONFIG_PREFIX','NPM_CONFIG_CACHE']) {
      out[k] = ensured.runtime[k] === undefined ? 'ABSENT' : 'PRESENT';
    }
    out.DSH_HOME_IN_ROOT = String(ensured.runtime.DSH_HOME).startsWith(String(ensured.paths.root)) ? 'YES' : 'NO';
    process.stdout.write(JSON.stringify(out));
  `;
  let parsed = null;
  try {
    const out = execFileSync(NODE, ['-e', craft, JSON.stringify(poisoned)], { encoding: 'utf8' });
    parsed = JSON.parse(out.trim());
  } catch (error) {
    parsed = { error: String(error.message).slice(0, 120) };
  }
  record('8 NODE_OPTIONS 被清除', parsed?.NODE_OPTIONS === 'ABSENT', JSON.stringify(parsed));
  record('8 NODE_PATH 被清除', parsed?.NODE_PATH === 'ABSENT');
  record('8 代理变量被清除', parsed?.HTTP_PROXY === 'ABSENT');
  record('8 NPM_CONFIG_PREFIX 被清除', parsed?.NPM_CONFIG_PREFIX === 'ABSENT');
  record('8 NPM_CONFIG_CACHE 被清除', parsed?.NPM_CONFIG_CACHE === 'ABSENT');
  record('8 DSH_HOME 指向隔离根', parsed?.DSH_HOME_IN_ROOT === 'YES');
}

// --- 汇总 ---
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n=== T6 汇总：${pass}/${results.length} PASS，${fail} FAIL ===`);
if (fail) {
  console.log('失败项：');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail}`);
}
process.exit(fail ? 1 : 0);
