'use strict';

// 插件市场排队任务（自 main.js 原样迁出，ADR 0002 L2 业务服务层）：
// 服务运行中安装/卸载撞上 Windows 文件锁（EPERM，如 sqlite-vec 的
// vec0.dll 被运行中的 web 进程加载）时，市场插件把任务写进 profile 的
// .dsh-market-pending.json。这里在"无服务进程持锁"的窗口期（应用启动时 /
// 原地重启 kill 完旧进程后）用 dsh CLI 完成它。

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { nodeExe, dshBin, APP_ROOT } = require('./runtime-paths');
const { childEnv } = require('./proc');
const { desktopProfile } = require('./profile');
const { ensureGuard } = require('./guard-box');
const {
  COMPANION_PLUGINS,
  SKINS_DIR,
  readJsonFile,
  healProfileModules,
} = require('./companion-sync');

let ctx = {};
function init(d) { ctx = d; }

// V4 退出清理：当前正在执行的插件市场排队任务子进程（退出时强杀）。
// 由 main.js 的 before-quit 经 getMarketOpChild() 读取。
let marketOpChild = null;
function getMarketOpChild() { return marketOpChild; }
function setMarketOpChild(child) { marketOpChild = child; }

const MARKER_NAME = '.dsh-market-pending.json';
const MARKER_MAX_ATTEMPTS = 3;

// 删除排队标记文件。曾有残留进程短暂持锁导致 rmSync 静默失败、标记
// "复活"并反复触发 pnpm 的案例 —— 这里带重试 + 改名兜底，并返回是否
// 真正删除，调用方据此决定是否放弃任务。
function removeMarkerFile(file) {
  try {
    fs.rmSync(file, { force: true, maxRetries: 5, retryDelay: 200 });
  } catch { /* 落到改名兜底 */ }
  if (!fs.existsSync(file)) return true;
  try {
    fs.renameSync(file, file + '.stale-' + Date.now());
  } catch { /* 锁着也无可奈何，交给 attempts 上限 */ }
  return !fs.existsSync(file);
}

function pendingMarketMarkers() {
  const out = [];
  try {
    const home = ctx.getDshHome() || path.join(os.homedir(), '.dsh');
    const profilesRoot = path.join(home, 'profiles');
    if (!fs.existsSync(profilesRoot)) return out;
    for (const entry of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const marker = path.join(profilesRoot, entry.name, MARKER_NAME);
      if (!fs.existsSync(marker)) continue;
      try {
        // 去掉可能的 UTF-8 BOM（外部编辑器写入的标记）再解析。
        const job = JSON.parse(fs.readFileSync(marker, 'utf8').replace(/^\uFEFF/, ''));
        if (job && typeof job.target === 'string' && job.target
          && typeof job.profile === 'string' && /^[A-Za-z0-9_-]+$/.test(job.profile)
          && (job.kind === 'install' || job.kind === 'uninstall')) {
          // V4.2：旧版 host 可能把目录默认 profile 'web' 写进标记（桌面壳跑
          // 在 web-desktop，profiles/web 不存在）—— 归一化后再执行，避免对
          // 不存在的 profile 跑 pnpm（spawn 报 node.exe ENOENT）。
          job.profile = job.profile === 'web' ? desktopProfile() : job.profile;
          out.push({ marker, job });
        } else {
          ctx.log('market-pending', '标记字段不完整，已删除: ' + marker);
          removeMarkerFile(marker);
        }
      } catch (err) {
        ctx.log('market-pending', `标记损坏，已删除: ${marker} (${err.message})`);
        removeMarkerFile(marker);
      }
    }
  } catch (err) {
    ctx.log('market-pending', '扫描排队任务失败: ' + err.message);
  }
  return out;
}

