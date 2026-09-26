import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 内核服务面漂移门禁。M0 把内核钉版升到 0.1.7-rc.2 时，上游移除了
// `settingsScope` cordis 服务（0.1.3 由 ui-settings 域提供，rc2 换成
// `settingsSchema`/`configForms`），而 Task 3.3 接回的 dsh-compact /
// dsh-easy-setup 仍 inject 它 —— 两入口永不激活，web boot 直接给出
// "entries did not activate" 失败屏（此前冒烟只断言服务端 200，从未在
// 真实浏览器渲染过，故未暴露）。本测试保证：随包插件 client inject 的
// 每个服务都必须仍由当前内核（node_modules @deepseek-ai/*）或 EAC 自有
// 插件提供；内核再升级时先跑本门禁，防同类静默失活。

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), 'utf8');

function collectKernelServices(): Set<string> {
  const services = new Set<string>(['timer']);
  const base = join(root, 'dsh-desktop', 'node_modules', '@deepseek-ai');
  for (const pkg of readdirSync(base)) {
    const libDir = join(base, pkg, 'lib');
    if (!existsSync(libDir)) continue;
    for (const file of readdirSync(libDir)) {
      if (!file.endsWith('.js')) continue;
      const text = readFileSync(join(libDir, file), 'utf8');
      // cordis Service 子类在构造器里声明服务名：super(ctx, "name")
      for (const m of text.matchAll(/super\(ctx,\s*"([A-Za-z][\w.]*)"\)/g)) services.add(m[1]);
      // client runner 的服务目录（key/summary 对）与 provide() 直注服务
      if (pkg === 'dsh-cordis-client-runner') {
        for (const m of text.matchAll(/key:\s*"([A-Za-z][\w.]*)",\s*\n\s*summary:/g)) services.add(m[1]);
        for (const m of text.matchAll(/provide\("([A-Za-z][\w.]*)"/g)) services.add(m[1]);
      }
    }
  }
  return services;
}

function collectEacPluginServices(): Set<string> {
  const services = new Set<string>();
  const pluginsDir = join(root, 'dsh-desktop', 'assets', 'plugins');
  for (const dir of readdirSync(pluginsDir)) {
    const client = join(pluginsDir, dir, 'lib', 'client.js');
    if (!existsSync(client)) continue;
    const text = read('dsh-desktop', 'assets', 'plugins', dir, 'lib', 'client.js');
    for (const m of text.matchAll(/SERVICE_NAME\s*=\s*"([A-Za-z][\w.]*)"/g)) services.add(m[1]);
  }
  return services;
}

const kernelServices = collectKernelServices();
const eacServices = collectEacPluginServices();

test('内核服务清单覆盖 rc2 已知面（settingsSchema/configForms 在、settingsScope 不在）', () => {
  for (const service of ['slots', 'locale', 'theme', 'configForms', 'settingsSchema', 'remote']) {
    assert.ok(kernelServices.has(service), `内核应提供服务 ${service}`);
  }
  assert.ok(!kernelServices.has('settingsScope'), '0.1.7-rc.2 已移除 settingsScope，清单不得再收录');
});

test('随包插件 client inject 只消费内核或 EAC 自有插件提供的服务', () => {
  const pluginsDir = join(root, 'dsh-desktop', 'assets', 'plugins');
  const failures: string[] = [];
  for (const dir of readdirSync(pluginsDir)) {
    const client = join(pluginsDir, dir, 'lib', 'client.js');
    if (!existsSync(client)) continue;
    const text = read('dsh-desktop', 'assets', 'plugins', dir, 'lib', 'client.js');
    for (const list of text.matchAll(/\binject\s*[:=]\s*\[([^\]]*)\]/g)) {
      for (const name of list[1].matchAll(/["']([^"']+)["']/g)) {
        const service = name[1];
        if (service === 'remote' || service.startsWith('remote.')) continue; // host 注入面
        if (kernelServices.has(service) || eacServices.has(service)) continue;
        failures.push(`${dir}: inject "${service}" 无提供方`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('回归钉死：dsh-compact / dsh-easy-setup 不再引用已移除的 settingsScope', () => {
  for (const dir of ['dsh-compact', 'dsh-easy-setup']) {
    const text = read('dsh-desktop', 'assets', 'plugins', dir, 'lib', 'client.js');
    assert.doesNotMatch(text, /ctx\.settingsScope/, `${dir} 不得再调用 ctx.settingsScope`);
    assert.doesNotMatch(text, /["']settingsScope["']/, `${dir} 的 inject 清单不得再含 settingsScope`);
  }
});

test('dsh-compact 经 configForms 读写设置（与 rc2 ConfigFormController 同构面）', () => {
  const text = read('dsh-desktop', 'assets', 'plugins', 'dsh-compact', 'lib', 'client.js');
  assert.match(text, /ctx\.configForms\.get\(NS\)/);
  assert.match(text, /inject:\s*\['slots',\s*'configForms'\]/);
});
