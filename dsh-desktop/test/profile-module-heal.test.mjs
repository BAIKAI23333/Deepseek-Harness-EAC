// TDD regression tests for profile node_modules shadowing heal.
//
// Bug reported: after installing out-of-tree plugins (dsh plugin add → pnpm,
// nodeLinker: hoisted), the web profile's node_modules contained REAL copies
// of @deepseek-ai core packages (dsh-system-prompt, dsh-scope, cordis, ...).
// Node resolves a profile's own node_modules before the installation fallback
// <home>/profiles/node_modules (one junction per package of the app's
// dependency closure, maintained by dsh-app-boot), so those copies shadow the
// junctions and load as second module instances. Symbol identity then breaks
// across the tree — the visible symptom was preset mounting failing with
// `prompt section "deployment:persona" is already registered`, plus model-list
// refresh / mode switch / workspace add all broken.
//
// The desktop must heal this at boot: remove real-directory copies in the web
// profile's node_modules that shadow a fallback link, so resolution falls back
// to the junctions (single instance, shared with the host app).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, lstatSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { healProfileModuleShadowing } from '../profile-module-heal.js';

/** Build a fake DSH home: fallback junctions + a web profile node_modules. */
function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-heal-'));
  const sources = join(home, 'sources');
  const fallback = join(home, 'profiles', 'node_modules');
  const nm = join(home, 'profiles', 'web', 'node_modules');

  const addFallbackLink = (srcName, scopeDir, pkgName) => {
    mkdirSync(join(sources, srcName), { recursive: true });
    writeFileSync(join(sources, srcName, 'package.json'), JSON.stringify({ name: pkgName }));
    const scope = scopeDir ? join(fallback, scopeDir) : fallback;
    mkdirSync(scope, { recursive: true });
    symlinkSync(join(sources, srcName), join(scope, scopeDir ? pkgName.split('/')[1] : pkgName), 'junction');
  };

  // Installation-closure packages exposed by the fallback:
  addFallbackLink('dsh-scope-real', '@deepseek-ai', '@deepseek-ai/dsh-scope');
  addFallbackLink('dsh-system-prompt-real', '@deepseek-ai', '@deepseek-ai/dsh-system-prompt');
  addFallbackLink('cosmokit-real', '', 'cosmokit'); // unscoped closure package

  // Web profile node_modules:
  mkdirSync(join(nm, '@deepseek-ai', 'dsh-scope'), { recursive: true }); // shadowing real copy — remove
  mkdirSync(join(nm, '@deepseek-ai', 'dsh-balance'), { recursive: true }); // local-only plugin — keep
  mkdirSync(join(nm, 'dsh-soul-md'), { recursive: true }); // local-only plugin — keep
  mkdirSync(join(nm, 'cosmokit'), { recursive: true }); // shadowing real copy (unscoped) — remove
  mkdirSync(join(sources, 'dsh-system-prompt-other'), { recursive: true }); // link-typed entry — keep
  symlinkSync(join(sources, 'dsh-system-prompt-other'), join(nm, '@deepseek-ai', 'dsh-system-prompt'), 'junction');

  return home;
}

test('removes real-dir copies that shadow installation fallback links', () => {
  const home = makeHome();
  try {
    const removed = healProfileModuleShadowing(home);
    assert.ok(removed.includes('@deepseek-ai/dsh-scope'), 'scoped shadow must be removed, got: ' + removed);
    assert.ok(removed.includes('cosmokit'), 'unscoped shadow must be removed, got: ' + removed);
    const nm = join(home, 'profiles', 'web', 'node_modules');
    assert.equal(existsSync(join(nm, '@deepseek-ai', 'dsh-scope')), false, 'shadow dir must be gone');
    assert.equal(existsSync(join(nm, 'cosmokit')), false, 'unscoped shadow dir must be gone');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('keeps packages that have no fallback counterpart', () => {
  const home = makeHome();
  try {
    healProfileModuleShadowing(home);
    const nm = join(home, 'profiles', 'web', 'node_modules');
    assert.equal(existsSync(join(nm, '@deepseek-ai', 'dsh-balance')), true, 'local scoped plugin must be kept');
    assert.equal(existsSync(join(nm, 'dsh-soul-md')), true, 'local unscoped plugin must be kept');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('keeps link-typed entries even when the name matches a fallback package', () => {
  const home = makeHome();
  try {
    healProfileModuleShadowing(home);
    const link = join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-system-prompt');
    assert.equal(existsSync(link), true, 'link entry must be kept');
    assert.equal(lstatSync(link).isSymbolicLink(), true, 'kept entry must still be a link');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('is idempotent — a second run removes nothing and does not throw', () => {
  const home = makeHome();
  try {
    healProfileModuleShadowing(home);
    const second = healProfileModuleShadowing(home);
    assert.deepEqual(second, [], 'second run must remove nothing');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('is a no-op when the fallback directory does not exist', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-heal-empty-'));
  try {
    mkdirSync(join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-scope'), { recursive: true });
    const removed = healProfileModuleShadowing(home);
    assert.deepEqual(removed, [], 'nothing to shadow — nothing removed');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
