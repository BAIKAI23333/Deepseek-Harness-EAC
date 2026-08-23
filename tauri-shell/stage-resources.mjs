'use strict';
// Tauri 打包资源装配（P4）：把运行所需的一切装进 staged-resources/，
// 供 tauri.conf.json 的 resources 映射进安装包。
//
// 布局（= main.rs resource_root() 的约定）：
//   staged-resources/sidecar/server.js|bridge.js|rescue-integration.js
//   staged-resources/dsh-desktop/<Electron 时代的精确文件清单 + 生产 node_modules
//                              + assets + vendor/node + vendor/npm>
//
// 用法：node stage-resources.mjs [--skip-npm]（--skip-npm 复用上次 npm ci 产物）

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dd = path.join(root, 'dsh-desktop');
const staged = path.join(root, 'tauri-shell', 'staged-resources');
const skipNpm = process.argv.includes('--skip-npm');

// electron-builder.yml 的 files 清单（人工同步：新增根模块要加进来）。
const ROOT_FILES = [
  'main.js', 'updater.js', 'client-updater.js', 'logger.js', 'plugin-updater.js',
  'balance.js', 'session-watcher.js', 'session-encoding-heal.js', 'profile-module-heal.js',
  'patch-row-heal.js', 'builtin-collision.js', 'plugin-manager-state.js', 'plugin-guard.js',
  'rescue-agent.js', 'preset-sync.js', 'compact-preset-migrate.js', 'error-detail.js',
  'bundle-integrity.js', 'stable-port.js', 'stream-write-guard.js', 'koffi-preflight.js',
  'renderer-recovery.js', 'watchdog.js', 'shortcut-maintenance.js', 'preload.js',
  'wsl-backend.js',
];
const LIB_DESKTOP = [
  'file-roots.js', 'proc.js', 'runtime-paths.js', 'profile.js', 'guard-box.js',
  'runtime-patches.js', 'companion-sync.js', 'plugin-ops.js', 'market.js',
  'shortcuts.js', 'junction-patrol.js', 'client-update.js', 'static-preview.js',
  'boot-server.js',
];
const SCRIPTS = [
  'koffi-preflight.cjs', 'patch-session-manage.js', 'plugin-manager-patch.js',
  'onboarding.js', 'make-release-hashes.js',
];

console.log('[stage] 清理旧装配目录');
rmSync(staged, { recursive: true, force: true });
mkdirSync(path.join(staged, 'sidecar'), { recursive: true });
mkdirSync(path.join(staged, 'dsh-desktop'), { recursive: true });

console.log('[stage] 编译 TypeScript（tsc 就地产物）');
execSync('npx tsc -p tsconfig.json', { cwd: dd, stdio: 'inherit' });

console.log('[stage] sidecar 产物');
for (const f of ['server.js', 'bridge.js', 'rescue-integration.js']) {
  cpSync(path.join(root, 'tauri-shell', 'sidecar', f), path.join(staged, 'sidecar', f));
}

console.log('[stage] dsh-desktop 根模块 + lib/desktop + scripts + package.json');
for (const f of ROOT_FILES) {
  const src = path.join(dd, f);
  if (existsSync(src)) cpSync(src, path.join(staged, 'dsh-desktop', f));
}
mkdirSync(path.join(staged, 'dsh-desktop', 'lib', 'desktop'), { recursive: true });
for (const f of LIB_DESKTOP) {
  cpSync(path.join(dd, 'lib', 'desktop', f), path.join(staged, 'dsh-desktop', 'lib', 'desktop', f));
}
mkdirSync(path.join(staged, 'dsh-desktop', 'scripts'), { recursive: true });
for (const f of SCRIPTS) {
  cpSync(path.join(dd, 'scripts', f), path.join(staged, 'dsh-desktop', 'scripts', f));
}
// package.json + lock 原样拷贝（npm ci 要求两者一致；--omit=dev 只装生产树）
cpSync(path.join(dd, 'package.json'), path.join(staged, 'dsh-desktop', 'package.json'));
cpSync(path.join(dd, 'package-lock.json'), path.join(staged, 'dsh-desktop', 'package-lock.json'));

console.log('[stage] assets（114MB：38 插件 + 10 皮肤 + 图标）');
cpSync(path.join(dd, 'assets'), path.join(staged, 'dsh-desktop', 'assets'), { recursive: true });

console.log('[stage] vendor node/npm 运行时');
mkdirSync(path.join(staged, 'dsh-desktop', 'vendor'), { recursive: true });
cpSync(path.join(dd, 'vendor', 'node'), path.join(staged, 'dsh-desktop', 'vendor', 'node'), { recursive: true });
if (existsSync(path.join(dd, 'vendor', 'npm'))) {
  cpSync(path.join(dd, 'vendor', 'npm'), path.join(staged, 'dsh-desktop', 'vendor', 'npm'), { recursive: true });
}

console.log('[stage] 生产 node_modules（npm ci --omit=dev，首次较慢）');
const nmDest = path.join(staged, 'dsh-desktop', 'node_modules');
if (!skipNpm || !existsSync(nmDest)) {
  execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: path.join(staged, 'dsh-desktop'), stdio: 'inherit' });
}

// 上游修复的 vendored 覆盖（pwsh 超时修复，a99a770）——npm ci 会还原成
// registry 版本，把仓库内的修复副本盖回去。
const vendoredFix = path.join(dd, 'node_modules', '@deepseek-ai', 'dsh-subprocess-local', 'lib', 'index.js');
if (existsSync(vendoredFix)) {
  cpSync(vendoredFix, path.join(nmDest, '@deepseek-ai', 'dsh-subprocess-local', 'lib', 'index.js'));
  console.log('[stage] 已回填 dsh-subprocess-local 的 vendored 修复');
}

console.log('[stage] 完成：' + staged);
