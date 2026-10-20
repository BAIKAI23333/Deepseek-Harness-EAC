import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// Execute the recovery page's actual inline functions, not a copied implementation.
function page(invoke: (...args: any[]) => any) {
  const rust = readFileSync(new URL('../../tauri-shell/src/main.rs', import.meta.url), 'utf8');
  const body = rust.slice(rust.indexOf('fn died_page('));
  const literal = body.match(/("<!doctype(?:\\[\s\S]|[^"\\])*")/);
  assert.ok(literal);
  const html = JSON.parse(literal[1].replace(/\\\r?\n/g, ''));
  const start = html.indexOf('function setEnvState');
  assert.ok(start > 0);
  const script = html.slice(start, html.indexOf('</script>', start))
    .replace(/\{(\d+):\?\}/g, (_, n) => JSON.stringify('message-' + n))
    .replaceAll('{{', '{').replaceAll('}}', '}');
  const elements = new Map<string, any>();
  for (const id of ['env-panel', 'env-summary', 'env-problems', 'env-purge', 'env-hint']) {
    elements.set(id, { textContent: '', disabled: false, attributes: {}, children: [],
      setAttribute(k: string, v: string) { this.attributes[k] = v; },
      appendChild(el: any) { this.children.push(el); },
    });
  }
  const restart = { textContent: '', disabled: false, attributes: {}, setAttribute(k: string, v: string) { this.attributes[k] = v; } };
  const context = vm.createContext({
    window: { dshShell: { invoke }, dshDesktop: { _call: async () => ({ ok: true }) }, confirm: () => true },
    document: { getElementById: (id: string) => elements.get(id), createElement: () => ({ setAttribute() {} }), querySelector: () => restart },
    location: { reload() {} },
  });
  vm.runInContext(script, context);
  return { elements, context, restart };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const diagnosis = { expectedRoot: 'C:/audit/env', registered: true, removable: true, problems: [] };

test('failed diagnosis cannot be displayed as healthy or offer deletion', async () => {
  const { elements } = page(async () => ({ ok: false, error: 'registry unreadable' }));
  await tick();
  assert.equal(elements.get('env-panel').attributes['data-state'], 'unavailable');
  assert.match(elements.get('env-summary').textContent, /registry unreadable/);
  assert.equal(elements.get('env-purge').disabled, true);
  assert.equal(elements.get('env-purge').attributes['data-state'], 'hidden');
  assert.equal(elements.get('env-hint').attributes['data-state'], 'hidden');
});

test('empty and malformed diagnosis responses fail closed', async () => {
  for (const res of [{ ok: true }, {}, { ok: true, diagnosis: {} },
    { ok: true, diagnosis: { ...diagnosis, problems: null } },
    { ok: true, diagnosis: { ...diagnosis, expectedRoot: '' } },
  ]) {
    const { elements } = page(async () => res);
    await tick();
    assert.equal(elements.get('env-panel').attributes['data-state'], 'unavailable');
    assert.equal(elements.get('env-purge').disabled, true);
  }
});

test('valid healthy and damaged diagnoses keep their actual state', async () => {
  const healthy = page(async () => ({ ok: true, diagnosis }));
  await tick();
  assert.equal(healthy.elements.get('env-panel').attributes['data-state'], 'healthy');
  assert.equal(healthy.elements.get('env-purge').disabled, false);
  const damaged = page(async () => ({ ok: true, diagnosis: { ...diagnosis, registered: false,
    removable: false, problems: [{ code: 'manifest-missing', text: 'manifest missing' }] } }));
  await tick();
  assert.equal(damaged.elements.get('env-panel').attributes['data-state'], 'damaged');
  assert.equal(damaged.elements.get('env-purge').disabled, true);
});

test('rejected diagnosis clears previously enabled destructive controls', async () => {
  let calls = 0;
  const { context, elements } = page(async () => {
    if (calls++ === 0) return { ok: true, diagnosis };
    throw new Error('bridge unavailable');
  });
  await tick();
  assert.equal(elements.get('env-purge').disabled, false);
  vm.runInContext('refreshEnvironment()', context);
  await tick();
  assert.equal(elements.get('env-panel').attributes['data-state'], 'unavailable');
  assert.equal(elements.get('env-purge').disabled, true);
});

test('cleanup returning ok:false must not reload or report success', async () => {
  const { context, elements } = page(async (method: string) => method === 'diagnose_environment'
    ? { ok: true, diagnosis } : { ok: false, error: 'environment is locked' });
  await tick();
  let reloaded = false;
  context.location.reload = () => { reloaded = true; };
  vm.runInContext('purgeEnvironment()', context);
  await tick();
  assert.equal(reloaded, false);
  assert.equal(elements.get('env-purge').attributes['data-state'], 'error');
  assert.match(elements.get('env-summary').textContent, /environment is locked/);
});


test('restart success must not reload the obsolete failure page after native navigation', async () => {
  const { context, restart } = page(async () => ({ ok: true, diagnosis }));
  let reloaded = false;
  context.location.reload = () => { reloaded = true; };
  vm.runInContext('retry()', context);
  await tick();
  assert.equal(reloaded, false, 'boot.web-ready owns navigation; reloading can return to /died');
  assert.equal(restart.disabled, true);
});

test('restart failure restores an actionable retry button', async () => {
  const { context, restart } = page(async () => ({ ok: true, diagnosis }));
  context.window.dshDesktop._call = async () => ({ ok: false, error: 'boot failed' });
  vm.runInContext('retry()', context);
  await tick();
  assert.equal(restart.disabled, false);
  assert.equal(restart.attributes['data-state'], 'error');
});
