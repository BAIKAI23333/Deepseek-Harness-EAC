import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { apply } from '../assets/plugins/dsh-easy-setup/lib/index.js';

test('easy-setup host and browser descriptors register with the pinned Typert runtime', async () => {
  const home = mkdtempSync(join(tmpdir(), 'eac-easy-setup-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const ctx = new Context();
  const registry = new TypertRegistry(ctx);
  const disposers: (() => void)[] = [];
  try {
    apply({ plugin(Gateway) { new Gateway(ctx); } });
    const host = registry.local.list();
    assert.equal(host.length, 6, 'all host methods must register without swallowed errors');

    let client;
    runInNewContext(readFileSync(new URL('../assets/plugins/dsh-easy-setup/lib/client.js', import.meta.url), 'utf8'), {
      window: { __ModuleLoader__: { load(bundle) {
        client = bundle.factory((id) => {
          assert.equal(id, 'react');
          return { createElement() {} };
        });
      } } },
      console,
    });
    let mounted;
    client.apply({
      locale: { bind: () => (key) => key, register() {} },
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
      remote: { $mount(contribution) {
        mounted = contribution;
        return Promise.resolve(registry.remotes.register(contribution));
      } },
      slots: { inject() {} },
    }, {});
    await Promise.resolve();
    assert.deepEqual(Array.from(mounted.descriptors, (d) => d.method), host.map((d) => d.method));
    for (const descriptor of [...host, ...mounted.descriptors]) {
      for (const codec of [descriptor.result, ...descriptor.parameters.map((p) => p.codec)]) {
        const value = { content: 'persona test', ok: true };
        assert.equal(codec.create().parse(value), value, 'preserve the existing JSON passthrough contract');
      }
    }
  } finally {
    for (const dispose of disposers.reverse()) dispose();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});
