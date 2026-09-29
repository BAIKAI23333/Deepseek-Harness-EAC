// M2/#415 皮肤平台 vendored 树摘要门禁（防止 lock 与随包产物再次漂移）。
//
// 背景（60a2dab）：5 款 dsh-web-ui 生成器批次皮肤（miku / minecraft / qq98 /
// ths / xp）的 vendored bundle 重建过（CSS 映射表从 apply() 函数体上移到模块
// 作用域，修「激活即 ReferenceError」），但 .sync/plugins.lock.json 的
// local.treeSha256 / source.sha256 没有同步更新 —— 台账摘要从此与随包树漂移，
// 供应链校验（validateLocked / 装包校验）对这 5 个包失效。本门禁把它们连同
// 本轮安全修复后的 trading 树一起重新钉住：以后任何重打包/修复都必须同步
// lock 摘要。
//
// 摘要口径 =「git 认定会提交的字节」（canonical 内容），不是工作区原始字节：
//   · `text` / `text=auto` 命中的文本文件：CRLF → LF（= git add 的规范化）；
//   · 二进制（.gitattributes 标 binary，或前 8000 字节含 NUL）：原样；
//   · 路径序 / 分隔符 / 排除目录（node_modules、vendor、cache）与
//     scripts/plugin-sync.mjs 的 treeSha256 同口径。
// 为什么不能用工作区字节：*.js/*.json/*.md 已由 .gitattributes 钉成 eol=lf，
// 但 LICENSE / NOTICE 这类无扩展名文件走 `* text=auto` + core.eol=native ——
// 同一提交在 Windows 检出是 CRLF、Linux 检出是 LF（本机实测）。四个 CI OS
// 共用这个门禁，工作区字节口径会在 ubuntu runner 上假红，且无法捕获
// 「改了树没改 lock」。本口径同时对齐 canonical（LF）检出下
// scripts/plugin-sync.mjs buildLock() 的产物。
//
// 范围：本轮重建/修复的 6 棵树（5 款重打包皮肤 + trading 安全修复）。
// 皮肤平台其余条目的历史摘要（早于本轮、混合检出状态下生成）不在本门禁内。

import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { treeSha256, treeSnapshot } = await import('../scripts/plugin-sync.mjs') as {
  treeSha256(directory: string): string;
  treeSnapshot(directory: string): { treeSha256: string; files: string[]; excludedPaths: string[] };
};

/** 本轮必须钉住摘要的皮肤树（id → assets 目录名）。 */
const PINNED_SKINS = [
  { id: 'dsh-eac-skin-miku', dir: 'dsh-eac-skin-miku' },
  { id: 'dsh-eac-skin-minecraft', dir: 'dsh-eac-skin-minecraft' },
  { id: 'dsh-eac-skin-qq98', dir: 'dsh-eac-skin-qq98' },
  { id: 'dsh-eac-skin-ths', dir: 'dsh-eac-skin-ths' },
  { id: 'dsh-eac-skin-xp', dir: 'dsh-eac-skin-xp' },
  { id: 'dsh-eac-skin-trading', dir: 'dsh-eac-skin-trading' },
] as const;

/** 本地复现遍历的排除目录（与 plugin-sync.mjs 保持一致）。 */
const EXCLUDED_SEGMENTS = new Set(['.git', 'node_modules', 'vendor', 'cache']);

/** git 判定「是否二进制」的探测窗口（buffer_is_binary 同口径）。 */
const BINARY_PROBE_BYTES = 8000;

const lock = JSON.parse(readFileSync(join(root, '.sync', 'plugins.lock.json'), 'utf8')) as {
  plugins: Record<string, {
    local: { path: string; treeSha256: string; fileCount: number };
    source: { sha256: string };
  }>;
};

/** 目录树遍历：跳过排除目录，文件按路径字节序（与 plugin-sync 一致）。 */
function walkTree(dir: string): { absPath: string; relPath: string; link?: string }[] {
  const files: { absPath: string; relPath: string; link?: string }[] = [];
  const visit = (current: string, rel: string): void => {
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
    for (const entry of entries) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const absPath = join(current, entry.name);
      if (entry.isDirectory()) visit(absPath, nextRel);
      else if (entry.isSymbolicLink()) files.push({ absPath, relPath: nextRel, link: readlinkSync(absPath) });
      else if (entry.isFile()) files.push({ absPath, relPath: nextRel });
    }
  };
  visit(dir, '');
  files.sort((a, b) => Buffer.compare(Buffer.from(a.relPath), Buffer.from(b.relPath)));
  return files;
}

