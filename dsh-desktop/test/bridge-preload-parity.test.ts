// bridge.ts（Tauri WebView2 桥）单侧表面契约。
//
// 背景：双壳时代 preload.js ↔ bridge.ts 键集一致性由本测试锁定（Bug #58 防
// 事故）；Electron 冻结壳已退役（批次 C），preload.ts 删除后窗口桥只剩
// bridge.ts——配套插件（dsh-better-sidebar 等）在此拿 window.dshDesktop。
// 本测试保留「防解析器写歪致空树假绿」的锚点断言，并把 dshDesktop 顶层表面
// 锁成必需清单，防止未来无意删掉配套插件依赖的方法。
//
// 允许的桥侧额外键：_call/_send/_onNotify/_onReady（桥内省，非 dshDesktop 面）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bridge = readFileSync(join(root, '..', 'tauri-shell', 'sidecar', 'bridge.ts'), 'utf8');

// 从「赋值起点」做花括号配对，收集相对深度 1（顶层键）与 2（命名空间内键）。
// 跳过字符串/模板串/注释，避免内容里的冒号干扰。
function extractKeyTree(src, marker) {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `marker not found: ${marker}`);
  const braceStart = src.indexOf('{', start);
  assert.ok(braceStart > start, 'object literal not found after marker');
  let depth = 0;
  let paren = 0; // 括号深度：参数表里的 TS 类型注解（changes: unknown）不是键
  let i = braceStart;
  let quote = null; // 当前所处的字符串引号（' " `）
  let lastTop = null;
  const tree = {};
  const identRe = /[A-Za-z_$][\w$]*/y;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; i += 1; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === '{') { depth += 1; i += 1; continue; }
    if (c === '}') {
      depth -= 1;
      if (depth === 0) break; // 对象结束
      i += 1;
      continue;
    }
    if (c === '(') { paren += 1; i += 1; continue; }
    if (c === ')') { paren -= 1; i += 1; continue; }
    // 键位置：标识符 + 可选空白 + ':'（跳过 "?." 与 "::" 等非键形态）。
    if (/[A-Za-z_$]/.test(c)) {
      identRe.lastIndex = i;
      const m = identRe.exec(src);
      if (m) {
        let j = m[0].length + i;
        while (j < src.length && /\s/.test(src[j])) j += 1;
        if (src[j] === ':' && src[j + 1] !== ':' && paren === 0) {
          const name = m[0];
          if (depth === 1) {
            tree[name] = [];
            lastTop = name;
          } else if (depth === 2 && lastTop) {
            tree[lastTop].push(name);
          }
        }
        i += m[0].length;
        continue;
      }
    }
    i += 1;
  }
  assert.ok(depth === 0, `unbalanced braces after ${marker}`);
  return tree;
}

const bridgeTree = extractKeyTree(bridge, '(window as any).dshDesktop =');

// v6 Task 3.3：原测试的必需键集是 v5 全量（21 键）。随 Task 3.1 接口收敛
//（ADR 0006 v5）与 Task 3.3 分阶段接回，键集变化；断言拆成两组：
//   A. 恒在组 —— 官方契约 + 壳最小控制面，任何阶段都不得缺失；
//   B. 已接回组 —— 随插件接回恢复的 EAC 面，锁定「接回的不得回退」；
// 未接回的能力（menu / floatWindow / pluginWizard / balance* / recovery 等）
// 显式列为「不得出现」，防止以接回为名把 v6 收敛成果整体回退。
const ALWAYS_PRESENT = ['protocolVersion', 'locale', 'plugins', 'updates', 'windowControls', 'boot',
  // SYNC-001：官方 DesktopKeyboardApi —— dsh-client-shortcuts 检测到
  // data-platform 即硬依赖 keyboard（client.js:1854-1855），缺一即 throw。
  'keyboard'];
const RESTORED_BY_TASK_3_3 = ['pluginManager', 'guard', 'fileDrop', 'getPathForFile',
  'getInfo', 'revertFiles', 'openPath', 'openExternal'];
