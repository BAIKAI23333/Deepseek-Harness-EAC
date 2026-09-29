window.__ModuleLoader__.load({
  id: "@dsh-eac/skin-inkwash",
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

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/identity.ts
var SKIN_ID = "dsh-eac.skin.inkwash";
var CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";
var THEME_ID = "dsh-eac-skin-inkwash-paper";
var CSS_PREFIX = "skn-inkwash";
var SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "\u6C34\u58A8\u9752\u70DF",
  version: "1.1.0",
  author: "DSH-EAC",
  description: "\u6D45\u8272\u7EB8\u8D28\u611F + \u6C34\u58A8\u6C1B\u56F4\u80CC\u666F\u7684\u5185\u7F6E\u793A\u4F8B\u76AE\u80A4\uFF08\u516C\u7EA6\u53C2\u8003\u5B9E\u73B0\uFF1B\u4E0D\u63D0\u4F9B\u81EA\u5B9A\u4E49\u8BBE\u7F6E\uFF09\u3002",
  tags: ["light", "paper", "example"]
};

// src/preview.ts
var INKWASH_PREVIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="${SKIN_META.name}"><defs><linearGradient id="${CSS_PREFIX}-preview-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f5ef"/><stop offset="1" stop-color="#eceade"/></linearGradient><radialGradient id="${CSS_PREFIX}-preview-mist" cx=".35" cy=".42" r=".65"><stop offset="0" stop-color="#3a4550" stop-opacity=".38"/><stop offset="1" stop-color="#3a4550" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="url(#${CSS_PREFIX}-preview-bg)"/><ellipse cx="112" cy="76" rx="128" ry="72" fill="url(#${CSS_PREFIX}-preview-mist)"/><path d="M28 132 C 74 108, 118 126, 158 112 S 246 122, 292 106" fill="none" stroke="#4a5560" stroke-width="3.5" opacity=".55" stroke-linecap="round"/><path d="M52 148 C 108 136, 170 150, 268 132" fill="none" stroke="#4a5560" stroke-width="1.6" opacity=".32" stroke-linecap="round"/><text x="160" y="46" text-anchor="middle" font-family="serif" font-size="22" font-weight="600" fill="#2f3a44">${SKIN_META.name}</text><text x="160" y="168" text-anchor="middle" font-family="sans-serif" font-size="11" letter-spacing=".2em" fill="#7a8288">INKWASH MIST</text></svg>`;

// src/client/components.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function InkwashBackdrop() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-skn-inkwash-backdrop": "", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { xmlns: "http://www.w3.org/2000/svg", preserveAspectRatio: "xMidYMid slice", viewBox: "0 0 1440 900", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("radialGradient", { id: `${CSS_PREFIX}-mist-a`, cx: ".5", cy: ".5", r: ".5", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0", stopColor: "#3a4550", stopOpacity: ".16" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "1", stopColor: "#3a4550", stopOpacity: "0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("radialGradient", { id: `${CSS_PREFIX}-mist-b`, cx: ".5", cy: ".5", r: ".5", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0", stopColor: "#5a6672", stopOpacity: ".12" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "1", stopColor: "#5a6672", stopOpacity: "0" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ellipse", { cx: "330", cy: "210", rx: "460", ry: "240", fill: `url(#${CSS_PREFIX}-mist-a)` }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ellipse", { cx: "1150", cy: "330", rx: "420", ry: "220", fill: `url(#${CSS_PREFIX}-mist-b)` }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M-40 780 C 260 640, 520 780, 820 690 S 1320 700, 1500 640",
        fill: "none",
        stroke: "#3a4550",
        strokeOpacity: ".18",
        strokeWidth: "52",
        strokeLinecap: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M120 830 C 420 760, 760 850, 1080 780",
        fill: "none",
        stroke: "#5a6672",
        strokeOpacity: ".14",
        strokeWidth: "18",
        strokeLinecap: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M300 870 C 620 820, 980 880, 1320 820",
        fill: "none",
        stroke: "#5a6672",
        strokeOpacity: ".09",
        strokeWidth: "10",
        strokeLinecap: "round"
      }
    )
  ] }) });
}

// src/background.ts
var STYLE_ATTR = `data-${CSS_PREFIX}-style`;
var ACTIVE_BODY_ATTR = `data-${CSS_PREFIX}-active`;
function paperBackgroundCss() {
  return [
    "background-color:#f7f5ef",
    "background-image:radial-gradient(900px 520px at 12% 6%, rgba(58, 69, 80, 0.10), transparent 62%),radial-gradient(760px 460px at 88% 28%, rgba(58, 69, 80, 0.08), transparent 58%),radial-gradient(1100px 640px at 42% 112%, rgba(58, 69, 80, 0.09), transparent 60%),linear-gradient(180deg, #f8f6f0 0%, #f1eee4 100%)",
    "background-attachment:fixed"
  ].join(";");
}
function backdropCss() {
  return [
    `[data-${CSS_PREFIX}-backdrop]{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;opacity:.5}`,
    `[data-${CSS_PREFIX}-backdrop] svg{width:100%;height:100%;display:block}`,
    // 与 aurora 同款双保险：只引用自有 data 属性，不碰宿主 class（R5）
    `body [data-${CSS_PREFIX}-backdrop]{pointer-events:none}`
  ].join("");
}
function buildInkwashCss() {
  return [
    `/* @dsh-eac/skin-inkwash \u2014 injected by activate, removed by deactivate (\u516C\u7EA6 R8) */`,
    `body[${ACTIVE_BODY_ATTR}]{${paperBackgroundCss()}}`,
    backdropCss()
  ].join("\n");
}