/** git 的 text 规范化：CRLF → LF（不动孤立 CR）。 */
function normalizeEol(buffer: Buffer): Buffer {
  const out = Buffer.allocUnsafe(buffer.length);
  let written = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i]!;
    if (byte === 0x0d && buffer[i + 1] === 0x0a) continue;
    out[written] = byte;
    written += 1;
  }
  return out.subarray(0, written);
}

/** `git check-attr -z --stdin text` → 路径 : set | unset | auto（未跟踪文件同样适用）。 */
function textAttributes(repoRoot: string, relPaths: string[]): Map<string, string> {
  const output = execFileSync('git', ['-C', repoRoot, 'check-attr', '-z', '--stdin', 'text'], {
    input: relPaths.join('\0') + '\0',
    maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8');
  const parts = output.split('\0');
  const attributes = new Map<string, string>();
  for (let i = 0; parts[i]; i += 3) attributes.set(parts[i]!, parts[i + 2] ?? '');
  return attributes;
}

/**
 * canonical 树摘要（工作区内容按 git 提交口径规范化，再按 plugin-sync 的
 * 摘要算法哈希）。untracked / 未提交改动都会被看见 —— 这正是门禁要抓的漂移。
 */
function canonicalTreeDigest(repoRoot: string, relDir: string): { sha256: string; files: string[] } {
  const files = walkTree(join(repoRoot, relDir));
  assert.ok(files.length > 0, `${relDir} 为空目录，无法计算树摘要`);
  const attributes = textAttributes(repoRoot, files.map((f) => `${relDir}/${f.relPath}`));
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(Buffer.from(`file\0${file.relPath}\0`, 'utf8'));
    if (file.link !== undefined) {
      digest.update(Buffer.from(`symlink:${file.link}`, 'utf8'));
    } else {
      let content = readFileSync(file.absPath);
      const attr = attributes.get(`${relDir}/${file.relPath}`) ?? 'auto';
      const isText = attr === 'set' || (attr !== 'unset' && !content.subarray(0, BINARY_PROBE_BYTES).includes(0));
      if (isText) content = normalizeEol(content);
      digest.update(content);
    }
    digest.update(Buffer.from('\0', 'utf8'));
  }
  return { sha256: digest.digest('hex'), files: files.map((f) => f.relPath) };
}

/** 提交内容（git 对象库）的树摘要：独立于工作区字节的第二条复现路径。 */
function blobTreeDigest(repoRoot: string, relDir: string): string {
  const listing = execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '-z', 'HEAD', '--', relDir], {
    maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8');
  const files = listing
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, filePath] = line.split('\t');
      const [mode, , objectSha] = meta!.split(' ');
      return { mode: mode!, objectSha: objectSha!, relPath: filePath!.slice(relDir.length + 1) };
    })
    .filter((f) => !f.relPath.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment)))
    .sort((a, b) => Buffer.compare(Buffer.from(a.relPath), Buffer.from(b.relPath)));
  const output = execFileSync('git', ['-C', repoRoot, 'cat-file', '--batch'], {
    input: files.map((f) => f.objectSha).join('\n') + '\n',
    maxBuffer: 256 * 1024 * 1024,
  });
  const blobs: Buffer[] = [];
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(0x0a, offset);
    if (newline < 0) break;
    const header = output.subarray(offset, newline).toString('utf8');
    const size = Number(header.split(' ')[2]);
    assert.ok(Number.isFinite(size), `cat-file --batch 头解析失败: ${header}`);
    const start = newline + 1;
    blobs.push(output.subarray(start, start + size));
    offset = start + size + 1;
  }
  assert.equal(blobs.length, files.length, 'cat-file --batch 返回的 blob 数与文件数不一致');
  const digest = createHash('sha256');
  files.forEach((file, index) => {
    digest.update(Buffer.from(`file\0${file.relPath}\0`, 'utf8'));
    if (file.mode === '120000') digest.update(Buffer.from(`symlink:${blobs[index]!.toString('utf8')}`, 'utf8'));
    else digest.update(blobs[index]!);
    digest.update(Buffer.from('\0', 'utf8'));
  });
  return digest.digest('hex');
}

