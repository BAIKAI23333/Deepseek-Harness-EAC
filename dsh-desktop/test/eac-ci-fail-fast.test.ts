// P3：CI / 开发构建 fail-fast 契约回归。
//
// 背景：`third_party/dsh-dpx` 是安装环境隔离的唯一实现（ADR 0004，固定提交）。
// 两类静默坏状态必须被门禁挡住，而不是留到发布包里：
//   1. submodule 缺失 → 隔离测试整片 skip，CI 看起来「全绿」但没测到隔离；
//   2. submodule 提交漂移 / 工作树脏 → 装配出与 pin 不一致的 API。
// 此外 CI 的 checkout 必须真的取 submodule，否则门禁本身拿不到东西。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDpxPin, pinnedCommit } from '../../tauri-shell/check-dpx-pin.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (relative: string): string => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('dsh-dpx pin 门禁脚本可报告固定提交，且与适配层常量同源', () => {
  const pinned = pinnedCommit();
  assert.match(pinned, /^[0-9a-f]{40}$/, '固定提交必须是完整 40 位 SHA');
  // 适配层与门禁必须来自同一常量，避免「两套 pin」。
  const environment = read('dsh-desktop/lib/desktop/environment.ts');
  assert.ok(environment.includes(pinned), '适配层的 DPX_PINNED_COMMIT 必须与门禁读到的值一致');
  // stage 脚本也必须引用同一个提交。
  assert.ok(read('tauri-shell/stage-resources.mjs').includes(pinned), 'stage 必须校验同一个固定提交');
});

test('门禁对当前工作树给出结论（干净即通过，任何问题都带修复提示）', () => {
  const result = checkDpxPin();
  if (!result.ok) {
    // 失败必须可操作：每个问题都要有 hint，不能只说「不对」。
    assert.ok(result.hints.length > 0, `门禁失败必须给出修复命令，problems=${result.problems.join(' | ')}`);
  } else {
    assert.equal(result.detail.actualCommit, result.detail.pinnedCommit, '通过时提交必须等于 pin');
    assert.equal(result.detail.dirty, false, '通过时工作树必须干净');
  }
});

test('CI 三个 checkout 都取 submodule，并在装配/测试前跑 pin 门禁', () => {
  const ci = read('.github/workflows/ci.yml');
  // source-and-unit（跑隔离测试）与 staged-runtime（装配）都必须取 submodule。
  assert.ok((ci.match(/submodules:\s*recursive/g) ?? []).length >= 2, 'CI 至少两个 job 必须取 submodule');
  assert.ok((ci.match(/check-dpx-pin\.mjs/g) ?? []).length >= 2, 'CI 必须在测试/装配前跑 pin 门禁');
  // 门禁必须排在测试与装配之前（用出现顺序粗校验：pin 门禁早于 stage 调用）。
  const pinIndex = ci.indexOf('check-dpx-pin.mjs');
  const stageIndex = ci.indexOf('stage-resources.mjs');
  assert.ok(pinIndex > 0 && stageIndex > pinIndex, 'pin 门禁必须早于 stage 装配');
});

test('打包 workflow 同样取 submodule 并跑 pin 门禁', () => {
  const artifact = read('.github/workflows/staged-runtime-artifact.yml');
  assert.match(artifact, /submodules:\s*recursive/, '打包 workflow 必须取 submodule');
  assert.match(artifact, /check-dpx-pin\.mjs/, '打包 workflow 必须跑 pin 门禁');
});

test('stage 装配对 submodule 缺失/提交不匹配/脏工作树给出可执行失败信息', () => {
  const stage = read('tauri-shell/stage-resources.mjs');
  // 三类前置失败各自有明确分支。
  assert.match(stage, /缺少 third_party\/dsh-dpx/, '缺少 submodule 必须 fail fast');
  assert.match(stage, /git submodule update --init --recursive third_party\/dsh-dpx/, '必须给出初始化命令');
  assert.match(stage, /dsh-dpx 提交不匹配/, '提交漂移必须 fail fast');
  assert.match(stage, /checkout \$\{DPX_COMMIT\}|checkout '\s*\+ DPX_COMMIT/, '必须给出 checkout 命令');
  assert.match(stage, /dsh-dpx 工作树脏/, '脏工作树必须 fail fast');
  // payload 闭包缺文件也要挡住（运行期 ERR_MODULE_NOT_FOUND 的根因）。
  assert.match(stage, /payload 闭包不完整|缺少 src\//, '必须校验 src 闭包完整性');
});

test('stage 对生产依赖源树缺失 fail fast（离线装配的前提）', () => {
  const stage = read('tauri-shell/stage-resources.mjs');
  assert.match(stage, /生产依赖源树不存在/, '缺少 dsh-desktop/node_modules 必须 fail fast');
  assert.match(stage, /package-lock\.json —— 无法校验依赖闭包/, '缺少 lockfile 必须 fail fast');
  assert.match(stage, /WebView2Loader\.dll 前置检查失败/, 'WebView2 loader 必须前置 fail fast');
});
