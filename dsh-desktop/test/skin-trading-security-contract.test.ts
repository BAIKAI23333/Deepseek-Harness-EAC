// 交易皮肤（@dsh-eac/skin-trading）发行前安全契约。
//
// 审查结论（P1，发行前必修）：`lib/client.js` 的 `loadTencentQuotes` 以 JSONP 方式
// 向 https://qt.gtimg.cn 动态插入 <script>，由 WebView 直接执行第三方返回的脚本体；
// 宿主 WebView 的 CSP 为 null，故这条通道等同「远端可随时在本客户端执行任意 JS」。
//
// 本文件把修复后的安全契约钉死：
//   A. 静态面：bundle 不含任何 <script> 动态注入/JSONP 通道痕迹，也不含第三方行情
//      域名；远程源只剩既有安全 fetch 源（Binance / Frankfurter）与本地 ticker API。
//   B. 行为面（jsdom + vm 真实加载 bundle、登记并激活皮肤）：
//      ① 激活全程不创建任何 <script>（含异步行情刷新窗口）；
//      ② 一切 fetch 目标都在既有安全源白名单内（零新远程源）；
//      ③ 行情全部缺席时优雅降级为占位符（-- / —），激活与卸载都不抛错、无未处理拒绝；
//      ④ 行情可用（本地 ticker API 承担股票报价）时正常渲染——安全修复未打断正常路径。
//
// 修复前本文件对 A/①为红（现行 bundle 会插入 qt.gtimg.cn 的 <script>）；修复后全绿。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = join(root, 'dsh-desktop', 'assets', 'plugins', 'dsh-eac-skin-trading', 'lib', 'client.js');
const source = readFileSync(BUNDLE, 'utf8');

/** 允许出现的远程源：既有安全 fetch 源 + SVG 命名空间（非网络目标）。不得新增。 */
const ALLOWED_ORIGINS = [
  'https://api.binance.com',
  'https://data-api.binance.vision',
  'https://api.frankfurter.dev',
  'https://api.frankfurter.app',
  'http://www.w3.org',
];

/** jsdom 文档自身的源（本地 ticker API 走相对路径，解析后落在这里）。 */
const DOCUMENT_ORIGIN = 'https://desktop.dsh.local';

function originOf(url: string, base: string): string {
  try {
    return new URL(url, base).origin;
  } catch {
    return `<unparsable:${url}>`;
  }
}

interface FetchCall {
  url: string;
  origin: string;
}

interface Mounted {
  created: string[];
  requests: FetchCall[];
  document: any;
  activate(): void;
  abort(): void;
}

/**
 * 真实加载随包 client bundle，并把皮肤经 fake uiSkinLoader 登记 + 激活。
 * 传入的 fetchImpl 决定行情来源行为（拒绝 = 全部缺席；返回本地 ticker 响应 = 行情可用）。
 */
function mountSkin(fetchImpl: (url: string) => Promise<unknown>): Mounted {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: `${DOCUMENT_ORIGIN}/`,
  });
  const internal = dom.getInternalVMContext();
  const { window } = dom;

  const created: string[] = [];
  const requests: FetchCall[] = [];
  const originalCreateElement = window.document.createElement.bind(window.document);
  window.document.createElement = (tag: unknown, ...rest: unknown[]) => {
    created.push(String(tag).toLowerCase());
    return originalCreateElement(tag as string, ...(rest as []));
  };
  window.fetch = (url: unknown) => {
    const href = String(url);
    requests.push({ url: href, origin: originOf(href, window.location.href) });
    return fetchImpl(href);
  };

  let exported: any;
  window.__ModuleLoader__ = {
    load: (definition: { id: string; factory: (require: unknown) => unknown }) => {
      exported = definition.factory(() => {
        throw new Error('bundle 不得 require 任何模块');
      });
    },
  };
  vm.runInContext(source, internal, { filename: BUNDLE });
  assert.equal(typeof exported?.apply, 'function', 'bundle 必须导出 apply（client 入口）');

  const registered: any[] = [];
  const hostCtx = {
    // 宿主服务全部缺席：连接/工作区读取走皮肤自带降级路径。
    get: () => undefined,
    effect: (fn: () => unknown) => fn(),
    uiSkinLoader: {
      registerSkin(definition: unknown) {
        registered.push(definition);
        return () => {};
      },
    },
  };
  exported.apply(hostCtx);
  assert.equal(registered.length, 1, '皮肤必须经 uiSkinLoader 登记（唯一换肤控制面）');

  const controller = new window.AbortController();
  let activated = false;
  return {
    created,
    requests,
    document: window.document,
    activate() {
      registered[0].activate({
        logger: { info() {}, warn() {} },
        signal: controller.signal,
      });
      activated = true;
    },
    abort() {
      if (activated) controller.abort();
    },
  };
}

