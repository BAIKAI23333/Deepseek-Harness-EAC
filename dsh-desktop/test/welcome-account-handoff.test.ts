// 官方欢迎/登录面复用契约（s7）——来源：MIT 仓库 deepseek-ai/deepseek-harness
// @ 477b4f420553e8a52c2fbccc464d7561b239c443（dsh-v0.1.7-rc.2）：
//   apps/desktop/src/{welcome-api.ts,welcome-window.ts,welcome-backend.ts,account-backend.ts}
//   packages/credentials/deepseek-account-platform（官方账号面：PKCE + 本机凭据库）
//
// EAC 是 Tauri：Electron 主进程代码（BrowserWindow/ipcMain/WebSocket 监听）不可
// 移植，只复用「窗口几何 + 页面状态机 + 官方账号协议（namespace/method/参数
// 形态）+ 凭据只在官方 Host 适配器落库」这一层契约。
//
// 钉版 rc2 事实：官方账号面要求部署方提供 platformOrigin（私有 patch / 环境
// 变量），源码树不下发部署地址 —— 未配置时 startSignIn 不可用。本契约据此
// 如实上报能力并给出交接（handoff），绝不伪造 OAuth 成功。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_SIGN_IN_PHASES,
  EAC_PRODUCT_LABEL,
  EAC_WELCOME_WINDOW,
  EAC_WORDMARK,
  OFFICIAL_ACCOUNT_SURFACE,
  OFFICIAL_SOURCE_PIN,
  WELCOME_IPC,
  WELCOME_PAGES,
  accountView,
  createOfficialHostAdapter,
  needsWelcome,
  signInCapability,
  validateApiKey,
  welcomeHandoff,
} from '../lib/desktop/welcome-account.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const nsh = readFileSync(join(root, 'tauri-shell', 'installer-hooks.nsh'), 'utf8');

interface Invoke { namespace: string; method: string; args: Record<string, unknown> }

const client = { version: '6.0.0', locale: 'zh-CN', timezoneOffsetSeconds: 28800 };

function stubHost(options: {
  platformOrigin?: string | null;
  state?: unknown;
  start?: unknown;
  credentialsRef?: string | undefined;
  failState?: boolean;
} = {}) {
  const calls: Invoke[] = [];
  const port = {
    calls,
    invoke: async (request: Invoke): Promise<unknown> => {
      calls.push(request);
      if (request.method === 'getState') {
        if (options.failState) throw new Error('host unavailable');
        return options.state ?? signedOut();
      }
      if (request.method === 'startSignIn') return options.start ?? signedOut();
      if (request.method === 'cancelSignIn') return signedOut();
      if (request.method === 'set') return { ok: true };
      if (request.method === 'describe') return { apiKeyEnv: 'DEEPSEEK_API_KEY' };
      throw new Error('unexpected method ' + request.method);
    },
    client,
    callbackOrigin: 'http://127.0.0.1:43821',
    platformOrigin: options.platformOrigin === undefined ? null : options.platformOrigin,
    credentialsRef: async () => (options.credentialsRef === undefined ? 'DEEPSEEK_API_KEY' : options.credentialsRef),
  };
  return port;
}

const signedOut = () => ({
  status: 'signed-out',
  links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
  attempt: null,
});

test('官方来源定型：欢迎/账号契约标注 commit 钉版与源路径', () => {
  assert.equal(OFFICIAL_SOURCE_PIN.repo, 'deepseek-ai/deepseek-harness');
  assert.equal(OFFICIAL_SOURCE_PIN.commit, '477b4f420553e8a52c2fbccc464d7561b239c443');
  assert.ok(OFFICIAL_SOURCE_PIN.installerPaths.includes('apps/desktop/installer/pages.nsh'));
  assert.ok(OFFICIAL_SOURCE_PIN.clientPaths.includes('apps/desktop/src/client/WelcomePage.tsx'));
  assert.ok(OFFICIAL_SOURCE_PIN.clientPaths.includes('apps/desktop/src/welcome-window.ts'));
});

