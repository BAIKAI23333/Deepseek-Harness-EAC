import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the shipped client component with a deterministic hook/slot fixture.
// This checks state transitions, not browser layout or native mouse hit testing.
function panel(action: (name: string, value?: unknown) => any, language = 'zh') {
  const states: any[] = [];
  const memo: any[] = [];
  let cursor = 0;
  let component: any;
  let dictionaries: any;
  let tree: any;
  let mounted = false;
  const effects: (() => void)[] = [];
  const calls: string[] = [];
  const same = (a: any[], b: any[]) => a && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children: children.flat(Infinity).filter(v => v != null) }),
    useState(initial: any) {
      const i = cursor++;
      if (!mounted) states[i] = initial;
      return [states[i], (value: any) => { states[i] = value; }];
    },
    useCallback(fn: any, deps: any[]) {
      const i = cursor++;
      if (!memo[i] || !same(memo[i].deps, deps)) memo[i] = { deps, fn };
      return memo[i].fn;
    },
    useEffect(fn: any, deps: any[]) {
      const i = cursor++;
      if (!memo[i] || !same(memo[i], deps)) { memo[i] = deps; effects.push(fn); }
    },
  };
  const status: any = { ok: true, profile: 'fixture', snapshots: [], incidents: [], lastGood: null };
  const window: any = {
    confirm: () => true, alert() {},
    dshDesktop: { guard: { action: async (name: string, value?: unknown) => {
      calls.push(name);
      return name === 'status' ? status : action(name, value);
    } } },
    __ModuleLoader__: { load(def: any) {
      def.factory((name: string) => { assert.equal(name, 'react'); return react; }).apply({
        locale: { bind: () => (key: string) => dictionaries[language][key], register: (_: string, d: any) => { dictionaries = d; } },
        effect: (fn: any) => fn(),
        slots: { inject: (_: string, fn: any) => fn(), register: (_: any, render: any) => { component = render; } },
      });
    } },
  };
  const context = vm.createContext({ window });
  vm.runInContext(readFileSync(new URL('../assets/plugins/dsh-plugin-shield/lib/client.js', import.meta.url), 'utf8'), context);
  const render = () => {
    cursor = 0;
    const section = component({ t: (key: string) => dictionaries[language][key] });
    tree = section.type(section.props);
    mounted = true;
    effects.splice(0).forEach(fn => fn());
  };
  const nodes = (value: any = tree): any[] => value && typeof value === 'object' ? [value, ...value.children.flatMap((c: any) => nodes(c))] : [];
  const text = (value: any = tree): string => typeof value === 'object' && value !== null ? value.children.map(text).join(' ') : String(value ?? '');
  const settle = async () => { await new Promise(r => setImmediate(r)); render(); await new Promise(r => setImmediate(r)); render(); };
  render();
  return { status, calls, window, dictionaries, text, nodes, settle,
    async click(key: string) {
      const button = nodes().find(n => n.type === 'button' && text(n) === dictionaries[language][key]);
      assert.ok(button, `missing ${key} button`);
      assert.equal(button.props.disabled === true, false);
      button.props.onClick();
      await settle();
    },
  };
}

function assertFailed(p: ReturnType<typeof panel>, message?: RegExp) {
  const alert = p.nodes().find(n => n.props.role === 'alert');
  assert.ok(alert, 'an unsuccessful guard operation must be visible, not silently ignored');
  if (message) assert.match(p.text(alert), message);
  assert.equal(p.nodes().some(n => n.props.className === '__sh_ok'), false, 'failed action must not leave a green success report');
  assert.equal(p.nodes().some(n => n.type === 'button' && n.props.disabled), false);
}

test('guard copy distinguishes manual tools and limited static findings from boot protection', async () => {
  for (const language of ['zh', 'en']) {
    const p = panel(() => ({}), language);
    await p.settle();
    const d = p.dictionaries[language];
    assert.doesNotMatch(d.intro, /每次安装与启动前自动快照|snapshots before every install and boot/);
    assert.match(d.intro, language === 'zh' ? /不.*自动.*启动/ : /does not.*automatic.*boot/i);
    assert.doesNotMatch(d.incidentsEmpty, /一切正常|all healthy/);
    assert.doesNotMatch(d.findingsClean, /一切正常|All clear/);
  }
});

test('guard health check rejects failures and missing or malformed reports', async () => {
  for (const response of [{ ok: false, error: 'check denied' }, null, { ok: true }, { ok: true, report: {} }, { ok: true, report: { findings: {} } }]) {
    const p = panel(() => response);
    await p.settle(); await p.click('check');
    assertFailed(p, response?.ok === false ? /check denied/ : undefined);
  }
  const p = panel(() => Promise.reject(new Error('RPC disconnected')));
  await p.settle(); await p.click('check'); assertFailed(p, /RPC disconnected/);
});

test('guard repair never renders a rejected or missing result as no repairs needed', async () => {
  for (const response of [{ ok: false, error: 'repair denied' }, { ok: true }, { ok: true, applied: {} }]) {
    const p = panel(() => response);
    await p.settle(); await p.click('repair'); assertFailed(p);
  }
});

test('guard snapshot failures are visible and do not reload status as if successful', async () => {
  for (const response of [{ ok: false, error: 'snapshot denied' }, { ok: true }, { ok: true, snapshot: {} }]) {
    const p = panel(() => response);
    await p.settle(); await p.click('snapshotNow'); assertFailed(p);
    assert.deepEqual(p.calls, ['status', 'snapshot']);
  }
});