function finishMarketMarker(marker, job, attempts, ok, tail) {
  if (ok) {
    ctx.log('market-pending', '排队任务完成: ' + (job.label || job.target));
    if (!removeMarkerFile(marker)) {
      ctx.log('market-pending', '警告: 排队标记删除失败（文件被占用？），已尝试改名兜底');
    }
    return;
  }
  if (attempts >= MARKER_MAX_ATTEMPTS) {
    const last = String(tail || '').split(/\r?\n/).filter(Boolean).pop() || '';
    ctx.log('market-pending', `排队任务连续 ${attempts} 次失败，放弃并清除: ${job.label || job.target}${last ? ' — ' + last.slice(0, 200) : ''}`);
    removeMarkerFile(marker);
    return;
  }
  try { fs.writeFileSync(marker, JSON.stringify({ ...job, attempts }, null, 2)); } catch {}
  ctx.log('market-pending', '排队任务失败（下次启动重试）: ' + (job.label || job.target));
}

// ---------------------------------------------------------------------------
// 第三方插件构建产物保留（V4）：pnpm 重写 profile node_modules 后，把快照
// 里「磁盘上消失」的文件补回去。实现与市场 host 半边共用一份（ESM）：
// assets/plugins/dsh-unified-market/lib/artifact-keep.mjs。
// ---------------------------------------------------------------------------
const ARTIFACT_KEEP_MODULE = path.join(APP_ROOT, 'assets', 'plugins', 'dsh-unified-market', 'lib', 'artifact-keep.mjs');
let artifactKeepMod = null;

async function artifactKeep() {
  if (artifactKeepMod) return artifactKeepMod;
  try {
    artifactKeepMod = await import(pathToFileURL(ARTIFACT_KEEP_MODULE).href);
  } catch (err) {
    ctx.log('artifact-keep', '模块加载失败: ' + err.message);
    artifactKeepMod = {};
  }
  return artifactKeepMod;
}

// V4.2：pnpm allowBuilds 自动放行（排队任务 + 守护启动失败链共用同一份
// ESM：assets/plugins/dsh-unified-market/lib/allow-builds.mjs）。
const ALLOW_BUILDS_MODULE = path.join(APP_ROOT, 'assets', 'plugins', 'dsh-unified-market', 'lib', 'allow-builds.mjs');
let allowBuildsMod = null;

async function allowBuilds() {
  if (allowBuildsMod) return allowBuildsMod;
  try {
    allowBuildsMod = await import(pathToFileURL(ALLOW_BUILDS_MODULE).href);
  } catch (err) {
    ctx.log('allow-builds', '模块加载失败: ' + err.message);
    allowBuildsMod = {};
  }
  return allowBuildsMod;
}

function profileDirFor(profile) {
  const home = ctx.getDshHome() || path.join(os.homedir(), '.dsh');
  return path.join(home, 'profiles', profile);
}

function artifactCacheDirFor(profile) {
  const home = ctx.getDshHome() || path.join(os.homedir(), '.dsh');
  return path.join(home, 'plugin-artifact-cache', profile);
}

