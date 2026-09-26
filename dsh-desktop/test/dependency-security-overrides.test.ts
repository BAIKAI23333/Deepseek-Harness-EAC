import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));

test('production dependency advisories are pinned to fixed glob and qs releases', () => {
  // 钉子必须始终在 package.json overrides 中声明：0.1.7 起内核树不再传递依赖
  // qs，条目不会物化进 lock；但未来任何传递依赖重新引入 qs/glob 时，钉子
  // 立即生效。因此物化检查是条件式的——只要出现在 lock 里就必须是钉住版本。
  assert.equal(manifest.overrides.glob, '10.5.0');
  assert.equal(manifest.overrides.qs, '6.16.0');
  const globEntry = lock.packages['node_modules/glob'];
  if (globEntry) assert.equal(globEntry.version, '10.5.0');
  const qsEntry = lock.packages['node_modules/qs'];
  if (qsEntry) assert.equal(qsEntry.version, '6.16.0');
});

test('kernel override regeneration preserves application security overrides', () => {
  const generator = readFileSync(join(ROOT, 'scripts', 'gen-kernel-overrides.ts'), 'utf8');
  assert.match(generator, /const nonKernelOverrides = Object\.entries\(manifest\.overrides \?\? \{\}\)/);
  assert.match(generator, /!name\.startsWith\('@deepseek-ai\/'\)/);
  assert.match(generator, /\.\.\.nonKernelOverrides, \.\.\.specByName\.entries\(\)/);
  assert.match(generator, /\^\\d\+\\\.\\d\+\\\.\\d\+\(\?:-\[0-9A-Za-z\.\]\+\)\?\$/,
    'vendor/kernel/.build and other work directories must not be treated as versions');
});
