import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

function waitHarness(probe: () => void = () => {}) {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const require = createRequire(import.meta.url);
  const exports: any = {};
  const logs: string[] = [];
  runInNewContext(stripTypeScriptTypes(readFileSync(new URL('../lib/desktop/proc.ts', import.meta.url), 'utf8'), {
    mode: 'transform',
  }).replace(/^export /gm, '').replace("import { APP_ROOT } from './runtime-paths';",
    "const { APP_ROOT } = require('./runtime-paths');") + '\nexports.init = init; exports.waitForProcExit = waitForProcExit;', {
    exports, process: { platform: 'win32', kill: probe },
    require: (name: string) => {
      if (name === './runtime-paths') return { APP_ROOT: 'unused' };
      if (name === 'node:child_process') return { execSync: () => '\"12345\"' };
      return require(name);
    },
    setTimeout: (fn: () => void) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  exports.init({ log: (_tag: string, message: string) => logs.push(message), getDshHome: () => null, getDesktopProfile: () => 'web-desktop' });
  const child = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null, signalCode: null });
  return {
    child, timers, logs,
    wait: (timeout: number) => exports.waitForProcExit(child, timeout),
    poll: () => {
      const first = [...timers][0];
      assert.ok(first);
      timers.delete(first[0]);
      first[1]();
    },
  };
}

test('process wait removes both exit/error listeners when exit wins', async () => {
  const h = waitHarness();
  const waiting = h.wait(5000);
  h.child.emit('exit', 0);
  assert.equal(await waiting, true);
  assert.equal(h.child.listenerCount('exit'), 0);
  assert.equal(h.child.listenerCount('error'), 0);
  assert.equal(h.timers.size, 0);
});

test('process wait removes both listeners and timer when error wins', async () => {
  const h = waitHarness();
  const waiting = h.wait(5000);
  h.child.emit('error', new Error('synthetic process error'));
  assert.equal(await waiting, false);
  assert.equal(h.child.listenerCount('exit'), 0);
  assert.equal(h.child.listenerCount('error'), 0);
  assert.equal(h.timers.size, 0);
});

test('timed-out process waits do not accumulate listeners on a surviving child', async () => {
  const h = waitHarness();
  for (let i = 0; i < 3; i++) {
    const waiting = h.wait(0);
    h.poll();
    assert.equal(await waiting, false);
    assert.equal(h.child.listenerCount('exit'), 0);
    assert.equal(h.child.listenerCount('error'), 0);
    assert.equal(h.timers.size, 0);
  }
  assert.equal(h.logs.length, 3, 'each surviving child should reach the timeout path');
});


test('process wait preserves listeners owned by other consumers', async () => {
  const h = waitHarness();
  const observer = () => {};
  h.child.on('exit', observer);
  h.child.on('error', observer);
  const waiting = h.wait(0);
  h.poll();
  assert.equal(await waiting, false);
  assert.deepEqual(h.child.listeners('exit'), [observer]);
  assert.deepEqual(h.child.listeners('error'), [observer]);
});

for (const code of ['EPERM', 'EACCES', 'EIO']) {
  test('process probe ' + code + ' never proves exit', async () => {
    const h = waitHarness(() => { throw Object.assign(new Error('probe failure'), { code }); });
    const waiting = h.wait(0);
    h.poll();
    assert.equal(await waiting, false);
    assert.equal(h.timers.size, 0);
    assert.equal(h.child.listenerCount('exit'), 0);
    assert.equal(h.child.listenerCount('error'), 0);
  });
}

test('only ESRCH probe confirms a missing process', async () => {
  const h = waitHarness(() => { throw Object.assign(new Error('no such process'), { code: 'ESRCH' }); });
  const waiting = h.wait(0);
  h.poll();
  assert.equal(await waiting, true);
  assert.equal(h.timers.size, 0);
});

test('signal exit status confirms exit without attaching listeners', async () => {
  const h = waitHarness();
  h.child.signalCode = 'SIGTERM';
  assert.equal(await h.wait(5000), true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.child.listenerCount('exit'), 0);
});
