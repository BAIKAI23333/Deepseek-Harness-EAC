// miku vendored apply 的「半途失败回滚」契约（TDD 红→绿）。
//
// 背景：@dsh-eac/skin-miku 的 client bundle 由上游 dsh-web-ui 皮肤 vendored 而来，
// activate 的顺序是：
//   ① 插入 <style> 节点；
//   ② 快照 body 的 backdrop 内联属性；
//   ③ 写 body.dataset.dshMiku（换肤标记）；
//   ④ setBackdrop() 写 body 的 background-* 内联属性；
//   ⑤ MutationObserver 监听 data-ds-dark-theme；
//   ⑥ 建 titlebar / statusbar / favicon 等 chrome；
//   ⑦ 最后才 ctx.effect(() => () => { 恢复 background-*、删 marker、摘 chrome })。
// vendored 自己的回滚逻辑整段挂在 ⑦ 的 effect disposer 上。于是 ④ 之后、⑦ 之前
// 抛出的任何异常（浏览器里 createElement/append 失败、生成器映射表缺失导致的
// ReferenceError 等真实事故形态）都会留下 ④ 写进 body 的 background-* 内联样式：
// wrapper（activateMikuSession）的 teardown 只按「新出现的节点 / 新出现的 data
// marker」做通用清扫，body 的内联 style 不在其中，皮肤激活失败后桌面背景仍是
// miku 渐变+固定背景，且没有任何 disposer 能恢复它。
//
// 已钉死的契约（jsdom + vm 真实加载随包 bundle，经 fake uiSkinLoader 激活）：
//   A. apply 中途 createElement 抛错：wrapper 必须把 activation 前的 body 内联
//      style 恢复到基线，并清掉 marker / style 节点 / chrome / favicon，且把原始
//      异常继续抛给宿主（不得吞掉）；
//   B. 正常激活不受影响（chrome 挂载、marker 在位、miku 背景生效），abort 卸载后
//      回到激活前基线；
//   C. 失败回滚后仍能再次正常激活（回滚不得把 wrapper 卡死）；
//   D. body 内联 style 回滚只发生在失败路径：正常激活期间其他插件改的 body 内联
//      样式，卸载时不得被「activation 前快照」覆盖。
//
// 修复前 A 为红（background-* 残留 miku 渐变），B/C/D 为绿（防回归护栏）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = join(root, 'dsh-desktop', 'assets', 'plugins', 'dsh-eac-skin-miku', 'lib', 'client.js');
const source = readFileSync(BUNDLE, 'utf8');

/** vendored apply 给自有 <style> 打的标记（session.ts 的 ownStyles() 同口径）。 */
const UPSTREAM_PACKAGE = '@linxin666/dsh-client-ui-skin-miku';
const BODY_MARKER = 'data-dsh-miku';
const BASELINE_IMAGE = 'url("baseline-desktop.png")';

interface Mounted {
  document: any;
  warnings: string[];
  activate(): void;
  abort(): void;
  failCreateElementFor(tag: string | null): void;
}

/**
 * 真实加载随包 client bundle，并把皮肤经 fake uiSkinLoader 登记。
 * body 上预置「上一个皮肤/桌面壳」留下的内联样式与无关 data 属性作为基线。
 */
function mount(): Mounted {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://desktop.dsh.local/',
  });
  const { window } = dom;
  const document = window.document;

  // 基线：非空的内联背景 + 一个与皮肤无关的 data 属性（回滚不得误删）。
  document.body.style.setProperty('background-image', BASELINE_IMAGE);
  document.body.style.setProperty('background-repeat', 'repeat-x');
  document.body.dataset.hostMarker = 'kept';

  // 故障注入点：让 apply 中途的某次 createElement 抛错。
  let failingTag: string | null = null;
  const nativeCreateElement = document.createElement.bind(document);
  document.createElement = ((tag: unknown, ...rest: unknown[]) => {
    if (failingTag !== null && String(tag).toLowerCase() === failingTag) {
      throw new Error(`forced createElement failure: ${String(tag)}`);
    }
    return nativeCreateElement(tag as string, ...(rest as []));
  }) as typeof document.createElement;

  let exported: any;
  window.__ModuleLoader__ = {
    load: (definition: { id: string; factory: (require: unknown) => unknown }) => {
      exported = definition.factory(() => {
        throw new Error('bundle 不得 require 任何模块');
      });
    },
  };
  vm.runInContext(source, dom.getInternalVMContext(), { filename: BUNDLE });
  assert.equal(typeof exported?.apply, 'function', 'bundle 必须导出 apply（client 入口）');

  const registered: any[] = [];
  const warnings: string[] = [];
  const hostCtx = {
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
    document,
    warnings,
    activate() {
      registered[0].activate({
        logger: { info() {}, warn: (message: string) => warnings.push(String(message)) },
        signal: controller.signal,
      });
      activated = true;
    },
    abort() {
      if (activated) controller.abort();
    },
    failCreateElementFor(tag) {
      failingTag = tag;
    },
  };
}

const bodyStyle = (document: any): string | null => document.body.getAttribute('style');
const ownStyleCount = (document: any): number =>
  document.querySelectorAll(`style[data-plugin="${UPSTREAM_PACKAGE}"]`).length;
const chromeCount = (document: any): number => document.querySelectorAll('[data-skin-chrome]').length;

// ---------------------------------------------------------------------------
// A. apply 中途失败：body 内联背景 / marker / style 节点 / chrome 全部回到基线
// ---------------------------------------------------------------------------

