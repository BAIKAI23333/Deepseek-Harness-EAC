import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

function fixture(t: any) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eac-guard-restore-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const profile = path.join(home, 'profiles', 'web-desktop');
  fs.mkdirSync(profile, { recursive: true });
  const appRoot = process.env.EAC_GUARD_RESTORE_RUNTIME_ROOT || path.resolve(import.meta.dirname, '..');
  const require = createRequire(path.join(appRoot, 'plugin-guard.js'));
  const atomic = require('./lib/atomic-json.js');
  const module: any = { exports: {} };
  let failBackup = false;
  let corruptBackup = false;
  let failWrite = 0;
  let persistentFailure = false;
  let writes = 0;
  const source = process.env.EAC_GUARD_RESTORE_RUNTIME_ROOT
    ? fs.readFileSync(path.join(appRoot, 'plugin-guard.js'), 'utf8')
    : stripTypeScriptTypes(fs.readFileSync(process.env.EAC_GUARD_RESTORE_SOURCE || new URL('../plugin-guard.ts', import.meta.url), 'utf8'), { mode: 'transform' });
  vm.runInNewContext(source, { module, exports: module.exports, Buffer, process, require: (name: string) => name === './lib/atomic-json' ? {
    writeJsonAtomic(file: string, value: any) {
      if (failBackup && file.endsWith('meta.json')) throw new Error('backup denied');
      atomic.writeJsonAtomic(file, value);
      if (corruptBackup && file.endsWith('meta.json')) fs.writeFileSync(path.join(path.dirname(file), 'package.json'), 'corrupt backup');
    },
    writeFileAtomic(file: string, value: any) {
      if (path.dirname(file) === profile) {
        writes++;
        if (writes === failWrite || (persistentFailure && writes > failWrite)) throw new Error('injected config write failure');
      }
      return atomic.writeFileAtomic(file, value);
    },
  } : require(name) });
  const guard = module.exports.createGuard({ getHome: () => home, getProfile: () => 'web-desktop', dshBin: () => 'unused', log() {} });
  const put = (name: string, value: string) => fs.writeFileSync(path.join(profile, name), value);
  const read = (name: string) => fs.readFileSync(path.join(profile, name), 'utf8');
  const snap = () => { const s = guard.snapshot('fixture'); assert.ok(s); return s; };
  return { home, profile, guard, put, read, snap,
    denyBackup: () => { failBackup = true; },
    corruptBackup: () => { corruptBackup = true; },
    failConfigWrite: (n: number, persistent = false) => { writes = 0; failWrite = n; persistentFailure = persistent; },
  };
}

test('guard restore rejects dot-directory ids without reading the parent snapshot root', t => {
  const f = fixture(t);
  f.put('package.json', 'current');
  fs.mkdirSync(path.join(f.home, 'rollbacks'), { recursive: true });
  fs.writeFileSync(path.join(f.home, 'rollbacks/package.json'), 'outside snapshot');
  const result = f.guard.restore('..');
  assert.equal(result.ok, false);
  assert.equal(f.read('package.json'), 'current');
});

test('guard restore requires a complete snapshot manifest and rejects linked snapshot directories', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot');
  const snap = f.snap();
  f.put('package.json', 'current');
  const root = path.join(f.home, 'rollbacks/web-desktop');
  fs.symlinkSync(path.join(root, snap.id), path.join(root, 'linked-snapshot'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(f.guard.restore('linked-snapshot').ok, false);
  const meta = path.join(root, snap.id, 'meta.json');
  fs.writeFileSync(meta, JSON.stringify({ ...snap, files: ['package.json', 'pnpm-lock.yaml'] }));
  assert.equal(f.guard.restore(snap.id).ok, false);
  assert.equal(f.read('package.json'), 'current');
});

test('guard restore aborts before touching current configuration when the mandatory backup fails', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot'); const snap = f.snap();
  f.put('package.json', 'current'); f.denyBackup();
  assert.equal(f.guard.restore(snap.id).ok, false);
  assert.equal(f.read('package.json'), 'current');
});