test('6 款皮肤（5 款重打包 + trading 安全修复）的 lock 摘要等于随包树实际摘要', () => {
  for (const skin of PINNED_SKINS) {
    const entry = lock.plugins[skin.id];
    assert.ok(entry, `.sync/plugins.lock.json 必须登记 ${skin.id}`);
    assert.equal(entry!.local.path, `dsh-desktop/assets/plugins/${skin.dir}`);
    const { sha256, files } = canonicalTreeDigest(root, entry!.local.path);
    const productionDigest = treeSha256(join(root, entry!.local.path));
    assert.equal(
      productionDigest,
      sha256,
      `${skin.id} 的门禁摘要必须与 plugin-sync.mjs 生产校验器一致`,
    );
    assert.equal(
      entry!.local.treeSha256,
      productionDigest,
      `${skin.id} 的 lock 树摘要与随包树漂移：重打包/修复后必须把 local.treeSha256 更新为 ${productionDigest}`,
    );
    assert.equal(
      entry!.source.sha256,
      entry!.local.treeSha256,
      `${skin.id} 的 source.sha256 必须与 local.treeSha256 一致（internal 源 = 随包树摘要）`,
    );
    assert.equal(entry!.local.fileCount, files.length, `${skin.id} 的 fileCount 与随包树不一致`);
  }
});

test('摘要口径与 git 提交口径一致：提交内容复现同一摘要，改一字节即变化', () => {
  const stage = mkdtempSync(join(tmpdir(), 'dsh-skin-digest-'));
  try {
    for (const skin of PINNED_SKINS) {
      cpSync(join(root, 'dsh-desktop', 'assets', 'plugins', skin.dir), join(stage, skin.dir), { recursive: true });
    }
    // 用仓库自己的 .gitattributes 复刻 git 的规范化规则（否则换行会被平台默认值影响）。
    cpSync(join(root, '.gitattributes'), join(stage, '.gitattributes'));
    const git = (...args: string[]): string =>
      execFileSync('git', ['-C', stage, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString();
    git('init', '-q');
    git('config', 'user.email', 'gate@example.com');
    git('config', 'user.name', 'digest gate');
    git('add', '-A');
    git('commit', '-qm', 'replicate');

    for (const skin of PINNED_SKINS) {
      const expected = lock.plugins[skin.id]!.local.treeSha256;
      assert.equal(
        blobTreeDigest(stage, skin.dir),
        expected,
        `${skin.id} 的 lock 摘要无法由提交内容复现 —— 台账值与 vendored 树不是同一份内容`,
      );
      assert.equal(
        canonicalTreeDigest(stage, skin.dir).sha256,
        expected,
        `${skin.id} 的规范化工作区摘要与提交口径不一致（规范化解算有偏差）`,
      );
    }

    // 判别力：任一文件字节变化都必须被门禁看见（否则门禁形同虚设）。
    const victim = PINNED_SKINS[0];
    const clientFile = join(stage, victim.dir, 'lib', 'client.js');
    writeFileSync(clientFile, readFileSync(clientFile, 'utf8') + '\n// drift probe\n');
    assert.notEqual(
      canonicalTreeDigest(stage, victim.dir).sha256,
      lock.plugins[victim.id]!.local.treeSha256,
      '内容改动后摘要必须变化',
    );
    for (const skin of PINNED_SKINS.slice(1)) {
      assert.equal(
        canonicalTreeDigest(stage, skin.dir).sha256,
        lock.plugins[skin.id]!.local.treeSha256,
        `${skin.id} 未被改动，摘要不应受影响`,
      );
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('门禁范围非空且指向真实随包树（防呆）', () => {
  assert.equal(PINNED_SKINS.length, 6);
  const digests = new Set<string>();
  for (const skin of PINNED_SKINS) {
    const dir = join(root, 'dsh-desktop', 'assets', 'plugins', skin.dir);
    assert.equal(existsSync(join(dir, 'package.json')), true, `${skin.dir} 必须随包`);
    assert.equal(existsSync(join(dir, 'lib', 'client.js')), true, `${skin.dir}/lib/client.js 必须随包`);
    const { sha256, files } = canonicalTreeDigest(root, `dsh-desktop/assets/plugins/${skin.dir}`);
    assert.equal(sha256.length, 64);
    assert.ok(files.includes('lib/client.js') && files.includes('lib/index.js'), `${skin.id} 树内必须有双半产物`);
    digests.add(sha256);
  }
  assert.equal(digests.size, PINNED_SKINS.length, '各皮肤树内容不应互相相同（防止门禁被批量复制糊弄）');
});
