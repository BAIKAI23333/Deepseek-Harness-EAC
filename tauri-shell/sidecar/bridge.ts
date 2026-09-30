/// <reference lib="dom" />
'use strict';
// DSH 桌面桥（v6 Task 3.1 · 官方契约 + 壳最小控制面）：在 Tauri WebView2 里
// 暴露 window.dshDesktop（transport = 回环 WS JSON-RPC，而非 ipcRenderer）。
//
// 通道分流：
//   win.*   → Rust 壳层在 WS 中继处本地拦截（窗口控制/拖拽/开发工具）
//   boot.*  → 转发 sidecar（dsh web 进程编排）
//   通知帧（无 id）→ win.maximized / boot.web-ready 推送
//
// 页面侧 chrome：36px 玻璃栏（主窗 decorations(false)，自绘标题栏必需），
// mousedown → win.start-dragging（WebView2 无 -webkit-app-region），5s 心跳，
// 页面异常上报。
//
// 接口面收敛（ADR 0006 v5）：只保留官方 dshDesktop 契约 + 窗口控制 + boot；
// EAC 自造面全部移除，被剥能力接回见 ADR 0006「插口契约」节。
//
// 官方并列面（与 dshDesktop 同层挂在 window 上）：
//   __DSH_LOCALE__   — SYNC-002，官方 LocaleBridge（preload-app.ts:102-105）
//   __DSH_HOST_PATHS__ — SYNC-003，官方 HostPathsBridge（preload-app.ts:78-83，
//     拖放/粘贴/选取文件的真实磁盘路径 → composer @path 引用；WebView2 能力
//     边界与匹配语义见下方实现区注释）