// 依据 metaone01 2026-09-19 的裁决（按 ADR 0006）：
//  - balance 不作内置，转为推荐插件（Task 4 范围）；其 balance* RPC 面不接回；
//  - plugin-wizard 因后续会与其它插件管理功能冲突，明确不接入。
// 因此下面这些键为**终态契约**（不再是"待裁决"状态），不得回归。
const STILL_RETIRED = ['menu', 'floatWindow', 'phoneBridge', 'pluginUpdates', 'imagePaste',
  'balancePrices', 'balanceModels', 'refreshBalance', 'restartService', 'copyText',
  'pluginWizard', 'recovery', 'rescue'];

test('bridge dshDesktop exposes the required namespaces（preload 退役后的单侧契约）', () => {
  // 基线锚点：防止解析器写歪导致解析出空树「假绿」。
  const tops = Object.keys(bridgeTree).filter((k) => !k.startsWith('_'));
  assert.ok(tops.length >= 10, `bridge tree parsed too few keys: ${tops.join(',')}`);
  for (const need of ALWAYS_PRESENT) {
    assert.ok(tops.includes(need), `bridge missing（恒在） ${need}`);
  }
  for (const need of RESTORED_BY_TASK_3_3) {
    assert.ok(tops.includes(need), `bridge missing（Task 3.3 已接回） ${need}`);
  }
  for (const dead of STILL_RETIRED) {
    assert.ok(!tops.includes(dead), `bridge 不得回退已收敛能力: ${dead}`);
  }
  assert.ok(bridgeTree.windowControls.length >= 5, 'windowControls subkeys parsed');
});

test('bridge keeps the introspection escape hatch for shell pages', () => {
  for (const k of ['_call', '_onReady']) {
    assert.ok(k in bridgeTree, `bridge introspection key missing: ${k}`);
  }
});

