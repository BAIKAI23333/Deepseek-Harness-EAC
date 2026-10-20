import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  childProcessSpawnOptions,
  init,
  killTreeAndWait,
  childEnv,
} from '../lib/desktop/proc.js';

const root = join(fileURLToPath(new URL('..', import.meta.url)));

test('boot-server applies the platform process-group spawn options', () => {
  const source = readFileSync(join(root, 'lib', 'desktop', 'boot-server.ts'), 'utf8');
  assert.match(source, /\.\.\.childProcessSpawnOptions\(\)/);
  // --no-open 必须在：内核 openBrowser 默认 true → 每轮启动弹系统浏览器。
  // 历史：5.3.0 期间的 spike 内核不认该参数（传了启动必死），PR #249 移除并钉死
  // 「不得出现」；最终 vendored alpha.1 的 dsh-web-app 恢复了 --no-open
  // （boot-smoke 实证：传参正常启动且不再弹浏览器），钉子翻转为「必须存在」，
  // 防止再丢。内核若再变更参数语义，此测试会红，届时按新内核契约重评。
  assert.match(source, /['"]--no-open['"]/);
  assert.deepEqual(childProcessSpawnOptions('linux'), { detached: true });
  assert.deepEqual(childProcessSpawnOptions('win32'), { detached: false });
});

if (process.platform !== 'win32') test('POSIX DSH process-group termination reaps a spawned descendant', async () => {
  init({ log: () => {}, getDshHome: () => null, getDesktopProfile: () => 'desktop' });
  const script = [
    'const {spawn}=require("node:child_process")',
    'const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"})',
    'process.stdout.write(String(c.pid)+"\\n")',
    'setInterval(()=>{},1000)',
  ].join(';');
  const child = spawn(process.execPath, ['-e', script], {
    ...childProcessSpawnOptions('linux'),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const descendantPid = await new Promise<number>((resolve, reject) => {
    let value = '';
    child.stdout.on('data', (chunk) => {
      value += chunk.toString();
      const pid = Number(value.trim());
      if (Number.isInteger(pid) && pid > 0) resolve(pid);
    });
    setTimeout(() => reject(new Error('descendant pid timeout')), 3000);
  });
  try {
    await killTreeAndWait(child, { graceMs: 100, hardMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.throws(() => process.kill(descendantPid, 0), /ESRCH/);
  } finally {
    try { process.kill(descendantPid, 'SIGKILL'); } catch { /* already reaped */ }
  }
});

test('childEnv 注入 DSH_PERMISSION_MODE=danger-full-access（issue #196）', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-perm-'));
  try {
    writeFileSync(
      join(temp, 'settings.yaml'),
      [
        'permission:',
        '  defaultPreset: danger-full-access',
        '',
      ].join('\n'),
      'utf8'
    );
    init({ log: () => {}, getDshHome: () => temp, getDesktopProfile: () => 'desktop' });
    const env = childEnv();
    assert.equal(env.DSH_PERMISSION_MODE, 'danger-full-access');
    assert.equal(env.DSH_DESKTOP, '1');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('childEnv 未设置完全访问时不注入 DSH_PERMISSION_MODE（保持默认 workspace-write）', () => {
  // childEnv 会先展开 process.env，故断言前必须清掉宿主的同名变量
  //（在已设 DSH_PERMISSION_MODE 的终端里跑测试时，继承值会掩盖本用例）。
  const saved = process.env.DSH_PERMISSION_MODE;
  delete process.env.DSH_PERMISSION_MODE;
  const temp = mkdtempSync(join(tmpdir(), 'dsh-perm-'));
  try {
    writeFileSync(
      join(temp, 'settings.yaml'),
      [
        'permission:',
        '  defaultPreset: workspace-write',
        '',
      ].join('\n'),
      'utf8'
    );
    init({ log: () => {}, getDshHome: () => temp, getDesktopProfile: () => 'desktop' });
    const env = childEnv();
    assert.equal(env.DSH_PERMISSION_MODE, undefined);
  } finally {
    if (saved !== undefined) process.env.DSH_PERMISSION_MODE = saved;
    rmSync(temp, { recursive: true, force: true });
  }
});

if (process.platform === 'win32') test('Windows strict termination confirms a real child and descendant exit', async () => {
  init({log: () => {}, getDshHome: () => null, getDesktopProfile: () => 'fixture'});
  const child = spawn(process.execPath, ['-e', [
    'const {spawn}=require("node:child_process")',
    'const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true})',
    'process.stdout.write(String(c.pid)+"\\n")',
    'setInterval(()=>{},1000)',
  ].join(';')], {...childProcessSpawnOptions(), windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
  let descendant = 0;
  try {
    descendant = await new Promise<number>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('descendant pid timeout')), 5000);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.stdout.on('data', chunk => {
        text += String(chunk);
        const pid = Number(text.trim());
        if (Number.isInteger(pid) && pid > 0) { clearTimeout(timer); resolve(pid); }
      });
    });
    assert.equal(await killTreeAndWait(child), true);
    const until = Date.now() + 5000;
    let alive = true;
    while (alive && Date.now() < until) {
      try { process.kill(descendant, 0); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
      }
      if (alive) await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(alive, false, 'a successful stop must not leave the known descendant running');
  } finally {
    await killTreeAndWait(child);
    if (descendant) { try { process.kill(descendant, 'SIGKILL'); } catch { /* already exited */ } }
  }
});
