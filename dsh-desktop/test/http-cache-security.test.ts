import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const patcher = require('../scripts/patch-deps.js');
const installedFile = require.resolve(process.env.EAC_SECURITY_TEST_ROOT
  ? join(process.env.EAC_SECURITY_TEST_ROOT, 'node_modules/http-cache-semantics') : 'http-cache-semantics');
const installedSource = readFileSync(installedFile, 'utf8');

function loadPolicy(source: string): any {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require, Date }, { filename: installedFile });
  return module.exports;
}

const request = { url: 'https://cache-audit.invalid/profile', method: 'GET', headers: { host: 'cache-audit.invalid', cookie: 'user=alice' } };
const nextRequest = { url: request.url, method: request.method, headers: { host: 'cache-audit.invalid', 'cache-control': 'max-stale=2147483647' } };

function policyFor(Policy: any, directive: string, cookie = false, shared = true, extraHeaders = {}) {
  return new Policy(request, { status: 200, headers: {
    date: new Date(Date.now() - 120_000).toUTCString(),
    'cache-control': directive,
    ...(cookie ? { 'set-cookie': 'audit-fixture-secret=alice' } : {}),
    ...extraHeaders,
  } }, { shared });
}

// These execute the installed dependency, not a copied cache implementation.
for (const [label, directive, cookie, extraHeaders] of [
  ['shared cookie without explicit opt-in', 'max-age=60, stale-if-error=600, stale-while-revalidate=600', true, {}],
  ['private response in shared cache', 'private, max-age=60, stale-if-error=600, stale-while-revalidate=600', false, {}],
  ['no-store response', 'no-store, max-age=60, stale-if-error=600, stale-while-revalidate=600', false, {}],
  ['no-cache response', 'no-cache, max-age=60, stale-if-error=600, stale-while-revalidate=600', false, {}],
  ['wildcard vary', 'max-age=60, stale-if-error=600, stale-while-revalidate=600', false, { vary: '*' }],
  ['shared proxy-revalidate', 'proxy-revalidate, max-age=60, stale-if-error=600, stale-while-revalidate=600', false, {}],
] as const) {
  test('security-zeroed cache rejects max-stale and stale fallbacks: ' + label, () => {
    const Policy = loadPolicy(installedSource);
    for (const policy of [policyFor(Policy, directive, cookie, true, extraHeaders), Policy.fromObject(policyFor(Policy, directive, cookie, true, extraHeaders).toObject())]) {
      assert.equal(policy.maxAge(), 0);
      assert.equal(policy.satisfiesWithoutRevalidation(nextRequest), false);
      const evaluated = policy.evaluateRequest(nextRequest);
      assert.equal(evaluated.response, undefined);
      assert.equal(evaluated.revalidation.synchronous, true);
      assert.equal(policy._useStaleIfError(), false);
      assert.equal(policy.useStaleWhileRevalidate(), false);
      assert.equal(policy.revalidatedPolicy(nextRequest, { status: 503, headers: {} }).modified, true);
    }
  });
}

test('ordinary stale responses and explicit cookie opt-in retain their cache behavior', () => {
  const Policy = loadPolicy(installedSource);
  for (const policy of [
    policyFor(Policy, 'public, max-age=60, stale-if-error=600, stale-while-revalidate=600'),
    policyFor(Policy, 'public, max-age=60, stale-if-error=600, stale-while-revalidate=600', true),
    policyFor(Policy, 'max-age=60, stale-if-error=600, stale-while-revalidate=600', true, false),
  ]) {
    assert.equal(policy.satisfiesWithoutRevalidation(nextRequest), true);
    assert.ok(policy.evaluateRequest(nextRequest).response);
    assert.equal(policy._useStaleIfError(), true);
    assert.equal(policy.useStaleWhileRevalidate(), true);
  }
});

test('cache security patch is idempotent and fails closed on drift or missing files', () => {
  assert.equal(typeof patcher.patchHttpCacheSemanticsSource, 'function');
  const patched = patcher.patchHttpCacheSemanticsSource(installedSource);
  assert.equal(patcher.patchHttpCacheSemanticsSource(patched), patched);
  assert.throws(() => patcher.patchHttpCacheSemanticsSource('module.exports = class CachePolicy {};'), /anchor|锚点/);
  assert.throws(() => patcher.patchHttpCacheSemanticsSource(patched.replace('if (this._securityZeroLifetime()) return false;', '')), /incomplete/);
  const root = mkdtempSync(join(tmpdir(), 'eac-cache-security-'));
  try {
    assert.throws(() => patcher.patchHttpCacheSemantics(join(root, 'missing.js')), /missing|不存在/);
    const target = join(root, 'index.js');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '4.3.0' }));
    writeFileSync(target, installedSource);
    patcher.patchHttpCacheSemantics(target);
    const once = readFileSync(target, 'utf8');
    patcher.patchHttpCacheSemantics(target);
    assert.equal(readFileSync(target, 'utf8'), once);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
    assert.throws(() => patcher.patchHttpCacheSemantics(target), /reviewed version/);
    assert.equal(readFileSync(target, 'utf8'), once);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
