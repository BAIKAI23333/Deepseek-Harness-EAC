import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'D:/DeepSeek Harness/dsh max/dsh_desktop';
const syncUrl = pathToFileURL(path.join(root, 'dsh-desktop/scripts/plugin-sync.mjs')).href;
const sync = await import(syncUrl);
const lockFile = path.join(root, '.sync/plugins.lock.json');
const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
const targets = ['dsh-compact', 'dsh-easy-setup'];
for (const t of targets) {
  const key = Object.keys(lock.plugins).find((k) => k === t || k.endsWith('/' + t) || (lock.plugins[k].local?.path || '').endsWith(t));
  if (!key) { console.log('record not found:', t); continue; }
  const rec = lock.plugins[key];
  const dir = path.join(root, rec.local.path);
  const before = rec.local.treeSha256;
  const after = await sync.treeSha256(dir);
  const snap = await sync.treeSnapshot(dir);
  console.log(`${t}: key=${key}`);
  console.log(`  treeSha256 ${before.slice(0, 12)}... -> ${after.slice(0, 12)}...  changed=${before !== after}`);
  console.log(`  fileCount ${rec.local.fileCount} -> ${snap.files.length}`);
  rec.local.treeSha256 = after;
  rec.local.fileCount = snap.files.length;
  if (rec.source && rec.source.sha256 === before) rec.source.sha256 = after;
}
writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
console.log('lock written');