test('欢迎窗几何/材质契约与官方 welcome-window.ts 逐值一致（600x700 固定窗）', () => {
  assert.equal(EAC_WELCOME_WINDOW.width, 600);
  assert.equal(EAC_WELCOME_WINDOW.height, 700);
  assert.equal(EAC_WELCOME_WINDOW.useContentSize, true);
  assert.equal(EAC_WELCOME_WINDOW.resizable, false);
  assert.equal(EAC_WELCOME_WINDOW.maximizable, false);
  assert.equal(EAC_WELCOME_WINDOW.fullscreenable, false);
  assert.equal(EAC_WELCOME_WINDOW.show, false, '先加载后显示（官方 show:false + loadFile 后 show）');
  assert.equal(EAC_WELCOME_WINDOW.backgroundColor, '#00000000');
  assert.equal(EAC_WELCOME_WINDOW.titleBarOverlayHeight, 42);
  assert.equal(EAC_WELCOME_WINDOW.sandboxed, true);
  assert.equal(EAC_WELCOME_WINDOW.nodeIntegration, false);
  assert.equal(EAC_WELCOME_WINDOW.contextIsolation, true);
  assert.equal(EAC_WELCOME_WINDOW.title, EAC_PRODUCT_LABEL);
});

test('页面状态机与私有 IPC 通道名沿用官方 welcome-api.ts', () => {
  assert.deepEqual([...WELCOME_PAGES], ['entry', 'key', 'account']);
  assert.deepEqual(WELCOME_IPC, {
    saveApiKey: 'dsh-welcome:save-api-key',
    skip: 'dsh-welcome:skip',
    start: 'dsh-welcome:start',
    cancel: 'dsh-welcome:cancel',
    copyLink: 'dsh-welcome:copy-link',
    state: 'dsh-welcome:state',
    takeNotice: 'dsh-welcome:take-notice',
  });
  assert.deepEqual([...ACCOUNT_SIGN_IN_PHASES], [
    'initializing', 'waiting-browser', 'exchanging', 'committing', 'succeeded', 'cancelled', 'expired', 'failed',
  ]);
});

test('首启判定沿用官方 needsWelcome（登录态与 API Key 均缺才进欢迎面）', () => {
  assert.equal(needsWelcome({ loggedIn: false, hasApiKey: false }), true);
  assert.equal(needsWelcome({ loggedIn: true, hasApiKey: false }), false);
  assert.equal(needsWelcome({ loggedIn: false, hasApiKey: true }), false);
  assert.equal(needsWelcome({ loggedIn: true, hasApiKey: true }), false);
});

test('API Key 校验沿用官方 WelcomePage 规则（去引号/去空格/非环境变量赋值）', () => {
  assert.equal(validateApiKey('sk-0123456789abcdef'), true);
  assert.equal(validateApiKey('abc.DEF-123_456'), true);
  assert.equal(validateApiKey(''), false);
  assert.equal(validateApiKey('   '), false);
  assert.equal(validateApiKey('sk-abc def'), false, '含空格必须拒绝');
  assert.equal(validateApiKey('DEEPSEEK_API_KEY=sk-abc'), false, '环境变量赋值必须拒绝');
  assert.equal(validateApiKey('"sk-abc"'), false, '带引号必须拒绝');
  assert.equal(validateApiKey("'sk-abc'"), false);
  assert.equal(validateApiKey('`sk-abc`'), false);
  assert.equal(validateApiKey('sk-abc\n'), false);
});

