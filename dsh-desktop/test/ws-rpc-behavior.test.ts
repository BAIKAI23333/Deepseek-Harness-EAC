import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function clientHarness() {
  const timers = new Map<number, { fn: () => void; delay: number }>();
  const listeners = new Map<string, () => void>();
  const sockets: Socket[] = [];
  let nextTimer = 0;
  class Socket {
    onopen!: () => void;
    onclose!: () => void;
    onmessage!: (event: { data: string }) => void;
    onerror!: () => void;
    sent: Array<{ id?: number; method: string }> = [];
    constructor(_url: string) { sockets.push(this); }
    send(frame: string) { this.sent.push(JSON.parse(frame)); }
    close() { this.onclose(); }
  }
  const window: any = {
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
  };
  runInNewContext(readFileSync(new URL('../assets/ws-jsonrpc-client.js', import.meta.url), 'utf8'), {
    window, WebSocket: Socket,
    setTimeout: (fn: () => void, delay: number) => {
      const id = ++nextTimer;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const rpc = window.__DSH_WS_RPC__({ timeoutMs: 50 });
  return {
    rpc, sockets, timers,
    connect: () => { listeners.get('DOMContentLoaded')!(); return sockets.at(-1)!; },
    fire: (delay: number) => {
      const entry = [...timers].find(([, value]) => value.delay === delay);
      assert.ok(entry, 'expected timer with delay ' + delay);
      timers.delete(entry[0]);
      entry[1].fn();
    },
  };
}

test('offline RPC that has timed out is never replayed when the bridge connects', async () => {
  const h = clientHarness();
  const expired = assert.rejects(h.rpc.call('files.revert', { changes: [] }), /bridge call timeout/);
  h.fire(50);
  await expired;
  const socket = h.connect();
  socket.onopen();
  assert.equal(socket.sent.length, 0, 'timed-out mutation must not execute later');
});

test('a live queued RPC is delivered once and its timer is cleared on reply', async () => {
  const h = clientHarness();
  const response = h.rpc.call('shell.info');
  const socket = h.connect();
  socket.onopen();
  assert.equal(socket.sent.length, 1);
  socket.onmessage({ data: JSON.stringify({ id: socket.sent[0]!.id, result: 'ok' }) });
  assert.equal(await response, 'ok');
  assert.equal(h.timers.size, 0);
});

test('expired and live queued RPCs stay distinct when the bridge connects', async () => {
  const h = clientHarness();
  const expired = assert.rejects(h.rpc.call('files.revert', {}, 10), /bridge call timeout/);
  const live = h.rpc.call('shell.info');
  h.fire(10);
  await expired;
  const socket = h.connect();
  socket.onopen();
  assert.deepEqual(socket.sent.map(frame => frame.method), ['shell.info']);
  socket.onmessage({ data: JSON.stringify({ id: socket.sent[0]!.id, result: 'ok' }) });
  assert.equal(await live, 'ok');
});

test('disconnect rejects in-flight RPCs but reconnect preserves live unsent calls', async () => {
  const h = clientHarness();
  const socket = h.connect();
  socket.onopen();
  const disconnected = assert.rejects(h.rpc.call('service.restart'), /bridge disconnected/);
  socket.onclose();
  await disconnected;
  const queued = h.rpc.call('shell.info');
  h.fire(1500);
  const next = h.sockets.at(-1)!;
  next.onopen();
  assert.deepEqual(next.sent.map(frame => frame.method), ['shell.info']);
  next.onmessage({ data: JSON.stringify({ id: next.sent[0]!.id, result: 'reconnected' }) });
  assert.equal(await queued, 'reconnected');
  assert.equal(h.timers.size, 0);
});
