'use strict';

// 官方欢迎/登录面复用（s7）——EAC 侧适配器缝（Tauri 边界）。
//
// 来源：MIT 仓库 deepseek-ai/deepseek-harness
//   @ 477b4f420553e8a52c2fbccc464d7561b239c443（dsh-v0.1.7-rc.2）
//   apps/desktop/src/welcome-api.ts       —— 私有 IPC 通道与 WelcomeOperations
//   apps/desktop/src/welcome-window.ts    —— 600x700 固定欢迎窗与隔离渲染进程
//   apps/desktop/src/welcome-backend.ts   —— 凭据存在性 / 官方 apiKeyEnv 引用
//   apps/desktop/src/account-backend.ts   —— accountView 投影与 browser 目的地校验
//   packages/credentials/deepseek-account-platform —— 官方账号服务面（PKCE）
//
// EAC 是 Tauri：Electron 主进程代码（BrowserWindow / ipcMain / ws cookie 流）
// 不可移植，只复用「窗口几何 + 页面状态机 + 官方账号协议面 + 凭据只落官方
// Host 适配器」这一层契约。**没有任何 OAuth 实现在这里被假装完成**：
// 钉版 rc2 的官方账号面要求部署方通过私有 patch / 环境变量提供 platformOrigin
// （源码树不下发部署地址），未配置时 startSignIn 不可用 —— 本模块如实上报
// 能力并给出交接（handoff），把用户引到官方 API Key 路径或官方授权地址。
//
// 纪律：
//   1. 凭据（账号授权码、API Key）永不进入安装器插件，也永不进入本模块的
//      返回结构；saveApiKey 只把校验过的值转交官方 credentials/set。
//   2. AccountView 一律走 accountView() 投影，未知字段（token/grant 等）被丢弃。
//   3. 官方品牌资产不复制；欢迎面品牌位一律由文本字标 EAC 承担。

/** 官方来源钉版（测试核对；改钉版必须同步改这里与安装器头注释）。 */
export const OFFICIAL_SOURCE_PIN = {
  repo: 'deepseek-ai/deepseek-harness',
  commit: '477b4f420553e8a52c2fbccc464d7561b239c443',
  tag: 'dsh-v0.1.7-rc.2',
  installerPaths: [
    'apps/desktop/installer/pages.nsh',
    'apps/desktop/installer/path.nsh',
    'apps/desktop/installer/theme.nsh',
    'apps/desktop/installer/strings.nsh',
    'apps/desktop/installer/drawing.nsh',
    'apps/desktop/installer/lifecycle.nsh',
    'apps/desktop/installer/window-frame.cpp',
  ],
  clientPaths: [
    'apps/desktop/src/client/WelcomePage.tsx',
    'apps/desktop/src/welcome-api.ts',
    'apps/desktop/src/welcome-window.ts',
    'apps/desktop/src/welcome-backend.ts',
    'apps/desktop/src/account-backend.ts',
  ],
} as const;

/** EAC 文本字标（官方 brand-2x.bmp / welcome-brand.svg 的文本替代，单源）。 */
export const EAC_WORDMARK = 'EAC';
/** EAC 产品标签：必须与 tauri-shell/tauri.conf.json 的 productName 一致。 */
export const EAC_PRODUCT_LABEL = 'Deepseek Harness EAC';

/**
 * 官方欢迎窗几何与进程隔离契约（welcome-window.ts welcomeWindowOptions 的
 * 平台无关部分）。Tauri 侧据此创建等价窗口（600x700 固定、居中、先加载后显示）。
 */
export interface WelcomeWindowContract {
  readonly width: number;
  readonly height: number;
  readonly useContentSize: true;
  readonly center: true;
  readonly resizable: false;
  readonly maximizable: false;
  readonly fullscreenable: false;
  readonly show: false;
  readonly title: string;
  readonly backgroundColor: string;
  readonly titleBarOverlayHeight: number;
  readonly nodeIntegration: false;
  readonly contextIsolation: true;
  readonly sandboxed: true;
}

/** 官方 win32 形态：无边框标题栏 + 透明底（acrylic 由壳层决定）。 */
export const EAC_WELCOME_WINDOW: WelcomeWindowContract = {
  width: 600,
  height: 700,
  useContentSize: true,
  center: true,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
  show: false,
  title: EAC_PRODUCT_LABEL,
  backgroundColor: '#00000000',
  titleBarOverlayHeight: 42,
  nodeIntegration: false,
  contextIsolation: true,
  sandboxed: true,
};

