'use strict';
// 压力 / 并发测试（2026-09-30）——此前只做过功能正确性测试，缺并发与负载覆盖。
//
// 针对本工作**实际引入或触及**的并发面：
//   A. 同通道并发初始化：多进程同时 ensureEacEnvironment 同一环境根（dpx 的
//      registry.lock 是否真的把它们串行化、且都成功复用同一实例）。
//   B. 不同通道并发：beta / rc 同时初始化，互不干扰（锁粒度是否过粗到互相阻塞）。
//   C. 诊断并发：/died 页可能被反复刷新；diagnose 是只读，必须不写盘、不损坏状态，
//      且在高并发下不因锁竞争而误报「busy」。
//   D. 反复创建/删除（churn）：验证删除后能干净重建、注册表不漂移、不留残余。
//   E. 失败注入下的并发：损坏注册表时多个进程同时冲入，必须**全部** fail closed，
//      不得有一个「侥幸成功」把坏状态写实。
//
// 运行：node reports/t1x-stress-isolation.mjs
// 退出码：0 = 全部通过；1 = 有失败
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = 'D:/AI_Coding/Deepseek-Harness-EAC';
const RELEASE = path.join(ROOT, 'tauri-shell', 'target', 'release');
const NODE = path.join(RELEASE, 'dsh-desktop', 'vendor', 'node', 'node.exe');
const CLI = path.join(RELEASE, 'dsh-desktop', 'scripts', 'environment-diagnose.mjs');
const ADAPTER = path.join(RELEASE, 'dsh-desktop', 'lib', 'desktop', 'environment.js');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ← ' + detail}`);
}

function baseEnv(root, channel) {
  return {
    ...process.env,
    DSH_RESOURCE_ROOT: RELEASE,
    DSH_EAC_DATA_ROOT: path.join(root, '产品 Data 根'),
    DSH_EAC_DPX_REGISTRY_HOME: path.join(root, 'registry'),
    DSH_EAC_CHANNEL: channel,
    USERPROFILE: path.join(root, 'h'),
    HOME: path.join(root, 'h'),
    LOCALAPPDATA: path.join(root, 'h'),
  };
}

