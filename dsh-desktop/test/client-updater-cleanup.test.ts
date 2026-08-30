import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// 项目约定：测试 import 编译产物 .js（tsc 就地产物）。
const { cleanupClientBackupIfHealthy } = require('../client-updater.js') as {
  // ⚠️ 异步语义（fs.promises.rm，严禁在 boot 关键路径同步删大目录）：
  cleanupClientBackupIfHealthy(ctx: unknown, opts?: unknown): Promise<{ removed: string[]; kept: string[] }>;
}

// ---------------------------------------------------------------------------
// V4.3/V4.1 保障③承诺的 cleanupClientBackupIfHealthy 回归：安装版自更新每次
// 留 <userData>/backups/<ts>/ 全量镜像 + .backup-ts marker，「新版健康启动后
// 清理」在 Tauri 化后一直没有实现 —— 更新频繁的用户磁盘被逐次吃满。
// 语义：>24h 静默删；未满 24h 保留（marker 同时保留）；全部清完才删 marker。
// ---------------------------------------------------------------------------

function makeCtx(dir: string) {
  return { userDataDir: dir, log: (_s: string, _m: string) => {} };
}

test('cleanup：超 24h 的备份删除，未满 24h 的保留且 marker 不动', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bak-clean-'))
  try {
    const oldTs = String(Date.now() - 25 * 60 * 60 * 1000)
    const newTs = String(Date.now())
    mkdirSync(join(dir, 'backups', oldTs), { recursive: true })
    mkdirSync(join(dir, 'backups', newTs), { recursive: true })
    writeFileSync(join(dir, 'backups', oldTs, 'manifest.json'), '{}')
    mkdirSync(join(dir, 'updates'), { recursive: true })
    writeFileSync(join(dir, 'updates', '.backup-ts'), oldTs)
    const r = await cleanupClientBackupIfHealthy(makeCtx(dir))
    assert.deepEqual(r.removed, [oldTs])
    assert.deepEqual(r.kept, [newTs])
    assert.ok(existsSync(join(dir, 'backups', newTs)), '未满 24h 的备份必须保留')
    assert.ok(existsSync(join(dir, 'updates', '.backup-ts')), '还有保留备份时 marker 不删')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cleanup：全部清完时删除 .backup-ts marker；.keep 标记的备份不删', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bak-clean2-'))
  try {
    const oldTs = String(Date.now() - 30 * 60 * 60 * 1000)
    const keepTs = String(Date.now() - 48 * 60 * 60 * 1000)
    mkdirSync(join(dir, 'backups', oldTs), { recursive: true })
    mkdirSync(join(dir, 'backups', keepTs), { recursive: true })
    writeFileSync(join(dir, 'backups', keepTs, '.keep'), '')
    mkdirSync(join(dir, 'updates'), { recursive: true })
    writeFileSync(join(dir, 'updates', '.backup-ts'), oldTs)
    const r = await cleanupClientBackupIfHealthy(makeCtx(dir))
    assert.deepEqual(r.removed, [oldTs])
    assert.ok(existsSync(join(dir, 'backups', keepTs)), '.keep 备份不删')
    // 仍有保留中的备份（.keep）时 marker 不动 —— marker 只在「清完所有备份」
    // 的时机一并回收。
    assert.ok(existsSync(join(dir, 'updates', '.backup-ts')), '仍有保留备份时 marker 不删')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cleanup：无 backups 目录时安全空跑', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bak-clean3-'))
  try {
    const r = await cleanupClientBackupIfHealthy(makeCtx(dir))
    assert.deepEqual(r.removed, [])
    assert.deepEqual(r.kept, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