/** 官方私有 IPC 通道名（welcome-api.ts WELCOME_IPC，逐字保留）。 */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
} as const;

/** 官方欢迎页三态（WelcomePage.tsx 的 Page 联合）。 */
export type WelcomePage = 'entry' | 'key' | 'account';
export const WELCOME_PAGES: readonly WelcomePage[] = ['entry', 'key', 'account'];

/** 官方登录尝试阶段（dsh-deepseek-account types SignInAttemptView.phase）。 */
export const ACCOUNT_SIGN_IN_PHASES = [
  'initializing', 'waiting-browser', 'exchanging', 'committing', 'succeeded', 'cancelled', 'expired', 'failed',
] as const;
export type SignInPhase = typeof ACCOUNT_SIGN_IN_PHASES[number];
export type SignInErrorCode = 'network' | 'protocol' | 'expired' | 'storage';

/** 官方 AccountClientMetadata（每次账号操作携带调用方身份）。 */
export interface AccountClientMetadata {
  readonly version: string;
  readonly locale: string;
  readonly timezoneOffsetSeconds: number;
}

/** 官方 SignInAttemptView 的安全投影。 */
export interface SignInAttemptView {
  readonly id: string;
  readonly phase: SignInPhase;
  readonly authorizeUrl?: string | undefined;
  readonly expiresAt?: number | undefined;
  readonly errorCode?: SignInErrorCode | undefined;
}

/** 官方 AccountLinks：只含浏览器目的地，永不携带凭据。 */
export interface AccountLinks {
  readonly usageUrl: string;
  readonly topUpUrl: string;
}

/** 官方 AccountView（credential-stored 只表示本机存有凭据，不代表服务端已验证）。 */
export interface AccountView {
  readonly status: 'signed-out' | 'credential-stored';
  readonly links: AccountLinks;
  readonly attempt: SignInAttemptView | null;
}

/** 认证事实：登录态与独立存储的 API Key 分开判断（官方 welcome-api.ts）。 */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean;
  readonly hasApiKey: boolean;
}

/**
 * 是否需要进入欢迎面。
 * @param authentication - 账号登录态与 API Key 存在性。
 * @returns 两条认证路径都未配置时为 true。
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  return !authentication.loggedIn && !authentication.hasApiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 官方浏览器目的地校验：仅 HTTPS，或显式回环 HTTP（account-backend.ts 同源规则）。
 * @param value - 待校验的 URL。
 * @returns 是否允许交给系统浏览器打开。
 */
function isAllowedBrowserDestination(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username !== '' || url.password !== '') return false;
  return url.protocol === 'https:' || (loopback && url.protocol === 'http:');
}

function validateBrowserDestination(value: unknown): string {
  if (typeof value !== 'string' || !isAllowedBrowserDestination(value)) {
    throw new Error('desktop account: invalid browser destination');
  }
  return value;
}

/**
 * 校验并投影官方账号状态（account-backend.ts accountView 的等价实现）。
 * 未知字段一律丢弃，凭据类字段不可能穿过本函数。
 * @param value - Host 返回的账号状态。
 * @returns 只含 status / links / attempt 的安全投影。
 * @throws 状态、链接或尝试形态非法时抛错（不猜测、不降级）。
 */