test('guard restore captures the selected oldest snapshot before backup retention pruning', t => {
  const f = fixture(t);
  const snapshots = [];
  for (let i = 0; i < 10; i++) { f.put('package.json', 'version-' + i); snapshots.push(f.snap()); }
  const oldest = f.guard.listSnapshots().at(-1);
  assert.ok(oldest);
  const expected = fs.readFileSync(path.join(f.home, 'rollbacks/web-desktop', oldest.id, 'package.json'), 'utf8');
  f.put('package.json', 'current');
  const result = f.guard.restore(oldest.id);
  assert.equal(result.ok, true);
  assert.equal(f.read('package.json'), expected);
});

test('guard restore matches configuration file presence, not just the files still present in both versions', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot'); const snap = f.snap();
  f.put('package.json', 'current'); f.put('pnpm-lock.yaml', 'newer lock');
  const result = f.guard.restore(snap.id);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(f.profile, 'pnpm-lock.yaml')), false);
  assert.equal(f.read('package.json'), 'snapshot');
});

test('guard restore reverses an interrupted multi-file write and preserves a durable pre-restore snapshot', t => {
  const f = fixture(t);
  f.put('package.json', 'old package'); f.put('cordis.patch.yml', 'old patch'); const snap = f.snap();
  f.put('package.json', 'current package'); f.put('cordis.patch.yml', 'current patch'); f.failConfigWrite(2);
  const result = f.guard.restore(snap.id);
  assert.equal(result.ok, false);
  assert.equal(f.read('package.json'), 'current package');
  assert.equal(f.read('cordis.patch.yml'), 'current patch');
  assert.equal(result.recovered, true);
  assert.equal(typeof result.backupId, 'string');
});

test('guard snapshot pruning ignores forged metadata ids rather than deleting the rollback parent', t => {
  const f = fixture(t);
  const root = path.join(f.home, 'rollbacks/web-desktop');
  f.put('package.json', 'current');
  for (let i = 0; i < 10; i++) f.snap();
  const fake = path.join(root, '0-forged'); fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'meta.json'), JSON.stringify({ id: '..', files: ['package.json'] }));
  assert.equal(f.guard.listSnapshots().some((s: any) => s.id === '..'), false);
  const fresh = f.snap();
  assert.equal(fs.existsSync(path.join(root, fresh.id, 'package.json')), true);
  assert.equal(f.read('package.json'), 'current');
});

test('guard restore rejects linked configuration paths without touching their targets', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot'); const snap = f.snap(); f.put('package.json', 'current');
  const sourceFile = path.join(f.home, 'rollbacks/web-desktop', snap.id, 'package.json');
  // Windows permits directory junctions without the file-symlink privilege.
  // POSIX exercises real file symlinks; do not change the host's Developer Mode.
  const outside = path.join(f.home, 'not-profile');
  if (process.platform === 'win32') { fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'sentinel'), 'outside'); }
  else fs.writeFileSync(outside, 'outside');
  const linkType = process.platform === 'win32' ? 'junction' : undefined;
  fs.unlinkSync(sourceFile);
  fs.symlinkSync(outside, sourceFile, linkType);
  assert.equal(f.guard.restore(snap.id).ok, false);
  assert.equal(f.read('package.json'), 'current');
  if (process.platform === 'win32') fs.rmdirSync(sourceFile); else fs.unlinkSync(sourceFile);
  fs.writeFileSync(sourceFile, 'snapshot');
  fs.unlinkSync(path.join(f.profile, 'package.json'));
  fs.symlinkSync(outside, path.join(f.profile, 'package.json'), linkType);
  assert.equal(f.guard.restore(snap.id).ok, false);
  assert.equal(fs.readFileSync(process.platform === 'win32' ? path.join(outside, 'sentinel') : outside, 'utf8'), 'outside');
});

