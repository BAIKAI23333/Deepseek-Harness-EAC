#!/usr/bin/env node
// dsh-dpx submodule 门禁（P3）：submodule 缺失 / 提交不匹配 / 工作树脏 时
// **fail fast**，并给出可执行的修复命令。
//
// 为什么要有独立门禁：`third_party/dsh-dpx` 是安装环境隔离的**唯一实现**
//（ADR 0004，固定提交）。当它缺失或漂移时：
//   - 开发态：隔离测试会大面积 skip，看起来「全绿」但其实没测到隔离；
//   - 打包态：stage 会装配出与 pin 不一致的 API，或直接失败在链路深处。
// 两种情况的代价都比在这里立刻停下高得多。
//
// 用法：
//   node tauri-shell/check-dpx-pin.mjs            # 校验（CI / preflight）
//   node tauri-shell/check-dpx-pin.mjs --report   # 只打印状态，恒 exit 0（诊断用）
//
// 单一事实源：固定提交常量从 lib/desktop/environment.ts 读取，避免本脚本
// 与适配层各写一份 DPX_PINNED_COMMIT。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DPX_ROOT = path.join(root, 'third_party', 'dsh-dpx');
const ENVIRONMENT_TS = path.join(root, 'dsh-desktop', 'lib', 'desktop', 'environment.ts');
const reportOnly = process.argv.includes('--report');

/** 从适配层源码里读出固定提交（唯一事实源）。 */
export function pinnedCommit() {
  const source = readFileSync(ENVIRONMENT_TS, 'utf8');
  const match = /DPX_PINNED_COMMIT\s*=\s*'([0-9a-f]{40})'/.exec(source);
  if (!match) throw new Error('无法从 lib/desktop/environment.ts 读取 DPX_PINNED_COMMIT');
  return match[1];
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * 校验 dsh-dpx 状态。
 * @returns {{ ok: boolean, problems: string[], hints: string[], detail: Record<string, unknown> }}
 */
export function checkDpxPin() {
  const problems = [];
  const hints = [];
  const detail = { root: DPX_ROOT, pinnedCommit: null, actualCommit: null, dirty: null };

  let expected;
  try {
    expected = pinnedCommit();
    detail.pinnedCommit = expected;
  } catch (error) {
    problems.push(String(error instanceof Error ? error.message : error));
    return { ok: false, problems, hints, detail };
  }

  if (!existsSync(DPX_ROOT)) {
    problems.push(`submodule 目录不存在：${DPX_ROOT}`);
    hints.push('git submodule update --init --recursive third_party/dsh-dpx');
    return { ok: false, problems, hints, detail };
  }

  // payload 闭包文件：缺一个，打包后 import() 就 ERR_MODULE_NOT_FOUND，
  // 隔离在每个正式包里 fail closed。
  const requiredSrc = ['index.js', 'desktop-release.js', 'environment-guide.js', 'http.js'];
  const missing = requiredSrc.filter((file) => !existsSync(path.join(DPX_ROOT, 'src', file)));
  if (!existsSync(path.join(DPX_ROOT, 'src', 'index.js'))) {
    problems.push('submodule 未初始化（缺少 src/index.js）');
    hints.push('git submodule update --init --recursive third_party/dsh-dpx');
    return { ok: false, problems, hints, detail };
  }
  if (missing.length) {
    problems.push(`payload 闭包缺文件：${missing.join(', ')}（submodule 可能停在错误提交）`);
    hints.push(`git -C third_party/dsh-dpx checkout ${expected} && git -C third_party/dsh-dpx submodule update --init`);
  }

  let actual = null;
  try {
    actual = git(['rev-parse', 'HEAD'], DPX_ROOT);
    detail.actualCommit = actual;
  } catch (error) {
    problems.push(`无法读取 submodule 提交（不是 git 工作树？）：${String(error)}`);
    hints.push('git submodule update --init --recursive third_party/dsh-dpx');
    return { ok: false, problems, hints, detail };
  }
  if (actual !== expected) {
    problems.push(`submodule 提交不匹配：期望 ${expected}，实际 ${actual}`);
    hints.push(`git -C third_party/dsh-dpx fetch && git -C third_party/dsh-dpx checkout ${expected}`);
  }

  let dirty = '';
  try {
    dirty = git(['status', '--porcelain'], DPX_ROOT);
    detail.dirty = Boolean(dirty);
  } catch {
    detail.dirty = null;
  }
  if (dirty) {
    problems.push(`submodule 工作树脏（拒绝装配与 pin 不一致的 API）：\n${dirty}`);
    hints.push('git -C third_party/dsh-dpx checkout -- . && git -C third_party/dsh-dpx clean -fd');
  }

  return { ok: problems.length === 0, problems, hints, detail };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDpxPin();
  if (reportOnly) {
    console.log(`[dpx-pin] root=${result.detail.root}`);
    console.log(`[dpx-pin] pinned=${result.detail.pinnedCommit}`);
    console.log(`[dpx-pin] actual=${result.detail.actualCommit}`);
    console.log(`[dpx-pin] dirty=${result.detail.dirty}`);
    for (const problem of result.problems) console.log(`[dpx-pin] 问题：${problem}`);
    process.exit(0);
  }
  if (result.ok) {
    console.log(`[dpx-pin] OK：dsh-dpx 停在固定提交 ${result.detail.pinnedCommit}，工作树干净`);
    process.exit(0);
  }
  console.error('[dpx-pin] dsh-dpx submodule 校验失败（fail fast）：');
  for (const problem of result.problems) console.error(`  - ${problem}`);
  if (result.hints.length) {
    console.error('  修复：');
    for (const hint of result.hints) console.error(`    ${hint}`);
  }
  process.exit(1);
}
