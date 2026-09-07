import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANION_PLUGINS,
  RETIRED_BUILTIN_PLUGINS,
} from '../lib/desktop/companion-sync.js';
import { pluginCapabilityDetails } from '../lib/desktop/platform.js';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = join(ROOT, 'assets', 'plugins', 'dsh-stt');

function text(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8');
}

function hasNativeBinary(dir: string): boolean {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.(node|dll)$/i.test(e.name)) return true;
    }
  }
  return false;
}

test('dsh-stt is registered disabled-by-default and removed from the retired list', () => {
  const entry = COMPANION_PLUGINS.find((p) => p.id === 'dsh-stt');
  assert.ok(entry, 'COMPANION_PLUGINS 必须注册 dsh-stt');
  assert.equal(entry.name, '@deepseek-ai/dsh-stt');
  assert.equal(entry.dir, 'dsh-stt');
  assert.equal(entry.disabled, true, '默认禁用：启用后才下载 SenseVoice 模型');

  assert.equal(
    RETIRED_BUILTIN_PLUGINS.some((p) => p.id === 'dsh-stt'),
    false,
    'dsh-stt 恢复内置后不得留在退役清单（启动清理会剥掉注册行与包副本）',
  );
});

test('dsh-stt ASR engine is gated to Windows in the platform capability map', () => {
  assert.equal(pluginCapabilityDetails('win32')['dsh-stt']?.status, 'supported');
  assert.equal(pluginCapabilityDetails('darwin')['dsh-stt']?.status, 'unavailable');
  assert.equal(pluginCapabilityDetails('linux')['dsh-stt']?.status, 'unavailable');
});

test('bundled dsh-stt keeps the host/client contract and its vendored engine', () => {
  const pkg = JSON.parse(text(PLUGIN, 'package.json'));
  assert.equal(pkg.name, '@deepseek-ai/dsh-stt');
  assert.equal(pkg.version, '0.2.0');
  assert.equal(pkg.main, 'src/index.js');
  assert.ok(existsSync(join(PLUGIN, 'src', 'index.js')), 'host 入口必须随包');
  assert.ok(existsSync(join(PLUGIN, 'client.js')), 'client bundle 必须随包');

  assert.match(text(PLUGIN, 'cordis.patch.yml'), /id:\s*dsh-stt/, 'bundle patch 行声明 dsh-stt');

  assert.ok(existsSync(join(PLUGIN, 'node_modules', 'sherpa-onnx-node')), '引擎装载器随包');
  const native = join(PLUGIN, 'node_modules', 'sherpa-onnx-win-x64');
  assert.ok(existsSync(native), 'win-x64 原生包随包（插件安装不执行 npm install）');
  assert.ok(hasNativeBinary(native), '原生二进制（.node/.dll）随包');
});