(function () {
  var BAR_ID = '__dsh_desktop_chrome__';
  var BAR_HEIGHT = 36;

  // ---------------------------------------------------------------------------
  // data-platform（SYNC-001 · 官方 markDocumentPlatform 同语义）
  //
  // 官方 preload-platform.ts:10-17 在 <html> 标 process.platform，客户端
  // dsh-client-shortcuts 的 detectEnvironment（client.js:721-724）见到该属性即判
  // runtime='desktop'，缺失走 web 分支（桌面键位等能力全部失效）—— 这是官方
  // client 包读取的桌面壳标记。Tauri 桥运行在页面层、无 process，用
  // navigator.platform（WebView2 在 Windows 恒 'Win32'）+ userAgent 复核判定。
  // 局限：UA 可被伪造误判，但本属性由壳在 document-start 注入、先于页面脚本，
  // 页面自身没有伪造窗口期；对 shortcuts 仅影响平台专属默认键位。
  //
  // 取值域：'windows' | 'macos' | 'linux'（SYNC-001 任务卡指定，与
  // detectEnvironment 的三个归一化分支对齐）。注：官方内核实际标的是
  // process.platform（'win32'/'darwin'/'linux'），本值域对 shortcuts 等价
  //（client.js 用 /win/i、/darwin|mac|.../ 归一化）；但 ui-layout/dockkit 的
  // CSS 按 `data-platform='darwin'` 出 macOS 专属规则 —— 未来接 macOS 壳时
  // darwin 一支应改标 'darwin' 而非 'macos'。取值必须先于 setAttribute 完成
  //（markDocumentPlatform 内部先算 value 再标记）。
  // ---------------------------------------------------------------------------
  function detectShellPlatform(): 'windows' | 'macos' | 'linux' {
    var platform = '';
    var ua = '';
    try { platform = String(navigator.platform || ''); } catch (e) { /* 桥单测 vm 无 navigator */ }
    try { ua = String(navigator.userAgent || ''); } catch (e) { /* 同上 */ }
    if (/win/iu.test(platform) || /Windows NT/iu.test(ua)) return 'windows';
    if (/mac|iphone|ipad|darwin/iu.test(platform) || /Macintosh|Mac OS X/iu.test(ua)) return 'macos';
    return 'linux';
  }

  function markDocumentPlatform(): void {
    var value = detectShellPlatform();
    var root = document.documentElement as HTMLElement | null;
    if (!root) {
      // 官方同款防御：初始化脚本可能先于文档根存在执行，延迟到 DOM ready。
      document.addEventListener('DOMContentLoaded', function () { markDocumentPlatform(); }, { once: true });
      return;
    }
    root.setAttribute('data-platform', value);
  }
  markDocumentPlatform();

  // 回环 WS JSON-RPC 客户端（单源：assets/ws-jsonrpc-client.js，Rust 壳在
  // initialization_script 序列中先注入本桥）。connect/queue/call/重连逻辑
  // 只存在于单源文件；这里只做钩子接线与语义别名。
  var notifyHooks: ((method: string, params: any) => void)[] = [];
  var readyHooks: ((info: any) => void)[] = [];
  var rpc = (window as any).__DSH_WS_RPC__({
    onOpen: function () {
      call('boot.state', {}).then(function (info) {
        try { readyHooks.forEach(function (h) { h(info); }); } catch (e) { /* 页面回调异常不断桥 */ }
      }).catch(function () { /* boot.state 不可用不致命 */ });
    },
  });
  rpc.onNotify(function (method: string, params: any): void {
    try { notifyHooks.forEach(function (h) { h(method, params); }); } catch (e) { /* 同上 */ }
  });

  // fire-and-forget（ipcRenderer.send 语义）：不等回复，断了就丢。
  function send(method: string, params?: unknown): void { rpc.send(method, params); }
  // invoke 语义（ipcRenderer.invoke）：Promise + 超时。
  function call(method: string, params?: unknown, timeoutMs?: number): Promise<any> { return rpc.call(method, params, timeoutMs); }
  function onNotify(fn: (method: string, params: any) => void): void { notifyHooks.push(fn); }

  // ---------------------------------------------------------------------------
  // window.dshDesktop（v6 Task 3.1 · 官方契约 + 壳最小控制面）
  //
  // 面收敛依据（ADR 0006 v5）：只保留「官方保留的接口」——
  //   1. 官方 dshDesktop 契约（对照内核 apps/desktop/src/ipc.ts 的
  //      DshDesktopApi：protocolVersion / keyboard / locale / plugins / updates；
  //      keyboard 为 SYNC-001 接回 —— 官方 shortcuts 包检测到 data-platform
  //      即硬依赖它）；
  //      其中 plugins.* 与 updates.* 的能力随最简本体剥出，按官方返回形态
  //      给出空实现（list → []，check → idle），接回时替换实现体即可。
  //   2. 壳最小控制面：windowControls（窗口控制，主窗 decorations(false)
  //      自绘标题栏必需）+ boot（拉起/停止/查询 dsh web）。
  // 其余 EAC 自造面（chrome.init / menu.* / files.* / balance.* / phone.* /
  // guard.* / rc.* / rescue.* / recovery.* / onboard.* / wizard.* / service.* /
  // profile.* / float.* / imagePaste / fileDrop / copyText / openExternal /
  // openPath / getPathForFile）全部移除。
  // ---------------------------------------------------------------------------
  function unavailable(capability: string): Promise<never> {
    return Promise.reject(new Error('capability "' + capability + '" is not bundled in the v6 minimal core'));
  }

  // ---------------------------------------------------------------------------
  // keyboard（SYNC-001 · 官方 DesktopKeyboardApi，native.d.ts 逐字段对齐）
  //
  // 强耦合背景：dsh-client-shortcuts 检测到 data-platform 即 runtime='desktop'
  // 并立即取 window.dshDesktop?.keyboard（client.js:1854-1855），缺失即
  // throw "Desktop keyboard bridge unavailable" —— data-platform 与 keyboard
  // 必须同批落地，缺一官方 shortcuts 包硬崩。
  //
  // 物理键捕获选型（SYNC-001 任务卡方案甲 · JS 层）：WebView2 无 Electron 的
  // before-input-event；方案乙（L1 accelerator）需 Win32 键盘钩子并在壳层自建
  // 键位解析与推送通道，改动面大、与页面聚焦态（本地控件优先消费）耦合困难。
  // 改为页面层 window keydown 捕获监听（capture 态、只观察上报、绝不
  // preventDefault/stopPropagation），就地组装官方 DesktopShortcutInput 分发
  // 给 subscribe 的 listener。官方客户端在 desktop 态的 DOM keydown 只喂 fixed
  // 动作（installKeyboard 的 native=true 分支，client.js:736），可配置键位一律
  // 走原生推送 —— 两通道不重复分发，与官方 Electron 形态一致。
  //
  // 已知缺口：跨文档 guest（侧边栏浏览器框 iframe/webview）聚焦时按键不冒泡
  // 到顶层 window；'iframe'/'webview' 分支按官方 preload-app.ts:21-31 的
  // activeElement 匹配集组装形态，但捕获依赖顶层 keydown 到达。完整对齐官方
  // 主进程级捕获需 L1 接管，留给后续 SYNC 任务。
  // ---------------------------------------------------------------------------

  // ShortcutRevision 运行时是 Branded<string>（编译期品牌，值即字符串）。EAC
  // 无快捷键配置修订存储（官方由主进程 persistence 发布 revision，原生输入与
  // 关窗指令携带同一值供客户端对账），给稳定占位串。官方 installNativeKeyboard
  //（client.js:896）会丢弃 revision 与其快照不一致的输入 —— 占位阶段原生输入
  // 只抵达 listener 闸门、不进入键位分发，功能对齐留给 dshDesktop.shortcuts
  // 接回任务。
  var SHORTCUT_REVISION_PLACEHOLDER = 'eac-shortcut-revision-0';
  var keyboardListeners: ((input: unknown) => void)[] = [];
  var keyboardCaptureInstalled = false;

  function emitShortcutInput(input: unknown): void {
    for (var i = 0; i < keyboardListeners.length; i++) {
      var listener = keyboardListeners[i];
      if (typeof listener !== 'function') continue;
      try { listener(input); } catch (e) { /* listener 异常不断桥 */ }
    }
  }

  // 官方 DesktopShortcutInput 组装（native.d.ts）：{ revision, kind, frameName,
  // code, secondCode?, control, alt, shift, meta, repeat }。secondCode 是双键
  // chord（如 Ctrl+K,C），单次 keydown 无从产生，按官方主进程行为省略
  //（keyboard.ts:202 仅 chord 命中时附带）。iframe/webview 分支与官方
  // preload-app.ts:21-31 同一匹配集：activeElement 命中侧边栏浏览器宿主元素
  // 即改发嵌入形态 + frameName；frameName 为空即丢弃（官方语义：无名的嵌入
  // 宿主无法回验所有权，宁可不分发）。
  function assembleShortcutInput(event: KeyboardEvent): Record<string, unknown> | null {
    var code = event.code;
    var control = !!event.ctrlKey;
    var alt = !!event.altKey;
    var shift = !!event.shiftKey;
    var meta = !!event.metaKey;
    var repeat = !!event.repeat;
    var revision = SHORTCUT_REVISION_PLACEHOLDER;
    var active = document.activeElement as Element | null;
    if (active && typeof active.matches === 'function' && active.isConnected) {
      // webview 分支先判（webview 宿主元素不是 HTMLIFrameElement）。
      if (active.matches('webview[data-sidebar-browser-frame]')) {
        var webviewName = active.getAttribute('name') || '';
        if (!webviewName) return null;
        return { revision: revision, kind: 'webview', frameName: webviewName, code: code, control: control, alt: alt, shift: shift, meta: meta, repeat: repeat };
      }
      if (active.matches('iframe[data-sidebar-browser-frame], iframe[data-html-preview]')) {
        var frameName = (active as HTMLIFrameElement).name || '';
        if (!frameName) return null;
        return { revision: revision, kind: 'iframe', frameName: frameName, code: code, control: control, alt: alt, shift: shift, meta: meta, repeat: repeat };
      }
    }
    return { revision: revision, kind: 'keyboard', frameName: '', code: code, control: control, alt: alt, shift: shift, meta: meta, repeat: repeat };
  }

  function onKeydownCapture(event: KeyboardEvent): void {
    var input = assembleShortcutInput(event);
    if (input === null) return;
    emitShortcutInput(input);
  }

  // 惰性安装：首个 listener 订阅才挂捕获，最后一个退订即卸 —— 打字是热路径，
  // 无消费者时不应每个按键都组装输入对象。
  function ensureKeyboardCapture(): void {
    if (keyboardCaptureInstalled) return;
    keyboardCaptureInstalled = true;
    // capture 态只保证早于页面冒泡监听观察，不拦截：本地控件（xterm/输入框）
    // 先处理属正常，本桥不做任何 consume。
    window.addEventListener('keydown', onKeydownCapture, true);
  }

  function releaseKeyboardCapture(): void {
    if (!keyboardCaptureInstalled) return;
    keyboardCaptureInstalled = false;
    window.removeEventListener('keydown', onKeydownCapture, true);
  }

  (window as any).dshDesktop = {
    // ---- 官方 dshDesktop 契约 ----
    protocolVersion: 1,
    // SYNC-001：官方 DesktopKeyboardApi（内核 ipc.ts:74 + dsh-client-shortcuts
    // native.d.ts）。官方 shortcuts 包检测到 data-platform 即硬依赖本面
    //（client.js:1854-1855），缺失立即 throw —— 实现体见上方 keyboard 区。
    keyboard: {
      // 物理键按下推送（DesktopShortcutInput），返回 disposer —— 形态对齐官方
      // preload-app.ts:19-36（ipcRenderer.on/off 的桥层等价物）。
      subscribe: function (listener: (input: unknown) => void): () => void {
        keyboardListeners.push(listener);
        ensureKeyboardCapture();
        return function () {
          var i = keyboardListeners.indexOf(listener);
          if (i >= 0) keyboardListeners.splice(i, 1);
          if (keyboardListeners.length === 0) releaseKeyboardCapture();
        };
      },
      // 官方语义（keyboard.ts:97-102）：主进程校验 revision 仍当前、窗口聚焦、
      // 未录键、未遮挡才关窗。EAC 无快捷键配置修订存储可校验 —— 按任务卡简化
      // 为「收到即关」，revision 原样透传在 win.close 帧上由 L1 记录；与官方
      // 的差异（无 revision 对账、无聚焦前置条件）留给 shortcuts 接回任务对齐。
      closeWindow: function (revision: unknown): Promise<void> {
        return call('win.close', { reason: 'shortcuts.closeWindow', revision: revision })
          .then(function () { /* Promise<void>：不把 win.close 的 ok 回包外泄 */ });
      },
    },
    locale: function () {
      try { return Promise.resolve(String((navigator && navigator.language) || 'zh-CN')); }
      catch (e) { return Promise.resolve('zh-CN'); }
    },
    plugins: {
      list: function () { return Promise.resolve([]); },
      add: function () { return unavailable('plugin-install'); },
      remove: function () { return unavailable('plugin-install'); },
      update: function () { return unavailable('plugin-install'); },
    },
    updates: {
      // rc.2 设置页在激活时读取 status；保留旧方法供现有插件使用。
      status: function () { return Promise.resolve({ phase: 'idle' }); },
      open: function () { return unavailable('client-update'); },
      check: function () { return Promise.resolve({ phase: 'idle' }); },
      install: function () { return unavailable('client-update'); },
      subscribe: function () { return function () { /* 无更新事件源 */ }; },
    },
    // ---- 壳最小控制面：窗口控制（自绘标题栏与 Rust L1 能力）----
    windowControls: {
      minimize: function () { return call('win.minimize', {}); },
      toggleMaximize: function () { return call('win.toggle-maximize', {}); },
      close: function () { return call('win.close', {}); },
      isMaximized: function () { return call('win.is-maximized', {}).then(function (r) { return !!(r && r.maximized); }); },
      reload: function () { return call('win.reload', {}); },
      toggleDevtools: function () { return call('win.devtools', {}); },
      toggleFullscreen: function () { return call('win.fullscreen', {}); },
      openInBrowser: function () { return call('win.open-browser', {}); },
      onMaximizeChange: function (cb: (maximized: boolean) => void) {
        var hook = function (method: string, params: any) {
          if (method !== 'win.maximized') return;
          try { cb(!!(params && params.maximized)); } catch (e) { /* 回调异常不断桥 */ }
        };
        notifyHooks.push(hook);
        return function () {
          var i = notifyHooks.indexOf(hook);
          if (i >= 0) notifyHooks.splice(i, 1);
        };
      },
    },
    // ---- 壳最小控制面：dsh web 服务编排 ----
    boot: {
      start: function () { return call('boot.start', {}); },
      stop: function () { return call('boot.stop', {}); },
      state: function () { return call('boot.state', {}); },
      restart: function () { return call('boot.restart', {}); },
      onStateChange: function (cb: (info: any) => void) {
        var hook = function (method: string, params: any) {
          if (method !== 'boot.web-ready') return;
          try { cb(params); } catch (e) { /* 回调异常不断桥 */ }
        };
        notifyHooks.push(hook);
        return function () {
          var i = notifyHooks.indexOf(hook);
          if (i >= 0) notifyHooks.splice(i, 1);
        };
      },
    },
    // ---- v6 Task 3.3 接回：内置插件消费的 EAC 面 ----
    // 依据 ADR 0006 v5 的接口收敛清单，这些方法族曾随最简本体剥出；
    // 现按其「插口契约」逐项接回。服务端实现见 sidecar/server.ts。
    // 配置收窄说明：仅恢复当前已接回插件实际消费的键，未恢复的
    // （menu / floatWindow / phoneBridge / pluginUpdates / imagePaste /
    //   recovery / rescue / refreshBalance / restartService 等）继续留空。
    // 依据 metaone01 2026-09-19 裁决（按 ADR 0006）：balance 转推荐插件、
    // plugin-wizard 明确不接入 —— 故 balance* 与 pluginWizard 为终态留空，
    // 由 bridge-preload-parity.test.ts 的 STILL_RETIRED 锁定不得回归。
    pluginManager: {
      list: function () { return call('plugins.list', {}); },
      setEnabled: function (id: string, enabled: boolean) { return call('plugins.set-enabled', { id: id, enabled: enabled }); },
      setRemoved: function (id: string, removed: boolean) { return call('plugins.set-removed', { id: id, removed: removed }); },
    },
    guard: {
      action: function (action: string, value?: unknown) { return call('guard.action', { action: action, value: value }); },
    },
    fileDrop: {
      save: function (payload: Record<string, unknown>) { return call('file-drop.save', payload || {}); },
    },
    // 浏览器环境无 File 磁盘路径：与 v5 一致返回空串，插件据此降级为可读提示。
    getPathForFile: function (): string { return ''; },
    // 壳信息（v6 语义：等同 boot.state；staticPort 恒 0，静态预览服务随
    // 插件面剥出，客户端按既有契约回退宿主路由）。
    getInfo: function () { return call('boot.state', {}); },
    // 文件还原（内容精确匹配；白名单校验在 sidecar）。
    revertFiles: function (changes: unknown) { return call('files.revert', { changes: changes }); },
    // 文件打开：L1 拦截（先经 sidecar files.authorize-open 授权，再 ShellExecuteW）。
    openPath: function (path: string) { return call('files.open', { path: path }); },
    // 外链打开：L1 拦截（ShellExecuteW）。
    openExternal: function (url: string) { return call('shell.open-external', { url: url }); },
    // 桥内省（壳层页面与冒烟用；不属于对外契约）。
    _call: call,
    _send: send,
    _onNotify: onNotify,
    _onReady: function (fn: (info: any) => void) { readyHooks.push(fn); },
  };
  var dshDesktop: any = (window as any).dshDesktop;

  // ---------------------------------------------------------------------------
  // __DSH_LOCALE__（SYNC-002 · 官方 LocaleBridge，preload-app.ts:102-105 逐字段
  // 对齐）
  //
  // 官方形态：read() = ipcRenderer.invoke(DESKTOP_IPC.localeBootstrap)；
  // onChange(locale) = ipcRenderer.send(DESKTOP_IPC.localeChanged, locale)
  //（fire-and-forget）。消费者 dsh-client-locale（client.js:1504-1533）：激活时
  // read() 经 parseLocaleBootstrap（client.js:18-19）严格校验 —— languages 必须
  // 是 string[]、preference 键必须存在且为 string|null，形态错即 throw
  // "locale: invalid native initialization data"；语言切换时 onChange(active) 上报。
  //
  // 通道映射：read() 经 WS call('locale.bootstrap')（Rust L1 本地拦截：返回壳
  // 持久化 preference + 系统语言标签）。languages 按 detectBrowserLocale 的
  // 浏览器侧语义（client.js:1476-1479）以 navigator.languages 优先、L1 系统标签
  // 兜底合并去重 —— WebView2 的 navigator.languages 跟随 OS 用户语言列表，与
  // 官方 app.getPreferredSystemLanguages() 等价且更完整；languages 保证非空
  //（'en' 兜底，与官方 resolveInitialLocale 的默认语言一致）。preference 透传
  // L1（string 或 null），壳无持久化时为 null（= 官方「自动选择」语义）。
  // read() 失败不降级 —— 与官方一致（invoke 失败即异常，消费者据此终止激活）。
  // onChange 经 WS send('locale.changed', {locale})（L1 拦截：持久化 preference
  // + 重建托盘菜单文案）。官方 main.ts:711 的应用菜单/平台页刷新在 EAC 无对应
  // 面（无原生应用菜单、无平台页），托盘菜单文案是语言回写的壳侧落点。
  // ---------------------------------------------------------------------------
  (window as any).__DSH_LOCALE__ = {
    read: function (): Promise<{ languages: string[]; preference: string | null }> {
      return call('locale.bootstrap', {}).then(function (r: any) {
        var languages: string[] = [];
        var seen: Record<string, boolean> = {};
        var push = function (tag: unknown): void {
          if (typeof tag !== 'string' || !tag || seen[tag]) return;
          seen[tag] = true;
          languages.push(tag);
        };
        try {
          // 浏览器侧语言优先序（detectBrowserLocale 同源）；桥单测 vm 无
          // navigator 时引用即 ReferenceError，捕获后走 L1 系统标签兜底。
          var navList = (navigator && navigator.languages) || [];
          for (var i = 0; i < navList.length; i++) push(navList[i]);
          push((navigator && navigator.language) || '');
        } catch (e) { /* 同上 */ }
        var fromShell = r && Array.isArray(r.languages) ? r.languages : [];
        for (var j = 0; j < fromShell.length; j++) push(fromShell[j]);
        if (languages.length === 0) push('en');
        return {
          languages: languages,
          preference: r && typeof r.preference === 'string' ? r.preference : null,
        };
      });
    },
    onChange: function (locale: string): void {
      send('locale.changed', { locale: locale });
    },
  };

  // ---------------------------------------------------------------------------
  // __DSH_HOST_PATHS__（SYNC-003 · 官方 HostPathsBridge，preload-app.ts:78-83 逐
  // 字段对齐）
  //
  // 官方形态：pathFor(file) = Electron webUtils.getPathForFile(file)。composer
  // 把「拖放/粘贴/选取的、有真实磁盘路径的文件」标成 @path 引用而非上传
  //（消费者 dsh-client-ui-conversation/lib/client.js:18290：path 非空且（目录
  // 或非图片）→ @path 引用；path 为空 → 上传；粘贴的字节流（截图）无真实路径
  // 必须返回 ''，官方注释原文语义）。
  //
  // WebView2 能力边界（SYNC-003 调研结论，证据见任务自证材料）：
  //   * 页面层：Chromium 的 File 没有 path 属性（Electron 专有 patch），
  //     DataTransfer/clipboardData 里的 File 只有 name/size/type —— 页面自身
  //     无从得知真实路径（WebView2Feedback #501/#3615，均未发布页面层 API）。
  //   * 宿主层：拿到「拖放」真实路径的唯一通道是在 WebView2 之前接管 OLE
  //     拖放（wry DragDropController 同款：SetAllowExternalDrop(false) + 自注册
  //     IDropTarget + CF_HDROP）。实测接管会让页面原生 HTML5 拖放整体失效
  //    （页面收不到 dragover/drop；wry 对非文件拖拽恒回 DROPEFFECT_NONE 且
  //     无事件，页内文字/图片拖拽无法恢复）—— 本壳 main.rs 特意
  //     disable_drag_drop_handler 保住页面拖放，故拖放路径本版不接管。
  //   * 选定方案（任务卡方案乙 · 剪贴板暂存）：资源管理器「复制」的文件以
  //     CF_HDROP 落在系统剪贴板，WebView2 页面 paste 事件的 clipboardData.files
  //     正是由它生成（File 的 name/size 与 L1 枚举一致）。L1 常驻剪贴板监听
  //    （main.rs 消息专用窗 + AddClipboardFormatListener + DragQueryFileW），
  //     内容变化即经 WS 广播 win.host-paths 通知帧（path/name/size/isDir 数组，
  //     绝不含伪造路径）；本桥暂存「最近一次 L1 暂存」，pathFor 按 name+size
  //     精确匹配返回真实绝对路径。
  //
  // 已知局限（SYNC-007/后续任务处置）：
  //   - 拖放（drop）：''（按上传处理，与现状一致；见上「接管代价」）；
  //   - 文件选取（picker）：WebView2 无自定义文件对话框路径 API，''；
  //   - 粘贴（paste）：已恢复 —— 复制文件粘贴 → @path；粘贴字节流 → ''；
  //   - 页面重载/重连期间 L1 会补推当前快照（main.rs 新 WS 连接推送），
  //     补推缺失时 pathFor 退化为 ''（走上传，不悬空）。
  //
  // 匹配语义：以「最近一次 win.host-paths 帧」为当前集（剪贴板内容变化即整体
  // 替换，含 L1 推空清场 —— 字节流截图上板后旧文件路径随之失效）；name 精确
  // 匹配 + size 精确匹配（目录 size 无意义，isDir 时仅按 name 匹配）；不消费
  // 表项（同一剪贴板内容可重复粘贴）；入参非 File 形态/无命中一律 ''。
  // ---------------------------------------------------------------------------
  interface HostPathEntry { path: string; name: string; size: number; isDir: boolean; }
  var hostPathEntries: HostPathEntry[] = [];
  onNotify(function (method: string, params: any): void {
    try {
      if (method !== 'win.host-paths') return;
      var files = params && params.files;
      if (!Array.isArray(files)) return;
      var next: HostPathEntry[] = [];
      for (var i = 0; i < files.length; i++) {
        var e = files[i] || {};
        // 只收 L1 真实枚举形态：path 非空字符串 + name 字符串；size 缺失按
        // -1 处理（永不可能与真实 File.size 匹配 → 恒 ''，不伪造）。
        if (typeof e.path === 'string' && e.path !== '' && typeof e.name === 'string' && e.name !== '') {
          next.push({
            path: e.path,
            name: e.name,
            size: typeof e.size === 'number' && Number.isFinite(e.size) ? e.size : -1,
            isDir: e.isDir === true,
          });
        }
      }
      hostPathEntries = next;
    } catch (e) { /* 通知帧畸形不炸桥 */ }
  });
  (window as any).__DSH_HOST_PATHS__ = {
    // 官方签名（preload-app.ts:83）：pathFor: (file: File) => string。
    // 实现按 name/size 鸭子匹配（vm 单测可喂纯对象；Chromium File 两者皆实）。
    pathFor: function (file: File): string {
      var f = file as unknown as { name?: unknown; size?: unknown } | null | undefined;
      if (!f || typeof f.name !== 'string' || typeof f.size !== 'number') return '';
      for (var i = 0; i < hostPathEntries.length; i++) {
        var entry = hostPathEntries[i];
        if (!entry) continue;
        if (entry.name !== f.name) continue;
        // 目录条目不做 size 对账（metadata.len() 对目录无意义）；文件条目
        // name+size 双匹配 —— size 相同的同名文件才可能命中，杜绝伪造。
        if (!entry.isDir && entry.size !== f.size) continue;
        return entry.path;
      }
      return '';
    },
  };

  // 页面异常 → 壳层日志。
  window.addEventListener('error', function (e) {
    try { send('log.page-error', { message: 'window.onerror: ' + ((e && (e.message || e.error)) || 'unknown') }); } catch (err) { /* 忽略 */ }
  });
  window.addEventListener('unhandledrejection', function (e) {
    try { send('log.page-error', { message: 'unhandledrejection: ' + String((e && (e as any).reason && ((e as any).reason.message || (e as any).reason)) || e) }); } catch (err) { /* 忽略 */ }
  });

  // ---------------------------------------------------------------------------
  // Chrome DOM（36px 玻璃栏；拖拽 = mousedown → win.start-dragging）
  // ---------------------------------------------------------------------------
  var GLYPHS = {
    min: '<svg data-control-name="system.default.window-minimize-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M2.5 6h7"/></svg>',
    max: '<svg data-control-name="system.default.window-maximize-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1.4"/></svg>',
    restore: '<svg data-control-name="system.default.window-restore-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M4.2 4.2V2.6h5.2v5.2H7.8"/><rect x="2.6" y="4.2" width="5.2" height="5.2" rx="1.2"/></svg>',
    close: '<svg data-control-name="system.default.window-close-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg>',
  };

  var maxBtn: HTMLElement | null = null;
  // 壳栏展示状态（来源：boot.state —— 唯一的壳信息接口）。
  var state: any = { appVersion: '', agentVersion: '', agentSource: '' };

  // WebView2 无 -webkit-app-region:drag —— mousedown 转发壳层 start_dragging。
  // 双击标题 = 最大化/还原（与系统标题栏默认行为对齐）。
  function armDrag(el: Element): void {
    var lastClick = 0;
    el.addEventListener('mousedown', function (e) {
      if ((e as MouseEvent).button !== 0) return;
      var target = e.target as HTMLElement | null;
      // 按钮上的按下不触发拖拽（关闭/最大化等仍可点击）。
      if (target && target.closest && target.closest('button')) return;
      var now = Date.now();
      if (now - lastClick < 400) {
        lastClick = 0;
        dshDesktop.windowControls.toggleMaximize().catch(function () { /* 壳层不可用时静默 */ });
        return;
      }
      lastClick = now;
      send('win.start-dragging', {});
    });
  }

  function setMaximized(isMax: boolean): void {
    if (!maxBtn) return;
    maxBtn.innerHTML = isMax ? GLYPHS.restore : GLYPHS.max;
    maxBtn.title = isMax ? '还原' : '最大化';
    maxBtn.setAttribute('aria-label', maxBtn.title);
    maxBtn.setAttribute('aria-pressed', String(isMax));
  }

  function injectUiSkin(): void {
    var manager = (window as any).__DSH_UI_SKIN_MANAGER__;
    if (manager && manager.enabled === true && manager.slots) {
      var generation = String(manager.generation);
      Object.keys(manager.slots).forEach(function (slot) {
        var id = 'dsh-ui-skin-' + slot + '-' + generation;
        if (document.getElementById(id)) return;
        var tag = document.createElement('style');
        tag.id = id;
        tag.setAttribute('data-skin-slot', slot);
        tag.setAttribute('data-skin-generation', generation);
        tag.textContent = String(manager.slots[slot] || '');
        document.head.appendChild(tag);
      });
      return;
    }
    if (document.getElementById('dsh-ui-skin')) return;
    var tag = document.createElement('style');
    tag.id = 'dsh-ui-skin';
    tag.textContent = String((window as any).__DSH_UI_SKIN_CSS__ || '');
    document.head.appendChild(tag);
  }

  // Generation-aware host bridge. Candidate styles are staged before the
  // previous generation is removed; the manager receives an explicit ack.
  (function installUiSkinTransactionBridge(): void {
    var activeGeneration = 0;
    var activeSlots: Record<string, string> = {};
    var manager = (window as any).__DSH_UI_SKIN_MANAGER__;
    if (manager && Number.isFinite(Number(manager.generation))) activeGeneration = Number(manager.generation);
    function acknowledge(generation: number, ok: boolean, error?: string): void {
      window.dispatchEvent(new CustomEvent('dsh-ui-skin-transaction-ack', {
        detail: {generation: generation, context: 'webview', ok: ok, error: error || undefined}
      }));
    }
    window.addEventListener('dsh-ui-skin-transaction', function (event: Event): void {
      var detail = (event as CustomEvent).detail || {};
      var generation = Number(detail.generation);
      var slots = detail.slots as Record<string, unknown> | undefined;
      if (!Number.isSafeInteger(generation) || generation <= activeGeneration || !slots) {
        acknowledge(generation, false, 'STALE_OR_INVALID_GENERATION');
        return;
      }
      var transactionSlots = slots;
      var staged: HTMLStyleElement[] = [];
      try {
        Object.keys(transactionSlots).forEach(function (slot): void {
          var style = document.createElement('style');
          style.id = 'dsh-ui-skin-' + slot + '-' + generation;
          style.setAttribute('data-skin-slot', slot);
          style.setAttribute('data-skin-generation', String(generation));
          style.textContent = String(transactionSlots[slot] || '');
          document.head.appendChild(style);
          staged.push(style);
        });
        Object.keys(activeSlots).forEach(function (slot): void {
          var old = document.querySelectorAll('[data-skin-slot="' + slot + '"][data-skin-generation="' + activeGeneration + '"]');
          old.forEach(function (node): void { node.remove(); });
        });
        activeSlots = Object.fromEntries(Object.keys(transactionSlots).map(function (slot): [string, string] { return [slot, String(transactionSlots[slot] || '')]; }));
        activeGeneration = generation;
        acknowledge(generation, true);
      } catch (error) {
        staged.forEach(function (style): void { style.remove(); });
        acknowledge(generation, false, error instanceof Error ? error.message : String(error));
      }
    });
  })();

  function nameUiSkinAnchors(): void {
    function name(selector: string, region: string, control: string): void {
      document.querySelectorAll(selector).forEach(function (node) {
        node.setAttribute('data-region', region);
        node.setAttribute('data-control-name', control);
      });
    }

    name('#root, [data-slot="root"]', 'session', 'session-root');
    name('[data-conversation-scroll]', 'session', 'session-content');
    name('[data-slot="top-sidebar"]', 'top-sidebar', 'sidebar-root');
    name('[data-slot="bottom-sidebar"]', 'bottom-sidebar', 'sidebar-root');
    name('[data-slot="left-sidebar"]', 'left-sidebar', 'sidebar-root');
    name('[data-slot="right-sidebar"]', 'right-sidebar', 'sidebar-root');
    name('[role="dialog"]', 'overlay', 'dialog-surface');
    name('[data-floating-ui-portal], [data-radix-popper-content-wrapper], ._7KE1Ra_menu, .ra1x4W_menu', 'overlay', 'popup-surface');

    document.querySelectorAll('[role="dialog"]').forEach(function (dialog) {
      dialog.querySelectorAll('[class*="navList"], [class*="options"]').forEach(function (node) {
        node.setAttribute('data-control-name', 'system.default.dialog-scroll-area');
      });
      dialog.querySelectorAll('[class*="panel"], [class*="overlay"]').forEach(function (node) {
        node.setAttribute('data-control-name', 'system.default.dialog-panel');
      });
    });
    document.querySelectorAll('._7KE1Ra_menu, .ra1x4W_menu').forEach(function (menu) {
      var composer = menu.closest('[class*="composerStack"]');
      if (composer) {
        composer.setAttribute('data-region', 'session');
        composer.setAttribute('data-control-name', 'composer');
      }
    });
  }

  // 模型选择弹层救援：菜单绝对定位向上展开（最高 360px + 8px 间距），在 hero
  // 页或矮窗口里顶部会越出滚动容器/视口被切。探到菜单顶部进入玻璃栏区（<40px）
  // 就翻转向下展开，并按触发钮下方可用空间收缩高度；菜单关闭或空间充足时还原。
  // 翻转向下后菜单会伸出 composerStack（overflow:auto）的盒子 —— 配套 CSS 用
  // :has(...) 在菜单打开时放开该容器裁剪（见 Control Package layout.css）。
  // 0.1.2 菜单哈希类 ._7KE1Ra_menu→.ra1x4W_menu（已实核安装闭包），双锚并留。
  function initPopupRescue(): void {
    var MENU_SEL = '._7KE1Ra_menu, .ra1x4W_menu';
    var FLIP_CLS = 'dsh-popup-flip';
    var BAR_EDGE = 40;
    var probeTimer: number | null = null;
    // 翻转态按菜单元素保存（WeakSet，菜单卸载即回收）：翻转与否只在菜单开起来
    // 时判定一次。绝不能根据翻转后的 r.top 还原 —— 翻转让它 ≥40，还原又让它
    // <40，会形成每 200ms 翻转↔复原的震荡（弹层自带抽搐，且导致位置随机）。
    var flippedMenus = new WeakSet<HTMLElement>();

    function probeMenus(): void {
      probeTimer = null;
      nameUiSkinAnchors();
      var menus = document.querySelectorAll(MENU_SEL);
      var anyOpen = false;
      for (var i = 0; i < menus.length; i++) {
        var menu = menus[i] as HTMLElement;
        var r = menu.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // 未渲染/已关闭
        anyOpen = true;
        if (!flippedMenus.has(menu) && r.top < BAR_EDGE) flippedMenus.add(menu);
        if (flippedMenus.has(menu)) {
          var trigger = menu.parentElement as HTMLElement | null;
          var below = trigger ? window.innerHeight - trigger.getBoundingClientRect().bottom - 16 : 240;
          menu.classList.add(FLIP_CLS);
          // 下限 80（而非 120）：矮窗口下触发钮本身贴近视口底，过高的下限会让
          // 菜单底部挤出视口（实测 470px 高时 120 的底超出 12px）。
          menu.style.maxHeight = String(Math.max(80, Math.min(360, below))) + 'px';
        } else {
          menu.classList.remove(FLIP_CLS);
          menu.style.maxHeight = '';
        }
      }
      // 菜单存续期间低频轮询（内容加载会改变高度/位置）。
      if (anyOpen) probeTimer = window.setTimeout(probeMenus, 200);
    }

    function scheduleProbe(): void {
      // 每个变更批次都同步 querySelectorAll 全树扫描：对话流式输出期间 DOM
      // 变更风暴会把这条热路径烧起来。菜单开/关/挪位晚一帧探测无可感知
      // 差异 —— rAF 把同帧的整批变更合并成一次探测（与页面渲染同帧节流）。
      if (probeTimer === null) probeTimer = window.requestAnimationFrame(probeMenus);
    }

    function start(): void {
      if (!document.body) return;
      new MutationObserver(scheduleProbe).observe(document.body, { childList: true, subtree: true });
      window.addEventListener('resize', scheduleProbe, { passive: true });
      scheduleProbe();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  function injectChrome(): void {
    if (document.getElementById(BAR_ID)) return;
    injectUiSkin();
    nameUiSkinAnchors();

    // 声明自绘标题栏高度：内核据此把顶部固定元素下移（fixed 侧栏等）。
    document.documentElement.setAttribute('data-dsh-title-bar-height', String(BAR_HEIGHT));

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('data-region', 'top-sidebar');
    bar.setAttribute('data-control-name', 'sidebar-root');
    bar.setAttribute('data-state', 'docked');
    bar.innerHTML = '\
    <div class="dch-left" data-control-name="sidebar-content">\
      <img class="dch-icon" data-control-name="window-icon" alt="" draggable="false" />\
      <span class="dch-title" data-control-name="window-title">Deepseek Harness EAC</span>\
      <span class="dch-badge" data-control-name="window-badge" hidden></span>\
    </div>\
    <div class="dch-right" data-control-name="window-actions">\
      <button class="dch-btn" data-act="min" data-control-name="window-minimize" data-state="idle" title="最小化" aria-label="最小化">' + GLYPHS.min + '</button>\
      <button class="dch-btn" data-act="max" data-control-name="window-maximize" data-state="idle" title="最大化" aria-label="最大化" aria-pressed="false">' + GLYPHS.max + '</button>\
      <button class="dch-btn dch-close" data-act="close" data-control-name="window-close" data-state="dangerous" title="关闭" aria-label="关闭">' + GLYPHS.close + '</button>\
    </div>';
    document.body.appendChild(bar);

    var badge = bar.querySelector('.dch-badge') as HTMLElement | null;
    var icon = bar.querySelector('.dch-icon') as HTMLImageElement | null;
    maxBtn = bar.querySelector('[data-act="max"]') as HTMLElement | null;

    // 只 arm bar 一层：.dch-left 是 bar 子元素，mousedown 会冒泡到 bar；
    // 两层各自持有 lastClick 闭包会让左半栏双击 toggle 两次（净零）= 双击
    // 最大化失效 + 每次按下多发一次拖拽事件。
    armDrag(bar);
    var minBtn = bar.querySelector('[data-act="min"]');
    if (minBtn) minBtn.addEventListener('click', function () { dshDesktop.windowControls.minimize(); });
    if (maxBtn) maxBtn.addEventListener('click', function () { dshDesktop.windowControls.toggleMaximize(); });
    var closeBtn = bar.querySelector('.dch-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { dshDesktop.windowControls.close(); });

    // 标题栏信息（版本徽标 + 图标）：来源 boot.state —— 唯一的壳信息接口。
    // 首启重载（profile 初始化）下可能超时，失败后 logo 会停在白方块，
    // 故指数退避重试至拿到 iconDataUri。
    (function initInfo(attempt: number): void {
      dshDesktop.boot.state().then(function (info: any) {
        if (!info) return;
        state = Object.assign({}, state, info);
        if (info.appVersion) {
          if (badge) badge.textContent = 'v' + info.appVersion;
        }
        if (badge && info.agentVersion) {
          badge.title = 'agent v' + info.agentVersion + '（' + (info.agentSource || 'bundled') + '）';
          badge.hidden = false;
        }
        if (icon && info.iconDataUri) {
          icon.src = info.iconDataUri;
        } else if (attempt < 5) {
          window.setTimeout(function () { initInfo(attempt + 1); }, 1000 * attempt);
        }
      }).catch(function () {
        if (attempt < 5) window.setTimeout(function () { initInfo(attempt + 1); }, 1000 * attempt);
      });
    })(0);
    dshDesktop.windowControls.isMaximized().then(setMaximized).catch(function () { /* 壳层不可用时静默 */ });
    dshDesktop.windowControls.onMaximizeChange(setMaximized);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChrome);
  } else {
    injectChrome();
  }

  // ---------------------------------------------------------------------------
  // 每 5s 上报页面视口（visibilitychange 回前台时立即补报）。
  // win.viewport-beat 由壳层本地拦截：WebView2 在窗口
  // 尺寸/DPI 变化事件被吞（副屏拔插、DPI 切换、启动期阻塞）时视口停留在
  // 旧尺寸 —— 窗口其余区域永不重绘（黑屏条带）、页面按旧窄视口布局，
  // 用户看到"侧边栏只剩一个图标+黑屏"的冻结画面。壳层比对该报文与窗口
  // 实际尺寸，超差即重申 webview bounds 自愈。
  // ---------------------------------------------------------------------------
  (function () {
    var beat = function () {
      try {
        send('win.viewport-beat', {
          w: window.innerWidth,
          h: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
          src: 'main',
        });
      } catch (e) { /* 视口上报失败不致命 */ }
    };
    beat();
    setInterval(beat, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') beat();
    });
  })();

  initPopupRescue();
})();