test('SYNC-001: data-platform marked and keyboard namespace locked to the official contract', () => {
  // 强耦合实测（dsh-client-shortcuts/lib/client.js）：
  //   :721-724  <html data-platform> 存在即 runtime='desktop'（否则 'web'）；
  //   :1854-1855  desktop 态 keyboard===undefined → throw "Desktop keyboard
  //   bridge unavailable"。两者必须同批在桥上就位，缺一官方 shortcuts 硬崩。
  assert.match(bridge, /setAttribute\(['"]data-platform['"]/,
    'bridge must mark <html data-platform>（官方 markDocumentPlatform 同语义）');
  // 官方 DesktopKeyboardApi（native.d.ts）只暴露 subscribe / closeWindow ——
  // 键集精确锁定，防止实现漂移出非契约面。
  assert.deepEqual([...bridgeTree.keyboard].sort(), ['closeWindow', 'subscribe'],
    `keyboard namespace drift: ${bridgeTree.keyboard.join(',')}`);
});

test('SYNC-001: keyboard bridge works on the official shortcuts probe path', async () => {
  // 等价 WebView2 注入序列：桥在 document-start 跑，页面上下文只提供最小 DOM。
  const attrs: Record<string, string> = {};
  const windowKeydowns: Array<(e: unknown) => void> = [];
  const calls: Array<{ method: string; params: any }> = [];
  const window: any = {
    addEventListener(type: string, fn: (e: unknown) => void) { if (type === 'keydown') windowKeydowns.push(fn); },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      const i = windowKeydowns.indexOf(fn);
      if (i >= 0) windowKeydowns.splice(i, 1);
    },
    __DSH_WS_RPC__: () => ({
      onNotify() {},
      send() {},
      call: (method: string, params: any) => { calls.push({ method, params }); return Promise.resolve({ ok: true }); },
    }),
  };
  const document: any = {
    readyState: 'loading',
    documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
    addEventListener() {},
  };
  runInNewContext(stripTypeScriptTypes(bridge), {
    window,
    document,
    navigator: { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    setInterval() {},
    setTimeout() {},
  });

  // data-platform：document-start 即标记，值域 'windows'（client.js detectEnvironment
  // 以 /win/i 归一化 → platform='windows'，与官方 shortcuts 期望一致）。
  assert.equal(attrs['data-platform'], 'windows');

  // subscribe：返回 disposer，首订即挂 keydown 捕获（官方 preload-app.ts:19-36
  // 的 ipcRenderer.on 形态）。
  assert.equal(typeof window.dshDesktop.keyboard.subscribe, 'function');
  assert.equal(typeof window.dshDesktop.keyboard.closeWindow, 'function');
  const received: any[] = [];
  const dispose = window.dshDesktop.keyboard.subscribe((input: unknown) => received.push(input));
  assert.equal(typeof dispose, 'function');
  assert.equal(windowKeydowns.length, 1, 'keydown capture must be armed on first subscribe');

  // 主文档按键 → kind='keyboard'（DesktopShortcutInput 官方形态，secondCode
  // 按官方主进程行为仅 chord 命中才出现，单键不含该键）。deepStrictEqual 会
  // 对 vm realm 的对象原型做引用比较 —— 先 JSON 归一到宿主 realm 再比。
  windowKeydowns[0]({ code: 'KeyK', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, repeat: false });
  assert.deepEqual(JSON.parse(JSON.stringify(received[0])), {
    revision: 'eac-shortcut-revision-0',
    kind: 'keyboard',
    frameName: '',
    code: 'KeyK',
    control: true,
    alt: false,
    shift: false,
    meta: false,
    repeat: false,
  });

  // iframe 分支：activeElement 命中官方匹配集（preload-app.ts:21-24）→
  // kind='iframe' + frameName=element.name。
  document.activeElement = {
    isConnected: true,
    matches: (sel: string) => sel === 'iframe[data-sidebar-browser-frame], iframe[data-html-preview]',
    name: 'preview-frame',
  };
  windowKeydowns[0]({ code: 'KeyW', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, repeat: false });
  assert.equal(received[1].kind, 'iframe');
  assert.equal(received[1].frameName, 'preview-frame');

  // webview 分支（preload-app.ts:27-30）：frameName 取 name 属性。
  document.activeElement = {
    isConnected: true,
    matches: (sel: string) => sel === 'webview[data-sidebar-browser-frame]',
    getAttribute: (k: string) => (k === 'name' ? 'browser-lease-1' : null),
  };
  windowKeydowns[0]({ code: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, repeat: true });
  assert.equal(received[2].kind, 'webview');
  assert.equal(received[2].frameName, 'browser-lease-1');
  assert.equal(received[2].repeat, true);

  // disposer：退订后不再投递，最后一个退订卸下捕获。
  dispose();
  assert.equal(windowKeydowns.length, 0, 'keydown capture must be released after last unsubscribe');

  // closeWindow：官方契约 Promise<void>；EAC 无修订校验，revision 透传
  // win.close 帧（L1 记录）。
  await window.dshDesktop.keyboard.closeWindow('rev-1');
  const close = calls.find((c) => c.method === 'win.close');
  assert.ok(close, 'closeWindow must route through win.close');
  assert.equal(close.params.revision, 'rev-1');
});

test('rc.2 settings update consumer can initialize with the desktop bridge', async () => {
  const window: any = {
    addEventListener() {},
    __DSH_WS_RPC__: () => ({ onNotify() {}, send() {}, call: async () => ({}) }),
  };
  runInNewContext(stripTypeScriptTypes(bridge), {
    window,
    document: { readyState: 'loading', addEventListener() {} },
    setInterval() {},
  });

  // Exercise the pinned kernel's real consumer: browser-only smoke has no carrier
  // and cannot catch a missing status() that aborts the desktop settings plugin.
  const client = readFileSync(join(root, 'node_modules', '@deepseek-ai',
    'dsh-client-ui-settings-general', 'lib', 'client.js'), 'utf8');
  const marker = 'var DesktopUpdateSource = class';
  const start = client.indexOf(marker);
  const end = client.indexOf('//#endregion', start);
  assert.ok(start >= 0 && end > start, 'pinned update consumer must be present');
  const Consumer = runInNewContext(client.slice(start, end) + '\nDesktopUpdateSource;', {
    _deepseek_ai_dsh_client_store: {
      createSnapshotStore(initial: unknown) {
        let snapshot = initial;
        return { getSnapshot: () => snapshot, set: (next: unknown) => { snapshot = next; } };
      },
    },
  });
  const updates = window.dshDesktop.updates;
  const consumer = new Consumer(updates);
  await Promise.resolve();
  assert.equal(consumer.store.getSnapshot().presentation.phase, 'idle');
  assert.equal(consumer.store.getSnapshot().failed, false);
  assert.equal(typeof updates.open, 'function');
  await assert.rejects(updates.open(), /capability "client-update"/);
  assert.equal((await updates.check()).phase, 'idle');
  consumer.dispose();
});
