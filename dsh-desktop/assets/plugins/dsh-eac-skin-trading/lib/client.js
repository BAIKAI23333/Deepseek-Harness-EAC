window.__ModuleLoader__.load({
  id: "@dsh-eac/skin-trading",
  factory: (require) => {
    var module = { exports: {} };

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply2,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/identity.ts
var SKIN_ID = "dsh-eac.skin.trading";
var CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";
var CSS_PREFIX = "skn-trading";
var SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "\u4EA4\u6613\u7EC8\u7AEF",
  version: "1.1.0",
  author: "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC (covenant conversion)",
  description: "\u5B9E\u65F6\u884C\u60C5\u8DD1\u9A6C\u706F \xB7 \u4EA4\u6613\u65F6\u6BB5\u72B6\u6001\u680F \xB7 \u7EA2\u6DA8\u7EFF\u8DCC\u914D\u8272\uFF08\u81EA DSH-Desktop-EAC \u8FC1\u79FB\uFF0Ccovenant-converted\uFF1B\u4E0A\u6E38 dsh-web-ui\uFF0CBSD-3-Clause\uFF09\u3002",
  tags: ["stock", "trading", "ticker", "live", "terminal", "migrated"]
};

// src/preview.ts
var TRADING_PREVIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="${SKIN_META.name}"><defs><linearGradient id="${CSS_PREFIX}-preview-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10151d"/><stop offset="1" stop-color="#1a222e"/></linearGradient><linearGradient id="${CSS_PREFIX}-preview-tape" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f23645"/><stop offset=".5" stop-color="#7c8897"/><stop offset="1" stop-color="#089981"/></linearGradient></defs><rect width="320" height="180" fill="url(#${CSS_PREFIX}-preview-bg)"/><rect x="0" y="26" width="320" height="22" fill="#151b25"/><rect x="14" y="33" width="292" height="8" rx="4" fill="url(#${CSS_PREFIX}-preview-tape)" opacity=".8"/><rect x="14" y="62" width="130" height="10" rx="3" fill="#dbe2ec" opacity=".85"/><rect x="14" y="80" width="88" height="7" rx="3" fill="#48566c"/><rect x="14" y="104" width="292" height="1" fill="#242e3d"/><rect x="14" y="112" width="292" height="1" fill="#242e3d"/><rect x="14" y="120" width="292" height="1" fill="#242e3d"/><text x="252" y="86" font-family="monospace" font-size="13" font-weight="600" fill="#f23645">+2.41%</text><text x="252" y="102" font-family="monospace" font-size="13" font-weight="600" fill="#089981">-1.08%</text><rect x="0" y="158" width="320" height="22" fill="#0e131b"/><text x="160" y="173" text-anchor="middle" font-family="monospace" font-size="10" letter-spacing=".2em" fill="#7c8897">TRADING TERMINAL</text></svg>`;

// src/markers.ts
var UPSTREAM_PACKAGE = "@linxin666/dsh-client-ui-skin-trading";
var ACTIVE_BODY_MARKER = "data-dsh-trading";
var UPSTREAM_STYLE_TAG_ID = `${UPSTREAM_PACKAGE}/trading.module.css`;

// src/vendor/dsh-web-ui-client.js
var css = 'body[data-dsh-trading]{--dsw-font-family:"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Segoe UI", sans-serif;--ds-font-family-code:"SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", monospace;--dsh-trd-desktop:#eef1f5;--dsh-trd-panel:#fff;--dsh-trd-titlebar-bg:linear-gradient(180deg, #fff, #f2f5f8);--dsh-trd-tape-bg:#fff;--dsh-trd-statusbar-bg:#f2f5f8;--dsh-trd-text:#1b2431;--dsh-trd-dim:#6b7788;--dsh-trd-border:#d4dce5;--dsh-trd-up:#e02e3d;--dsh-trd-down:#089981;--dsh-trd-flat:#8b96a5;--dsh-trd-warn:#c08a35;--dsh-trd-brand:#e02e3d;color:#1b2431;box-sizing:border-box;background-color:#eef1f5;padding:66px 10px 26px}body[data-dsh-trading][data-ds-dark-theme]{--dsh-trd-desktop:#0a0e15;--dsh-trd-panel:#10151d;--dsh-trd-titlebar-bg:linear-gradient(180deg, #161d27, #10151d);--dsh-trd-tape-bg:#0e131b;--dsh-trd-statusbar-bg:#0e131b;--dsh-trd-text:#dbe2ec;--dsh-trd-dim:#7c8897;--dsh-trd-border:#222b39;--dsh-trd-up:#f23645;--dsh-trd-down:#089981;--dsh-trd-flat:#5f6b7a;--dsh-trd-warn:#d69a3a;--dsh-trd-brand:#f23645;color:#dbe2ec;background-color:#0a0e15}body[data-dsh-trading] [id=root]{box-sizing:border-box;background:#fff;border:1px solid #ccd5df;box-shadow:0 1px #fff,0 3px 12px #17202d1f}body[data-dsh-trading][data-ds-dark-theme] [id=root]{background:#10151d;border-color:#232c3a;box-shadow:0 1px #0a0e15,0 3px 12px #00000080}body[data-dsh-trading] *{border-radius:3px!important}body[data-dsh-trading]{--dsw-static-amber-100:#f8ecd9;--dsw-static-amber-400:#d69a3a;--dsw-static-amber-500:#b07600;--dsw-static-amber-600:#966300;--dsw-static-amber-900:#3f2f10;--dsw-static-blue-100:#e2e9f1;--dsw-static-blue-300:#aec3d6;--dsw-static-blue-400:#8aa7c0;--dsw-static-blue-450:#6f92b0;--dsw-static-blue-500:#56799a;--dsw-static-blue-50:#f4f7fa;--dsw-static-blue-50p:#eef3f8;--dsw-static-blue-600:#46627f;--dsw-static-blue-75:#edf2f7;--dsw-static-blue-800:#2b4158;--dsw-static-blue-950:#182635;--dsw-static-deepseek-100:#e2e9f1;--dsw-static-deepseek-200:#ccd9e6;--dsw-static-deepseek-300:#aec3d6;--dsw-static-deepseek-400:#8aa7c0;--dsw-static-deepseek-450:#6f92b0;--dsw-static-deepseek-50:#f4f7fa;--dsw-static-deepseek-500:#56799a;--dsw-static-deepseek-600:#46627f;--dsw-static-deepseek-700-delete:#35506a;--dsw-static-deepseek-800:#2b4158;--dsw-static-deepseek-900:#223446;--dsw-static-green-100:#d8f2ec;--dsw-static-green-400:#0fb091;--dsw-static-green-500:#089981;--dsw-static-green-900:#0a4a3c;--dsw-static-neutral-00:#fff;--dsw-static-neutral-1000:#161d29;--dsw-static-neutral-100:#f1f4f7;--dsw-static-neutral-150:#eaeef3;--dsw-static-neutral-200:#e3e8ee;--dsw-static-neutral-250:#dce2ea;--dsw-static-neutral-300:#d2dae4;--dsw-static-neutral-400:#b9c3d0;--dsw-static-neutral-50:#f6f8fa;--dsw-static-neutral-500:#9aa7b6;--dsw-static-neutral-550:#8b99aa;--dsw-static-neutral-600:#748394;--dsw-static-neutral-700:#5b6a7c;--dsw-static-neutral-800:#435264;--dsw-static-neutral-850:#394858;--dsw-static-neutral-900:#2b3948;--dsw-static-neutral-bluish-00:#fff;--dsw-static-neutral-bluish-1000:#161d29;--dsw-static-neutral-bluish-100:#f1f4f7;--dsw-static-neutral-bluish-150:#eaeef3;--dsw-static-neutral-bluish-200:#e3e8ee;--dsw-static-neutral-bluish-300:#d2dae4;--dsw-static-neutral-bluish-400:#b9c3d0;--dsw-static-neutral-bluish-500:#9aa7b6;--dsw-static-neutral-bluish-50:#f6f8fa;--dsw-static-neutral-bluish-60:#f3f5f8;--dsw-static-neutral-bluish-600:#748394;--dsw-static-neutral-bluish-700:#5b6a7c;--dsw-static-neutral-bluish-750:#506070;--dsw-static-neutral-bluish-75:#eef1f5;--dsw-static-neutral-bluish-800:#435264;--dsw-static-neutral-bluish-850:#394858;--dsw-static-neutral-bluish-875:#2f3e4e;--dsw-static-neutral-bluish-900:#2b3948;--dsw-static-neutral-bluish-950:#223040;--dsw-static-red-100:#fbd9d9;--dsw-static-red-400:#f25c5c;--dsw-static-red-50:#fdecec;--dsw-static-red-500:#e02e3d;--dsw-static-red-600:#c42533;--dsw-static-red-900:#7a1620}body[data-dsh-trading][data-ds-dark-theme]{--dsw-static-amber-100:#3a2d14;--dsw-static-amber-400:#d69a3a;--dsw-static-amber-500:#b07600;--dsw-static-amber-600:#966300;--dsw-static-amber-900:#3f2f10;--dsw-static-blue-100:#1f2d3d;--dsw-static-blue-300:#2f445c;--dsw-static-blue-400:#3d5875;--dsw-static-blue-450:#4b6a8b;--dsw-static-blue-500:#5f81a4;--dsw-static-blue-50:#17222f;--dsw-static-blue-50p:#192531;--dsw-static-blue-600:#7398bb;--dsw-static-blue-75:#1b2735;--dsw-static-blue-800:#97b3cf;--dsw-static-blue-950:#b9cddf;--dsw-static-deepseek-100:#1f2d3d;--dsw-static-deepseek-200:#26374b;--dsw-static-deepseek-300:#2f445c;--dsw-static-deepseek-400:#3d5875;--dsw-static-deepseek-450:#4b6a8b;--dsw-static-deepseek-50:#17222f;--dsw-static-deepseek-500:#5f81a4;--dsw-static-deepseek-600:#7398bb;--dsw-static-deepseek-700-delete:#86a6c6;--dsw-static-deepseek-800:#97b3cf;--dsw-static-deepseek-900:#a8c0d8;--dsw-static-green-100:#0e2c25;--dsw-static-green-400:#10b595;--dsw-static-green-500:#089981;--dsw-static-green-900:#0a3a30;--dsw-static-neutral-00:#10151d;--dsw-static-neutral-1000:#dbe2ec;--dsw-static-neutral-100:#171e28;--dsw-static-neutral-150:#1b2330;--dsw-static-neutral-200:#1f2836;--dsw-static-neutral-250:#242e3d;--dsw-static-neutral-300:#2b3748;--dsw-static-neutral-400:#38465a;--dsw-static-neutral-50:#131922;--dsw-static-neutral-500:#48566c;--dsw-static-neutral-550:#536179;--dsw-static-neutral-600:#64738a;--dsw-static-neutral-700:#7e8da2;--dsw-static-neutral-800:#9eabc0;--dsw-static-neutral-850:#adb9cc;--dsw-static-neutral-900:#c2ccda;--dsw-static-neutral-bluish-00:#10151d;--dsw-static-neutral-bluish-1000:#dbe2ec;--dsw-static-neutral-bluish-100:#171e28;--dsw-static-neutral-bluish-150:#1b2330;--dsw-static-neutral-bluish-200:#1f2836;--dsw-static-neutral-bluish-300:#2b3748;--dsw-static-neutral-bluish-400:#38465a;--dsw-static-neutral-bluish-500:#48566c;--dsw-static-neutral-bluish-50:#131922;--dsw-static-neutral-bluish-600:#64738a;--dsw-static-neutral-bluish-60:#151b25;--dsw-static-neutral-bluish-700:#7e8da2;--dsw-static-neutral-bluish-750:#8b99aa;--dsw-static-neutral-bluish-75:#141a24;--dsw-static-neutral-bluish-800:#9eabc0;--dsw-static-neutral-bluish-850:#adb9cc;--dsw-static-neutral-bluish-875:#b9c5d3;--dsw-static-neutral-bluish-900:#c2ccda;--dsw-static-neutral-bluish-950:#cfd8e2;--dsw-static-red-100:#3c1a20;--dsw-static-red-400:#ff5a5a;--dsw-static-red-50:#2a1418;--dsw-static-red-500:#f23645;--dsw-static-red-600:#d62b3a;--dsw-static-red-900:#57151d}body[data-dsh-trading]{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f5f7fa;--dsw-alias-bg-layer-2:#eef1f5;--dsw-alias-bg-layer-3:#e7ebf0;--dsw-alias-bg-mask-1:#1018246b;--dsw-alias-bg-mask-2:#10182440;--dsw-alias-bg-mask-3:#1018248c;--dsw-alias-bg-mask-photo:#0009;--dsw-alias-bg-module-platform:#eef1f5;--dsw-alias-bg-multi-select:#e3e8ee;--dsw-alias-bg-overlay:#fff;--dsw-alias-bg-skeleton:#1018240f;--dsw-alias-border-inverted2:#10182480;--dsw-alias-border-inverted:#10182459;--dsw-alias-border-l1:#10182414;--dsw-alias-border-l2-darkmode-thin:#1018241f;--dsw-alias-border-l2:#10182424;--dsw-alias-border-l3:#10182438;--dsw-alias-border-l4:#10182452;--dsw-alias-brand-primary-invert:#fff;--dsw-alias-brand-primary-new-colorprimary-new-color:#e02e3d;--dsw-alias-brand-primary:#e02e3d;--dsw-alias-brand-text:#e02e3d;--dsw-alias-button-contrast-fill:#2b3948;--dsw-alias-button-elevated-fill:#fff;--dsw-alias-button-floating-fill:#fff;--dsw-alias-button-floating-hover:#f1f4f7;--dsw-alias-button-ghost-active-border:#9aa7b6;--dsw-alias-button-ghost-active-fill:#eef1f5;--dsw-alias-button-ghost-active-hover:#e7ebf0;--dsw-alias-button-info-fill:#e02e3d;--dsw-alias-button-info-hover:#c42533;--dsw-alias-button-primary-dimmed:#f6d7da;--dsw-alias-button-primary-fill:#e02e3d;--dsw-alias-button-primary-hover:#c42533;--dsw-alias-button-tool-bar-fill-invisible:#10182414;--dsw-alias-button-tool-bar-fill:#1018241f;--dsw-alias-button-tool-bar-hover:#10182429;--dsw-alias-interactive-bg-active:#e7ebf0;--dsw-alias-interactive-bg-hover:#eef1f5;--dsw-alias-interactive-bg-hover-accent:#fdecec;--dsw-alias-interactive-bg-hover-danger:#fdecec;--dsw-alias-interactive-bg-hover-solid:#e02e3d;--dsw-alias-label-caption:#8a97a6;--dsw-alias-label-dimmed:#8b96a5;--dsw-alias-label-primary-dimmed:#4a5768;--dsw-alias-label-primary-foreground:#fff;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-label-primary:#1b2431;--dsw-alias-label-secondary:#445160;--dsw-alias-label-tertiary:#66707f;--dsw-alias-markdown-citation:#eaeef3;--dsw-alias-markdown-code-block-banner:#f5f7fa;--dsw-alias-markdown-code-block:#f5f7fa;--dsw-alias-markdown-code-segment-selected:#fff;--dsw-alias-markdown-code-segment-unselected:#eceff3;--dsw-alias-markdown-inline-code:#eaeef3;--dsw-alias-markdown-placeholder:#f1f4f7;--dsw-alias-markdown-tag:#eceff3;--dsw-alias-state-business-primary:#e02e3d;--dsw-alias-state-business-tertiary:#fbd9d9;--dsw-alias-state-error-primary:#e02e3d;--dsw-alias-state-error-secondary:#f25c5c;--dsw-alias-state-success-primary:#089981;--dsw-alias-state-success-secondary:#0fb091;--dsw-alias-state-success-tertiary:#d8f2ec;--dsw-alias-state-warn-primary:#b07600;--dsw-alias-toast-bg:#2b3948;--dsw-alias-tooltip-bg:#2b3948;--dsw-specific-bubble-highlight:#e7ebf0;--dsw-specific-bubble:#f1f4f7;--dsw-specific-input-major:#fff;--dsw-specific-login-input:#fff;--dsw-specific-menu:#f5f7fa;--dsw-specific-selector:#e7ebf0;--dsw-specific-sidebar-fill:#f6f8fa;--dsw-specific-sidebar-nav-item-active-accent:#e02e3d;--dsw-specific-sidebar-nav-item-active:#fdecec;--dsw-specific-sidebar-nav-item-hover:#eef1f5;--dsw-specific-tip:#f5f7fa}body[data-dsh-trading][data-ds-dark-theme]{--dsw-alias-bg-base:#10151d;--dsw-alias-bg-layer-1:#151b25;--dsw-alias-bg-layer-2:#1a222e;--dsw-alias-bg-layer-3:#1f2836;--dsw-alias-bg-mask-1:#00000080;--dsw-alias-bg-mask-2:#00000040;--dsw-alias-bg-mask-3:#0000008c;--dsw-alias-bg-mask-photo:#000000e0;--dsw-alias-bg-module-platform:#1a222e;--dsw-alias-bg-multi-select:#1b2431;--dsw-alias-bg-overlay:#161d27;--dsw-alias-bg-skeleton:#ffffff0f;--dsw-alias-border-inverted2:#fff9;--dsw-alias-border-inverted:#fff6;--dsw-alias-border-l1:#ffffff12;--dsw-alias-border-l2-darkmode-thin:#ffffff1f;--dsw-alias-border-l2:#ffffff24;--dsw-alias-border-l3:#ffffff38;--dsw-alias-border-l4:#ffffff52;--dsw-alias-brand-primary-invert:#0e131a;--dsw-alias-brand-primary-new-colorprimary-new-color:#ff5a5a;--dsw-alias-brand-primary:#f23645;--dsw-alias-brand-text:#f23645;--dsw-alias-button-contrast-fill:#c2ccda;--dsw-alias-button-elevated-fill:#151b25;--dsw-alias-button-floating-fill:#161d27;--dsw-alias-button-floating-hover:#1a222e;--dsw-alias-button-ghost-active-border:#7e8da2;--dsw-alias-button-ghost-active-fill:#1f2836;--dsw-alias-button-ghost-active-hover:#242e3d;--dsw-alias-button-info-fill:#f23645;--dsw-alias-button-info-hover:#ff5a5a;--dsw-alias-button-primary-dimmed:#4a262b;--dsw-alias-button-primary-fill:#f23645;--dsw-alias-button-primary-hover:#d62b3a;--dsw-alias-button-tool-bar-fill-invisible:#b4c8e14d;--dsw-alias-button-tool-bar-fill:#b4c8e16b;--dsw-alias-button-tool-bar-hover:#b4c8e185;--dsw-alias-interactive-bg-active:#1f2836;--dsw-alias-interactive-bg-hover:#1a222e;--dsw-alias-interactive-bg-hover-accent:#3a1c20;--dsw-alias-interactive-bg-hover-danger:#3a1c20;--dsw-alias-interactive-bg-hover-solid:#f23645;--dsw-alias-label-caption:#8a97a6;--dsw-alias-label-dimmed:#5f6b7a;--dsw-alias-label-primary-dimmed:#a7b1bf;--dsw-alias-label-primary-foreground:#fff;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-label-primary:#dbe2ec;--dsw-alias-label-secondary:#a7b1bf;--dsw-alias-label-tertiary:#7c8897;--dsw-alias-markdown-citation:#1b2330;--dsw-alias-markdown-code-block-banner:#151b25;--dsw-alias-markdown-code-block:#151b25;--dsw-alias-markdown-code-segment-selected:#1f2836;--dsw-alias-markdown-code-segment-unselected:#171e28;--dsw-alias-markdown-inline-code:#1b2330;--dsw-alias-markdown-placeholder:#171e28;--dsw-alias-markdown-tag:#1f2836;--dsw-alias-state-business-primary:#f23645;--dsw-alias-state-business-tertiary:#3c1a20;--dsw-alias-state-error-primary:#f23645;--dsw-alias-state-error-secondary:#ff5a5a;--dsw-alias-state-success-primary:#089981;--dsw-alias-state-success-secondary:#10b595;--dsw-alias-state-success-tertiary:#0e2c25;--dsw-alias-state-warn-primary:#d69a3a;--dsw-alias-toast-bg:#1b2431;--dsw-alias-tooltip-bg:#232e3f;--dsw-specific-bubble-highlight:#1f2836;--dsw-specific-bubble:#151b25;--dsw-specific-input-major:#151b25;--dsw-specific-login-input:#151b25;--dsw-specific-menu:#151b25;--dsw-specific-selector:#1f2836;--dsw-specific-sidebar-fill:#10151d;--dsw-specific-sidebar-nav-item-active-accent:#f23645;--dsw-specific-sidebar-nav-item-active:#1f2836;--dsw-specific-sidebar-nav-item-hover:#1a222e;--dsw-specific-tip:#151b25}body[data-dsh-trading] ::-webkit-scrollbar{width:10px;height:10px}body[data-dsh-trading] ::-webkit-scrollbar-track{background:0 0}body[data-dsh-trading] ::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l3);background-clip:content-box;border:2px solid #0000;border-radius:5px}body[data-dsh-trading] ::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-border-l4);background-clip:content-box}.Ra1MMG_tradingTitlebar{z-index:100;background:var(--dsh-trd-titlebar-bg);border-bottom:1px solid var(--dsh-trd-border);height:34px;color:var(--dsh-trd-text);font:600 13px/34px var(--dsw-font-family);user-select:none;align-items:center;gap:8px;padding:0 8px;display:flex;position:fixed;top:0;left:0;right:0}.Ra1MMG_tradingTitlebarIcon{background:var(--dsh-trd-brand);border-radius:5px;justify-content:center;align-items:center;width:20px;height:20px;display:inline-flex;box-shadow:inset 0 1px #ffffff40}.Ra1MMG_tradingTitlebarIcon svg{width:14px;height:14px;display:block}.Ra1MMG_tradingTitlebarTitle{color:var(--dsh-trd-text);letter-spacing:.02em;white-space:nowrap}.Ra1MMG_tradingTitlebarChips{align-items:center;gap:14px;margin-left:auto;display:inline-flex;overflow:hidden}.Ra1MMG_tradingTitlebarChip{font:500 12px/1 var(--ds-font-family-code);font-variant-numeric:tabular-nums;white-space:nowrap;align-items:baseline;gap:5px;display:inline-flex}.Ra1MMG_tradingTitlebarChipName{color:var(--dsh-trd-dim)}.Ra1MMG_tradingTitlebarChipVal{color:var(--dsh-trd-text);font-weight:600}.Ra1MMG_tradingTitlebarChipChg[data-trend=up]{color:var(--dsh-trd-up)}.Ra1MMG_tradingTitlebarChipChg[data-trend=down]{color:var(--dsh-trd-down)}.Ra1MMG_tradingTitlebarChipChg:not([data-trend]){color:var(--dsh-trd-flat)}.Ra1MMG_tradingTitlebarBtn{text-align:center;width:26px;color:var(--dsh-trd-dim);border-radius:4px;display:inline-block}.Ra1MMG_tradingTitlebarBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsh-trd-text)}.Ra1MMG_tradingTape{z-index:100;background:var(--dsh-trd-tape-bg);border-bottom:1px solid var(--dsh-trd-border);user-select:none;height:30px;position:fixed;top:34px;left:0;right:0;overflow:hidden}.Ra1MMG_tradingTapeTrack{white-space:nowrap;will-change:transform;align-items:center;height:100%;animation:60s linear infinite Ra1MMG_tradingTapeMove;display:inline-flex}.Ra1MMG_tradingTape:hover .Ra1MMG_tradingTapeTrack{animation-play-state:paused}.Ra1MMG_tradingTapeItem{border-right:1px solid var(--dsw-alias-border-l2);height:100%;font:500 12px/30px var(--ds-font-family-code);font-variant-numeric:tabular-nums;align-items:baseline;gap:6px;padding:0 16px;display:inline-flex}.Ra1MMG_tradingTapeName{color:var(--dsh-trd-dim);white-space:nowrap}.Ra1MMG_tradingTapePrice{color:var(--dsh-trd-text);font-weight:600}.Ra1MMG_tradingTapeChg[data-trend=up]{color:var(--dsh-trd-up);font-weight:600}.Ra1MMG_tradingTapeChg[data-trend=down]{color:var(--dsh-trd-down);font-weight:600}.Ra1MMG_tradingTapeChg:not([data-trend]){color:var(--dsh-trd-flat)}@keyframes Ra1MMG_tradingTapeMove{0%{transform:translate(0)}to{transform:translate(-50%)}}@media (prefers-reduced-motion:reduce){.Ra1MMG_tradingTapeTrack{animation:none}}.Ra1MMG_tradingStatusbar{z-index:100;background:var(--dsh-trd-statusbar-bg);border-top:1px solid var(--dsh-trd-border);height:26px;color:var(--dsh-trd-dim);font:500 12px/26px var(--ds-font-family-code);font-variant-numeric:tabular-nums;user-select:none;white-space:nowrap;align-items:center;gap:14px;padding:0 10px;display:flex;position:fixed;bottom:0;left:0;right:0}.Ra1MMG_tradingStatusbarGroup{align-items:center;gap:12px;display:inline-flex}.Ra1MMG_tradingStatusbarSpacer{flex:1}.Ra1MMG_tradingStatusbarCell{color:var(--dsh-trd-dim);align-items:baseline;gap:4px;display:inline-flex}.Ra1MMG_tradingStatusbarCell[data-phase=trading]{color:var(--dsh-trd-up)}.Ra1MMG_tradingStatusbarCell[data-phase=lunch],.Ra1MMG_tradingStatusbarCell[data-phase=pre]{color:var(--dsh-trd-warn)}.Ra1MMG_tradingStatusbarCell[data-trend=up]{color:var(--dsh-trd-up)}.Ra1MMG_tradingStatusbarCell[data-trend=down]{color:var(--dsh-trd-down)}.Ra1MMG_tradingStatusbarLbLabel{color:var(--dsh-trd-brand);font-weight:600}';
var trading_module_css_default = {
  "tradingStatusbar": "Ra1MMG_tradingStatusbar",
  "tradingStatusbarCell": "Ra1MMG_tradingStatusbarCell",
  "tradingStatusbarGroup": "Ra1MMG_tradingStatusbarGroup",
  "tradingStatusbarLbLabel": "Ra1MMG_tradingStatusbarLbLabel",
  "tradingStatusbarSpacer": "Ra1MMG_tradingStatusbarSpacer",
  "tradingTape": "Ra1MMG_tradingTape",
  "tradingTapeChg": "Ra1MMG_tradingTapeChg",
  "tradingTapeItem": "Ra1MMG_tradingTapeItem",
  "tradingTapeMove": "Ra1MMG_tradingTapeMove",
  "tradingTapeName": "Ra1MMG_tradingTapeName",
  "tradingTapePrice": "Ra1MMG_tradingTapePrice",
  "tradingTapeTrack": "Ra1MMG_tradingTapeTrack",
  "tradingTitlebar": "Ra1MMG_tradingTitlebar",
  "tradingTitlebarBtn": "Ra1MMG_tradingTitlebarBtn",
  "tradingTitlebarChip": "Ra1MMG_tradingTitlebarChip",
  "tradingTitlebarChipChg": "Ra1MMG_tradingTitlebarChipChg",
  "tradingTitlebarChipName": "Ra1MMG_tradingTitlebarChipName",
  "tradingTitlebarChipVal": "Ra1MMG_tradingTitlebarChipVal",
  "tradingTitlebarChips": "Ra1MMG_tradingTitlebarChips",
  "tradingTitlebarIcon": "Ra1MMG_tradingTitlebarIcon",
  "tradingTitlebarTitle": "Ra1MMG_tradingTitlebarTitle"
};
function trendOf(q) {
  if (q.changeAbs > 0) return "up";
  if (q.changeAbs < 0) return "down";
  if (q.changePct > 0) return "up";
  if (q.changePct < 0) return "down";
  return "flat";
}
function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") return Number.parseFloat(value);
  return NaN;
}
// 发行前安全修复（P1，DSH-EAC 2026-09-27）：上游自带一条「动态注入 <script>、由本
// WebView 执行第三方行情端点返回的脚本体」的取数通道。宿主 WebView 的 CSP 为 null，
// 该通道等同把远端任意 JS 执行权交给第三方，故整条删除：本包不再以任何形式注入
// <script>、也不再执行远端返回的脚本。交易所前缀品种（sh/sz/hk/us）改由既有安全
// 源承担（本地 ticker 端点 / 长桥 RPC），缺席时走皮肤既有降级路径（placeholderQuote
// 的 -- / — 占位，不抛错）。这是对上游产物的**有意偏离**，已记入本包 README「已知行为」。
var BINANCE_ENDPOINTS = ["https://api.binance.com/api/v3/ticker/24hr", "https://data-api.binance.vision/api/v3/ticker/24hr"];
var CRYPTO_NAMES = {
  BTCUSDT: "\u6BD4\u7279\u5E01",
  ETHUSDT: "\u4EE5\u592A\u574A",
  BNBUSDT: "BNB",
  SOLUSDT: "Solana",
  XRPUSDT: "\u745E\u6CE2\u5E01",
  DOGEUSDT: "\u72D7\u72D7\u5E01",
  ADAUSDT: "Cardano",
  AVAXUSDT: "Avalanche",
  LINKUSDT: "Chainlink",
  LTCUSDT: "\u83B1\u7279\u5E01",
  DOTUSDT: "Polkadot",
  TRXUSDT: "\u6CE2\u573A",
  SHIBUSDT: "SHIB",
  TONUSDT: "TON",
  BCHUSDT: "BCH",
  UNIUSDT: "Uniswap",
  ATOMUSDT: "Cosmos",
  NEARUSDT: "NEAR",
  APTUSDT: "Aptos",
  ARBUSDT: "Arbitrum",
  OPUSDT: "Optimism",
  FILUSDT: "Filecoin",
  SUIUSDT: "SUI",
  PEPEUSDT: "PEPE"
};
async function fetchBinanceQuotes(symbols, timeoutMs = 8e3) {
  const out = /* @__PURE__ */ new Map();
  if (symbols.length === 0) return out;
  for (const endpoint of BINANCE_ENDPOINTS) try {
    const response = await fetch(`${endpoint}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, { signal: timeoutSignal(timeoutMs) });
    if (!response.ok) continue;
    const rows = await response.json();
    for (const row of rows) {
      const symbol = String(row.symbol ?? "");
      const price = toNumber(row.lastPrice);
      if (symbol === "" || !Number.isFinite(price)) continue;
      out.set(symbol, {
        symbol,
        name: CRYPTO_NAMES[symbol] ?? symbol,
        price,
        changeAbs: toNumber(row.priceChange),
        changePct: toNumber(row.priceChangePercent),
        source: "binance"
      });
    }
    if (out.size > 0) return out;
  } catch {
  }
  return out;
}
var FRANKFURTER_ENDPOINTS = ["https://api.frankfurter.dev/v1", "https://api.frankfurter.app/v1"];
var FX_CURRENCY_NAMES = {
  CNY: "\u4EBA\u6C11\u5E01",
  USD: "\u7F8E\u5143",
  EUR: "\u6B27\u5143",
  JPY: "\u65E5\u5143",
  GBP: "\u82F1\u9551",
  HKD: "\u6E2F\u5143",
  AUD: "\u6FB3\u5143",
  CAD: "\u52A0\u5143",
  CHF: "\u745E\u58EB\u6CD5\u90CE",
  KRW: "\u97E9\u5143",
  SGD: "\u65B0\u52A0\u5761\u5143",
  TWD: "\u65B0\u53F0\u5E01",
  THB: "\u6CF0\u94E2",
  RUB: "\u5362\u5E03",
  INR: "\u5362\u6BD4",
  BRL: "\u96F7\u4E9A\u5C14",
  MXN: "\u6BD4\u7D22",
  TRY: "\u91CC\u62C9",
  ZAR: "\u5170\u7279",
  SEK: "\u745E\u5178\u514B\u6717",
  NOK: "\u632A\u5A01\u514B\u6717",
  DKK: "\u4E39\u9EA6\u514B\u6717",
  NZD: "\u65B0\u897F\u5170\u5143",
  CZK: "\u6377\u514B\u514B\u6717",
  PLN: "\u5179\u7F57\u63D0",
  HUF: "\u798F\u6797"
};
function isoDaysAgo(date, days) {
  return (/* @__PURE__ */ new Date(date.getTime() - days * 864e5)).toISOString().slice(0, 10);
}
async function frankfurterRates(base, targets) {
  const symbols = targets.join(",");
  const date = /* @__PURE__ */ new Date();
  for (const endpoint of FRANKFURTER_ENDPOINTS) try {
    const latestUrl = `${endpoint}/latest?base=${base}&symbols=${symbols}`;
    const latestResponse = await fetch(latestUrl, { signal: timeoutSignal(8e3) });
    if (!latestResponse.ok) continue;
    const latest = await latestResponse.json();
    if (latest.rates === void 0) continue;
    const rates = /* @__PURE__ */ new Map();
    for (const [code, value] of Object.entries(latest.rates)) {
      const n = toNumber(value);
      if (Number.isFinite(n)) rates.set(code, n);
    }
    let prev = /* @__PURE__ */ new Map();
    for (let back = 1; back <= 4 && prev.size === 0; back += 1) {
      const prevUrl = `${endpoint}/${isoDaysAgo(date, back)}?base=${base}&symbols=${symbols}`;
      try {
        const prevResponse = await fetch(prevUrl, { signal: timeoutSignal(6e3) });
        if (!prevResponse.ok) continue;
        const prevJson = await prevResponse.json();
        prev = /* @__PURE__ */ new Map();
        for (const [code, value] of Object.entries(prevJson.rates ?? {})) {
          const n = toNumber(value);
          if (Number.isFinite(n)) prev.set(code, n);
        }
      } catch {
      }
    }
    return {
      base,
      rates,
      prev
    };
  } catch {
  }
  return null;
}
async function fetchFrankfurterQuotes(pairs, timeoutMs = 8e3) {
  const out = /* @__PURE__ */ new Map();
  if (pairs.length === 0) return out;
  const byBase = /* @__PURE__ */ new Map();
  for (const pair of pairs) {
    const [base, target] = pair.split("/");
    if (base === void 0 || target === void 0 || base === target) continue;
    const list = byBase.get(base) ?? [];
    list.push(target);
    byBase.set(base, list);
  }
  const results = await Promise.all([...byBase.entries()].map(([base, targets]) => frankfurterRates(base, targets)));
  for (const result of results) {
    if (result === null) continue;
    for (const [target, rate] of result.rates) {
      const symbol = `${result.base}/${target}`;
      const prevRate = result.prev.get(target);
      const changeAbs = Number.isFinite(prevRate) && prevRate !== 0 ? rate - prevRate : 0;
      const changePct = Number.isFinite(prevRate) && prevRate !== 0 ? (rate - prevRate) / prevRate * 100 : 0;
      out.set(symbol, {
        symbol,
        name: `${FX_CURRENCY_NAMES[result.base] ?? result.base}/${FX_CURRENCY_NAMES[target] ?? target}`,
        price: rate,
        changeAbs,
        changePct,
        source: "frankfurter"
      });
    }
  }
  return out;
}
var TICKER_API_BASE = "/plugins/dsh-ticker/api";
async function fetchTickerSettings(timeoutMs = 5e3) {
  if (typeof fetch === "undefined") return null;
  try {
    const response = await fetch(`${TICKER_API_BASE}/settings`, { signal: timeoutSignal(timeoutMs) });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.ok !== true) return null;
    const symbols = data.section?.symbols;
    if (!Array.isArray(symbols)) return null;
    const list = symbols.filter((s) => typeof s === "string" && s.length > 0);
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}
async function fetchTickerQuotes(symbols, timeoutMs = 8e3) {
  if (typeof fetch === "undefined" || symbols.length === 0) return null;
  try {
    const response = await fetch(`${TICKER_API_BASE}/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, { signal: timeoutSignal(timeoutMs) });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.ok !== true || data.quotes === void 0) return null;
    const quotes = [];
    for (const row of Object.values(data.quotes)) {
      const symbol = String(row.symbol ?? "");
      const price = toNumber(row.price);
      if (symbol === "" || !Number.isFinite(price)) continue;
      quotes.push({
        symbol,
        name: typeof row.name === "string" && row.name !== "" ? row.name : symbol,
        price,
        changePct: toNumber(row.changePct),
        changeAbs: toNumber(row.changeAbs),
        source: "ticker"
      });
    }
    return quotes.length > 0 ? quotes : null;
  } catch {
    return null;
  }
}
var LONGBRIDGE_RPC_CHANNEL = "/longbridge";
var LONGBRIDGE_SNAPSHOT_ENDPOINT = "panel/snapshot";
var LONGBRIDGE_WATCHLIST = [
  "HSI.HK",
  "HSTECH.HK",
  "DJI.US",
  "SPX.US",
  "NDX.US"
];
var LONGBRIDGE_NAMES = {
  "HSI.HK": "\u6052\u751F\u6307\u6570",
  "HSTECH.HK": "\u6052\u751F\u79D1\u6280",
  "HSCEI.HK": "\u56FD\u4F01\u6307\u6570",
  "DJI.US": "\u9053\u743C\u65AF",
  "SPX.US": "\u6807\u666E500",
  "NDX.US": "\u7EB3\u6307100",
  "700.HK": "\u817E\u8BAF\u63A7\u80A1",
  "9988.HK": "\u963F\u91CC\u5DF4\u5DF4",
  "3690.HK": "\u7F8E\u56E2",
  "1810.HK": "\u5C0F\u7C73\u96C6\u56E2",
  "AAPL.US": "\u82F9\u679C",
  "NVDA.US": "\u82F1\u4F1F\u8FBE",
  "TSLA.US": "\u7279\u65AF\u62C9",
  "MSFT.US": "\u5FAE\u8F6F",
  "META.US": "Meta",
  "GOOGL.US": "\u8C37\u6B4C",
  "AMZN.US": "\u4E9A\u9A6C\u900A",
  "BABA.US": "\u963F\u91CC\u5DF4\u5DF4"
};
async function fetchLongbridgeQuotes(connection) {
  if (connection === void 0) return null;
  try {
    const result = await connection.rpc.call(LONGBRIDGE_RPC_CHANNEL, LONGBRIDGE_SNAPSHOT_ENDPOINT, { symbols: [...LONGBRIDGE_WATCHLIST] });
    if (!result.ok) return null;
    const rows = result.value.quotes ?? [];
    const quotes = [];
    for (const row of rows) {
      const symbol = String(row.symbol ?? "");
      const price = toNumber(row.lastDone);
      if (symbol === "" || !Number.isFinite(price)) continue;
      quotes.push({
        symbol,
        name: LONGBRIDGE_NAMES[symbol] ?? symbol,
        price,
        changePct: toNumber(row.changePct),
        changeAbs: 0,
        source: "longbridge"
      });
    }
    return quotes.length > 0 ? quotes : null;
  } catch {
    return null;
  }
}
var DEFAULT_TAPE = [
  "sh000001",
  "sz399001",
  "sz399006",
  "hkHSI",
  "hk00700",
  "hk09988",
  "usIXIC",
  "usDJI",
  "usNVDA",
  "usAAPL",
  "usTSLA",
  "BTCUSDT",
  "ETHUSDT",
  "USD/CNY"
];
var DEFAULT_INDEX_CELLS = [
  "hkHSI",
  "hkHSTECH",
  "usDJI",
  "usINX",
  "usIXIC"
];
function classifyDirectSymbol(symbol) {
  const value = symbol.trim();
  if (/^(?:sh|sz|hk|us)[A-Za-z0-9.]+$/.test(value)) return "exchange";
  if (/^(?=.*[A-Z])[A-Z0-9]{4,12}$/.test(value)) return "crypto";
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(value)) return "fx";
  return null;
}
async function fetchDirectQuotes(symbols, timeoutMs = 8e3) {
  const cryptoSymbols = [];
  const fxSymbols = [];
  for (const symbol of symbols) {
    const category = classifyDirectSymbol(symbol);
    if (category === "crypto") cryptoSymbols.push(symbol);
    else if (category === "fx") fxSymbols.push(symbol);
  }
  const [crypto, fx] = await Promise.all([
    fetchBinanceQuotes(cryptoSymbols, timeoutMs),
    fetchFrankfurterQuotes(fxSymbols, timeoutMs)
  ]);
  const quotes = [];
  for (const quote of crypto.values()) quotes.push(quote);
  for (const quote of fx.values()) quotes.push(quote);
  return quotes;
}
function tzWeekday(timeZone, date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(date);
}
function tzMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
function isWeekday(timeZone, now) {
  const day = tzWeekday(timeZone, now);
  return day !== "Sat" && day !== "Sun";
}
function continuousPhase(minutes, open, close, preOpen) {
  if (minutes >= open && minutes < close) return "trading";
  if (preOpen !== void 0 && minutes >= preOpen && minutes < open) return "pre";
  return "closed";
}
function splitPhase(minutes, open, lunch, resume, close) {
  if (minutes >= open && minutes < lunch) return "trading";
  if (minutes >= lunch && minutes < resume) return "lunch";
  if (minutes >= resume && minutes < close) return "trading";
  return "closed";
}
function marketSessions(now = /* @__PURE__ */ new Date()) {
  const aShareOpen = isWeekday("Asia/Shanghai", now);
  const hkOpen = isWeekday("Asia/Hong_Kong", now);
  const usOpen = isWeekday("America/New_York", now);
  return {
    aShare: aShareOpen ? splitPhase(tzMinutes("Asia/Shanghai", now), 570, 690, 780, 900) : "closed",
    hk: hkOpen ? splitPhase(tzMinutes("Asia/Hong_Kong", now), 570, 720, 780, 960) : "closed",
    us: usOpen ? continuousPhase(tzMinutes("America/New_York", now), 570, 960, 240) : "closed"
  };
}
function phaseLabel(phase) {
  switch (phase) {
    case "trading":
      return "\u76D8\u4E2D";
    case "lunch":
      return "\u5348\u4F11";
    case "pre":
      return "\u76D8\u524D";
    case "closed":
      return "\u4F11\u5E02";
  }
}
var SKIN_TITLE = "\u4EA4\u6613\u7EC8\u7AEF \xB7 DeepSeek \u5728\u7EBF";
var QUOTES_REFRESH_MS = 3e4;
var SESSION_REFRESH_MS = 6e4;
var WORKSPACES_REFRESH_MS = 3e4;
var TITLEBAR_GLYPHS = [
  "\u2013",
  "\u25A1",
  "\xD7"
];
var cls = (name) => trading_module_css_default[name] ?? "";
var CANDLE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">',
  '<rect x="6" y="14" width="8" height="20" fill="#fff"/>',
  '<rect x="9" y="6" width="2" height="36" fill="#fff"/>',
  '<rect x="17" y="20" width="8" height="18" fill="#fff"/>',
  '<rect x="20" y="12" width="2" height="34" fill="#fff"/>',
  '<rect x="28" y="10" width="8" height="16" fill="#fff"/>',
  '<rect x="31" y="4" width="2" height="28" fill="#fff"/>',
  "</svg>"
].join("");
var FAVICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
  '<rect x="2" y="2" width="60" height="60" rx="14" fill="#f23645"/>',
  '<rect x="14" y="24" width="8" height="16" rx="1" fill="#fff"/>',
  '<rect x="17" y="18" width="2" height="28" rx="1" fill="#fff"/>',
  '<rect x="28" y="30" width="8" height="14" rx="1" fill="#fff"/>',
  '<rect x="31" y="24" width="2" height="26" rx="1" fill="#fff"/>',
  '<rect x="42" y="22" width="8" height="12" rx="1" fill="#fff"/>',
  '<rect x="45" y="16" width="2" height="24" rx="1" fill="#fff"/>',
  "</svg>"
].join("");
function placeholderQuote(symbol) {
  return {
    symbol,
    name: symbol,
    price: NaN,
    changePct: NaN,
    changeAbs: NaN,
    source: "placeholder"
  };
}
function pctText(trend, pct) {
  if (trend === "flat") return "\u2014";
  return `${trend === "up" ? "+" : ""}${Math.abs(pct).toFixed(2)}%`;
}
function priceText(price) {
  return Number.isFinite(price) ? price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) : "--";
}
function applyTrend(el, trend) {
  if (trend === "flat") delete el.dataset.trend;
  else el.dataset.trend = trend;
}
function apply(ctx) {
  const tagId = "@linxin666/dsh-client-ui-skin-trading/trading.module.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@linxin666/dsh-client-ui-skin-trading";
    tag.dataset.pluginCss = tagId;
    tag.textContent = css;
    document.head.appendChild(tag);
  }
  const body = document.body;
  const originalTitle = document.title;
  body.dataset.dshTrading = "";
  let disposed = false;
  const titlebar = document.createElement("div");
  titlebar.className = cls("tradingTitlebar");
  titlebar.dataset.skinChrome = "titlebar";
  const brand = document.createElement("span");
  brand.className = cls("tradingTitlebarIcon");
  brand.innerHTML = CANDLE_SVG;
  const title = document.createElement("span");
  title.className = cls("tradingTitlebarTitle");
  title.textContent = SKIN_TITLE;
  const chips = document.createElement("span");
  chips.className = cls("tradingTitlebarChips");
  titlebar.append(brand, title, chips);
  for (const glyph of TITLEBAR_GLYPHS) {
    const btn = document.createElement("span");
    btn.className = cls("tradingTitlebarBtn");
    btn.setAttribute("aria-hidden", "true");
    btn.textContent = glyph;
    titlebar.append(btn);
  }
  const tape = document.createElement("div");
  tape.className = cls("tradingTape");
  tape.dataset.skinChrome = "tape";
  const track = document.createElement("div");
  track.className = cls("tradingTapeTrack");
  tape.append(track);
  const statusbar = document.createElement("div");
  statusbar.className = cls("tradingStatusbar");
  statusbar.dataset.skinChrome = "statusbar";
  const leftGroup = document.createElement("span");
  leftGroup.className = cls("tradingStatusbarGroup");
  const sessionCells = /* @__PURE__ */ new Map();
  const sessionLabels = [
    ["aShare", "A\u80A1"],
    ["hk", "\u6E2F\u80A1"],
    ["us", "\u7F8E\u80A1"]
  ];
  for (const [key, label] of sessionLabels) {
    const cell = document.createElement("span");
    cell.className = cls("tradingStatusbarCell");
    cell.textContent = `${label} \u4F11\u5E02`;
    sessionCells.set(key, cell);
    leftGroup.append(cell);
  }
  const spacer = document.createElement("span");
  spacer.className = cls("tradingStatusbarSpacer");
  const lbGroup = document.createElement("span");
  lbGroup.className = cls("tradingStatusbarGroup");
  const lbLabel = document.createElement("span");
  lbLabel.className = cls("tradingStatusbarLbLabel");
  lbLabel.textContent = "\u957F\u6865";
  const lbCells = [];
  for (let i = 0; i < DEFAULT_INDEX_CELLS.length; i += 1) {
    const cell = document.createElement("span");
    cell.className = cls("tradingStatusbarCell");
    cell.textContent = "-- --";
    lbCells.push(cell);
    lbGroup.append(cell);
  }
  lbGroup.prepend(lbLabel);
  const codeIndexCell = document.createElement("span");
  codeIndexCell.className = cls("tradingStatusbarCell");
  codeIndexCell.textContent = "\u5DE5\u4F5C\u533A --";
  const rightGroup = document.createElement("span");
  rightGroup.className = cls("tradingStatusbarGroup");
  for (const state of [
    "\u5C31\u7EEA",
    "\u5DF2\u8FDE\u63A5",
    "\u5728\u7EBF"
  ]) {
    const cell = document.createElement("span");
    cell.className = cls("tradingStatusbarCell");
    cell.textContent = state;
    rightGroup.append(cell);
  }
  statusbar.append(leftGroup, spacer, lbGroup, codeIndexCell, rightGroup);
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.href = `data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_SVG)}`;
  document.title = SKIN_TITLE;
  document.head.append(favicon);
  body.append(titlebar, tape, statusbar);
  function renderQuoteCell(container, quote, nameClass, valueClass, chgClass) {
    container.textContent = "";
    const trend = trendOf(quote);
    const name = document.createElement("span");
    name.className = nameClass;
    name.textContent = quote.name;
    const price = document.createElement("span");
    price.className = valueClass;
    price.textContent = priceText(quote.price);
    const chg = document.createElement("span");
    chg.className = chgClass;
    chg.textContent = `${trend === "up" ? "\u25B2" : trend === "down" ? "\u25BC" : ""}${pctText(trend, quote.changePct)}`;
    applyTrend(chg, trend);
    container.append(name, price, chg);
  }
  function renderTape(quotes) {
    const items = quotes.length > 0 ? quotes : DEFAULT_TAPE.map(placeholderQuote);
    track.textContent = "";
    for (let copy = 0; copy < 2; copy += 1) for (const quote of items) {
      const item = document.createElement("span");
      item.className = cls("tradingTapeItem");
      renderQuoteCell(item, quote, cls("tradingTapeName"), cls("tradingTapePrice"), cls("tradingTapeChg"));
      track.append(item);
    }
    track.style.animationDuration = `${Math.max(30, items.length * 4)}s`;
  }
  function renderChips(quotes) {
    chips.textContent = "";
    const shown = quotes.length > 0 ? quotes.slice(0, 3) : DEFAULT_TAPE.slice(0, 3).map(placeholderQuote);
    for (const quote of shown) {
      const chip = document.createElement("span");
      chip.className = cls("tradingTitlebarChip");
      renderQuoteCell(chip, quote, cls("tradingTitlebarChipName"), cls("tradingTitlebarChipVal"), cls("tradingTitlebarChipChg"));
      chips.append(chip);
    }
  }
  function renderIndexCells(quotes) {
    for (let i = 0; i < lbCells.length; i += 1) {
      const cell = lbCells[i];
      const quote = quotes[i];
      if (quote === void 0) {
        cell.textContent = "-- --";
        delete cell.dataset.trend;
        continue;
      }
      cell.textContent = `${quote.name} ${priceText(quote.price)}`;
      const trend = trendOf(quote);
      const chg = document.createElement("span");
      chg.textContent = `${trend === "up" ? "\u25B2" : trend === "down" ? "\u25BC" : ""}${pctText(trend, quote.changePct)}`;
      cell.append(" ", chg);
      applyTrend(cell, trend);
    }
  }
  function renderSessions(now) {
    const phases = marketSessions(now);
    for (const [key, cell] of sessionCells) {
      const phase = phases[key];
      cell.textContent = `${sessionLabels.find(([k]) => k === key)?.[1] ?? key} ${phaseLabel(phase)}`;
      cell.dataset.phase = phase;
    }
  }
  const connection = (() => {
    try {
      return ctx.get("connection");
    } catch {
      return;
    }
  })();
  const refreshQuotes = async () => {
    if (disposed) return;
    let quotes = [];
    const tickerSymbols = await fetchTickerSettings();
    if (tickerSymbols !== null) {
      const tickerQuotes = await fetchTickerQuotes(tickerSymbols);
      if (tickerQuotes !== null) quotes = tickerQuotes;
    }
    if (quotes.length === 0) quotes = await fetchDirectQuotes(DEFAULT_TAPE);
    if (disposed) return;
    renderTape(quotes);
    renderChips(quotes);
  };
  const refreshLongbridge = async () => {
    if (disposed) return;
    const longbridgeQuotes = await fetchLongbridgeQuotes(connection);
    if (longbridgeQuotes !== null && longbridgeQuotes.length > 0) {
      if (disposed) return;
      lbLabel.textContent = "\u957F\u6865";
      renderIndexCells(longbridgeQuotes);
      return;
    }
    const fallback = await fetchDirectQuotes(DEFAULT_INDEX_CELLS);
    if (disposed) return;
    lbLabel.textContent = "\u6307\u6570";
    renderIndexCells(fallback);
  };
  const refreshWorkspaces = async () => {
    if (disposed) return;
    try {
      const workspaces = ctx.get("workspaces");
      if (workspaces === void 0) return;
      const count = workspaces.list.getSnapshot().items.length;
      if (disposed) return;
      codeIndexCell.textContent = `\u5DE5\u4F5C\u533A ${count}`;
    } catch {
      codeIndexCell.textContent = "\u5DE5\u4F5C\u533A --";
    }
  };
  renderTape([]);
  renderChips([]);
  renderIndexCells([]);
  renderSessions(/* @__PURE__ */ new Date());
  refreshQuotes();
  refreshLongbridge();
  refreshWorkspaces();
  const quotesTimer = setInterval(() => {
    refreshQuotes();
    refreshLongbridge();
  }, QUOTES_REFRESH_MS);
  const sessionTimer = setInterval(() => renderSessions(/* @__PURE__ */ new Date()), SESSION_REFRESH_MS);
  const workspacesTimer = setInterval(() => {
    refreshWorkspaces();
  }, WORKSPACES_REFRESH_MS);
  ctx.effect(() => () => {
    disposed = true;
    clearInterval(quotesTimer);
    clearInterval(sessionTimer);
    clearInterval(workspacesTimer);
    delete body.dataset.dshTrading;
    titlebar.remove();
    tape.remove();
    statusbar.remove();
    favicon.remove();
    if (document.title === SKIN_TITLE) document.title = originalTitle;
  }, "ui-skin-trading: trading chrome");
}