test('apply 中途 createElement 抛错：body 背景、marker、style 节点、chrome 全部回到基线', () => {
  const mounted = mount();
  try {
    const baselineStyle = bodyStyle(mounted.document);
    assert.ok(
      typeof baselineStyle === 'string' && baselineStyle.includes('baseline-desktop.png'),
      `夹具前提：body 基线里应有上一个皮肤的背景（实际 ${baselineStyle}）`,
    );

    // favicon 的 <link> 是 ctx.effect 之前的最后一次 createElement：
    // 此时 body 的 data marker、background-* 内联属性都已写下，但 vendored 的
    // 回滚 disposer 还没登记。
    mounted.failCreateElementFor('link');
    assert.throws(
      () => mounted.activate(),
      /forced createElement failure/,
      'apply 自身的异常必须继续抛给宿主（wrapper 不得吞掉）',
    );

    assert.equal(
      mounted.document.body.hasAttribute(BODY_MARKER),
      false,
      '失败后不得残留换肤 marker（data-dsh-miku）',
    );
    assert.equal(
      bodyStyle(mounted.document),
      baselineStyle,
      '失败后 body 内联样式必须回到 activation 前基线（不留 miku 背景）',
    );
    assert.equal(
      mounted.document.body.style.backgroundRepeat,
      'repeat-x',
      '失败后 body 上被 vendored 覆盖的 backdrop 属性必须逐条回滚',
    );
    assert.equal(
      String(mounted.document.body.style.backgroundImage).includes('linear-gradient'),
      false,
      '失败后不得残留 miku 渐变背景',
    );
    assert.equal(ownStyleCount(mounted.document), 0, '失败后不得残留皮肤自有 style 节点');
    assert.equal(chromeCount(mounted.document), 0, '失败后不得残留皮肤 chrome 节点');
    assert.equal(
      mounted.document.querySelectorAll('link[rel~="icon"]').length,
      0,
      '失败后不得残留皮肤注入的 favicon',
    );
    assert.equal(mounted.document.body.dataset.hostMarker, 'kept', '回滚不得误删与皮肤无关的 body 数据');
  } finally {
    mounted.abort();
  }
});

// ---------------------------------------------------------------------------
// B. 正常路径不受影响：激活生效、卸载回到基线
// ---------------------------------------------------------------------------

test('正常激活仍生效，abort 卸载后回到激活前基线', () => {
  const mounted = mount();
  try {
    const baselineStyle = bodyStyle(mounted.document);
    assert.doesNotThrow(() => mounted.activate(), '正常激活不得抛错');

    assert.equal(mounted.document.body.hasAttribute(BODY_MARKER), true, '激活后 marker 必须在位');
    assert.ok(
      String(mounted.document.body.style.backgroundImage).includes('linear-gradient'),
      '激活后 body 应带上 miku 背景',
    );
    assert.equal(mounted.document.body.style.backgroundRepeat, 'no-repeat', '激活后 backdrop 应被皮肤接管');
    assert.equal(chromeCount(mounted.document), 2, 'titlebar / statusbar 两段 chrome 应已挂载');
    assert.equal(ownStyleCount(mounted.document), 1, '皮肤样式节点应已注入');

    mounted.abort();

    assert.equal(bodyStyle(mounted.document), baselineStyle, '卸载后 body 内联样式必须回到激活前基线');
    assert.equal(mounted.document.body.hasAttribute(BODY_MARKER), false, '卸载后 marker 必须清掉');
    assert.equal(ownStyleCount(mounted.document), 0, '卸载后不得残留皮肤 style 节点');
    assert.equal(chromeCount(mounted.document), 0, '卸载后不得残留 chrome 节点');
  } finally {
    mounted.abort();
  }
});

// ---------------------------------------------------------------------------
// C. 失败回滚后可再次激活（回滚不得把 wrapper 卡死）
// ---------------------------------------------------------------------------

test('失败回滚后再次激活仍然成功', () => {
  const mounted = mount();
  try {
    mounted.failCreateElementFor('link');
    assert.throws(() => mounted.activate(), /forced createElement failure/);

    mounted.failCreateElementFor(null);
    assert.doesNotThrow(() => mounted.activate(), '回滚后重试激活不得失败');
    assert.equal(mounted.document.body.hasAttribute(BODY_MARKER), true, '重试激活后 marker 必须在位');
    assert.ok(chromeCount(mounted.document) > 0, '重试激活后 chrome 必须挂载');
    assert.deepEqual(mounted.warnings, [], '正常路径不得产生 teardown 警告');
  } finally {
    mounted.abort();
  }
});

// ---------------------------------------------------------------------------
// D. 回滚只走失败路径：正常卸载不得覆盖他人对 body 内联样式的修改
// ---------------------------------------------------------------------------

test('正常卸载不覆盖其他插件在激活期间对 body 内联样式的修改', () => {
  const mounted = mount();
  try {
    mounted.activate();
    // 皮肤激活期间，其他插件（或桌面壳）改了 body 的内联样式。
    mounted.document.body.style.setProperty('background-color', 'papayawhip');

    mounted.abort();

    assert.equal(
      mounted.document.body.style.backgroundColor,
      'papayawhip',
      '正常卸载不得用「activation 前快照」覆盖其他插件的 body 内联样式改动',
    );
    assert.equal(
      mounted.document.body.style.backgroundRepeat,
      'repeat-x',
      'vendored 自己写的 backdrop 属性仍须由它自己的 disposer 回滚',
    );
    assert.equal(mounted.document.body.hasAttribute(BODY_MARKER), false, '卸载后 marker 必须清掉');
  } finally {
    mounted.abort();
  }
});
