// dsh-compact 设置卡「Host 未接受写入」反馈契约（TDD 红→绿）。
//
// 背景：内核 0.1.7-rc.2 的 ConfigFormController 写入契约是 `Promise<boolean>`：
// Host 明确拒绝时 resolve(false)，只有传输/校验异常才 reject —— 见
// dsh-client-ui-settings 的 config-form.d.ts，以及实现里
// `if (!response.ok) { await this.recover(generation); return false }`
// 这条分支（preset 只读、web profile 只读存储、revision 冲突都会走它）。
//
// dsh-compact 的 CompactCard 之前只挂了 `.catch(...)`，于是「Host 拒绝」这条
// 最常见的失败路径在 UI 上完全静默：用户勾选/拖动滑杆后界面回弹，既没有失败
// 提示也没有成功提示，看起来像「点了没反应」。
//
// 本文件用 jsdom + vm 真实加载随包 bundle、以 fake react 运行时渲染设置卡
// （fake slots / configForms 宿主），把修好的契约钉死：
//   A. set() resolve(false)（Host 拒绝）→ 卡片必须显示 dshc-error 失败提示；
//   B. set() reject（传输/校验异常）→ 仍然显示失败提示（异常 catch 不得回归）；
//   C. set() resolve(true)（成功）→ 不得显示失败提示（成功路径保持静默）；
// 三种结果都要断言写入真的递给了 ConfigFormController（键/值正确）。
//
// 修复前 A 为红（resolve(false) 时卡片不渲染任何 role=status 提示），B/C/D 为绿。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = join(root, 'dsh-desktop', 'assets', 'plugins', 'dsh-compact', 'lib', 'client.js');
const source = readFileSync(BUNDLE, 'utf8');

/** 写入结果：Host 拒绝 / 传输异常 / Host 接受。 */
type WriteOutcome = 'rejected-by-host' | 'transport-error' | 'accepted';

interface VNode {
  type: unknown;
  props: Record<string, any>;
}

/** 极简 react 运行时：真实 state/effect 语义，够跑通卡片组件。 */
function createReactRuntime() {
  const hooks: any[] = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0;
  let dirty = false;
  let mounted = false;

  const React = {
    createElement(type: unknown, props: Record<string, any> | null, ...children: unknown[]): VNode {
      return { type, props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] } };
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!mounted) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(factory: () => unknown) {
      const index = cursor++;
      if (!mounted) hooks[index] = factory();
      return hooks[index];
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (!mounted) hooks[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      const setState = (next: unknown) => {
        const value = typeof next === 'function' ? (next as (prev: unknown) => unknown)(hooks[index]) : next;
        if (value !== hooks[index]) {
          hooks[index] = value;
          dirty = true;
        }
      };
      return [hooks[index], setState];
    },
    useEffect(effect: () => unknown, deps?: unknown[]) {
      const index = cursor++;
      const previous = hooks[index] as { deps?: unknown[] } | undefined;
      const changed =
        !mounted ||
        previous === undefined ||
        deps === undefined ||
        previous.deps === undefined ||
        deps.length !== previous.deps.length ||
        deps.some((item, i) => item !== previous.deps?.[i]);
      if (changed) {
        const cleanup = effect();
        hooks[index] = { deps };
        if (typeof cleanup === 'function') cleanups.push(cleanup as () => void);
      }
    },
    useDebugValue() {},
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
      return getSnapshot();
    },
  };

  return {
    React,
    /** 渲染到状态收敛（模拟 react 在 setState 后的重渲染）。 */
    render(component: (props: any) => unknown, props: any): VNode {
      for (let pass = 0; pass < 8; pass += 1) {
        cursor = 0;
        dirty = false;
        const tree = component(props) as VNode;
        mounted = true;
        if (!dirty) return tree;
      }
      throw new Error('render 未收敛（fake react 运行时保护）');
    },
    cleanup() {
      for (const fn of cleanups.splice(0)) fn();
    },
  };
}

function walk(node: unknown, visit: (element: VNode) => void): void {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  const element = node as VNode;
  visit(element);
  walk(element.props?.children, visit);
}

function findElement(tree: unknown, predicate: (element: VNode) => boolean): VNode | undefined {
  let found: VNode | undefined;
  walk(tree, (element) => {
    if (found === undefined && predicate(element)) found = element;
  });
  return found;
}

const messageOf = (tree: unknown): VNode | undefined =>
  findElement(tree, (element) => element.props?.role === 'status');

const flush = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

interface Mounted {
  calls: Array<{ key: string; value: unknown }>;
  render(): VNode;
  clickFirstCheckbox(tree: VNode): void;
  cleanup(): void;
}

