import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const bridge = readFileSync(new URL('../../tauri-shell/sidecar/bridge.ts', import.meta.url), 'utf8');
const kernel = readFileSync(new URL('../node_modules/@deepseek-ai/dsh-client-locale/lib/client.js', import.meta.url), 'utf8');
let localePlugin: any;
runInNewContext(kernel, { window: { __ModuleLoader__: { load(plugin: any) { localePlugin = plugin; } } } });
// LocaleRuntime is the installed pinned kernel implementation. Its React UI and
// store registration dependencies are unused by these initialization checks.
const { LocaleRuntime } = localePlugin.factory((name: string) => name === '@deepseek-ai/dsh-client-store' ? { defineStore: (spec: any) => spec } : {});

async function nativeBootstrap(reply: any, browserLanguages?: string[]) {
  const window: any = {
    addEventListener() {},
    __DSH_WS_RPC__: () => ({ onNotify() {}, send() {}, call: async () => reply }),
  };
  runInNewContext(stripTypeScriptTypes(bridge), {
    window,
    document: { readyState: 'loading', documentElement: { setAttribute() {} }, addEventListener() {} },
    navigator: { platform: 'Win32', languages: browserLanguages, language: browserLanguages?.[0] },
    setInterval() {},
  });
  return JSON.parse(JSON.stringify(await window.__DSH_LOCALE__.read()));
}

for (const scenario of [
  { name: 'Chinese Windows locale wins over WebView2 en-US default', languages: ['zh-CN'], browser: ['en-US', 'en'], expected: 'zh' },
  { name: 'English system locale wins over a Chinese renderer default', languages: ['en-US'], browser: ['zh-CN'], expected: 'en' },
  { name: 'explicit saved language survives the system-language ordering', languages: ['zh-CN'], browser: ['en-US'], preference: 'en', expected: 'en' },
  { name: 'browser languages remain a fallback when native languages are unavailable', languages: [], browser: ['zh-CN', 'en-US'], expected: 'zh' },
  { name: 'native languages work without navigator language fields', languages: ['zh-CN'], browser: undefined, expected: 'zh' },
  { name: 'missing language information falls back to English', languages: [], browser: undefined, expected: 'en' },
]) {
  test(scenario.name, async () => {
    const bootstrap = await nativeBootstrap({ languages: scenario.languages, preference: scenario.preference ?? null }, scenario.browser);
    const locale = new LocaleRuntime({}, undefined, bootstrap);
    assert.equal(locale.getLocale().active, scenario.expected);
    assert.equal(bootstrap.preference, scenario.preference ?? null);
    assert.equal(new Set(bootstrap.languages).size, bootstrap.languages.length);
  });
}

test('existing Host language preference is adopted without a write', async () => {
  const bootstrap = await nativeBootstrap({ languages: ['zh-CN'], preference: null }, ['en-US']);
  let writes = 0;
  const host = { subscribe: () => () => {}, getSnapshot: () => ({ value: { preference: 'en' } }), update: () => { writes++; } };
  const locale = new LocaleRuntime({ effect: (fn: any) => fn(), emit() {} }, host, bootstrap);
  assert.equal(locale.getLocale().active, 'en');
  assert.equal(writes, 0);
});
