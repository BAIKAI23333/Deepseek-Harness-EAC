import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
let playwright: any;
try { playwright = require(process.env.EAC_BROWSER_TEST_PLAYWRIGHT || 'playwright'); }
catch (error) { if (process.env.EAC_BROWSER_TEST_PLAYWRIGHT) throw error; }
const options = { skip: !playwright && 'V4 requires Playwright and an installed browser' };
const source = readFileSync(new URL('../../tauri-shell/src/exit-overlay.js', import.meta.url), 'utf8');
const rust = readFileSync(new URL('../../tauri-shell/src/main.rs', import.meta.url), 'utf8');

function script(chinese: boolean): string {
  if (!rust.includes('fn exit_dialog_script(')) return source;
  assert.match(rust, /format!\(\s*"\{\}\(\{\}\);",\s*include_str!\("exit-overlay.js"\),\s*chinese\s*\)/);
  assert.match(rust, /win.eval\(&exit_dialog_script\(shell_prefers_chinese\(\)\)\)/);
  return source + '(' + String(chinese) + ');';
}

async function fixture(t: any) {
  const browser = await playwright.chromium.launch({ headless: true, channel: process.env.EAC_BROWSER_TEST_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<button id="origin">Close window</button><button id="foreign" data-v="quit">Unrelated control</button><div id="settings" role="dialog"><button>General</button></div>');
  await page.evaluate(() => {
    const w = window as any;
    w.auditCalls = []; w.auditUnhandled = [];
    w.dshDesktop = { _call: async (method: string) => { w.auditCalls.push(method); } };
    window.addEventListener('unhandledrejection', e => { w.auditUnhandled.push(String(e.reason)); e.preventDefault(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('settings')!.setAttribute('data-escaped', 'true'); });
    document.getElementById('origin')!.focus();
  });
  return page;
}

const calls = (page: any) => page.evaluate(() => (window as any).auditCalls);
const active = (page: any) => page.evaluate(() => document.activeElement?.getAttribute('data-v'));

test('exit dialog uses English when selected by the native shell', options, async t => {
  const page = await fixture(t); await page.addScriptTag({ content: script(false) });
  assert.match(await page.locator('#dsh-exit-card').innerText(), /Quit Deepseek Harness EAC/);
  assert.equal(await page.locator('[data-v="minimize"]').textContent(), 'Minimize to tray');
  assert.equal(await page.locator('#dsh-exit-card [data-v="quit"]').textContent(), 'Quit app');
  assert.doesNotMatch(await page.locator('#dsh-exit-card').innerText(), /退出|托盘|取消/);
});

test('exit dialog preserves Chinese and provides an accessible title', options, async t => {
  const page = await fixture(t); await page.addScriptTag({ content: script(true) });
  assert.match(await page.locator('#dsh-exit-card').innerText(), /退出 Deepseek Harness/);
  const title = await page.locator('#dsh-exit-card').getAttribute('aria-labelledby');
  assert.ok(title); assert.match(await page.locator('#' + title).textContent(), /退出/);
});

test('exit dialog initially focuses the safe cancel action', options, async t => {
  const page = await fixture(t); await page.addScriptTag({ content: script(false) });
  assert.equal(await active(page), 'cancel'); assert.deepEqual(await calls(page), []);
});

test('Tab and Shift+Tab stay inside all three exit actions', options, async t => {
  const page = await fixture(t); await page.addScriptTag({ content: script(false) });
  for (const expected of ['minimize', 'quit', 'cancel', 'minimize']) {
    await page.keyboard.press('Tab'); assert.equal(await active(page), expected);
  }
  await page.keyboard.press('Shift+Tab'); assert.equal(await active(page), 'cancel');
  await page.keyboard.press('Shift+Tab'); assert.equal(await active(page), 'quit');
  assert.deepEqual(await calls(page), []);
});

test('Escape dismisses only the exit dialog and restores prior focus', options, async t => {
  const page = await fixture(t); await page.addScriptTag({ content: script(false) });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dsh-exit-overlay').count(), 0);
  assert.equal(await page.locator('#settings').getAttribute('data-escaped'), null);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'origin');
  assert.deepEqual(await calls(page), ['win.close-dialog']);
});

test('repeated native script injection removes the previous keyboard listener', options, async t => {
  const page = await fixture(t);
  for (let i = 0; i < 4; i++) await page.addScriptTag({ content: script(false) });
  assert.equal(await page.locator('#dsh-exit-overlay').count(), 1);
  await page.keyboard.press('Escape');
  assert.deepEqual(await calls(page), ['win.close-dialog']);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'origin');
});

test('exit action listeners never attach to unrelated host data-v controls', options, async t => {
  const page = await fixture(t); await page.addScriptTag({ content: script(false) });
  await page.locator('#foreign').dispatchEvent('click');
  assert.deepEqual(await calls(page), []); assert.equal(await page.locator('#dsh-exit-overlay').count(), 1);
});

test('a rejected Escape RPC does not become an unhandled renderer rejection', options, async t => {
  const page = await fixture(t);
  await page.evaluate(() => { (window as any).dshDesktop._call = async () => { throw Error('bridge unavailable'); }; });
  await page.addScriptTag({ content: script(false) }); await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => (window as any).auditUnhandled), []);
});
