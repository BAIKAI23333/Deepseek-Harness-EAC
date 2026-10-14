import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

// Exercise the actual TypeScript source; this boundary needs no kernel runtime.
const require = createRequire(import.meta.url);
const exports: { isPathWithinRoots?: (candidate: string, roots: string[]) => boolean } = {};
runInNewContext(stripTypeScriptTypes(fs.readFileSync(new URL('../lib/desktop/file-roots.ts', import.meta.url), 'utf8'), {
  mode: 'transform',
}).replace(/^export /gm, '') + '\nexports.isPathWithinRoots = isPathWithinRoots;', {
  exports, process,
  require: (name: string) => {
    if (name === '../../session-watcher') return { scanZstdFrames: () => { throw new Error('not used'); } };
    return require(name);
  },
});
const isPathWithinRoots = exports.isPathWithinRoots!;

test('a filesystem root authorizes its descendants, including nonexistent leaves', () => {
  const root = path.parse(tmpdir()).root;
  assert.equal(isPathWithinRoots(path.join(tmpdir(), 'eac-nonexistent-leaf.txt'), [root]), true);
  assert.equal(isPathWithinRoots(root, [root]), true);
});

test('workspace containment excludes siblings, parent traversal, and empty root lists', () => {
  const workspace = path.join(tmpdir(), 'eac-root-boundary');
  assert.equal(isPathWithinRoots(path.join(workspace, 'sub', 'new.txt'), [workspace]), true);
  assert.equal(isPathWithinRoots(workspace, [workspace]), true);
  assert.equal(isPathWithinRoots(workspace + '-sibling/new.txt', [workspace]), false);
  assert.equal(isPathWithinRoots(path.join(workspace, '..', 'outside.txt'), [workspace]), false);
  assert.equal(isPathWithinRoots(workspace, []), false);
});

test('workspace containment resolves junctions before allowing a missing leaf', () => {
  const temp = fs.mkdtempSync(path.join(tmpdir(), 'eac-file-roots-'));
  try {
    const workspace = path.join(temp, 'workspace');
    const outside = path.join(temp, 'outside');
    fs.mkdirSync(workspace);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(workspace, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(isPathWithinRoots(path.join(workspace, 'escape', 'new.txt'), [workspace]), false);
    fs.symlinkSync(workspace, path.join(temp, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(isPathWithinRoots(path.join(workspace, 'sub', 'new.txt'), [path.join(temp, 'alias')]), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Windows workspace containment is case-insensitive', { skip: process.platform !== 'win32' }, () => {
  const workspace = path.join(tmpdir(), 'EAC-Root-Boundary');
  assert.equal(isPathWithinRoots(path.join(workspace.toUpperCase(), 'new.txt'), [workspace.toLowerCase()]), true);
});
