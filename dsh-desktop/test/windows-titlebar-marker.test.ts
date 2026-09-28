import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

// 覆盖空洞回归门（v6 外壳迁移遗漏）：
//
// 内核给 Windows 自绘标题栏打标记的唯一实现是
// apps/desktop/src/preload-windows.ts 的 mark()（Electron preload）。v6 换
// Tauri 外壳后 Electron 整条链不再随包分发，Tauri 侧若不同等注入，内核所有
// `[data-windows-titlebar]` 规则与 `--dsh-windows-titlebar-height` 会静默落空。
//
// 更隐蔽的是第二个缺口：皮肤 system.default 的
//   `html[data-dsh-title-bar-height] body { padding-top: 36px }`
// 只把内容往下推，没有同步扣减子树高度。`#root`/`.frame` 仍是 body 的 100%，
// 底边超出 body 36px，被 `body{overflow:hidden}` 裁掉 —— 落在那 36px 里的
// 侧边栏 footArea（`sidebar.settings`）底部不可见，用户找不到设置/账号入口。
// 皮肤是钉版二进制产物（SHA-256 双重校验），不能就地改，故壳层注入补偿规则。
//
// 内核的 preload-windows.client.spec.ts 只覆盖 Electron 实现，覆盖不到 Tauri
// 真实运行路径，因此这里锚定壳层注入脚本的契约。
const root = join(fileURLToPath(import.meta.url), '..', '..');
const mainRs = readFileSync(
  join(root, '..', 'tauri-shell', 'src', 'main.rs'),
  'utf8',
);

test('Tauri 注入脚本补回 Windows 自绘标题栏标记（内核 preload-windows.ts 契约）', () => {
  // 1) 标记生成函数存在，且写入内核识别的确切属性名。
  assert.match(
    mainRs,
    /fn windows_titlebar_marker_js\(\) -> String \{/,
    '缺少 windows_titlebar_marker_js() 生成函数',
  );
  assert.match(
    mainRs,
    /setAttribute\('data-windows-titlebar',''\)/,
    '标记必须写入内核读取的属性名 data-windows-titlebar',
  );

  // 2) 高度变量必须一并写入：只设属性不设变量时，内核依赖
  //    var(--dsh-windows-titlebar-height) 的 calc() 仍为 0，内容区依旧塌陷。
  assert.match(
    mainRs,
    /setProperty\('--dsh-windows-titlebar-height',h\)/,
    '必须同写 --dsh-windows-titlebar-height',
  );

  // 3) 高度值必须与壳层自绘栏高度一致。壳层 BAR_HEIGHT = 36
  //    （sidecar/bridge.ts），不是内核 Electron 版的 WINDOWS_TITLEBAR_HEIGHT=40；
  //    写错会让内核多预留 4px。
  assert.match(
    mainRs,
    /const TITLE_BAR_HEIGHT_PX: u32 = 36;/,
    '标题栏高度必须为 36，与 bridge.ts 的 BAR_HEIGHT 对齐',
  );

  // 4) 平台门控：与 preload-windows.ts 的 `process.platform !== 'win32'` 同语义，
  //    否则 macOS/Linux 会被带进 Windows 布局分支。
  assert.match(
    mainRs,
    /navigator\.platform\.indexOf\('Win'\)===0/,
    '标记必须仅 Windows 生效',
  );

  // 5) documentElement 未就绪时要有兜底（初始化脚本在 document-start 执行，
  //    此时 documentElement 可能尚不存在；preload-windows.ts 有同款判断）。
  assert.match(
    mainRs,
    /if\(!d\(\)\)\{/,
    'documentElement 缺失时必须有重试兜底',
  );
});

test('壳层注入 frame 高度补偿，修复被 body overflow 裁掉的底部区域', () => {
  // 皮肤只 `padding-top` 不扣高度的缺口由壳层补：把 frame 高度改为
  // calc(100% - <标题栏高度>)，否则 footArea（设置/账号入口）底部被裁。
  assert.match(
    mainRs,
    /height:calc\(100% - \{height\}px\) !important/,
    '必须注入 frame 高度补偿规则，否则底部入口仍被 overflow 裁掉',
  );

  // 选择器必须锚定内核稳定契约属性，而不是 CSS-modules 哈希类名 ——
  // 后者随内核前端构建变化即静默失效（与 viewport-lock 的历史教训一致）。
  assert.match(
    mainRs,
    /\[data-control-name=\\?"session-root\\?"\]>\[class\*=frame\]/,
    '补偿规则必须锚定 data-control-name="session-root"，不得依赖哈希类名',
  );

  // 样式注入必须幂等：重复注入会累积多份 style 节点。
  assert.match(
    mainRs,
    /if\(!document\.getElementById\('\{style_id\}'\)\)/,
    '样式注入必须按 id 幂等',
  );
});

test('标记与高度补偿在 bridge_init_script 的每次导航生效（与端口同段）', () => {
  const body = mainRs.slice(mainRs.indexOf('fn bridge_init_script'));
  // 标记与 __DSH_BRIDGE_WS__ 写在同一个 format! 串里：两者都必须在每次
  // 导航的 document-start 注入，不能只在 /loading 页面 HTML 里出现。
  assert.match(
    body,
    /\{\}\\nwindow\.__DSH_BRIDGE_WS__=/,
    '标记必须与端口注入同段，保证主窗导航到真实 Web UI 后依然生效',
  );
  assert.match(body, /windows_titlebar_marker_js\(\),/);
});

test('壳层不再依赖 Electron preload 提供该标记', () => {
  // 交付运行时里不得再出现 Electron —— 若哪天回归，说明标记可以改回内核侧
  // 实现，本门禁应随之调整。锚定 Cargo 依赖而非产物目录，避免测试依赖
  // stage-resources 是否已装配。
  const cargoToml = readFileSync(
    join(root, '..', 'tauri-shell', 'Cargo.toml'),
    'utf8',
  );
  assert.doesNotMatch(
    cargoToml,
    /electron/i,
    'Tauri 外壳不应再依赖 Electron；若引入，请复核标题栏标记的归属',
  );
});