export function accountView(value: unknown): AccountView {
  if (!isRecord(value) || typeof value.status !== 'string'
    || !['signed-out', 'credential-stored'].includes(value.status) || !('attempt' in value)) {
    throw new Error('desktop account: invalid state');
  }
  if (!isRecord(value.links) || typeof value.links.usageUrl !== 'string' || typeof value.links.topUpUrl !== 'string') {
    throw new Error('desktop account: invalid platform links');
  }
  const links: AccountLinks = {
    usageUrl: validateBrowserDestination(value.links.usageUrl),
    topUpUrl: validateBrowserDestination(value.links.topUpUrl),
  };
  const raw = value.attempt;
  if (raw === null) {
    return { status: value.status as AccountView['status'], links, attempt: null };
  }
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.phase !== 'string'
    || !(ACCOUNT_SIGN_IN_PHASES as readonly string[]).includes(raw.phase)
    || ('authorizeUrl' in raw && typeof raw.authorizeUrl !== 'string')
    || ('expiresAt' in raw && (typeof raw.expiresAt !== 'number' || !Number.isFinite(raw.expiresAt)))
    || ('errorCode' in raw && !['network', 'protocol', 'expired', 'storage'].includes(String(raw.errorCode)))) {
    throw new Error('desktop account: invalid attempt');
  }
  const attempt: SignInAttemptView = {
    id: raw.id,
    phase: raw.phase as SignInPhase,
    ...(typeof raw.authorizeUrl === 'string' ? { authorizeUrl: validateBrowserDestination(raw.authorizeUrl) } : {}),
    ...(typeof raw.expiresAt === 'number' ? { expiresAt: raw.expiresAt } : {}),
    ...(typeof raw.errorCode === 'string' ? { errorCode: raw.errorCode as SignInErrorCode } : {}),
  };
  return { status: value.status as AccountView['status'], links, attempt };
}

/**
 * 官方 API Key 输入校验（WelcomePage.tsx saveKey 的三条规则）。
 * @param value - 用户输入（调用方负责 trim）。
 * @returns 是否可作为官方 provider 的密钥写入。
 */
export function validateApiKey(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value)) return false;
  if (/^[A-Z][A-Z0-9_]*=[^=]/.test(value)) return false;
  const first = value.charAt(0);
  if ((first === '"' || first === "'" || first === '`') && value.at(-1) === first) return false;
  return true;
}

/** 登录能力不可用的原因（不含任何部署地址）。 */
export type WelcomeSignInReason = 'ready' | 'platform-origin-unconfigured';

/**
 * 如实上报官方浏览器登录能力。
 * 官方账号面要求部署方提供 platformOrigin（私有 patch / 环境变量）；
 * 未配置即不可用 —— 不谎报、不降级成假成功。
 * @param platformOrigin - 官方平台 origin（未配置传 null）。
 * @returns 能力与可展示的如实说明。
 */
export function signInCapability(platformOrigin: string | null): { readonly available: boolean; readonly reason: WelcomeSignInReason; readonly notice: string } {
  const configured = typeof platformOrigin === 'string' && platformOrigin.length > 0;
  if (configured && isAllowedBrowserDestination(platformOrigin)) {
    return {
      available: true,
      reason: 'ready',
      notice: '官方账号面已配置，可发起浏览器登录（PKCE）。',
    };
  }
  return {
    available: false,
    reason: 'platform-origin-unconfigured',
    notice: '本安装未配置官方账号 platformOrigin（官方不下发部署地址），浏览器登录不可用；请在设置中填入官方 API Key，或由部署方补配置后重试。',
  };
}

/** 交接描述：把用户导向可用路径，绝不表示登录已完成。 */
export interface WelcomeHandoff {
  readonly kind: 'official-account' | 'api-key';
  readonly copy: string;
  readonly requiresOfficialPlatform: boolean;
  readonly authorizeUrl?: string | undefined;
}

/**
 * 生成欢迎面交接。
 * @param capability - signInCapability 的结果。
 * @param officialAuthorizeUrl - Host 提供的官方授权地址（仅能力可用时有意义）。
 * @returns 交接描述；不可用时导向 API Key 路径。
 */
export function welcomeHandoff(
  capability: { readonly available: boolean; readonly notice: string },
  officialAuthorizeUrl?: string,
): WelcomeHandoff {
  if (!capability.available) {
    return { kind: 'api-key', copy: capability.notice, requiresOfficialPlatform: true };
  }
  return {
    kind: 'official-account',
    copy: capability.notice,
    requiresOfficialPlatform: false,
    authorizeUrl: officialAuthorizeUrl,
  };
}

/** 官方 Host 侧方法名（内核 Remote 面，逐字保留）。 */
export const OFFICIAL_ACCOUNT_SURFACE = {
  methods: {
    state: 'account/getState',
    startSignIn: 'account/startSignIn',
    cancelSignIn: 'account/cancelSignIn',
    signOut: 'account/signOut',
    watch: 'account/watch',
    watchExpiry: 'account/watchExpiry',
    credentialSet: 'credentials/set',
    settingsDescribe: 'settings/describe',
    listProviders: 'llm/listConfigurableProviders',
  },
  /** 官方 DeepSeek provider 的 settings 命名空间与凭据引用字段。 */
  credentialProviderNs: 'llm-deepseek',
  settingsReferenceField: 'apiKeyEnv',
  /** 安装器（NSIS 插件）永不落任何凭据；凭据只经官方 Host 面写入。 */
  installerPersistsCredentials: false,
} as const;

