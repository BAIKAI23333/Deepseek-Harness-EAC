'use strict';

// cordis.patch.yml row heal for dsh-soul-md.
//
// v2.0.0 shipped the bundled dsh-soul-md plugin whose config schema declared
// `path` as REQUIRED with no default, while the profile patch row written by
// syncCompanionPlugins carried only id + name (no config). On a fresh install
// config validation then failed for that row, which took down the ENTIRE
// plugin tree: `dsh web` exited with code 1 and the app showed "启动失败"
// (persistent crash loop — the exe re-syncs the row on every boot, so users
// could not delete their way out of it).
//
// The plugin schema now defaults `path` to "soul.md" (missing file → empty
// fallback → NO prompt section → the stock official system prompt is used
// untouched), so a config-less row boots fine again. New rows are also
// written WITH an explicit config block (see configLinesFor below), and this
// heal pass fixes ALREADY-BROKEN rows living in existing user profiles, so
// upgrading to the fixed build repairs them without any manual edit.

/** Serialize a config object as patch-row YAML lines (2-space step from `name:`). */
function configLinesFor(config) {
  let out = '      config:\n';
  for (const [k, v] of Object.entries(config || {})) {
    out += `        ${k}: ${JSON.stringify(v)}\n`;
  }
  return out;
}

/**
 * Ensure every soul-md row in `patch` carries config.path.
 * Idempotent: rows that already have a config block are left untouched.
 * Returns { patch, healed } — healed lists row ids that were modified.
 */
function healSoulMdPatchRow(patch, config = { path: 'soul.md' }) {
  const healed = [];
  if (typeof patch !== 'string' || patch === '') return { patch, healed };
  // A row looks like:
  //   - insert:
  //       - id: soul-md
  //         name: 'dsh-soul-md'
  //         (config: ... optional)
  // Match the `id:` + `name:` lines; only rewrite when the NEXT non-blank
  // line is not a `config:` key (negative lookahead keeps healed rows stable).
  const rowRe = /(^[\t ]*- id: soul-md\b[^\n]*\n[\t ]*name: ['"]?[^'"\n]+['"]?\n)(?![\t ]*config:)/gm;
  let out = patch.replace(rowRe, (m) => m + configLinesFor(config));
  if (out !== patch) healed.push('soul-md');
  return { patch: out, healed };
}

/**
 * Remove insert-blocks for rows the profile already mounts through its
 * package.json bundle list (`dsh.profile.bundles`, written by `dsh plugin
 * add` — i.e. anything the user installed from the plugin market).
 *
 * A bundle listed there is loaded WITH its own packaged cordis.patch.yml,
 * which mounts the row itself. When syncCompanionPlugins has also written an
 * overlay row for the same plugin, the loader aborts the whole tree with
 * `duplicate loader entry id: <id>` (dsh web exits 1 → "启动失败" crash
 * loop). Dropping the overlay copy is safe: the bundle still mounts it.
 *
 * `rowIds` maps row id → package name; only rows whose package name appears
 * in the bundle list are removed. Returns { patch, removed }.
 */
function removeBundledRowDuplicates(patch, rowIds, bundleNames) {
  const removed = [];
  if (typeof patch !== 'string' || patch === '' || !bundleNames.length) return { patch, removed };
  const targets = Object.entries(rowIds)
    .filter(([, pkg]) => bundleNames.includes(pkg))
    .map(([id]) => id);
  if (!targets.length) return { patch, removed };
  const lines = patch.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-\s*insert:/.test(line)) {
      const m = /\bid:\s*([\w-]+)/.exec(lines[i + 1] || '');
      if (m && targets.includes(m[1])) {
        removed.push(m[1]);
        // Skip the block body: indented non-comment lines up to the next
        // top-level key / block / comment / blank line.
        let j = i + 1;
        while (j < lines.length && !/^-\s*insert:/.test(lines[j]) && /^#/.test(lines[j]) === false && /^\s+\S/.test(lines[j])) j++;
        i = j - 1;
        continue;
      }
    }
    out.push(line);
  }
  // Collapse the blank line an inner removed block may leave behind.
  let text = out.join('\n').replace(/\n{3,}/g, '\n\n');
  if (!text.endsWith('\n')) text += '\n';
  return { patch: text, removed };
}

module.exports = { configLinesFor, healSoulMdPatchRow, removeBundledRowDuplicates };
