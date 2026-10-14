import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
const app = process.env.EAC_NPM_RUNTIME_TEST_ROOT;
const options = { skip: !app && 'V4 requires EAC_NPM_RUNTIME_TEST_ROOT pointing to an assembled application tree', timeout: 60_000 };
const require = createRequire(path.join(app || path.join(import.meta.dirname, '..'), 'package.json'));
const manager = require('./lib/desktop/package-manager.js');
const updater = require('./updater.js');
const runtimeNode = app && path.join(app, 'vendor/node', process.platform === 'win32' ? 'node.exe' : 'node');

function write(file: string, content: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function hash(file: string): string { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function cli(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => execFile(runtimeNode!, [manager.bundledNpmCli(app), ...args],
    { cwd, env: process.env, windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
    (error, out, err) => error ? reject(new Error(String(error) + '\n' + err)) : resolve(out.trim())));
}
function workspace(t: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eac-npm-v4-'));
  const inheritedNpmConfig = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^npm_config_/i.test(key)));
  for (const key of Object.keys(inheritedNpmConfig)) delete process.env[key];
  const overrides: Record<string, string> = {
    NPM_CONFIG_USERCONFIG: path.join(root, '.npmrc'), NPM_CONFIG_GLOBALCONFIG: path.join(root, 'global.npmrc'),
    NPM_CONFIG_CACHE: path.join(root, 'cache'), NPM_CONFIG_UPDATE_NOTIFIER: 'false', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false',
    HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1',
    NPM_CONFIG_PROXY: 'http://127.0.0.1:1', NPM_CONFIG_HTTPS_PROXY: 'http://127.0.0.1:1',
    NPM_CONFIG_FETCH_RETRIES: '0', NPM_CONFIG_FETCH_TIMEOUT: '2000', NPM_CONFIG_NOPROXY: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost',
  };
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  write(overrides.NPM_CONFIG_USERCONFIG, 'audit=false\nfund=false\n'); write(overrides.NPM_CONFIG_GLOBALCONFIG, '');
  t.after(async () => {
    updater.abort();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    for (const key of Object.keys(process.env).filter(key => /^npm_config_/i.test(key))) delete process.env[key];
    Object.assign(process.env, inheritedNpmConfig);
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return root;
}

test('assembled npm CLI uses the exact reviewed version and an isolated configuration', options, async t => {
  const root = workspace(t);
  assert.equal(await cli(['--version'], root), manager.NPM_VERSION);
  assert.equal(await cli(['config', 'get', 'cache'], root), path.join(root, 'cache'));
});

test('real bundled npm supports updater view/install/rollback, failed CLI verification and offline install without hooks', options, async t => {
  const root = workspace(t), packages: Record<string, any> = {}, tarballs = new Map<string, Buffer>();
  const hookFile = path.join(root, 'forbidden-hook.txt');
  for (const version of ['1.0.1', '1.0.2', '1.0.3']) {
    const source = path.join(root, 'source-' + version);
    const pkg = { name: '@deepseek-ai/dsh', version, files: ['lib'], bin: { dsh: 'lib/bin.js' },
      scripts: { postinstall: 'node -e ' + JSON.stringify('require("node:fs").writeFileSync(' + JSON.stringify(hookFile) + ',"must not execute")') } };
    write(path.join(source, 'package.json'), JSON.stringify(pkg));
    write(path.join(source, 'lib/bin.js'), version === '1.0.2' ? 'require("./missing-dependency");' : 'console.log(' + JSON.stringify(version) + ');');
    const packed = JSON.parse(await cli(['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', root], source));
    const tarball = fs.readFileSync(path.join(root, packed[0].filename));
    tarballs.set('/' + packed[0].filename, tarball);
    packages[version] = { ...pkg, dist: { tarball: '', integrity: 'sha512-' + crypto.createHash('sha512').update(tarball).digest('base64') } };
  }
  // Packing seeds content-addressed cache; use a fresh cache to prove real HTTP tarball retrieval.
  process.env.NPM_CONFIG_CACHE = path.join(root, 'install-cache');
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '').split('?')[0]); requests.push(url);
    if (tarballs.has(url)) { res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(tarballs.get(url)); return; }
    if (url.toLowerCase() === '/@deepseek-ai/dsh') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: '@deepseek-ai/dsh',
        'dist-tags': { latest: '1.0.3' }, versions: packages })); return;
    }
    res.writeHead(404).end(JSON.stringify({ error: 'fixture route not found' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const registry = 'http://127.0.0.1:' + address.port;
  process.env.NPM_CONFIG_REGISTRY = registry;
  for (const version of Object.keys(packages)) packages[version].dist.tarball = registry + [...tarballs.keys()].find(name => name.includes(version));
  write(path.join(root, '.npmrc'), 'registry=' + registry + '\naudit=false\nfund=false\n');
  try {
    const data = path.join(root, '用户数据 with spaces'); fs.mkdirSync(data);
    const oldPackage = path.join(data, 'agent/node_modules/@deepseek-ai/dsh');
    write(path.join(oldPackage, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '1.0.0' }));
    write(path.join(oldPackage, 'lib/bin.js'), 'console.log("1.0.0");');
    const protectedFiles = [path.join(data, 'sessions/audit.jsonl'), path.join(data, 'skills/personal/SKILL.md'), path.join(data, 'profiles/cordis.yml')];
    for (const file of protectedFiles) write(file, 'user-owned fixture; never part of an npm program-tree swap');
    write(path.join(data, 'settings.json'), JSON.stringify({ customUserSetting: 'preserve' }));
    const protectedHashes = protectedFiles.map(hash);
    const logs: string[] = [], stages: string[] = [];
    const ctx = { userDataDir: data, nodeExe: () => runtimeNode!, npmCli: () => manager.bundledNpmCli(app), log: (_tag: string, message: string) => logs.push(message) };
    assert.equal(await updater.checkLatest(ctx), '1.0.3');
    const installed = await updater.applyUpdate(ctx, '1.0.1', { onProgress: (event: { stage: string }) => stages.push(event.stage) });
    assert.equal(installed.version, '1.0.1');
    assert.equal(JSON.parse(fs.readFileSync(path.join(oldPackage, 'package.json'), 'utf8')).version, '1.0.1');
    assert.equal(updater.overlayVersion(ctx), '1.0.1', 'live metadata must not reuse the previous require cache');
    assert.equal(updater.previousAgentInfo(ctx).version, '1.0.0');
    assert.ok(stages.includes('verify') && stages.includes('done'));
    assert.equal(fs.existsSync(hookFile), false);
    await updater.applyUpdate(ctx, '1.0.3');
    assert.equal(updater.overlayVersion(ctx), '1.0.3');
    assert.equal(updater.previousAgentInfo(ctx).version, '1.0.1');
    assert.equal(updater.rollbackToPrevious(ctx), '1.0.1');
    assert.equal(updater.overlayVersion(ctx), '1.0.1');
    const previousHash = hash(path.join(oldPackage, 'package.json'));
    await assert.rejects(updater.applyUpdate(ctx, '1.0.2'), /CLI 加载失败/);
    assert.equal(hash(path.join(oldPackage, 'package.json')), previousHash);
    assert.equal(fs.existsSync(path.join(data, 'agent-staging')), false);
    assert.deepEqual(protectedFiles.map(hash), protectedHashes);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8')).customUserSetting, 'preserve');
    assert.equal(fs.existsSync(hookFile), false);
    const beforeOffline = requests.length;
    const localTarball = path.join(root, [...tarballs.keys()].find(name => name.includes('1.0.1'))!.slice(1));
    await cli(['install', '--prefix', path.join(root, 'offline target'), localTarball, '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], root);
    assert.equal(requests.length, beforeOffline);
    assert.equal(fs.existsSync(hookFile), false);
    assert.ok(logs.some(line => line.includes('依赖闭包与 CLI 加载验证通过')));
    assert.ok(requests.some(url => url.includes('1.0.1.tgz')) && requests.some(url => url.includes('1.0.2.tgz')));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('reviewed npm private libraries retain ordinary behavior and bound deep brace input', options, async t => {
  const root = workspace(t);
  const npmRequire = createRequire(path.join(app!, 'vendor/npm/package.json'));
  const brace = npmRequire('brace-expansion').expand;
  assert.deepEqual(brace('pkg-{a,b}'), ['pkg-a', 'pkg-b']);
  assert.equal(new (npmRequire('ip-address').Address6)('2001:db8::1').correctForm(), '2001:db8::1');
  assert.equal(npmRequire('postcss-selector-parser')().astSync('.audit > #fixture').toString(), '.audit > #fixture');
  const script = 'const expand=require(' + JSON.stringify(npmRequire.resolve('brace-expansion')) + ').expand;const r=expand("{".repeat(4000)+"a,b"+"}".repeat(4000));if(!Array.isArray(r))process.exit(2);';
  await new Promise<void>((resolve, reject) => execFile(runtimeNode!, ['--max-old-space-size=96', '-e', script],
    { cwd: root, windowsHide: true, timeout: 3000 }, (error, _out, err) => error ? reject(new Error(String(error) + err)) : resolve()));
});
