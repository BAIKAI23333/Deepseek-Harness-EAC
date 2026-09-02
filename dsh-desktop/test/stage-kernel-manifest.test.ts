import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { absolutizeKernelFileReferences } from '../../tauri-shell/stage-kernel-manifest.mjs';

test('staging manifest uses one absolute kernel root for root and transitive overrides', () => {
  const source = JSON.stringify({
    dependencies: {
      '@deepseek-ai/dsh': 'file:vendor/kernel/0.1.2/deepseek-ai-dsh.tgz',
    },
    overrides: {
      '@deepseek-ai/schemastery': 'file:vendor/kernel/0.1.2/deepseek-ai-schemastery.tgz',
    },
    untouched: 'file:vendor/npm',
  });
  const kernel = path.join('H:\\build root', 'staged-resources', 'vendor', 'kernel');
  const absoluteKernel = path.resolve(kernel).replaceAll('\\', '/');

  const result = absolutizeKernelFileReferences(source, kernel);

  assert.match(result, new RegExp(`file:${escapeRegex(absoluteKernel)}/0\\.1\\.2/deepseek-ai-dsh\\.tgz`));
  assert.match(result, new RegExp(`file:${escapeRegex(absoluteKernel)}/0\\.1\\.2/deepseek-ai-schemastery\\.tgz`));
  assert.match(result, /file:vendor\/npm/);
  assert.doesNotMatch(result, /file:vendor\/kernel\//);
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
