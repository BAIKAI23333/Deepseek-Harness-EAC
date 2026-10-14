import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {createGuard} = require('../plugin-guard.js');
function fixture(t: any) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(),'eac-restore-status-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const create = (profile='web-desktop') => createGuard({getHome:()=>home,getProfile:()=>profile,dshBin:()=>''});
  const status = {snapshotId:'snapshot-1',at:'2026-10-11T01:00:00.000Z',phase:'succeeded',code:'restore-succeeded',ok:true,backupId:'backup-1'};
  return {home,create,status};
}
test('guard persists restore outcomes across instances and keeps profile ownership', t=>{
  const f=fixture(t); const g=f.create();g.markGood('good-snapshot');g.recordRestore(f.status);
  assert.deepEqual(f.create().lastRestore(),f.status);assert.equal(f.create('other').lastRestore(),null);
  f.create('other').recordRestore({...f.status,snapshotId:'other-snapshot'});
  assert.equal(f.create().lastRestore().snapshotId,'snapshot-1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.home,'guard/state.json'),'utf8')).lastGood,'good-snapshot');
});
test('guard restore status projects only non-secret fields', t=>{
  const f=fixture(t); f.create().recordRestore({...f.status,error:'token=secret',webUrl:'https://private.invalid',details:{password:'secret'}});
  assert.deepEqual(f.create().lastRestore(),f.status);
  assert.doesNotMatch(fs.readFileSync(path.join(f.home,'guard/state.json'),'utf8'),/secret|private|password|webUrl/);
});
test('guard rejects arbitrary codes, paths and inconsistent success status', t=>{
  const f=fixture(t);
  for(const invalid of [{code:'raw secret error'},{snapshotId:'../escape'},{backupId:'../escape'},{phase:'failed'},{at:'not-a-date'}])
    assert.throws(()=>f.create().recordRestore({...f.status,...invalid}));
  assert.equal(fs.existsSync(path.join(f.home,'guard/state.json')),false);
});
test('guard refuses linked guard directory without reading or overwriting the target', t=>{
  const f=fixture(t);const outside=path.join(f.home,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'state.json'),'keep');
  fs.symlinkSync(outside,path.join(f.home,'guard'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>f.create().recordRestore(f.status));assert.equal(f.create().lastRestore(),null);
  assert.equal(fs.readFileSync(path.join(outside,'state.json'),'utf8'),'keep');
});
test('guard refuses corrupt status state instead of silently discarding it', t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.home,'guard'));const file=path.join(f.home,'guard/state.json');fs.writeFileSync(file,'invalid-json');
  assert.throws(()=>f.create().recordRestore(f.status));assert.equal(fs.readFileSync(file,'utf8'),'invalid-json');
});
test('a pending restore remains explicit after restart rather than becoming success', t=>{
  const f=fixture(t);f.create().recordRestore({...f.status,phase:'pending',code:'restore-in-progress',ok:false});
  assert.equal(f.create().lastRestore().phase,'pending');assert.equal(f.create().lastRestore().ok,false);
});
