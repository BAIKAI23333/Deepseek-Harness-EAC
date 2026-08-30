// 原子写 JSON/文本（tmp + rename）：先写同目录临时文件再改名替换，避免
// 写一半损坏目标文件；Windows 上 rename 可能因瞬时占用失败，先删旧文件
// 重试一次。目录自动创建。既有调用点（plugin-guard / supervisor registry /
// recovery-center register / extension-host sdk / sidecar rescue-integration /
// companion-sync patch）的落盘语义一致：`JSON.stringify(v, null, 2) + '\n'`。

import fs = require('node:fs');
import path = require('node:path');
import { randomBytes } from 'node:crypto';

export function writeFileAtomic(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // tmp 名含随机后缀：Date.now() 同毫秒并发写同一目标会互相踩踏
  //（先完成者 rename 走后，第二者 rename ENOENT → 误报失败）。
  const tmp = file + '.tmp-' + Date.now() + '-' + randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows 上 rename 目标被瞬时占用（杀软/索引器）可能 EPERM。旧实现
    // 「先删旧目标再 rename」在两步之间被杀 = 数据只剩 .tmp、目标消失。
    // 改为两步换入：先把旧目标改名到 .old-<rand>，换入新文件成功后再删；
    // 换入失败把 .old 还原回去 —— 任何时刻目标路径都有完整数据。
    const old = file + '.old-' + randomBytes(4).toString('hex');
    let saved = false;
    try { fs.renameSync(file, old); saved = true; } catch { /* 目标本就不存在：直接换入 */ }
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      if (saved) { try { fs.renameSync(old, file); } catch { /* 尽力还原 */ } }
      try { fs.rmSync(tmp, { force: true }); } catch { /* 尽力清理 */ }
      throw e;
    }
    if (saved) { try { fs.rmSync(old, { force: true, maxRetries: 3 }); } catch { /* 残留无碍 */ } }
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');
}