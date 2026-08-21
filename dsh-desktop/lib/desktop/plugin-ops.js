'use strict';

// 插件启停管理（自 main.js 原样迁出，ADR 0002 L2 业务服务层）：
// 设置页「插件 → 管理」标签的数据与写盘。dsh:plugin-list /
// dsh:plugin-set-enabled 两个 IPC 驱动；写盘用纯文本手术
// （scripts/plugin-manager-patch.js），保留文件其它内容与注释。

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { togglePluginInPatch, removePluginFromPatch, hasEntryId } = require('../../scripts/plugin-manager-patch');
const { collectPluginRows } = require('../../plugin-manager-state');
const onboardingLogic = require('../../scripts/onboarding');
const { configLinesFor } = require('../../patch-row-heal');
const {
  COMPANION_PLUGINS,
  removedPluginIds,
  saveRemovedPluginIds,
  builtinPluginSourceDir,
  readJsonFile,
  copyPluginPackage,
} = require('./companion-sync');
const { desktopProfileDir } = require('./profile');
const { APP_ROOT } = require('./runtime-paths');

let ctx = {};
function init(d) { ctx = d; }

// 惰性加载 js-yaml（内置 dsh 的传递依赖）；缺失时管理页降级为空列表。
let dshYamlDialect = null;
let dshYamlTried = false;
function loadDshYamlDialect() {
  if (dshYamlTried) return dshYamlDialect;
  dshYamlTried = true;
  try {
    const yaml = require('js-yaml');
    // 与 dsh 相同的 entry-list 方言：`!!js` 表达式是合法标量。
    const jsType = new yaml.Type('tag:yaml.org,2002:js', {
      kind: 'scalar',
      resolve: (data) => typeof data === 'string',
      construct: (data) => ({ __jsExpr: data }),
    });
    dshYamlDialect = { load: (content) => yaml.load(content, { schema: yaml.JSON_SCHEMA.extend(jsType) }) };
  } catch {
    dshYamlDialect = null;
  }
  return dshYamlDialect;
}

function pluginManagerReadPatch() {
  const file = path.join(desktopProfileDir(), 'cordis.patch.yml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch {}
  const yaml = loadDshYamlDialect();
  if (!yaml) return { file, text, entries: [] };
  try {
    const parsed = yaml.load(text);
    return { file, text, entries: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { file, text, entries: [] };
  }
}

function pluginManagerPackageDescription(name) {
  if (!name) return '';
  const candidates = [
    path.join(desktopProfileDir(), 'node_modules', ...name.split('/')),
    path.join(APP_ROOT, 'assets', 'plugins', name.includes('/') ? name.slice(name.indexOf('/') + 1) : name),
  ];
  for (const dir of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg && typeof pkg.description === 'string' && pkg.description) return pkg.description;
    } catch {}
  }
  return '';
}

function pluginManagerCollect() {
  const { entries } = pluginManagerReadPatch();
  let bundles = [];
  try {
    const m = JSON.parse(fs.readFileSync(path.join(desktopProfileDir(), 'package.json'), 'utf8'));
    bundles = (m && m.dsh && m.dsh.profile && Array.isArray(m.dsh.profile.bundles)) ? m.dsh.profile.bundles : [];
  } catch {}
  return collectPluginRows(entries, {
    companion: COMPANION_PLUGINS.map((p) => ({ id: p.id, name: p.name })),
    coreIds: onboardingLogic.CORE_PLUGIN_IDS,
    removedIds: removedPluginIds(),
    describe: (name) => pluginManagerPackageDescription(name),
    bundles,
  });
}

function pluginManagerResolveName(id) {
  const c = COMPANION_PLUGINS.find((p) => p.id === id);
  if (c) return c.name;
  const { entries } = pluginManagerReadPatch();
  for (const entry of entries) {
    if (entry && Array.isArray(entry.insert)) {
      const it = entry.insert.find((x) => x && x.id === id);
      if (it && it.name) return it.name;
    }
  }
  return '';
}

// 恢复单个配套插件：立即复制包 + 补写 patch 行（与 syncCompanionPlugins
// 的写入规则一致），重启服务后生效。源目录走「覆盖层优先」（V4.3）：
// 被恢复的内置插件若是已更新版本，恢复回来的就是更新版。
function restoreCompanionPlugin(p) {
  const profileDirP = desktopProfileDir();
  const dirName = p.dir || (p.name.includes('/') ? p.name.split('/').pop() : p.name);
  const src = builtinPluginSourceDir(dirName);
  if (!fs.existsSync(path.join(src, 'package.json'))) {
    return { ok: false, error: '配套插件源目录无效: ' + src };
  }
  copyPluginPackage(profileDirP, src, p.name);
  const patchFile = path.join(profileDirP, 'cordis.patch.yml');
  let patch = '';
  try { patch = fs.readFileSync(patchFile, 'utf8'); } catch {}
  if (!hasEntryId(patch, p.id)) {
    let bundled = [];
    try { bundled = readJsonFile(path.join(profileDirP, 'package.json'))?.dsh?.profile?.bundles || []; } catch { bundled = []; }
    if (!bundled.includes(p.name)) {
      let block = `- insert:\n    - id: ${p.id}\n      name: '${p.name}'\n`;
      if (p.config) block += configLinesFor(p.config);
      if (p.disabled) block += `      disabled: true\n`;
      if (/^\s*\[\]\s*$/m.test(patch)) patch = patch.replace(/\[\]/m, block);
      else if (patch.trim() === '') patch = '# dsh web profile patch（由 DSH Desktop 维护）\n' + block;
      else patch = patch.replace(/\s*$/, '\n') + block;
      try { fs.writeFileSync(patchFile, patch); } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    }
  }
  return { ok: true };
}