/** 并发跑 N 个 CLI，返回各自 {code, stdout}。 */
function runConcurrent(envs, args) {
  return Promise.all(envs.map((env) => new Promise((resolve) => {
    const child = spawn(NODE, [CLI, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  })));
}

function parseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

const t0 = Date.now();
console.log('=== T1x 压力 / 并发测试（真实打包产物）===\n');

// ---------------------------------------------------------------------------
// A. 同通道并发初始化（8 个进程抢同一环境根）
// ---------------------------------------------------------------------------
{
  console.log('--- A. 同通道并发初始化（8 进程）---');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't1x-a-'));
  const env = baseEnv(root, 'beta');
  const t = Date.now();
  const out = await runConcurrent(Array.from({ length: 8 }, () => env), ['--action=repair']);
  const ms = Date.now() - t;

  const okCount = out.filter((r) => r.code === 0 && parseJson(r.out)?.ok === true).length;
  const busyCount = out.filter((r) => /busy|DPX registry is busy/i.test(r.out + r.err)).length;
  record(`A 8 并发 repair 全部成功（${okCount}/8，耗时 ${ms}ms）`, okCount === 8,
    `失败: ${out.filter((r) => r.code !== 0).map((r) => (r.out || r.err).slice(0, 90)).join(' | ')}`);
  record('A 无因锁竞争而报 busy', busyCount === 0, `busy 次数=${busyCount}`);

  // 结果必须是**同一个**环境根 + 注册表只 1 条（复用而非重复创建）
  const regFile = path.join(root, 'registry', 'registry.json');
  const reg = fs.existsSync(regFile) ? JSON.parse(fs.readFileSync(regFile, 'utf8')) : null;
  record('A 注册表只有 1 条记录（未重复创建）', !!reg && reg.environments.length === 1,
    `实际 ${reg ? reg.environments.length : 'null'}`);
  const roots = new Set(out.map((r) => parseJson(r.out)?.isolation?.root).filter(Boolean));
  record(`A 8 个进程指向同一环境根（${roots.size} 个不同值）`, roots.size === 1, [...roots].join(' | '));

  // 环境根清单必须完好（未被并发写坏）
  const manifest = path.join(root, '产品 Data 根', 'dpx', 'dsh-environments', 'eac-beta', '.dpx-environment.json');
  let manifestOk = false;
  try { manifestOk = JSON.parse(fs.readFileSync(manifest, 'utf8')).kind === 'DPXEnvironment'; } catch { manifestOk = false; }
  record('A 环境清单完好（未被并发写坏）', manifestOk);

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// B. 不同通道并发（beta / rc 各自 4 进程）
// ---------------------------------------------------------------------------
{
  console.log('\n--- B. 不同通道并发（beta×4 + rc×4）---');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't1x-b-'));
  const envs = [
    ...Array.from({ length: 4 }, () => baseEnv(root, 'beta')),
    ...Array.from({ length: 4 }, () => baseEnv(root, 'rc')),
  ];
  const t = Date.now();
  const out = await runConcurrent(envs, ['--action=repair']);
  const ms = Date.now() - t;
  const okCount = out.filter((r) => r.code === 0 && parseJson(r.out)?.ok === true).length;
  record(`B 8 并发（双通道）全部成功（${okCount}/8，耗时 ${ms}ms）`, okCount === 8,
    `失败: ${out.filter((r) => r.code !== 0).map((r) => (r.out || r.err).slice(0, 90)).join(' | ')}`);

  const regFile = path.join(root, 'registry', 'registry.json');
  const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  record('B 注册表恰好 2 条（beta + rc）', reg.environments.length === 2, `实际 ${reg.environments.length}`);
  const names = reg.environments.map((e) => e.name).sort();
  record('B 两个通道名正确', JSON.stringify(names) === JSON.stringify(['eac-beta', 'eac-rc']), names.join(','));

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// C. 高并发只读诊断（20 进程，验证只读性 + 不误报 busy）
// ---------------------------------------------------------------------------
{
  console.log('\n--- C. 高并发只读诊断（20 进程 × 3 轮）---');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't1x-c-'));
  const env = baseEnv(root, 'beta');
  await runConcurrent([env], ['--action=repair']);   // 先建好

  const rootDir = path.join(root, '产品 Data 根', 'dpx', 'dsh-environments', 'eac-beta');
  const manifestBefore = fs.readFileSync(path.join(rootDir, '.dpx-environment.json'), 'utf8');

  let allOk = true;
  let busy = 0;
  const times = [];
  for (let round = 0; round < 3; round++) {
    const t = Date.now();
    const out = await runConcurrent(Array.from({ length: 20 }, () => env), ['--action=status']);
    times.push(Date.now() - t);
    const bad = out.filter((r) => r.code !== 0 || parseJson(r.out)?.ok !== true);
    busy += out.filter((r) => /busy/i.test(r.out + r.err)).length;
    if (bad.length) allOk = false;
  }
  record(`C 60 次并发诊断全部成功（每轮 20，耗时 ${times.join('/')}ms）`, allOk);
  record('C 只读诊断未触发锁竞争 busy', busy === 0, `busy=${busy}`);

  // 只读性：环境清单字节级未变
  const manifestAfter = fs.readFileSync(path.join(rootDir, '.dpx-environment.json'), 'utf8');
  record('C 诊断是只读的（清单字节未变）', manifestBefore === manifestAfter);

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// D. 反复创建/删除（churn 10 轮，验证无残留漂移）
// ---------------------------------------------------------------------------
{
  console.log('\n--- D. 创建/删除 churn（10 轮）---');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't1x-d-'));
  const env = baseEnv(root, 'beta');
  let churnOk = true;
  let detail = '';
  for (let i = 0; i < 10; i++) {
    const r1 = execFileSync(NODE, [CLI, '--action=repair'], { env, encoding: 'utf8' });
    if (parseJson(r1)?.ok !== true) { churnOk = false; detail = `第 ${i} 轮 repair 失败`; break; }
    const r2 = execFileSync(NODE, [CLI, '--action=remove', '--purge'], { env, encoding: 'utf8' });
    if (parseJson(r2)?.ok !== true) { churnOk = false; detail = `第 ${i} 轮 purge 失败`; break; }
  }
  record('D 10 轮 repair→purge 全部成功', churnOk, detail);

  const regFile = path.join(root, 'registry', 'registry.json');
  const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  record('D 注册表最终为空（无残留记录）', reg.environments.length === 0, `实际 ${reg.environments.length}`);

  const rootDir = path.join(root, '产品 Data 根', 'dpx', 'dsh-environments', 'eac-beta');
  record('D 环境根已清除（无残留目录）', !fs.existsSync(rootDir));

  // 再建一次，确认状态仍可用（不是"越 churn 越坏"）
  const r = execFileSync(NODE, [CLI, '--action=repair'], { env, encoding: 'utf8' });
  record('D churn 后仍可干净重建', parseJson(r)?.ok === true);

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// E. 损坏状态下并发冲入 → 必须全部 fail closed，不得有一个"侥幸成功"
// ---------------------------------------------------------------------------
{
  console.log('\n--- E. 损坏注册表 + 8 并发 → 全部 fail closed ---');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't1x-e-'));
  const env = baseEnv(root, 'beta');
  await runConcurrent([env], ['--action=repair']);            // 先建健康环境
  fs.writeFileSync(path.join(root, 'registry', 'registry.json'), '{ 坏掉的 JSON');  // 破坏
  const regBrokenBefore = fs.readFileSync(path.join(root, 'registry', 'registry.json'), 'utf8');

  const out = await runConcurrent(Array.from({ length: 8 }, () => env), ['--action=repair']);
  const failed = out.filter((r) => r.code !== 0 && parseJson(r.out)?.ok === false).length;
  record(`E 8 并发全部 fail closed（${failed}/8）`, failed === 8,
    `成功数=${out.filter((r) => r.code === 0).length}`);

  // 关键：损坏状态不得被谁"修好"（那等于静默重建，违背 fail-closed）
  const regBrokenAfter = fs.readFileSync(path.join(root, 'registry', 'registry.json'), 'utf8');
  record('E 损坏注册表未被并发写实/静默重建', regBrokenBefore === regBrokenAfter);

  // 诊断仍可用且如实报告
  const diag = parseJson(execFileSync(NODE, [CLI, '--action=status'], { env, encoding: 'utf8' }));
  record('E 并发冲击后诊断仍可读且报告损坏',
    diag?.ok === true && diag.diagnosis.registryReadable === false);

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// F. 适配层并发（在单进程内 Promise.all 并发 ensure，验证模块级状态安全）
// ---------------------------------------------------------------------------
{
  console.log('\n--- F. 单进程内并发 ensureEacEnvironment（10 并发）---');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't1x-f-'));
  const env = baseEnv(root, 'beta');
  const craft = `
    const env = require(${JSON.stringify(ADAPTER)});
    const e = JSON.parse(process.argv[1]);
    Promise.all(Array.from({length:10}, () => new Promise((res) => {
      try { const r = env.ensureEacEnvironment(e, 'win32'); res({ok:true, root:r.paths.root}); }
      catch (err) { res({ok:false, err:String(err.message).slice(0,80)}); }
    }))).then((rs) => {
      const roots = [...new Set(rs.filter(r=>r.ok).map(r=>r.root))];
      process.stdout.write(JSON.stringify({ok:rs.every(r=>r.ok), n:rs.length, distinctRoots:roots.length, errs:rs.filter(r=>!r.ok).map(r=>r.err)}));
    });
  `;
  let parsed = null;
  try {
    // 注意：ensure 是同步阻塞（spawnSync），所以"并发"在单进程里其实是串行——
    // 这本身就值得验证：同步 API 不会因 reentrancy 破坏状态。
    const out = execFileSync(NODE, ['-e', craft, JSON.stringify(env)], { encoding: 'utf8', timeout: 180000 });
    parsed = JSON.parse(out.trim());
  } catch (e) { parsed = { error: String(e.message).slice(0, 120) }; }
  record('F 10 次 ensure 全部成功', parsed?.ok === true && parsed?.n === 10, JSON.stringify(parsed).slice(0, 160));
  record('F 全部指向同一环境根（无分叉）', parsed?.distinctRoots === 1, `distinct=${parsed?.distinctRoots}`);

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n=== T1x 汇总：${pass}/${results.length} PASS，${fail} FAIL（总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s）===`);
if (fail) {
  console.log('失败项：');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail}`);
}
process.exit(fail ? 1 : 0);
