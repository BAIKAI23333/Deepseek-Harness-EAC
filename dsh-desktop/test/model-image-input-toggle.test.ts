import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const {
  patchModelImageInputSource,
  patchModelImageInputToggle,
} = require('../scripts/patch-deps.js') as {
  patchModelImageInputSource(source: string): string | undefined;
  patchModelImageInputToggle(targetFile: string): boolean;
};

const prefix = 'fixture';
const helper = [
  '\t\tfunction modelDrafts(value) {',
  '\t\t\tif (!Array.isArray(value)) return [];',
  '\t\t\treturn value.map((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry : {});',
  '\t\t}',
].join('\n');
const deepSeekButton = [
  '\t\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("button", {',
  '\t\t\t\t\t\t\t\t\t\ttype: "button",',
  '\t\t\t\t\t\t\t\t\t\tclassName: ModelsSection_module_css_default["iconButton"],',
  '\t\t\t\t\t\t\t\t\t\t"aria-label": `${props.t("modelAdvanced")} ${String(index + 1)}`,',
].join('\n');
const genericButton = [
  '\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("button", {',
  '\t\t\t\t\t\t\t\t\ttype: "button",',
  '\t\t\t\t\t\t\t\t\tclassName: ModelsSection_module_css_default["iconButton"],',
  '\t\t\t\t\t\t\t\t\t"aria-label": `${t("modelAdvanced")} ${index + 1}`,',
].join('\n');
const fixture = [
  `const css = ".${prefix}_modelRow{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto auto;align-items:center;gap:6px;display:grid}";`,
  `\t\t\t"modelRow": "${prefix}_modelRow",`,
  helper,
  deepSeekButton,
  genericButton,
  '\t\t\tmodelName: "Display name",',
  '\t\t\tmodelName: "显示名称",',
].join('\n');

test('model image-input patch adds one inline switch to both model editors', () => {
  const patched = patchModelImageInputSource(fixture);
  assert.ok(patched);
  assert.equal(patched.match(/ModelImageInputSwitch, \{/g)?.length, 2);
  assert.match(patched, /grid-template-columns:minmax\(0,1\.4fr\) minmax\(0,1fr\) auto auto auto/);
  assert.match(patched, /role: "switch"/);
  assert.match(patched, /modelImageInput: "图片输入"/);
  assert.match(patched, /modelImageInput: "Image input"/);
});

test('image switch writes native modalities when enabled and deletes the override when disabled', () => {
  const patched = patchModelImageInputSource(fixture);
  assert.ok(patched);
  assert.match(patched, /props\.onChange\(enabled \? void 0 : \["text", "image"\]\)/);
  assert.match(patched, /update\(index, "input", input\)/);
  assert.match(patched, /patch\(index, \{ input \}\)/);
  assert.doesNotMatch(patched, /enabled \? \["text"\]/);
});

test('model image-input source transform is idempotent', () => {
  const once = patchModelImageInputSource(fixture);
  assert.ok(once);
  assert.equal(patchModelImageInputSource(once), once);
});

test('file patch applies atomically and reports success on a second run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-model-image-input-'));
  const file = join(dir, 'client.js');
  try {
    writeFileSync(file, fixture);
    assert.equal(patchModelImageInputToggle(file), true);
    const once = readFileSync(file, 'utf8');
    assert.equal(patchModelImageInputToggle(file), true);
    assert.equal(readFileSync(file, 'utf8'), once);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('model image-input patch refuses an unknown upstream shape', () => {
  assert.equal(patchModelImageInputSource('const upstreamChanged = true;'), undefined);
});
