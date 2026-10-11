import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function harness(blockedPort = 0) {
  const require = createRequire(import.meta.url);
  const exports: any = {};
  const stops: any[] = [];
  const children: any[] = [];
  const requests: any[] = [];
  const deaths: any[] = [];
  const stopResult = deferred<boolean>();
  const port = deferred<number>();
  let quitting = false;
  let choosing = false;
  const source = stripTypeScriptTypes(readFileSync(new URL('../lib/desktop/boot-server.ts', import.meta.url), 'utf8'), { mode: 'transform' })
    .replace(/^export /gm, '')
    .replace("import { writeFileAtomic } from '../atomic-json';", "const { writeFileAtomic } = require('../atomic-json');");
  runInNewContext(source + '\nObject.assign(exports, {init, stopServer, startAndWait, killAndWaitForRestart, getServerProc, state, waitUntilUp, seed: p => {serverProc = p;}});', {
    exports, Buffer, URL, process, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name === './proc') return {
        killTree: () => {}, waitForProcExit: () => Promise.resolve(),
        killTreeAndWait: (child: any) => { stops.push(child); return stopResult.promise; },
        childEnv: () => ({}), childProcessSpawnOptions: () => ({detached: false}),
      };
      if (name === '../../stable-port') return { restrictedPortOf: (url: string) => blockedPort && url.includes(':' + blockedPort) ? blockedPort : 0, chooseStableWebPort: () => { choosing = true; return port.promise; } };
      if (name === '../atomic-json') return { writeFileAtomic: () => {} };
      if (name === 'node:child_process') return { spawn: () => { const child = Object.assign(new EventEmitter(), { pid: 200 + children.length, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() }); children.push(child); return child; } };
      if (name === 'node:fs') return { existsSync: () => true, readFileSync: () => '', statSync: () => ({size: 0}), mkdirSync: () => {}, createWriteStream: () => new EventEmitter() };
      if (name === '../../stream-write-guard') return { createStreamWriteGuard: () => ({write: () => true, end: () => {}}) };
      if (name === 'node:http') return { get: (_url: string, _options: any, callback: any) => {
        const request = Object.assign(new EventEmitter(), {destroy: () => {}});
        requests.push({request, ready: (code = 200) => callback({resume: () => {}, statusCode: code})});
        return request;
      } };
      return require(name);
    },
  });
  exports.init({ log: () => {}, getUserDataDir: () => 'fixture', getDesktopProfile: () => 'fixture', desktopProfileDir: () => 'fixture', nodeExe: () => 'node', dshBin: () => 'bin', dshCli: () => 'carrier', loadSettings: () => ({}), saveSettings: () => {}, isQuitting: () => quitting, onServerDied: (info: any) => deaths.push(info) });
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null });
  return { exports, child, stops, children, requests, deaths, stopResult, port, get choosing() { return choosing; }, quit: () => { quitting = true; } };
}

test('stop retains the child identity until termination is confirmed', async () => {
  const h = harness(); h.exports.seed(h.child);
  const stopping = h.exports.stopServer();
  assert.equal(h.exports.getServerProc(), h.child);
  assert.equal(h.exports.state().running, true);
  h.stopResult.resolve(true); await stopping;
  assert.equal(h.exports.getServerProc(), null);
});

test('failed stop rejects and retains the process handle for diagnosis/retry', async () => {
  const h = harness(); h.exports.seed(h.child);
  const stopping = h.exports.stopServer(); h.stopResult.resolve(false);
  await assert.rejects(stopping, /service-stop-unconfirmed/);
  assert.equal(h.exports.getServerProc(), h.child);
  assert.equal(h.exports.state().running, true);
});

test('concurrent stops share one termination attempt', async () => {
  const h = harness(); h.exports.seed(h.child);
  const a = h.exports.stopServer(); const b = h.exports.stopServer();
  assert.equal(h.stops.length, 1);
  h.stopResult.resolve(true); await Promise.all([a, b]);
});

test('restart stop uses the same strict termination path', async () => {
  const h = harness(); h.exports.seed(h.child);
  const stopping = h.exports.killAndWaitForRestart(); h.stopResult.resolve(false);
  await assert.rejects(stopping, /service-stop-unconfirmed/);
  assert.equal(h.exports.getServerProc(), h.child);
  assert.equal(h.stops.length, 1);
});

test('new start cannot pass an unconfirmed old process stop', async () => {
  const h = harness(); h.exports.seed(h.child);
  const starting = h.exports.startAndWait(); h.stopResult.resolve(false);
  await assert.rejects(starting, /service-stop-unconfirmed/);
  assert.equal(h.choosing, false);
  assert.equal(h.children.length, 0);
});

test('quitting during asynchronous port selection prevents spawn', async () => {
  const h = harness(); const starting = h.exports.startAndWait();
  assert.equal(h.choosing, true); h.quit(); h.port.resolve(19000);
  await assert.rejects(starting, /应用正在退出/);
  assert.equal(h.children.length, 0);
});

