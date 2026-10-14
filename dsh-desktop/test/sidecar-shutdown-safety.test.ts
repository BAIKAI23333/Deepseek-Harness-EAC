import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';

async function shutdown(stop: () => Promise<void>, mutation: Promise<unknown> | null = null, instantTimeout = false) {
  const source = readFileSync(new URL('../../tauri-shell/sidecar/server.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function gracefulExit()');
  const end = source.indexOf('async function handleLine(', start);
  assert.ok(start >= 0 && end > start);
  const code = stripTypeScriptTypes(source.slice(start, end), {mode: 'transform'});
  const exits: number[] = []; const logs: string[] = [];
  let watcherStopped = 0;
  const context: any = {quitting: false, activeMutation: mutation ? {key: "guard.action:restore", promise: mutation} : null, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, instantTimeout ? 0 : ms), clearTimeout, sessionWatcher: {stop: () => {watcherStopped++;}},
    bootMod: {stopServer: stop}, log: (tag: string, text: string) => logs.push(tag + ':' + text),
    process: {exit: (code: number) => exits.push(code)},
  };
  runInNewContext(code + '\nthis.run = gracefulExit;', context);
  await context.run();
  return {exits, logs, watcherStopped, quitting: context.quitting};
}

test('sidecar shutdown succeeds only after the service stop settles', async () => {
  let stopped = false;
  const result = await shutdown(async () => { await Promise.resolve(); stopped = true; });
  assert.equal(stopped, true); assert.deepEqual(result.exits, [0]);
  assert.equal(result.watcherStopped, 1); assert.equal(result.quitting, true);
});

test('sidecar shutdown surfaces an unconfirmed stop without persisting raw errors', async () => {
  const result = await shutdown(async () => { throw new Error('token=synthetic-private-detail'); });
  assert.deepEqual(result.exits, [1]); assert.deepEqual(result.logs, ['shutdown:service-stop-unconfirmed']);
  assert.equal(result.quitting, true); assert.equal(result.watcherStopped, 1);
});

test('sidecar shutdown waits for in-flight restore settlement after stopping the kernel',async()=>{
  let complete!:()=>void;const pending=new Promise<void>(r=>{complete=r;});let settled=false;
  const exiting=shutdown(async()=>{setImmediate(complete);},pending).then(r=>{settled=true;return r;});
  assert.equal(settled,false);const result=await exiting;assert.deepEqual(result.exits,[0]);
});
test('sidecar shutdown reports a bounded failure when a mutation cannot settle',async()=>{
  const result=await shutdown(async()=>{},new Promise(()=>{}),true);
  assert.deepEqual(result.exits,[1]);assert.deepEqual(result.logs,['shutdown:mutation-shutdown-timeout']);
});
