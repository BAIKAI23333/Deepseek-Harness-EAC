import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness(platform = 'win32') {
  const require = createRequire(import.meta.url);
  const exports: any = {};
  const timers = new Map<number, () => void>();
  const commands: any[] = [];
  const signals: any[] = [];
  let nextTimer = 0;
  let groupAlive = true;
  const child = Object.assign(new EventEmitter(), {pid: 12345, exitCode: null as number | null, signalCode: null});
  const source = stripTypeScriptTypes(readFileSync(new URL('../lib/desktop/proc.ts', import.meta.url), 'utf8'), {mode: 'transform'})
    .replace(/^export /gm, '').replace("import { APP_ROOT } from './runtime-paths';", "const { APP_ROOT } = require('./runtime-paths');");
  runInNewContext(source + '\nObject.assign(exports, {init, killTreeAndWait});', {
    exports,
    process: {platform, kill: (pid: number, signal: any) => {
      signals.push([pid, signal]);
      if (pid < 0) {
        if (signal === 'SIGKILL') groupAlive = false;
        if (!groupAlive) throw Object.assign(new Error('gone'), {code: 'ESRCH'});
      }
    }},
    require: (name: string) => {
      if (name === './runtime-paths') return {APP_ROOT: 'unused'};
      if (name === 'node:child_process') return {spawn: (_bin: string, args: string[]) => {
        const command = Object.assign(new EventEmitter(), {args, kill: () => {}}); commands.push(command); return command;
      }};
      return require(name);
    },
    setTimeout: (fn: () => void) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  exports.init({log: () => {}, getDshHome: () => null, getDesktopProfile: () => 'fixture'});
  return { child, commands, signals, timers,
    stop: () => exports.killTreeAndWait(child, {graceMs: 0, hardMs: 0}),
    exitRoot: () => { child.exitCode = 0; child.emit('exit', 0); },
    poll: async () => { const timer = [...timers][0]; assert.ok(timer); timers.delete(timer[0]); timer[1](); await flush(); },
  };
}

test('Windows termination awaits the taskkill command, not just the root exit', async () => {
  const h = harness(); let settled = false;
  const stopping = h.stop().then((r: boolean) => {settled = true; return r;});
  h.exitRoot(); await flush(); assert.equal(settled, false);
  h.commands[0].emit('exit', 0);
  assert.equal(await stopping, true); assert.equal(h.timers.size, 0);
});

test('failed graceful command escalates only while the root remains alive', async () => {
  const h = harness(); const stopping = h.stop();
  h.commands[0].emit('exit', 1); await flush(); await h.poll();
  assert.equal(h.commands.length, 2); assert.ok(h.commands[1].args.includes('/F'));
  h.exitRoot(); h.commands[1].emit('exit', 0);
  assert.equal(await stopping, true); assert.equal(h.timers.size, 0);
});

test('taskkill error is consumed and a failed forced command never reports success', async () => {
  const h = harness(); const stopping = h.stop();
  h.commands[0].emit('error', new Error('spawn failure')); await flush(); await h.poll();
  h.commands[1].emit('error', new Error('spawn failure')); await flush(); await h.poll();
  assert.equal(await stopping, false); assert.equal(h.timers.size, 0);
});

test('root disappearance during a failed tree command remains unconfirmed on retry', async () => {
  const h = harness(); const stopping = h.stop();
  h.exitRoot(); h.commands[0].emit('exit', 1);
  assert.equal(await stopping, false);
  assert.equal(await h.stop(), false, 'root exit must not erase an unconfirmed descendant state');
  assert.equal(h.commands.length, 1); assert.equal(h.timers.size, 0);
});

test('taskkill timeouts are bounded and never produce a successful stop', async () => {
  const h = harness(); const stopping = h.stop();
  await h.poll(); await h.poll(); await h.poll(); await h.poll();
  assert.equal(await stopping, false); assert.equal(h.timers.size, 0);
});

test('successful tree command still fails if the root survives the deadline', async () => {
  const h = harness(); const stopping = h.stop();
  h.commands[0].emit('exit', 0); await flush(); await h.poll();
  h.commands[1].emit('exit', 0); await flush(); await h.poll();
  assert.equal(await stopping, false); assert.equal(h.timers.size, 0);
});

test('POSIX termination still checks the process group after its leader exits', async () => {
  const h = harness('linux'); h.exitRoot();
  assert.equal(await h.stop(), true);
  assert.ok(h.signals.some(([pid, signal]: any[]) => pid === -12345 && signal === 'SIGKILL'));
  assert.equal(h.commands.length, 0);
});