test('stop during port selection invalidates the pending start', async () => {
  const h = harness(); const starting = h.exports.startAndWait();
  const stopping = h.exports.stopServer(); h.stopResult.resolve(true); await stopping;
  h.port.resolve(19000);
  await assert.rejects(starting, /service-start-cancelled/);
  assert.equal(h.children.length, 0);
});

test('concurrent starts fail busy before creating a second process', async () => {
  const h = harness(); const starting = h.exports.startAndWait();
  await assert.rejects(h.exports.startAndWait(), /service-busy/);
  h.quit(); h.port.resolve(19000); await assert.rejects(starting);
  assert.equal(h.children.length, 0);
});

test('readiness probing exits immediately when application is quitting', async () => {
  const h = harness(); h.quit();
  await assert.rejects(h.exports.waitUntilUp('http://127.0.0.1:19000'), /应用正在退出/);
});

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('timeout and error on one readiness request schedule only one retry', async () => {
  const h = harness(); const waiting = h.exports.waitUntilUp('http://127.0.0.1:19000');
  const rejected = assert.rejects(waiting, /应用正在退出/);
  h.requests[0].request.emit('timeout'); h.requests[0].request.emit('error', new Error('same timeout'));
  await new Promise(r => setTimeout(r, 350)); assert.equal(h.requests.length, 2);
  h.quit(); h.requests[1].request.emit('error', new Error('cancel'));
  await rejected;
});

test('late successful callback after request timeout cannot mark readiness', async () => {
  const h = harness(); const waiting = h.exports.waitUntilUp('http://127.0.0.1:19000');
  const rejected = assert.rejects(waiting, /应用正在退出/);
  h.requests[0].request.emit('timeout'); h.requests[0].ready(); h.quit();
  await rejected; assert.equal(h.requests.length, 1);
});

test('stop invalidates readiness even if the old HTTP request later succeeds', async () => {
  const h = harness(); const waiting = h.exports.waitUntilUp('http://127.0.0.1:19000');
  const rejected = assert.rejects(waiting, /service-start-cancelled/);
  await h.exports.stopServer(); h.requests[0].ready(); await rejected;
});

test('completed readiness ignores late timeout and error without scheduling retry', async () => {
  const h = harness(); const waiting = h.exports.waitUntilUp('http://127.0.0.1:19000');
  h.requests[0].ready(); assert.equal(await waiting, 'http://127.0.0.1:19000');
  h.requests[0].request.emit('timeout'); h.requests[0].request.emit('error', new Error('late'));
  await new Promise(r => setTimeout(r, 350)); assert.equal(h.requests.length, 1);
});

test('intentional stop does not report a false service crash while retaining identity', async () => {
  const h = harness(); const starting = h.exports.startAndWait(); h.port.resolve(19000); await flush();
  h.children[0].stdout.emit('data', Buffer.from('dsh web: http://127.0.0.1:19000\n')); await flush();
  h.requests.at(-1).ready(); await starting;
  const stopping = h.exports.stopServer(); h.children[0].exitCode = 0; h.children[0].emit('exit', 0, null);
  assert.equal(h.exports.getServerProc(), h.children[0]); assert.equal(h.deaths.length, 0);
  h.stopResult.resolve(true); await stopping; assert.equal(h.exports.getServerProc(), null);
  h.requests[0].request.emit('error', new Error('stopped probe'));
});

test('restricted-port retry never launches another process after a failed stop', async () => {
  const h = harness(6667); const starting = h.exports.startAndWait();
  const rejected = assert.rejects(starting, /service-stop-unconfirmed/);
  h.port.resolve(19000); await flush();
  h.children[0].stdout.emit('data', Buffer.from('dsh web: http://127.0.0.1:6667\n'));
  h.stopResult.resolve(false); await rejected;
  assert.equal(h.children.length, 1); assert.equal(h.exports.getServerProc(), h.children[0]);
  h.requests[0].request.emit('error', new Error('stopped probe'));
});

test('tree stop pending after root exit still blocks configuration writes through running state', async () => {
  const h = harness(); h.exports.seed(h.child);
  const stopping = h.exports.stopServer(); h.child.exitCode = 0;
  assert.equal(h.exports.state().running, true, 'root exit is not yet confirmed tree exit');
  h.stopResult.resolve(true); await stopping;
  assert.equal(h.exports.state().running, false);
});

test('unconfirmed tree stop remains conservatively running after the root has exited', async () => {
  const h = harness(); h.exports.seed(h.child);
  const stopping = h.exports.stopServer(); h.child.exitCode = 0; h.stopResult.resolve(false);
  await assert.rejects(stopping, /service-stop-unconfirmed/);
  assert.equal(h.exports.state().running, true, 'guard restore must not use a false running state as a write permit');
});

test('total startup deadline invalidates a late asynchronous port choice', async () => {
  const h = harness();const starting = h.exports.startAndWait([], 1);
  await assert.rejects(starting,/service-start-timeout/);h.port.resolve(19000);await flush();
  assert.equal(h.children.length,0);
});