test('guard successful check followed by failed repair clears stale green findings and allows retry', async () => {
  let fail = true;
  const p = panel(name => name === 'check' ? { ok: true, report: { findings: [] } } : fail ? { ok: false, error: 'repair failed' } : { ok: true, applied: [] });
  await p.settle(); await p.click('check');
  assert.match(p.text(), /静态检查/);
  await p.click('repair'); assertFailed(p, /repair failed/);
  fail = false; await p.click('repair');
  assert.equal(p.nodes().some(n => n.props.role === 'alert'), false);
  assert.match(p.text(), /没有可自动修复/);
});

test('guard successful snapshot refreshes actual list; incident read and resolve failures remain visible', async () => {
  const p = panel(name => name === 'snapshot' ? { ok: true, snapshot: { id: 'fixture-snapshot' } } : { ok: false, error: name + ' denied' });
  p.status.incidents = [{ id: 'fixture.md', title: 'Fixture incident' }] as any;
  await p.settle(); await p.click('snapshotNow');
  assert.deepEqual(p.calls, ['status', 'snapshot', 'status']);
  await p.click('view'); assertFailed(p, /incident denied/);
  const q = panel(name => name === 'incident' ? { ok: true, content: 'fixture report' } : { ok: false, error: 'resolve denied' });
  q.status.incidents = [{ id: 'fixture.md', title: 'Fixture incident' }] as any;
  await q.settle(); await q.click('view'); await q.click('resolve');
  assertFailed(q, /resolve denied/);
  assert.match(q.text(), /fixture report/);
  assert.deepEqual(q.calls, ['status', 'incident', 'resolve-incident']);
});

test('guard rollback uses inline confirmation and cancellation sends no restore RPC', async () => {
  const p = panel(() => ({ ok: false, error: 'service-running' }));
  p.status.snapshots = [{id:'fixture-snapshot',at:'2026-10-11T00:00:00Z',files:[],pluginRows:[]}];
  await p.settle(); await p.click('restore');
  assert.deepEqual(p.calls,['status']);assert.ok(p.nodes().some(n=>n.props.role==='alertdialog'));
  await p.click('confirmRestore');assertFailed(p,/当前界面不能执行回滚.*未改动配置/);
  const q=panel(()=>{throw Error('cancel must not call RPC');});q.status.snapshots=p.status.snapshots;
  q.window.confirm=()=>{throw Error('native confirm must not be used');};
  await q.settle();await q.click('restore');await q.click('cancelRestore');
  assert.deepEqual(q.calls,['status']);assert.equal(q.nodes().some(n=>n.props.role==='alertdialog'),false);
});

function snapshotPanel(action: (name: string,value?: unknown)=>any) {
  const p=panel(action);p.status.snapshots=[{id:'fixture-snapshot',at:'2026-10-11T00:00:00Z',files:[],pluginRows:[]}];return p;
}
const succeeded={ok:true,phase:'succeeded',code:'restore-succeeded',snapshotId:'fixture-snapshot',at:'2026-10-11T00:00:00Z',backupId:'backup-1'};
test('confirmed restore reports completion without a native alert',async()=>{
  const p=snapshotPanel(()=>succeeded);p.window.alert=()=>{throw Error('native alert must not be used');};
  await p.settle();await p.click('restore');assert.match(p.text(),/中断当前任务.*不还原插件包、会话或 Skill/);
  await p.click('confirmRestore');assert.deepEqual(p.calls,['status','restore']);
  assert.match(p.text(),/配置已回滚，Web 服务已重新启动/);assert.match(p.text(),/backup-1/);
});
test('restore failure recovery remains visibly a failed rollback, not success',async()=>{
  const p=snapshotPanel(()=>({...succeeded,ok:false,phase:'failed',code:'restore-start-failed',error:'restore-start-failed',recovered:true}));
  await p.settle();await p.click('restore');await p.click('confirmRestore');
  assert.match(p.text(),/回滚失败；原配置已恢复并重新启动/);assertFailed(p,/restore-start-failed/);
});
test('restore keeps write controls disabled while its RPC is pending',async()=>{
  let complete!: (value:any)=>void;const promise=new Promise(r=>{complete=r;});const p=snapshotPanel(()=>promise);
  await p.settle();await p.click('restore');await p.click('confirmRestore');
  assert.match(p.text(),/回滚进行中/);assert.ok(p.nodes().filter(n=>n.type==='button').every(n=>n.props.disabled));
  complete(succeeded);await p.settle();assert.match(p.text(),/配置已回滚，Web 服务已重新启动/);
});
test('reopened panel displays the persisted completion result',async()=>{
  const p=panel(()=>({}));p.status.lastRestore=succeeded;await p.settle();
  assert.match(p.text(),/最近一次回滚/);assert.match(p.text(),/配置已回滚，Web 服务已重新启动/);assert.match(p.text(),/backup-1/);
});
test('pending historical result without an active transaction is unconfirmed, not healthy',async()=>{
  const p=panel(()=>({}));p.status.lastRestore={...succeeded,ok:false,phase:'pending',code:'restore-in-progress'};
  p.status.restoreInProgress=false;await p.settle();assert.match(p.text(),/上次回滚没有完成记录.*配置状态未确认/);
  assert.doesNotMatch(p.text(),/配置已回滚，Web 服务已重新启动/);
});
test('guard restore bridge budget exceeds L1 recovery timeout without changing other actions',()=>{
  const bridge=readFileSync(new URL('../../tauri-shell/sidecar/bridge.ts',import.meta.url),'utf8');
  assert.match(bridge,/call\('guard.action',[^\n]+action === 'restore' \? 660000 : 30000/);
});
