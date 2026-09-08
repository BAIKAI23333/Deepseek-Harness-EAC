import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtimePaths = require('../lib/desktop/runtime-paths.js') as {
  init(ctx: {
    log(tag: string, message: string): void;
    getUserDataDir(): string;
    isPackaged(): boolean;
    resourcesPath(): string;
    appRoot(): string;
    platform: NodeJS.Platform;
  }): void;
  ensureHealthyOverlay(timeoutMs?: number): Promise<{ source: 'overlay' | 'bundled'; reason?: string }>;
  dshBin(): string;
};

function makeOverlay(userDataDir: string, version: string, binSource: string): string {
  const pkg = path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh');
  fs.mkdirSync(path.join(pkg, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }));
  const bin = path.join(pkg, 'lib', 'bin.js');
  fs.writeFileSync(bin, binSource);
  return bin;
}

function init(userDataDir: string, logs: string[]): void {
  const appRoot = path.join(userDataDir, 'app-root');
  const runtimeDir = path.join(appRoot, 'vendor', 'node');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node'));
  runtimePaths.init({
    log: (tag, message) => logs.push(`[${tag}] ${message}`),
    getUserDataDir: () => userDataDir,
    isPackaged: () => false,
    resourcesPath: () => '',
    appRoot: () => appRoot,
    platform: process.platform,
  });
}

test('健康 overlay 首次探测成功后写入标记并参与启动', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-health-ok-'));
  const logs: string[] = [];
  const bin = makeOverlay(userDataDir, '9.9.9', "console.log('9.9.9');\n");
  init(userDataDir, logs);

  assert.notEqual(runtimePaths.dshBin(), bin, '未经探测的 overlay 不得直接参与启动');
  assert.deepEqual(await runtimePaths.ensureHealthyOverlay(5_000), { source: 'overlay' });
  assert.equal(runtimePaths.dshBin(), bin);
  const marker = JSON.parse(fs.readFileSync(path.join(userDataDir, 'agent', '.eac-agent-health.json'), 'utf8'));
  assert.equal(marker.version, '9.9.9');
  assert.ok(logs.some((line) => line.includes('启动探测通过')));
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('缺失运行时依赖的 overlay 被隔离并自动回退内置版本', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-health-bad-'));
  const logs: string[] = [];
  makeOverlay(userDataDir, '9.9.9', "require('@deepseek-ai/definitely-missing');\n");
  init(userDataDir, logs);

  const result = await runtimePaths.ensureHealthyOverlay(5_000);
  assert.equal(result.source, 'bundled');
  assert.match(result.reason || '', /definitely-missing|Cannot find module|MODULE_NOT_FOUND/);
  assert.equal(fs.existsSync(path.join(userDataDir, 'agent')), false);
  assert.ok(fs.readdirSync(userDataDir).some((name) => name.startsWith('agent-broken-')));
  assert.ok(!runtimePaths.dshBin().includes(userDataDir), '隔离后必须回退随包内核');
  assert.ok(logs.some((line) => line.includes('启动探测失败')));
  fs.rmSync(userDataDir, { recursive: true, force: true });
});