// removed=true 移除（卸载语义）；removed=false 恢复。核心插件拒绝移除。
function pluginManagerSetRemoved(id, removed) {
  const p = COMPANION_PLUGINS.find((x) => x.id === id);
  if (!p) return { ok: false, error: '未知内置插件: ' + String(id) };
  if (onboardingLogic.CORE_PLUGIN_IDS.has(id)) {
    return { ok: false, error: '核心插件不可移除: ' + String(id) };
  }
  const removedSet = removedPluginIds();
  const patchFile = path.join(desktopProfileDir(), 'cordis.patch.yml');
  try {
    if (removed) {
      // 1) 清 patch 行（顶层 + insert 内层）
      let text = '';
      try { text = fs.readFileSync(patchFile, 'utf8'); } catch {}
      const patched = removePluginFromPatch(text, id);
      if (patched !== text) fs.writeFileSync(patchFile, patched, 'utf8');
      // 2) 删 profile node_modules 里的包副本（copyPluginPackage 的产物）
      const pkgDir = path.join(desktopProfileDir(), 'node_modules', p.name);
      fs.rmSync(pkgDir, { recursive: true, force: true });
      // 3) 记入跳过清单（下次 sync 不再写回）
      removedSet.add(id);
      saveRemovedPluginIds(removedSet);
      ctx.log('plugin-manager', '已移除内置插件 ' + id);
      return { ok: true, restartRequired: true };
    }
    // 恢复：清出跳过清单 + 立即复制包与行
    removedSet.delete(id);
    saveRemovedPluginIds(removedSet);
    const res = restoreCompanionPlugin(p);
    if (!res.ok) return res;
    ctx.log('plugin-manager', '已恢复内置插件 ' + id);
    return { ok: true, restartRequired: true };
  } catch (err) {
    ctx.log('plugin-manager', '移除/恢复插件 ' + id + ' 失败: ' + ((err && err.message) || err));
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// 图片粘贴保存（dsh-image-paste 插件）：只接受 image/* 的 data URL，
// base64 解码后原子写入 %TEMP%/dsh-paste/<清洗名>-<时间戳><ext>，返回
// { ok, path, size }。文件在临时目录，随系统清理，不污染工作区。
const IMAGE_PASTE_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_PASTE_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  'image/ico': '.ico',
  'image/x-icon': '.ico',
  'image/tiff': '.tiff',
};

function imagePasteSave(dataUrl, name) {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: '不是合法的图片 data URL' };
  const mime = m[1].toLowerCase();
  if (!IMAGE_PASTE_EXT[mime]) return { ok: false, error: '不支持的图片类型: ' + mime };
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) return { ok: false, error: '图片内容为空' };
  if (buf.length > IMAGE_PASTE_MAX_BYTES) return { ok: false, error: '图片超过 15MB 上限' };
  const dir = path.join(os.tmpdir(), 'dsh-paste');
  fs.mkdirSync(dir, { recursive: true });
  const base = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 40) || '粘贴图片';
  const file = path.join(dir, base + '-' + Date.now() + IMAGE_PASTE_EXT[mime]);
  fs.writeFileSync(file, buf);
  return { ok: true, path: file, size: buf.length };
}

// 写入/移除用户层 disabled 条目（纯文本手术见 scripts/plugin-manager-patch.js）：
// 与上游的差异 —— 「启用」保留顶层裸条目 {id, name} 而不是整条移除，这样
// 默认禁用的配套插件（dsh-pet）被用户启用后不会被下次 sync 重新插回
// disabled 行（sync 的「已有行不重写」规则自然接管）。
function pluginManagerSetEnabled(id, enabled) {
  if (onboardingLogic.CORE_PLUGIN_IDS.has(id)) {
    return { ok: false, error: '核心插件不可停用: ' + String(id) };
  }
  const file = path.join(desktopProfileDir(), 'cordis.patch.yml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch {}
  if (!text.trim()) text = '# dsh web profile patch（由 Deepseek Harness EAC 维护）\n';

  const name = pluginManagerResolveName(id);
  if (!enabled && !name) return { ok: false, error: '无法解析插件包名: ' + id };

  let patched;
  try {
    patched = togglePluginInPatch(text, id, !!enabled, name);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
  if (patched !== text) {
    try {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, patched, 'utf8');
      fs.renameSync(tmp, file);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }
  return { ok: true };
}

module.exports = {
  IMAGE_PASTE_MAX_BYTES,
  IMAGE_PASTE_EXT,
  init,
  loadDshYamlDialect,
  pluginManagerReadPatch,
  pluginManagerPackageDescription,
  pluginManagerCollect,
  pluginManagerResolveName,
  restoreCompanionPlugin,
  pluginManagerSetRemoved,
  imagePasteSave,
  pluginManagerSetEnabled,
};