/** 一次账号 RPC 调用（与官方 typert 远程面的请求形态一致）。 */
export interface OfficialInvokeRequest {
  readonly namespace: string;
  readonly method: string;
  readonly args: Record<string, unknown>;
}

/** 官方 Host 适配器端口：由调用方（sidecar / 壳层）注入，凭据不经过本模块存储。 */
export interface OfficialAccountHostPorts {
  /** 认证后的 Host RPC 调用（与官方 Web RPC 信封对应）。 */
  invoke(request: OfficialInvokeRequest): Promise<unknown>;
  /** 本次调用的 UI 身份（版本、语言、UTC 偏移秒）。 */
  client: AccountClientMetadata;
  /** 浏览器回跳 origin（回环地址，官方 /oauth/callback 绑定它）。 */
  callbackOrigin: string;
  /** 官方平台 origin；未配置传 null（能力如实降级）。 */
  platformOrigin: string | null;
  /** 解析官方 DeepSeek provider 的凭据引用（settings 面 apiKeyEnv）。 */
  credentialsRef(): Promise<string | undefined>;
}

/** API Key 写入结果（不暴露 Host 诊断细节）。 */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false };

/** startSignIn 的两种诚实结果：真的发起了尝试，或只做交接。 */
export type SignInStart =
  | { readonly kind: 'attempt'; readonly state: AccountView }
  | { readonly kind: 'handoff'; readonly state: AccountView; readonly handoff: WelcomeHandoff };

/** 欢迎面消费方（Tauri 壳 / 未来欢迎窗渲染进程）使用的适配器面。 */
export interface WelcomeAccountAdapter {
  capability(): ReturnType<typeof signInCapability>;
  state(): Promise<AccountView>;
  startSignIn(): Promise<SignInStart>;
  cancelSignIn(id: string): Promise<AccountView>;
  saveApiKey(value: string): Promise<WelcomeSaveResult>;
  skip(): Promise<void>;
  skipped(): boolean;
}

/**
 * 创建官方 Host 适配器。
 * @param ports - Host RPC、客户端身份与官方凭据引用解析。
 * @returns 只暴露安全投影与如实能力的适配器。
 */
export function createOfficialHostAdapter(ports: OfficialAccountHostPorts): WelcomeAccountAdapter {
  const capability = (): ReturnType<typeof signInCapability> => signInCapability(ports.platformOrigin);
  const call = async (method: string, args: Record<string, unknown>): Promise<AccountView> =>
    accountView(await ports.invoke({ namespace: 'account', method, args }));
  let skippedState = false;
  return {
    capability,
    state: () => call('getState', {}),
    async startSignIn(): Promise<SignInStart> {
      const current = capability();
      if (!current.available) {
        // 不可用时先取真实状态（signed-out）再交接：不伪造成功，也不伪造 attempt。
        const state = await call('getState', {});
        return { kind: 'handoff', state, handoff: welcomeHandoff(current) };
      }
      const state = await call('startSignIn', {
        client: ports.client,
        callbackOrigin: ports.callbackOrigin,
        loginSource: 'desktop',
      });
      return { kind: 'attempt', state };
    },
    cancelSignIn: (id: string) => call('cancelSignIn', { attemptId: id }),
    async saveApiKey(value: string): Promise<WelcomeSaveResult> {
      if (!validateApiKey(value)) return { ok: false };
      let ref: string | undefined;
      try {
        ref = await ports.credentialsRef();
      } catch {
        return { ok: false };
      }
      if (ref === undefined || ref === '') return { ok: false };
      try {
        await ports.invoke({ namespace: 'credentials', method: 'set', args: { ref, value } });
        return { ok: true };
      } catch {
        // 官方同一纪律：provider 诊断可能含凭据，失败只回 ok:false。
        return { ok: false };
      }
    },
    async skip(): Promise<void> {
      // 官方 skip()：进入工作区但不写「已完成引导」设置 —— 仅本次运行内生效。
      skippedState = true;
    },
    skipped: () => skippedState,
  };
}