/** 让行情刷新链上的 await 全部落定（含本地 ticker 的双跳）。 */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 40; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 10));
}

const jsonResponse = (data: unknown) => ({ ok: true, json: async () => data });

function assertNoScriptInjection(mounted: Mounted): void {
  assert.deepEqual(
    mounted.created.filter((tag) => tag === 'script'),
    [],
    '激活期间不得创建任何 <script>（动态脚本注入是 P1 通道）',
  );
  assert.equal(mounted.document.querySelectorAll('script').length, 0, '文档内不得存在 <script>');
}

function assertRequestsStayOnSafeSources(mounted: Mounted, allowed: string[]): void {
  for (const call of mounted.requests) {
    assert.ok(
      allowed.includes(call.origin),
      `fetch 目标越界：${call.url}（源 ${call.origin} 不在安全源白名单内）`,
    );
  }
}

// ---------------------------------------------------------------------------
// A. 静态面：bundle 里不得再有脚本注入 / JSONP 通道 / 第三方行情域名
// ---------------------------------------------------------------------------

test('bundle 语法有效（node --check 等价：可被 vm 解析）', () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: BUNDLE }));
});

test('bundle 不含动态 <script> 注入与 JSONP 执行通道', () => {
  for (const [pattern, label] of [
    [/createElement\(\s*["'`]script["'`]\s*\)/, '动态创建 <script>'],
    [/\bscript\.src\b/, '为 script 赋 src'],
    [/\.(?:append|appendChild|insertBefore)\(\s*script\b/, '把 script 插入文档'],
    [/jsonp/i, 'JSONP 字样'],
    [/gtimg/i, '第三方行情域名（qt.gtimg.cn）'],
    [/loadTencentQuotes|parseTencentRow/, '腾讯行情加载器'],
    [/document\.write\b/, 'document.write'],
    [/insertAdjacentHTML/, 'insertAdjacentHTML'],
    [/\beval\s*\(/, 'eval'],
    [/new\s+Function\s*\(/, 'new Function'],
  ] as const) {
    assert.doesNotMatch(source, pattern, `bundle 不得出现：${label}`);
  }
});

test('bundle 的远程源只剩既有安全 fetch 源（不得新增远程源）', () => {
  const origins = new Set<string>();
  for (const match of source.matchAll(/https?:\/\/[^"'\s`)]+/g)) {
    origins.add(originOf(match[0], DOCUMENT_ORIGIN));
  }
  for (const origin of origins) {
    assert.ok(ALLOWED_ORIGINS.includes(origin), `bundle 出现未登记远程源：${origin}`);
  }
});

test('bundle 的 innerHTML 只写入本地常量（不得由网络数据拼 HTML）', () => {
  const assignments = [...source.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)];
  for (const [, expression] of assignments) {
    const value = expression.trim();
    assert.match(
      value,
      /^[A-Za-z_$][\w$]*$/,
      `innerHTML 只允许赋本地常量标识符，实际为：${value}`,
    );
  }
});

// ---------------------------------------------------------------------------
// B. 行为面：行情全部缺席时零注入、优雅降级、激活/卸载不崩
// ---------------------------------------------------------------------------

test('行情全部缺席：零 script 注入、占位符降级、激活与卸载都不抛错', async () => {
  const mounted = mountSkin(() => Promise.reject(new Error('offline')));
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    assert.doesNotThrow(() => mounted.activate(), '行情缺席不得让皮肤激活崩溃');
    await settle();

    assertNoScriptInjection(mounted);
    assertRequestsStayOnSafeSources(mounted, [...ALLOWED_ORIGINS, DOCUMENT_ORIGIN]);
    assert.ok(mounted.requests.length > 0, '行情刷新路径必须真的执行过（断言才有意义）');
    assert.ok(
      mounted.requests.some((call) => call.url.includes('/plugins/dsh-ticker/api')),
      '本地 ticker API 仍须被尝试（既有安全源承担股票报价）',
    );

    const tape = mounted.document.querySelector('[data-skin-chrome="tape"]');
    const titlebar = mounted.document.querySelector('[data-skin-chrome="titlebar"]');
    const statusbar = mounted.document.querySelector('[data-skin-chrome="statusbar"]');
    assert.ok(tape && titlebar && statusbar, '三段 chrome 必须都已挂载');
    for (const [name, node] of [['tape', tape], ['titlebar', titlebar]] as const) {
      const text = node.textContent as string;
      assert.ok(text.includes('--'), `${name} 行情应降级为 -- 占位符，实际：${text.slice(0, 80)}`);
      assert.ok(text.includes('—'), `${name} 涨跌应降级为 — 占位符`);
      assert.doesNotMatch(text, /NaN|undefined/, `${name} 不得泄露 NaN/undefined：${text.slice(0, 80)}`);
    }
    assert.ok(
      (statusbar.textContent as string).includes('-- --'),
      '长桥/指数行缺席时应显示 -- -- 占位',
    );

    await settle();
    assertNoScriptInjection(mounted);

    assert.doesNotThrow(() => mounted.abort(), '卸载不得抛错');
    assert.equal(
      mounted.document.querySelectorAll('[data-skin-chrome]').length,
      0,
      '卸载后不得残留自有 chrome 节点',
    );
    assert.deepEqual(rejections, [], '激活/刷新/卸载链路不得产生未处理拒绝');
  } finally {
    process.off('unhandledRejection', onRejection);
    mounted.abort();
  }
});

// ---------------------------------------------------------------------------
// B. 回归面：股票报价改由既有安全 fetch 源承担后，正常路径不受影响
// ---------------------------------------------------------------------------

test('行情可用（本地 ticker API 承担股票报价）时仍正常渲染，且零第三方网络', async () => {
  const mounted = mountSkin(async (url) => {
    if (url.includes('/plugins/dsh-ticker/api/settings')) {
      return jsonResponse({ ok: true, section: { symbols: ['sh000001', 'hkHSI'] } });
    }
    if (url.includes('/plugins/dsh-ticker/api/quotes')) {
      return jsonResponse({
        ok: true,
        quotes: {
          sh000001: { symbol: 'sh000001', name: '上证指数', price: 3345.6, changePct: 0.82, changeAbs: 27.3 },
          hkHSI: { symbol: 'hkHSI', name: '恒生指数', price: 25123.4, changePct: -0.35, changeAbs: -88.1 },
        },
      });
    }
    throw new Error(`本场景不得访问该目标：${url}`);
  });
  try {
    assert.doesNotThrow(() => mounted.activate());
    await settle();

    assertNoScriptInjection(mounted);
    // 行情由本地 ticker 端点供给：零第三方网络请求。
    assert.ok(mounted.requests.length > 0, 'ticker 端点必须被调用');
    for (const call of mounted.requests) {
      assert.ok(
        call.url.startsWith('/plugins/dsh-ticker/api/'),
        `本场景只允许本地 ticker 端点，实际请求：${call.url}`,
      );
    }

    const tapeText = mounted.document.querySelector('[data-skin-chrome="tape"]').textContent as string;
    const titlebarText = mounted.document.querySelector('[data-skin-chrome="titlebar"]').textContent as string;
    for (const text of [tapeText, titlebarText]) {
      assert.ok(text.includes('上证指数'), `应渲染 ticker 返回的股票名：${text.slice(0, 80)}`);
      assert.ok(text.includes('3,345.60'), `应渲染 ticker 返回的价格：${text.slice(0, 80)}`);
      assert.ok(text.includes('+0.82%'), `应渲染涨跌幅：${text.slice(0, 80)}`);
      assert.doesNotMatch(text, /NaN|undefined/);
    }
  } finally {
    mounted.abort();
  }
});