// src/client/session.ts
var CHROME_SELECTOR = "[data-skin-chrome]";
var FAVICON_SELECTOR = 'link[rel~="icon"]';
function isDataUriFavicon(node) {
  const href = node.href || node.getAttribute("href") || "";
  return href.startsWith("data:");
}
function datasetKey(attribute) {
  return attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
function collectOwnChromeNodes() {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(CHROME_SELECTOR)];
}
function collectOwnFaviconNodes() {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(FAVICON_SELECTOR)].filter(isDataUriFavicon);
}
function activateTradingSession(ctx, skinCtx, applyImpl = apply) {
  let tornDown = false;
  const disposers = [];
  skinCtx.logger.info("trading: activating (vendored dsh-web-ui client)", { skin: SKIN_ID });
  disposers.push(() => {
    for (const node of collectOwnStyleNodes()) node.remove();
  });
  const chromeBefore = new Set(collectOwnChromeNodes());
  const faviconBefore = new Set(collectOwnFaviconNodes());
  const markerBefore = typeof document !== "undefined" && datasetKey(ACTIVE_BODY_MARKER) in document.body.dataset;
  const pollHandles = [];
  disposers.push(() => {
    for (const node of collectOwnChromeNodes()) if (!chromeBefore.has(node)) node.remove();
    for (const node of collectOwnFaviconNodes()) if (!faviconBefore.has(node)) node.remove();
    if (!markerBefore && datasetKey(ACTIVE_BODY_MARKER) in document.body.dataset) {
      delete document.body.dataset[datasetKey(ACTIVE_BODY_MARKER)];
    }
    for (const handle of pollHandles) clearInterval(handle);
  });
  const vendoredCtx = {
    effect(execute) {
      const disposer = execute();
      if (typeof disposer === "function") disposers.push(disposer);
      return disposer;
    },
    get(name) {
      return readHostService(ctx, name);
    }
  };
  const globalRef = globalThis;
  const originalSetInterval = globalRef.setInterval;
  if (typeof originalSetInterval === "function" && typeof globalRef.clearInterval === "function") {
    globalRef.setInterval = ((handler, timeout, ...args) => {
      const handle = originalSetInterval.call(globalThis, handler, timeout, ...args);
      pollHandles.push(handle);
      return handle;
    });
  }
  const originalTitle = typeof document !== "undefined" ? document.title : "";
  const onAbort = () => teardown();
  skinCtx.signal.addEventListener("abort", onAbort);
  try {
    applyImpl(vendoredCtx);
  } catch (error) {
    teardown();
    if (typeof document !== "undefined" && document.title !== originalTitle) {
      document.title = originalTitle;
    }
    throw error;
  } finally {
    if (typeof originalSetInterval === "function") globalRef.setInterval = originalSetInterval;
  }
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    skinCtx.signal.removeEventListener("abort", onAbort);
    for (let i = disposers.length - 1; i >= 0; i--) {
      try {
        disposers[i]();
      } catch (error) {
        skinCtx.logger.warn("trading: teardown step failed", { error: String(error) });
      }
    }
    skinCtx.logger.info("trading: deactivated \u2014 all side effects unwound");
  }
  return { teardown };
}
function collectOwnStyleNodes() {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll(`style[data-plugin="${UPSTREAM_PACKAGE}"]`)
  );
}
function readHostService(ctx, name) {
  try {
    const host = ctx;
    if (typeof host.get === "function") return host.get(name);
    return ctx[name];
  } catch {
    return void 0;
  }
}
function createTradingActivation(ctx) {
  let activeSession = null;
  let safetyNetRegistered = false;
  return {
    activate(skinCtx) {
      if (activeSession !== null) activeSession.teardown();
      activeSession = activateTradingSession(ctx, skinCtx);
      if (!safetyNetRegistered) {
        safetyNetRegistered = true;
        ctx.effect(() => () => activeSession?.teardown(), "skn-trading: session safety net (fiber dispose, R8)");
      }
    },
    deactivate() {
      activeSession?.teardown();
      activeSession = null;
    }
  };
}

// src/client/index.ts
var inject = ["uiSkinLoader"];
function apply2(ctx) {
  const activation = createTradingActivation(ctx);
  const unregister = ctx.uiSkinLoader.registerSkin({
    ...SKIN_META,
    preview: TRADING_PREVIEW_SVG,
    activate: (skinCtx) => activation.activate(skinCtx),
    deactivate: () => activation.deactivate()
  });
  ctx.effect(() => unregister, "skn-trading: unregister on fiber dispose");
}

    return module.exports;
  },
});

