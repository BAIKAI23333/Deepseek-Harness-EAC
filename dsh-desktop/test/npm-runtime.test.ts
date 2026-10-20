import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manager = require('../lib/desktop/package-manager.js');
const fetcher = require('../scripts/fetch-npm.js');
const runtimePaths = require('../lib/desktop/runtime-paths.js');
const desktop = path.join(import.meta.dirname, '..');
const expected = { npm: '11.21.0', 'brace-expansion': '5.0.12', 'http-cache-semantics': '4.3.0',
  'ip-address': '10.7.3', 'postcss-selector-parser': '7.1.6', undici: '6.28.1' };

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
}
function fixture(t: any): { root: string; source: string; dest: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eac-managed-npm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'build'), dest = path.join(root, 'app/vendor/npm');
  write(path.join(source, 'package.json'), JSON.stringify({ private: true, dependencies: expected }));
  const packages: Record<string, any> = { '': { dependencies: expected } };
  for (const [name, version] of Object.entries(expected)) {
    packages['node_modules/' + name] = { version, integrity: 'sha512-test-fixture' };
    write(path.join(source, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
  }
  write(path.join(source, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  write(path.join(source, 'node_modules/npm/bin/npm-cli.js'), "console.log('fixture-only');");
  write(path.join(source, 'node_modules/npm/lib/cli.js'), 'module.exports = {};');
  write(path.join(source, 'node_modules/http-cache-semantics/index.js'), fs.readFileSync(require.resolve('http-cache-semantics'), 'utf8'));
  write(path.join(dest, 'old-runtime.txt'), 'keep until the new tree is fully validated');
  return { root, source, dest };
}

test('npm runtime build has an independent exact lock without changing application brace2 pin', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(desktop, 'scripts/npm-runtime/package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(desktop, 'scripts/npm-runtime/package-lock.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, expected);
  assert.deepEqual(lock.packages[''].dependencies, expected);
  for (const [name, version] of Object.entries(expected)) {
    assert.equal(lock.packages['node_modules/' + name].version, version);
    assert.match(lock.packages['node_modules/' + name].integrity, /^sha512-/);
  }
  const app = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  assert.equal(app.overrides['brace-expansion'], '2.1.7');
});

test('npm runtime replacement discards stale files and records reproducible provenance', t => {
  const { source, dest } = fixture(t);
  fetcher.copyBundledNpm(source, dest);
  assert.doesNotThrow(() => manager.validateNpmRuntime(dest));
  assert.equal(fs.existsSync(path.join(dest, 'old-runtime.txt')), false);
  const provenance = JSON.parse(fs.readFileSync(path.join(dest, 'eac-runtime.json'), 'utf8'));
  assert.equal(provenance.npmVersion, expected.npm);
  assert.match(provenance.buildLockSha256, /^[a-f0-9]{64}$/);
  assert.equal(provenance.replacements['brace-expansion'], expected['brace-expansion']);
  const cache = fs.readFileSync(path.join(dest, 'node_modules/http-cache-semantics/index.js'), 'utf8');
  fetcher.copyBundledNpm(source, dest);
  assert.equal(fs.readFileSync(path.join(dest, 'node_modules/http-cache-semantics/index.js'), 'utf8'), cache);
});

test('failed cache patch leaves the previous runtime intact and removes only its staging directory', t => {
  const { root, source, dest } = fixture(t);
  write(path.join(source, 'node_modules/http-cache-semantics/index.js'), 'module.exports = {};');
  assert.throws(() => fetcher.copyBundledNpm(source, dest), /anchor|锚点/);
  assert.equal(fs.readFileSync(path.join(dest, 'old-runtime.txt'), 'utf8'), 'keep until the new tree is fully validated');
  assert.deepEqual(fs.readdirSync(path.join(root, 'app/vendor')), ['npm']);
});

test('wrong installed version or unreviewed build manifest fails before replacing the runtime', t => {
  const { source, dest } = fixture(t);
  write(path.join(source, 'node_modules/undici/package.json'), JSON.stringify({ name: 'undici', version: '6.27.0' }));
  assert.throws(() => fetcher.copyBundledNpm(source, dest), /does not match its lock/);
  write(path.join(source, 'package.json'), JSON.stringify({ dependencies: { ...expected, undici: '6.27.0' } }));
  assert.throws(() => fetcher.copyBundledNpm(source, dest), /reviewed security pins/);
  assert.ok(fs.existsSync(path.join(dest, 'old-runtime.txt')));
});

test('npm runtime replacement rejects source/destination overlap in both directions', t => {
  const { root, source } = fixture(t);
  assert.throws(() => fetcher.copyBundledNpm(source, root), /must not contain/);
  assert.throws(() => fetcher.copyBundledNpm(source, path.join(source, 'node_modules/npm')), /must not contain/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).dependencies.npm, expected.npm);
});

test('npm resolver fails closed on legacy versions, missing entries and incomplete cache guards', t => {
  const { source, dest } = fixture(t);
  assert.throws(() => manager.validateNpmRuntime(dest), /unsafe or incomplete/);
  fetcher.copyBundledNpm(source, dest);
  const cacheFile = path.join(dest, 'node_modules/http-cache-semantics/index.js');
  const cache = fs.readFileSync(cacheFile, 'utf8');
  write(cacheFile, cache.replace('if (this._securityZeroLifetime()) return false;', ''));
  assert.throws(() => manager.validateNpmRuntime(dest), /cache security guards/);
  write(cacheFile, cache); fs.rmSync(path.join(dest, 'bin/npm-cli.js'));
  assert.throws(() => manager.validateNpmRuntime(dest), /npm-cli.js missing/);
});

test('runtime npm path uses only the validated application tree and refuses an unsafe legacy fallback', t => {
  const { root, source, dest } = fixture(t);
  fetcher.copyBundledNpm(source, dest);
  const ctx = { log: () => {}, getUserDataDir: () => root, appRoot: () => path.join(root, 'app'),
    isPackaged: () => true, resourcesPath: () => path.join(root, 'legacy'), platform: process.platform };
  runtimePaths.init(ctx);
  assert.equal(runtimePaths.npmCli(), path.join(dest, 'bin/npm-cli.js'));
  runtimePaths.init({ ...ctx, appRoot: () => path.join(root, 'absent') });
  assert.throws(() => runtimePaths.npmCli(), /Bundled npm is unsafe or incomplete/);
});


test('npm directory-swap failure restores the previous runtime without leaving managed temporary trees', t => {
  const { root, source, dest } = fixture(t);
  const rename = fs.renameSync;
  fs.renameSync = (from: fs.PathLike, to: fs.PathLike): void => {
    if (String(from).includes('.npm-stage-') && String(to) === dest) throw Object.assign(new Error('injected managed swap failure'), { code: 'EPERM' });
    rename(from, to);
  };
  try { assert.throws(() => fetcher.copyBundledNpm(source, dest), /injected managed swap failure/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(path.join(dest, 'old-runtime.txt'), 'utf8'), 'keep until the new tree is fully validated');
  assert.deepEqual(fs.readdirSync(path.join(root, 'app/vendor')), ['npm']);
});