// 由桌面壳重建的包（配套插件 + 皮肤）不进快照：丢了也会被 syncCompanion
// Plugins / 皮肤同步立刻补回，缓存它们只浪费空间。
function managedPackageNames() {
  const names = COMPANION_PLUGINS.map((p) => p.name);
  try {
    for (const entry of fs.readdirSync(SKINS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkg = readJsonFile(path.join(SKINS_DIR, entry.name, 'package.json'));
      if (pkg && typeof pkg.name === 'string') names.push(pkg.name);
    }
  } catch {}
  return names;
}

// 启动兜底回填：上次 pnpm 运行后若应用异常退出没来得及回填（或回填被
// 中断），这里补上。只补缺失文件，安全幂等。
async function restoreKeptArtifacts(profile) {
  const ak = await artifactKeep();
  if (typeof ak.restoreArtifacts !== 'function') return;
  try {
    ak.restoreArtifacts(profileDirFor(profile), artifactCacheDirFor(profile), {
      log: (m) => ctx.log('artifact-keep', m),
    });
  } catch (err) {
    ctx.log('artifact-keep', '回填失败: ' + err.message);
  }
}

// 必须在"没有任何 dsh web 进程持锁"时调用；调用方负责先等待旧进程退出。
async function processPendingMarketOps() {
  const items = pendingMarketMarkers();
  if (items.length === 0) return;
  const nodeBin = nodeExe();
  const bin = dshBin();
  if (!fs.existsSync(nodeBin) || !fs.existsSync(bin)) {
    ctx.log('market-pending', '找不到 node/dsh CLI，跳过排队任务');
    return;
  }
  ctx.log('market-pending', `发现 ${items.length} 个排队任务，开始执行（Web 服务启动前，无文件锁）`);
  // V4：pnpm 即将重写 node_modules —— 先快照第三方包（含人工补齐的
  // lib/ 等构建产物），任务结束后回填被清掉的部分（meow-memory 修复）。
  const profiles = [...new Set(items.map((it) => it.job.profile))];
  const ak = await artifactKeep();
  if (typeof ak.snapshotArtifacts === 'function') {
    for (const profile of profiles) {
      try {
        ak.snapshotArtifacts(profileDirFor(profile), artifactCacheDirFor(profile), {
          managedNames: managedPackageNames(),
          log: (m) => ctx.log('artifact-keep', m),
        });
      } catch (err) {
        ctx.log('artifact-keep', `snapshot ${profile} 失败: ` + err.message);
      }
    }
  }
  await new Promise((resolve) => {
    let idx = 0;
    // V4.2：allowBuilds 自动放行后的重试只允许一次（同一 marker）。
    const retriedMarkers = new Set();
    const next = async () => {
      if (idx >= items.length) {
        // pnpm 可能重新 hoist 出 @deepseek-ai 遮蔽拷贝，装完立刻清理，
        // 避免模块双实例（Symbol 身份不一致）问题拖到下次启动。
        healProfileModules();
        return resolve();
      }
      const { marker, job } = items[idx];
      const retried = retriedMarkers.has(marker);
      const attempts = Number(job.attempts || 0) + 1;
      const action = job.kind === 'uninstall' ? 'remove' : 'add';
      // 安装前快照（保护中心）：排队任务改的是 profile 配置面，出问题可
      // 一键/自动回滚到这里。
      ensureGuard().snapshot('market:' + job.target);
      ctx.log('market-pending', `执行(${attempts}/${MARKER_MAX_ATTEMPTS}): dsh plugin --profile ${job.profile} ${action} ${job.target}`);
      const child = spawn(nodeBin, [bin, 'plugin', '--profile', job.profile, action, job.target], {
        cwd: ctx.getUserDataDir(),
        // CI=true 与市场插件 host 侧一致：pnpm v10 无 TTY 时对被忽略的构建
        // 脚本（如 node-llama-cpp）静默放行，而不是 ERR_PNPM_IGNORED_BUILDS 硬失败。
        env: { ...childEnv(), CI: 'true' },
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      setMarketOpChild(child);
      let tail = '';
      const onData = (c) => {
        const text = c.toString();
        tail = (tail + text).slice(-8000);
        for (const line of text.split(/\r?\n/)) {
          const s = line.trim();
          // Progress: \r 进度条不进日志，只保留有信息量的行。
          if (s && !/^Progress:/.test(s)) ctx.log('market-pending', s.slice(0, 300));
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const timer = setTimeout(() => {
        ctx.log('market-pending', '排队任务超时（5 分钟），强制终止');
        try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
      }, 5 * 60 * 1000);
      child.on('error', (err) => {
        clearTimeout(timer);
        if (getMarketOpChild() === child) setMarketOpChild(null);
        finishMarketMarker(marker, job, attempts, false, String(err.message));
        idx += 1;
        next();
      });
      child.on('close', async (code) => {
        clearTimeout(timer);
        if (getMarketOpChild() === child) setMarketOpChild(null);
        // V4.2：pnpm 封锁构建脚本硬失败时，从输出解析包名、自动写入
        // pnpm-workspace.yaml 的 allowBuilds（兼容旧名 onlyBuiltDependencies）
        // 后重试同一任务一次（不消耗 attempts）。
        if (code !== 0 && !retried) {
          try {
            const ab = await allowBuilds();
            const keys = (ab.parseBlockedBuildKeys || (() => []))(tail);
            if (keys.length > 0) {
              const r = await ab.ensureAllowBuilds(path.join(profileDirFor(job.profile), 'pnpm-workspace.yaml'), keys);
              if (r && r.wrote) {
                ctx.log('market-pending', `[allowBuilds] 已自动放行 ${r.added.join(', ')}，自动重试`);
                retriedMarkers.add(marker);
                next();
                return;
              }
            }
          } catch (err) {
            ctx.log('market-pending', '[allowBuilds] 自动放行失败: ' + String((err && err.message) || err));
          }
        }
        finishMarketMarker(marker, job, attempts, code === 0, tail);
        idx += 1;
        next();
      });
    };
    next();
  });
  // pnpm 重写完成：回填被清掉的第三方构建产物（lib/ 等）。
  if (typeof ak.restoreArtifacts === 'function') {
    for (const profile of profiles) {
      try {
        ak.restoreArtifacts(profileDirFor(profile), artifactCacheDirFor(profile), {
          log: (m) => ctx.log('artifact-keep', m),
        });
      } catch (err) {
        ctx.log('artifact-keep', `restore ${profile} 失败: ` + err.message);
      }
    }
  }
}

// 内置 skills 分发目录：assets/skills/<kebab-name>/SKILL.md。~/.dsh/skills
// 本就是 dsh-skill-filesystem 的默认扫描根（rank 400），这里只需把内置
// 技能同步过去 —— 内核零配置。同步规则：带 .eac-skill.json 标记的目录由
// EAC 管理（版本变化时覆盖更新）；用户自建同名目录（无标记）永不覆盖。
const BUNDLED_SKILLS_DIR = path.join(APP_ROOT, 'assets', 'skills');

function syncBundledSkills() {
  try {
    const src = BUNDLED_SKILLS_DIR;
    if (!fs.existsSync(src)) return;
    const destRoot = path.join(ctx.getDshHome() || path.join(os.homedir(), '.dsh'), 'skills');
    fs.mkdirSync(destRoot, { recursive: true });
    const installed = [];
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillSrc = path.join(src, entry.name);
      if (!fs.existsSync(path.join(skillSrc, 'SKILL.md'))) continue;
      const skillDst = path.join(destRoot, entry.name);
      const markerSrc = readJsonFile(path.join(skillSrc, '.eac-skill.json')) || { version: 1, managed: true };
      const markerDst = readJsonFile(path.join(skillDst, '.eac-skill.json'));
      if (markerDst && markerDst.version === markerSrc.version) continue;
      if (!markerDst && fs.existsSync(skillDst)) continue; // 用户自建同名技能：不动
      fs.cpSync(skillSrc, skillDst, { recursive: true });
      installed.push(entry.name);
    }
    if (installed.length) ctx.log('boot', '已同步内置 skills 到 ' + destRoot + ': ' + installed.join(', '));
  } catch (err) {
    ctx.log('boot', '同步内置 skills 失败: ' + err.message);
  }
}

module.exports = {
  MARKER_NAME,
  MARKER_MAX_ATTEMPTS,
  BUNDLED_SKILLS_DIR,
  init,
  getMarketOpChild,
  setMarketOpChild,
  removeMarkerFile,
  pendingMarketMarkers,
  finishMarketMarker,
  artifactKeep,
  allowBuilds,
  profileDirFor,
  artifactCacheDirFor,
  managedPackageNames,
  restoreKeptArtifacts,
  processPendingMarketOps,
  syncBundledSkills,
};
