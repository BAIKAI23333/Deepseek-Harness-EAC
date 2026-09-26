// gen-kernel-overrides 契约：内核升版后上游会移除/改名包，生成器必须把
// 「已声明但缓存中没有 tarball」的直接依赖从 dependencies 和 overrides 中
// 一并剔除（仅限 KERNEL_REMOVED_PACKAGES 白名单内），其余缺失仍硬错误。
// 0.1.7-rc.2 实测移除：code-runtime / agent-presets / e2b 家族等 9 包。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyKernelSpecs, KERNEL_DEP_GAPS } from '../scripts/gen-kernel-overrides.js';

const V = 'file:vendor/kernel/0.1.7-rc.2/';
// 覆盖全部缺口包，保证测试直接命中 deps/overrides 改写与剔除逻辑本身。
const SPECS = new Map<string, string>([
  ['@deepseek-ai/dsh', V + 'deepseek-ai-dsh-0.1.7-rc.2.tgz'],
  ['@deepseek-ai/dsh-compaction', V + 'deepseek-ai-dsh-compaction-0.1.7-rc.2.tgz'],
  ...KERNEL_DEP_GAPS.map((name) => [name, V + 'deepseek-ai-' + name.slice('@deepseek-ai/'.length) + '-0.1.7-rc.2.tgz']),
]);

test('已移除包从 dependencies 与 overrides 一并剔除', () => {
  const manifest = {
    dependencies: {
      '@deepseek-ai/dsh': 'file:vendor/kernel/0.1.5-rc.2/deepseek-ai-dsh-0.1.5-rc.2.tgz',
      '@deepseek-ai/dsh-code-runtime': 'file:vendor/kernel/0.1.5-rc.2/deepseek-ai-dsh-code-runtime-0.1.5-rc.2.tgz',
      archiver: '^7.0.1',
    },
    overrides: {
      '@deepseek-ai/dsh': 'file:vendor/kernel/0.1.5-rc.2/deepseek-ai-dsh-0.1.5-rc.2.tgz',
      '@deepseek-ai/dsh-code-runtime': 'file:vendor/kernel/0.1.5-rc.2/deepseek-ai-dsh-code-runtime-0.1.5-rc.2.tgz',
      glob: '10.5.0',
    },
  };
  const result = applyKernelSpecs(manifest, SPECS);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0], '@deepseek-ai/dsh-code-runtime');
  assert.ok(!('@deepseek-ai/dsh-code-runtime' in manifest.dependencies));
  assert.ok(!('@deepseek-ai/dsh-code-runtime' in manifest.overrides));
  // 安全钉必须保留
  assert.equal(manifest.overrides.glob, '10.5.0');
  // 存活内核包被改写为新 spec
  assert.equal(manifest.dependencies['@deepseek-ai/dsh'], SPECS.get('@deepseek-ai/dsh'));
});

test('非白名单的缓存缺失包仍然硬错误', () => {
  const manifest = {
    dependencies: { '@deepseek-ai/dsh-not-in-kernel': 'file:vendor/kernel/0.1.5-rc.2/x.tgz' },
    overrides: {},
  };
  assert.throws(() => applyKernelSpecs(manifest, SPECS), /没有对应 tarball/);
});

test('KERNEL_REMOVED_PACKAGES 覆盖 0.1.7-rc.2 实测缺失的 9 个包', () => {
  const removed = [
    '@deepseek-ai/dsh-code-runtime',
    '@deepseek-ai/dsh-agent-presets',
    '@deepseek-ai/dsh-code-runtime-worker-thread',
    '@deepseek-ai/dsh-e2b',
    '@deepseek-ai/dsh-experimental-agent-team-web-profile',
    '@deepseek-ai/dsh-fs-e2b',
    '@deepseek-ai/dsh-settings-file',
    '@deepseek-ai/dsh-subprocess-e2b',
    '@deepseek-ai/dsh-workflow-worker-thread',
  ];
  assert.equal(applyKernelSpecs.REMOVED_SET.size, removed.length);
  for (const name of removed) assert.ok(applyKernelSpecs.REMOVED_SET.has(name), name);
});
