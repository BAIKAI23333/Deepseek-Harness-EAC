// Spy preload v2: wrap BOTH internal loader resolve + resolveSync, log calls. No main import here
// (node runs bin.js as main after preloads).
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
const req = createRequire('D:/DeepSeek Harness/dsh max/dsh_desktop/tauri-shell/staged-resources/dsh-desktop/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js');
const LOG = 'D:/tmp/pack-smoke2/diag/spy.log';
try {
  const addon = req('node-addon-require-builtin');
  const esm = addon.requireBuiltin('internal/modules/esm/loader').getOrInitializeCascadedLoader();
  const describe = (a) => {
    if (a === null || a === undefined) return String(a);
    if (typeof a === 'string') return a.length > 150 ? a.slice(0, 70) + '…' + a.slice(-60) : a;
    if (typeof a === 'object') {
      const o = { keys: Object.keys(a).slice(0, 8) };
      if (typeof a.specifier === 'string') o.specifier = a.specifier;
      if (typeof a.parentURL === 'string') o.parentURL = '…' + a.parentURL.slice(-70);
      return o;
    }
    return typeof a;
  };
  let n = 0;
  const wrap = (name, orig) => function (...args) {
    const id = ++n;
    const tag = `#${id} ${name} ` + JSON.stringify(args.map(describe)).slice(0, 500);
    try {
      const r = Reflect.apply(orig, this, args);
      appendFileSync(LOG, tag + '\n  → OK ' + String(r?.url ?? r).slice(-110) + '\n');
      return r;
    } catch (e) {
      appendFileSync(LOG, tag + '\n  → ERR ' + (e.code ?? '') + ' ' + String(e.message).split('\n')[0] + '\n');
      throw e;
    }
  };
  esm.resolve = wrap('resolve', esm.resolve);
  esm.resolveSync = wrap('resolveSync', esm.resolveSync);
  appendFileSync(LOG, '--- spy v2 installed ---\n');
} catch (e) {
  try { appendFileSync(LOG, '--- spy v2 FAILED: ' + e.message + ' ---\n'); } catch {}
}