test('prepared restore captures selected bytes, restores fresh pre-operation state on undo, and preserves user data', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot'); const snap = f.snap();
  const selectedFile = path.join(f.home, 'rollbacks/web-desktop', snap.id, 'package.json');
  const transaction = f.guard.prepareRestore(snap.id);
  fs.unlinkSync(selectedFile);
  f.put('package.json', 'fresh current'); f.put('pnpm-lock.yaml', 'fresh lock');
  fs.mkdirSync(path.join(f.home, 'sessions')); fs.writeFileSync(path.join(f.home, 'sessions/fixture.json'), 'session bytes');
  fs.mkdirSync(path.join(f.home, 'skills')); fs.writeFileSync(path.join(f.home, 'skills/fixture.md'), 'skill bytes');
  fs.writeFileSync(path.join(f.home, 'settings.yaml'), 'custom: preserved\n');
  assert.equal(transaction.apply().ok, true);
  assert.equal(f.read('package.json'), 'snapshot');
  assert.equal(fs.existsSync(path.join(f.profile, 'pnpm-lock.yaml')), false);
  assert.equal(transaction.undo().ok, true);
  assert.equal(f.read('package.json'), 'fresh current'); assert.equal(f.read('pnpm-lock.yaml'), 'fresh lock');
  assert.equal(transaction.apply().ok, false);
  assert.equal(transaction.undo().ok, true);
  assert.equal(fs.readFileSync(path.join(f.home, 'sessions/fixture.json'), 'utf8'), 'session bytes');
  assert.equal(fs.readFileSync(path.join(f.home, 'skills/fixture.md'), 'utf8'), 'skill bytes');
  assert.equal(fs.readFileSync(path.join(f.home, 'settings.yaml'), 'utf8'), 'custom: preserved\n');
});

test('guard restore exposes uncertain recovery instead of success when both apply and undo encounter write failures', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot package'); f.put('cordis.patch.yml', 'snapshot patch'); const snap = f.snap();
  f.put('package.json', 'current package'); f.put('cordis.patch.yml', 'current patch'); f.failConfigWrite(2, true);
  const result = f.guard.restore(snap.id);
  assert.equal(result.ok, false); assert.equal(result.recovered, false);
  assert.match(result.error, /recovery failed/);
  assert.equal(typeof result.backupId, 'string');
  const backup = path.join(f.home, 'rollbacks/web-desktop', result.backupId);
  assert.equal(fs.readFileSync(path.join(backup, 'package.json'), 'utf8'), 'current package');
  assert.equal(fs.readFileSync(path.join(backup, 'cordis.patch.yml'), 'utf8'), 'current patch');
});

test('guard rejects linked snapshot manifests without hiding other valid snapshots', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot'); const snap = f.snap(); const other = f.snap();
  const meta = path.join(f.home, 'rollbacks/web-desktop', snap.id, 'meta.json');
  const outside = path.join(f.home, 'external-meta');
  if (process.platform === 'win32') fs.mkdirSync(outside);
  else fs.writeFileSync(outside, fs.readFileSync(meta));
  fs.unlinkSync(meta); fs.symlinkSync(outside, meta, process.platform === 'win32' ? 'junction' : undefined);
  assert.equal(f.guard.restore(snap.id).ok, false);
  assert.equal(f.guard.listSnapshots().some((s: any) => s.id === snap.id), false);
  assert.equal(f.guard.listSnapshots().some((s: any) => s.id === other.id), true);
});

test('guard checks the durable backup bytes before replacing current configuration', t => {
  const f = fixture(t);
  f.put('package.json', 'snapshot'); const snap = f.snap(); f.put('package.json', 'current');
  f.corruptBackup();
  const result = f.guard.restore(snap.id);
  assert.equal(result.ok, false);
  assert.match(result.error, /backup does not match/);
  assert.equal(f.read('package.json'), 'current');
});
