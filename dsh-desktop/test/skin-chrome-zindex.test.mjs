// TDD regression tests for bundled skins whose client CSS injects fixed
// full-width chrome bars (a titlebar at the top and/or a statusbar at the
// bottom) to mimic OS window chrome.
//
// Bug reported: while a conversation is open, the Settings modal (the 设置
// dialog, `.VOzbGW_overlay`, `z-index:1000`) was covered by the top and
// bottom bars, so the settings UI was not rendered on the topmost layer.
// Root cause: these skins hard-code `z-index:1000000` (and `999999`) on
// their fixed bars, which is far above the web UI's modal layer (1000). Any
// modal/dialog is therefore drawn *under* the skin chrome.
//
// The skin chrome must sit above ordinary content but strictly below the
// app's modal layer, i.e. every `z-index` in a skin's stylesheet must be
// less than 1000.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skinsDir = join(root, 'assets', 'skins');

// Skins known to inject fixed top/bottom chrome bars (titlebar / statusbar).
const CHROME_SKINS = ['xp', 'miku', 'qq98', 'trading', 'ths'];

/** Read a skin's bundled client bundle. */
function skinClient(skin) {
  const file = join(skinsDir, skin, 'lib', 'client.js');
  return readFileSync(file, 'utf8');
}

/** All numeric `z-index:N` values appearing anywhere in a skin's CSS. */
function zIndexValues(src) {
  const out = [];
  for (const m of src.matchAll(/z-index:\s*(\d+)/g)) out.push(Number(m[1]));
  return out;
}

for (const skin of CHROME_SKINS) {
  test(`skin "${skin}" keeps its chrome bars below the app modal layer (z-index < 1000)`, () => {
    const src = skinClient(skin);
    const values = zIndexValues(src);
    assert.ok(values.length > 0, `expected ${skin} to declare z-index values`);
    for (const v of values) {
      assert.ok(
        v < 1000,
        `${skin} declares z-index:${v} which is at/above the web UI modal layer (1000); ` +
          'its fixed titlebar/statusbar would cover the Settings modal'
      );
    }
  });
}

test('every bundled skin keeps its z-index values below the modal layer', () => {
  for (const entry of readdirSync(skinsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const clientFile = join(skinsDir, entry.name, 'lib', 'client.js');
    if (!statSync(clientFile, { throwIfNoEntry: false })) continue;
    const values = zIndexValues(readFileSync(clientFile, 'utf8'));
    for (const v of values) {
      assert.ok(
        v < 1000,
        `skin "${entry.name}" declares z-index:${v} which is at/above the modal layer (1000)`
      );
    }
  }
});
