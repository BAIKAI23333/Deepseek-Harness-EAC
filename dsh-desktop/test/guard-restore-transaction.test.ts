import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const box = require('../lib/desktop/guard-box.js');

function fixture(options: any = {}) {
  const events: string[] = []; const statuses: any[] = [];
  let stops = 0, starts = 0, quitting = !!options.quitting;
  const deps = {
    guard: {
      prepareRestore: () => { events.push('prepare'); if (options.invalid) throw Error('private-token=secret'); return {
        apply: () => { events.push('apply'); if (options.quitAfterApply) quitting = true; return options.apply || {ok: true, backupId: 'backup-1'}; },
        undo: () => { events.push('undo'); return options.undo || {ok: true}; },
      }; },
      recordRestore: (r: any) => { events.push('record:' + r.phase); statuses.push({...r}); if (options.recordFail === statuses.length || options.recordAlwaysFail) throw Error('token=private-write-error'); },
    },
    stop: async () => { events.push('stop'); stops++; if (options.stopFail === stops) throw Error('private-stop-details'); },
    start: async () => { events.push('start'); starts++; if (options.quitAtStart === starts) quitting = true; if ((options.startFails || []).includes(starts)) throw Error('https://private.invalid/?token=secret'); return {webUrl: 'http://127.0.0.1:9000/?token=runtime-only', port: 9000}; },
    isQuitting: () => quitting,
    setIsRestarting: (v: boolean) => events.push('restarting:' + v),
  };
  return {events, statuses, deps, run: (id: any = 'snapshot-1') => { assert.equal(typeof box.restoreAndRestart, 'function'); return box.restoreAndRestart(deps, id); }};
}

test('restore validates before stopping, backs up and starts only the restored profile', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.ok, true); assert.equal(result.backupId, 'backup-1');
  assert.ok(f.events.indexOf('prepare') < f.events.indexOf('stop'));
  assert.ok(f.events.indexOf('stop') < f.events.indexOf('apply'));
  assert.ok(f.events.indexOf('apply') < f.events.indexOf('start'));
  assert.equal(f.events.filter(x => x === 'start').length, 1);
  assert.equal(f.events.at(-1), 'restarting:false');
  assert.equal(f.statuses.at(-1).phase, 'succeeded');
  assert.doesNotMatch(JSON.stringify(f.statuses), /runtime-only|private|https?:/);
});

test('invalid snapshot never stops or writes the current profile', async () => {
  const f = fixture({invalid: true}); const result = await f.run();
  assert.equal(result.error, 'invalid-snapshot'); assert.deepEqual(f.events, ['prepare']);
});

test('failed initial status persistence aborts before any service or configuration mutation', async () => {
  const f = fixture({recordFail: 1}); assert.equal((await f.run()).error, 'restore-status-write-failed');
  assert.equal(f.events.includes('stop'), false); assert.equal(f.events.includes('apply'), false);
});

test('unconfirmed stop never applies or restarts', async () => {
  const f = fixture({stopFail: 1}); const result = await f.run();
  assert.equal(result.error, 'service-stop-unconfirmed'); assert.equal(f.events.includes('apply'), false); assert.equal(f.events.includes('start'), false);
});

test('failed target start stops remnants before undo and boots the original exactly once', async () => {
  const f = fixture({startFails: [1]}); const result = await f.run();
  assert.equal(result.ok, false); assert.equal(result.error, 'restore-start-failed'); assert.equal(result.recovered, true);
  const boot = f.events.indexOf('start'); const stop = f.events.indexOf('stop', boot); const undo = f.events.indexOf('undo');
  assert.ok(boot < stop && stop < undo && undo < f.events.lastIndexOf('start'));
  assert.equal(f.events.filter(x => x === 'start').length, 2);
  assert.equal(f.statuses.at(-1).phase, 'failed'); assert.equal(f.statuses.at(-1).recovered, true);
});

test('unconfirmed target stop never undoes configuration held by a possibly live process', async () => {
  const f = fixture({startFails: [1], stopFail: 2}); const result = await f.run();
  assert.equal(result.error, 'restore-recovery-stop-unconfirmed'); assert.equal(f.events.includes('undo'), false);
  assert.equal(f.events.filter(x => x === 'start').length, 1);
});

test('failed undo leaves a backup reference and never boots an uncertain configuration', async () => {
  const f = fixture({startFails: [1], undo: {ok: false, error: 'private failure'}}); const result = await f.run();
  assert.equal(result.error, 'restore-undo-failed'); assert.equal(result.backupId, 'backup-1');
  assert.equal(f.events.filter(x => x === 'start').length, 1); assert.equal(result.serviceStopped, true);
});

test('original boot failure has a bounded final stop and never reports recovered', async () => {
  const f = fixture({startFails: [1, 2]}); const result = await f.run();
  assert.equal(result.error, 'restore-recovery-start-failed'); assert.equal(result.recovered, false);
  assert.equal(f.events.filter(x => x === 'start').length, 2); assert.equal(f.events.filter(x => x === 'stop').length, 3);
  assert.equal(result.serviceStopped, true);
});

test('apply failure with successful engine undo restarts only the unchanged original', async () => {
  const f = fixture({apply: {ok: false, recovered: true, backupId: 'backup-1'}}); const result = await f.run();
  assert.equal(result.error, 'restore-apply-failed'); assert.equal(result.recovered, true);
  assert.equal(f.events.includes('undo'), false); assert.equal(f.events.filter(x => x === 'start').length, 1);
});

test('unrecovered apply failure never attempts a boot', async () => {
  const f = fixture({apply: {ok: false, recovered: false, backupId: 'backup-1'}}); const result = await f.run();
  assert.equal(result.error, 'restore-undo-failed'); assert.equal(f.events.includes('start'), false);
});

test('exit after apply undoes only after strict stop, without any new boot', async () => {
  const f = fixture({quitAfterApply: true}); const result = await f.run();
  assert.equal(result.error, 'restore-cancelled'); assert.equal(f.events.includes('undo'), true); assert.equal(f.events.includes('start'), false);
  assert.equal(f.statuses.at(-1).phase, 'cancelled');
});

test('exit during target boot stops and undoes without starting the original', async () => {
  const f = fixture({quitAtStart: 1, startFails: [1]}); const result = await f.run();
  assert.equal(result.error, 'restore-cancelled'); assert.equal(f.events.includes('undo'), true);
  assert.equal(f.events.filter(x => x === 'start').length, 1);
});

test('final success record failure rolls back before restarting the original', async () => {
  const f = fixture({recordFail: 3}); const result = await f.run();
  assert.equal(result.ok, false); assert.equal(result.error, 'restore-status-write-failed'); assert.equal(result.recovered, true);
  assert.equal(f.events.includes('undo'), true); assert.equal(f.statuses.at(-1).phase, 'failed');
});

test('operation errors and token-bearing boot URLs never enter persistent status', async () => {
  const f = fixture({startFails: [1, 2]}); await f.run();
  assert.doesNotMatch(JSON.stringify(f.statuses), /private|secret|runtime-only|https?:/);
});