/** 真实加载随包 bundle，取回 settings.plugin.item 里注册的设置卡并渲染。 */
function mount(outcome: WriteOutcome): Mounted {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://desktop.dsh.local/',
  });
  const { window } = dom;

  const runtime = createReactRuntime();
  let exported: any;
  window.__ModuleLoader__ = {
    load: (definition: { id: string; factory: (require: unknown) => unknown }) => {
      exported = definition.factory((id: string) => {
        if (id === 'react') return runtime.React;
        throw new Error(`bundle 不得 require ${id}`);
      });
    },
  };
  vm.runInContext(source, dom.getInternalVMContext(), { filename: BUNDLE });
  assert.equal(typeof exported?.apply, 'function', 'bundle 必须导出 apply（client 入口）');

  // fake ConfigFormController：getSnapshot/subscribe/set 面与内核同构。
  const snapshot = { status: 'ready', writable: true, value: {} };
  const calls: Array<{ key: string; value: unknown }> = [];
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set(key: string, value: unknown): Promise<boolean> {
      calls.push({ key, value });
      if (outcome === 'rejected-by-host') return Promise.resolve(false);
      if (outcome === 'accepted') return Promise.resolve(true);
      return Promise.reject(new Error('settings transport down'));
    },
  };

  const registered: Array<{ options: any; component: any }> = [];
  const hostCtx = {
    get: () => undefined,
    effect: (fn: () => unknown) => fn(),
    configForms: { get: () => scope },
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register(options: any, component: any) {
        registered.push({ options, component });
        return () => {};
      },
    },
  };
  exported.apply(hostCtx);

  const card = registered.find((entry) => entry.options?.name === 'settings.plugin.item');
  assert.ok(card, 'bundle 必须把设置卡注册进 settings.plugin.item');
  const props = { scope, useScope: (selector: (value: unknown) => unknown) => selector(snapshot) };

  return {
    calls,
    render: () => runtime.render(card.component, props),
    clickFirstCheckbox(tree: VNode) {
      const checkbox = findElement(
        tree,
        (element) => element.type === 'input' && element.props?.type === 'checkbox',
      );
      assert.ok(checkbox, '夹具前提：卡片必须渲染出「启用自动压缩」复选框');
      checkbox.props.onChange({ target: { checked: false } });
    },
    cleanup() {
      runtime.cleanup();
      window.close();
    },
  };
}

// ---------------------------------------------------------------------------
// A. Host 拒绝（resolve(false)）：必须给出显式失败提示
// ---------------------------------------------------------------------------

test('set() resolve(false)：设置卡必须显示显式失败提示，而不是静默', async () => {
  const mounted = mount('rejected-by-host');
  try {
    let tree = mounted.render();
    mounted.clickFirstCheckbox(tree);
    await flush();
    tree = mounted.render();

    assert.deepEqual(mounted.calls, [{ key: 'enabled', value: false }], '写入必须真的递给 ConfigFormController');

    const message = messageOf(tree);
    assert.ok(message, 'Host 拒绝（resolve(false)）时卡片必须渲染失败提示（role=status）');
    assert.equal(message.props.className, 'dshc-error', '失败提示必须用 dshc-error 样式');
    assert.match(String(message.props.children), /保存失败/, '失败提示必须说明写入没有被接受');
    assert.doesNotMatch(String(message.props.children), /undefined|\[object/, '失败提示不得泄露内部值');
  } finally {
    mounted.cleanup();
  }
});

// ---------------------------------------------------------------------------
// B. 异常路径不得回归：reject 仍然显示失败提示
// ---------------------------------------------------------------------------

test('set() reject：异常 catch 不得回归，仍显示失败提示', async () => {
  const mounted = mount('transport-error');
  try {
    let tree = mounted.render();
    mounted.clickFirstCheckbox(tree);
    await flush();
    tree = mounted.render();

    assert.deepEqual(mounted.calls, [{ key: 'enabled', value: false }], '写入必须真的递给 ConfigFormController');

    const message = messageOf(tree);
    assert.ok(message, '写入 reject 时卡片必须渲染失败提示');
    assert.equal(message.props.className, 'dshc-error');
    assert.match(String(message.props.children), /settings transport down/, '失败提示必须带出异常原文');
  } finally {
    mounted.cleanup();
  }
});

// ---------------------------------------------------------------------------
// C. 成功路径保持静默
// ---------------------------------------------------------------------------

test('set() resolve(true)：成功路径不得显示失败提示', async () => {
  const mounted = mount('accepted');
  try {
    let tree = mounted.render();
    mounted.clickFirstCheckbox(tree);
    await flush();
    tree = mounted.render();

    assert.deepEqual(mounted.calls, [{ key: 'enabled', value: false }], '写入必须真的递给 ConfigFormController');
    assert.equal(messageOf(tree), undefined, '写入成功时不得渲染任何失败提示');
    assert.equal(
      findElement(tree, (element) => element.props?.className === 'dshc-error'),
      undefined,
      '写入成功时不得出现 dshc-error 节点',
    );
  } finally {
    mounted.cleanup();
  }
});