// src/theme.ts
var INKWASH_THEME_TOKENS = {
  // 表面层：宣纸白，半透明透出底纹
  "--dsw-alias-bg-base": "rgba(250, 248, 242, 0.86)",
  "--dsw-alias-bg-layer-1": "rgba(252, 250, 245, 0.9)",
  "--dsw-alias-bg-layer-2": "rgba(246, 243, 234, 0.92)",
  "--dsw-alias-bg-overlay": "rgba(253, 252, 248, 0.96)",
  "--dsw-specific-sidebar-fill": "rgba(243, 240, 231, 0.85)",
  // 边界：淡墨线
  "--dsw-alias-border-l1": "rgba(90, 100, 110, 0.14)",
  "--dsw-alias-border-l2": "rgba(90, 100, 110, 0.2)",
  "--dsw-alias-border-l3": "rgba(90, 100, 110, 0.28)",
  // 文字与品牌：墨色 + 黛青
  "--dsw-alias-label-primary": "#2f3a44",
  "--dsw-alias-label-secondary": "#5a6672",
  "--dsw-alias-label-dimmed": "#8a939c",
  "--dsw-alias-brand-primary": "#3a6ea5"
};
var INKWASH_THEME = {
  id: THEME_ID,
  colorScheme: "light",
  tokens: INKWASH_THEME_TOKENS
};
var INKWASH_OVERRIDE_SOURCE = SKIN_ID;
var INKWASH_TOKEN_OVERRIDES = Object.fromEntries(
  Object.entries(INKWASH_THEME_TOKENS).map(([name, value]) => [name, { light: value, dark: value }])
);

// src/client/session.ts
var BACKDROP_SEAT_ID = `${CSS_PREFIX}-backdrop`;
var BACKDROP_ORDER = 10;
function activateInkwashSession(ctx, skinCtx, deps) {
  const dom = deps.dom ?? document;
  let tornDown = false;
  const disposers = [];
  skinCtx.logger.info("inkwash: activating", { skin: SKIN_ID });
  dom.body.setAttribute(ACTIVE_BODY_ATTR, "");
  let disposeTheme;
  let disposeOverride;
  try {
    disposeTheme = ctx.theme.register(INKWASH_THEME);
    disposeOverride = ctx.theme.overrideTokens(INKWASH_OVERRIDE_SOURCE, INKWASH_TOKEN_OVERRIDES);
  } catch (error) {
    disposeTheme?.();
    dom.body.removeAttribute(ACTIVE_BODY_ATTR);
    throw error;
  }
  disposers.push(disposeTheme);
  disposers.push(disposeOverride);
  const styleNode = dom.createElement("style");
  styleNode.setAttribute(STYLE_ATTR, "");
  styleNode.textContent = buildInkwashCss();
  dom.head.appendChild(styleNode);
  disposers.push(() => styleNode.remove());
  const disposeBackdropSeat = ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register(
      { name: "shell.overlay", id: BACKDROP_SEAT_ID, order: BACKDROP_ORDER },
      deps.createBackdrop()
    )
  );
  disposers.push(disposeBackdropSeat);
  const onAbort = () => teardown();
  skinCtx.signal.addEventListener("abort", onAbort);
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    skinCtx.signal.removeEventListener("abort", onAbort);
    for (let i = disposers.length - 1; i >= 0; i--) {
      try {
        disposers[i]();
      } catch (error) {
        skinCtx.logger.warn("inkwash: teardown step failed", { error: String(error) });
      }
    }
    dom.body.removeAttribute(ACTIVE_BODY_ATTR);
    skinCtx.logger.info("inkwash: deactivated \u2014 all side effects unwound");
  }
  return { teardown };
}
function createInkwashActivation(ctx, deps) {
  let activeSession = null;
  let safetyNetRegistered = false;
  return {
    activate(skinCtx) {
      if (activeSession !== null) activeSession.teardown();
      activeSession = activateInkwashSession(ctx, skinCtx, deps);
      if (!safetyNetRegistered) {
        safetyNetRegistered = true;
        ctx.effect(() => () => activeSession?.teardown(), "skn-inkwash: session safety net (fiber dispose, R8)");
      }
    },
    deactivate() {
      activeSession?.teardown();
      activeSession = null;
    }
  };
}

// src/client/index.tsx
var inject = ["uiSkinLoader", "theme", "slots"];
function apply(ctx) {
  const activation = createInkwashActivation(ctx, {
    createBackdrop: () => InkwashBackdrop
  });
  const unregister = ctx.uiSkinLoader.registerSkin({
    ...SKIN_META,
    preview: INKWASH_PREVIEW_SVG,
    activate: (skinCtx) => activation.activate(skinCtx),
    deactivate: () => activation.deactivate()
  });
  ctx.effect(() => unregister, "skn-inkwash: unregister on fiber dispose");
}

    return module.exports;
  },
});