test('账号快照投影不泄漏凭据字段（官方 account-backend.ts 的 accountView 等价面）', () => {
  const projected = accountView({
    status: 'credential-stored',
    links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
    attempt: { id: 'attempt-1', phase: 'waiting-browser', authorizeUrl: 'https://platform.deepseek.com/dsh/authorize?x=1' },
    token: 'secret-token',
    grant: { raw: 'secret' },
  });
  assert.deepEqual(Object.keys(projected).sort(), ['attempt', 'links', 'status']);
  assert.deepEqual(Object.keys(projected.attempt!).sort(), ['authorizeUrl', 'id', 'phase']);
  assert.ok(!JSON.stringify(projected).includes('secret'), '投影不得带出任何凭据/内部字段');

  assert.throws(() => accountView({ status: 'signed-in', links: {}, attempt: null }), /invalid state/);
  assert.throws(() => accountView({ status: 'signed-out', attempt: null }), /invalid platform links/);
  assert.throws(() => accountView({
    status: 'signed-out', attempt: null,
    links: { usageUrl: 'http://evil.example.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
  }), /invalid browser destination/);
  assert.throws(() => accountView({
    status: 'signed-out', attempt: { id: 'attempt-1', phase: 'signed-in' },
    links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
  }), /invalid attempt/);
  assert.throws(() => accountView({
    status: 'signed-out', attempt: { id: 'attempt-1', phase: 'failed', errorCode: 'teapot' },
    links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
  }), /invalid attempt/);
});

test('登录能力如实上报：rc2 未配置官方 platformOrigin 时不可用（不谎报 OAuth 完成）', () => {
  const unconfigured = signInCapability(null);
  assert.equal(unconfigured.available, false);
  assert.equal(unconfigured.reason, 'platform-origin-unconfigured');
  assert.ok(unconfigured.notice.length > 0, '须给出可展示的如实说明');

  const ready = signInCapability('https://platform.deepseek.com');
  assert.equal(ready.available, true);
  assert.equal(ready.reason, 'ready');
  // 官方约束：除回环开发外必须 HTTPS。
  assert.equal(signInCapability('http://platform.deepseek.com').available, false);
  assert.equal(signInCapability('http://127.0.0.1:8080').available, true, '回环 HTTP 是官方允许的开发形态');
  assert.equal(signInCapability('not-a-url').available, false);
});

test('交接契约：不可用时明确交接到 API Key 路径，可用时给官方授权地址', () => {
  const fallback = welcomeHandoff(signInCapability(null));
  assert.equal(fallback.kind, 'api-key');
  assert.equal(fallback.requiresOfficialPlatform, true);
  assert.equal(fallback.authorizeUrl, undefined);
  assert.ok(fallback.copy.length > 0);

  const direct = welcomeHandoff(signInCapability('https://platform.deepseek.com'), 'https://platform.deepseek.com/dsh/authorize?state=1');
  assert.equal(direct.kind, 'official-account');
  assert.equal(direct.requiresOfficialPlatform, false);
  assert.equal(direct.authorizeUrl, 'https://platform.deepseek.com/dsh/authorize?state=1');
});

test('适配器 startSignIn：未配置 platformOrigin 时只做交接，绝不返回成功态', async () => {
  const host = stubHost({ platformOrigin: null });
  const adapter = createOfficialHostAdapter(host);
  const outcome = await adapter.startSignIn();
  assert.equal(outcome.kind, 'handoff');
  assert.equal(outcome.state.status, 'signed-out');
  assert.equal(outcome.state.attempt, null);
  assert.equal(outcome.handoff.kind, 'api-key');
  assert.deepEqual(host.calls.map((c) => c.namespace + '/' + c.method), ['account/getState'],
    '不可用时不得调用官方 startSignIn');
});

test('适配器 startSignIn：配置官方 origin 后按官方参数形态发起（loginSource=desktop）', async () => {
  const host = stubHost({
    platformOrigin: 'https://platform.deepseek.com',
    start: {
      status: 'signed-out',
      links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
      attempt: { id: 'attempt-9', phase: 'waiting-browser', authorizeUrl: 'https://platform.deepseek.com/dsh/authorize?state=9' },
    },
  });
  const adapter = createOfficialHostAdapter(host);
  const outcome = await adapter.startSignIn();
  assert.equal(outcome.kind, 'attempt');
  assert.equal(outcome.state.attempt?.phase, 'waiting-browser');
  const start = host.calls.find((c) => c.method === 'startSignIn');
  assert.ok(start, '须调用官方 account/startSignIn');
  assert.equal(start.namespace, 'account');
  assert.deepEqual(start.args, { client, callbackOrigin: 'http://127.0.0.1:43821', loginSource: 'desktop' });

  await adapter.cancelSignIn('attempt-9');
  const cancel = host.calls.find((c) => c.method === 'cancelSignIn');
  assert.deepEqual(cancel?.args, { attemptId: 'attempt-9' });
});

test('适配器凭据写入只走官方 credentials 面（安装器不落任何凭据）', async () => {
  const host = stubHost({ platformOrigin: 'https://platform.deepseek.com' });
  const adapter = createOfficialHostAdapter(host);
  for (const bad of ['', 'sk-abc def', 'DEEPSEEK_API_KEY=sk-abc', '"sk-abc"']) {
    host.calls.length = 0;
    assert.deepEqual(await adapter.saveApiKey(bad), { ok: false }, `非法输入必须拒绝：${bad}`);
    assert.deepEqual(host.calls, [], '非法输入不得触达 Host');
  }
  host.calls.length = 0;
  assert.deepEqual(await adapter.saveApiKey('sk-0123456789abcdef'), { ok: true });
  assert.deepEqual(host.calls.map((c) => c.namespace + '/' + c.method), ['credentials/set']);
  assert.deepEqual(host.calls[0]!.args, { ref: 'DEEPSEEK_API_KEY', value: 'sk-0123456789abcdef' });

  // 未发现官方凭据引用（llm-deepseek 的 apiKeyEnv）时不写入、不谎报成功。
  const noRef = stubHost({ platformOrigin: 'https://platform.deepseek.com', credentialsRef: undefined });
  const noRefAdapter = createOfficialHostAdapter({ ...noRef, credentialsRef: async () => undefined });
  noRef.calls.length = 0;
  assert.deepEqual(await noRefAdapter.saveApiKey('sk-0123456789abcdef'), { ok: false });
  assert.deepEqual(noRef.calls, []);
});

test('适配器不伪造状态：Host 不可用时 state() 抛错，skip() 只在内存标记', async () => {
  const broken = createOfficialHostAdapter(stubHost({ failState: true }));
  await assert.rejects(() => broken.state(), /host unavailable/);

  const host = stubHost({ platformOrigin: 'https://platform.deepseek.com' });
  const adapter = createOfficialHostAdapter(host);
  assert.equal(adapter.skipped(), false);
  await adapter.skip();
  assert.equal(adapter.skipped(), true, '官方 skip() 不写完成设置，只在本次运行内生效');
});

test('官方账号面清单：命名空间/方法与内核 Remote 面一致', () => {
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.state, 'account/getState');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.startSignIn, 'account/startSignIn');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.cancelSignIn, 'account/cancelSignIn');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.signOut, 'account/signOut');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.watch, 'account/watch');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.watchExpiry, 'account/watchExpiry');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.credentialSet, 'credentials/set');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.settingsDescribe, 'settings/describe');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.methods.listProviders, 'llm/listConfigurableProviders');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.credentialProviderNs, 'llm-deepseek');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.settingsReferenceField, 'apiKeyEnv');
  assert.equal(OFFICIAL_ACCOUNT_SURFACE.installerPersistsCredentials, false);
});

test('字标单源一致：安装器与运行时欢迎面共用 EAC 字标，且不引用官方品牌资产', () => {
  assert.equal(EAC_WORDMARK, 'EAC');
  assert.match(nsh, new RegExp(`!define\\s+DSH_WORDMARK\\s+"${EAC_WORDMARK}"`), '安装器须共用同一字标');
  assert.equal(EAC_PRODUCT_LABEL, 'Deepseek Harness EAC');
  assert.match(nsh, new RegExp(`!define\\s+DSH_PRODUCT_LABEL\\s+"${EAC_PRODUCT_LABEL}"`));
  assert.ok(!JSON.stringify({ EAC_WELCOME_WINDOW, EAC_PRODUCT_LABEL }).includes('welcome-brand.svg'),
    '欢迎面不得引用官方品牌 SVG');
});
