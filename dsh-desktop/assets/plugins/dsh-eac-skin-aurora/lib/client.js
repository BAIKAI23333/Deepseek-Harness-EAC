window.__ModuleLoader__.load({
  id: "@dsh-eac/skin-aurora",
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
var SKIN_ID = "dsh-eac.skin.aurora";
var CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";
var SETTINGS_NAMESPACE = "dsh-eac-skin-aurora";
var THEME_ID = "dsh-eac-skin-aurora-night";
var CSS_PREFIX = "skn-aurora";
var SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "\u6781\u5149\u4E4B\u591C",
  version: "1.1.0",
  author: "DSH-EAC",
  description: "\u6DF1\u8272\u73BB\u7483\u62DF\u6001 + \u6781\u5149\u6E10\u53D8\u80CC\u666F\u7684\u5185\u7F6E\u793A\u4F8B\u76AE\u80A4\uFF08\u516C\u7EA6\u53C2\u8003\u5B9E\u73B0\uFF09\u3002",
  tags: ["dark", "glassmorphism", "example"]
};

// src/preview.ts
var AURORA_PREVIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="${SKIN_META.name}"><defs><linearGradient id="${CSS_PREFIX}-preview-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1026"/><stop offset="1" stop-color="#1b2148"/></linearGradient><linearGradient id="${CSS_PREFIX}-preview-ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#39d0a4"/><stop offset=".5" stop-color="#4f8dff"/><stop offset="1" stop-color="#a06bff"/></linearGradient></defs><rect width="320" height="180" fill="url(#${CSS_PREFIX}-preview-bg)"/><path d="M-20 118 C 60 58, 120 150, 200 80 S 320 58, 340 88" fill="none" stroke="url(#${CSS_PREFIX}-preview-ribbon)" stroke-width="26" stroke-linecap="round" opacity=".55"/><path d="M-20 142 C 80 92, 150 172, 240 102 S 330 92, 340 112" fill="none" stroke="url(#${CSS_PREFIX}-preview-ribbon)" stroke-width="13" stroke-linecap="round" opacity=".33"/><text x="160" y="42" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="600" fill="#e8ecff">${SKIN_META.name}</text><text x="160" y="166" text-anchor="middle" font-family="sans-serif" font-size="11" letter-spacing=".2em" fill="#9fb0e8">AURORA NIGHT</text></svg>`;

// src/client/messages.ts
var AURORA_LOCALE_NS = "dsh-eac-skin-aurora/console";
var AURORA_SETTINGS_HINT = "\u6FC0\u6D3B\u540E\u5728 \u8BBE\u7F6E \u2192 \u6781\u5149\u4E4B\u591C \u81EA\u5B9A\u4E49\u80CC\u666F\u56FE\uFF08Settings \u2192 Aurora Night, after activation\uFF09";
var AURORA_LOCALE_DICTS = {
  en: {
    "nav.label": SKIN_META.name,
    "settings.title": "Aurora Night \xB7 Background",
    "settings.desc": "Choose the background behind the glass surfaces. Leave empty for the built-in aurora gradient. The setting is owned by this skin and survives deactivation.",
    "settings.label": "Background image URL (http/https)",
    "settings.placeholder": "https://example.com/aurora.jpg",
    "settings.apply": "Apply",
    "settings.reset": "Use built-in gradient",
    "settings.applied": "Applied.",
    "settings.write-refused": "The host refused the write \u2014 try again.",
    "settings.unavailable": "Settings channel unavailable (status: {status}).",
    "settings.readonly": "Read-only in this mode.",
    "settings.error.not-url": "Not a valid absolute URL.",
    "settings.error.unsupported-scheme": "Only http/https URLs are supported.",
    "settings.error.empty-input": "Type a URL, or use \u201CUse built-in gradient\u201D."
  },
  zh: {
    "nav.label": SKIN_META.name,
    "settings.title": "\u6781\u5149\u4E4B\u591C \xB7 \u80CC\u666F",
    "settings.desc": "\u9009\u62E9\u73BB\u7483\u8868\u9762\u4E4B\u540E\u7684\u80CC\u666F\u56FE\u3002\u7559\u7A7A\u5373\u7528\u5185\u7F6E\u6781\u5149\u6E10\u53D8\u3002\u8BE5\u8BBE\u7F6E\u7531\u76AE\u80A4\u81EA\u6CBB\u6301\u4E45\u5316\uFF0C\u505C\u7528\u76AE\u80A4\u4E0D\u4F1A\u4E22\u5931\u3002",
    "settings.label": "\u80CC\u666F\u56FE URL\uFF08http/https\uFF09",
    "settings.placeholder": "https://example.com/aurora.jpg",
    "settings.apply": "\u5E94\u7528",
    "settings.reset": "\u7528\u56DE\u5185\u7F6E\u6E10\u53D8",
    "settings.applied": "\u5DF2\u5E94\u7528\u3002",
    "settings.write-refused": "\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u5199\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    "settings.unavailable": "\u8BBE\u7F6E\u901A\u9053\u4E0D\u53EF\u7528\uFF08\u72B6\u6001\uFF1A{status}\uFF09\u3002",
    "settings.readonly": "\u5F53\u524D\u6A21\u5F0F\u53EA\u8BFB\u3002",
    "settings.error.not-url": "\u4E0D\u662F\u5408\u6CD5\u7684\u7EDD\u5BF9 URL\u3002",
    "settings.error.unsupported-scheme": "\u53EA\u652F\u6301 http/https \u5730\u5740\u3002",
    "settings.error.empty-input": "\u8BF7\u8F93\u5165 URL\uFF0C\u6216\u70B9\u51FB\u300C\u7528\u56DE\u5185\u7F6E\u6E10\u53D8\u300D\u3002"
  }
};

// src/client/components.tsx
var import_react = require("react");

// src/settings.ts
var BACKGROUND_URL_DEFAULT = "";
function validateBackgroundUrl(input) {
  const value = input.trim();
  if (value === "") return { ok: true, value: BACKGROUND_URL_DEFAULT };
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "not-url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported-scheme" };
  }
  return { ok: true, value: parsed.href };
}
function readBackgroundUrl(value) {
  if (typeof value !== "object" || value === null) return BACKGROUND_URL_DEFAULT;
  const raw = value.backgroundUrl;
  if (typeof raw !== "string") return BACKGROUND_URL_DEFAULT;
  const validated = validateBackgroundUrl(raw);
  return validated.ok ? validated.value : BACKGROUND_URL_DEFAULT;
}

// src/client/components.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function AuroraBackdrop() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-skn-aurora-backdrop": "", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { xmlns: "http://www.w3.org/2000/svg", preserveAspectRatio: "xMidYMid slice", viewBox: "0 0 1440 900", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${CSS_PREFIX}-ribbon-a`, x1: "0", y1: "0", x2: "1", y2: "0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0", stopColor: "#39d0a4", stopOpacity: "0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: ".45", stopColor: "#4f8dff", stopOpacity: ".55" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "1", stopColor: "#a06bff", stopOpacity: "0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${CSS_PREFIX}-ribbon-b`, x1: "0", y1: "0", x2: "1", y2: "0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0", stopColor: "#a06bff", stopOpacity: "0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: ".5", stopColor: "#4f8dff", stopOpacity: ".38" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "1", stopColor: "#39d0a4", stopOpacity: "0" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M-80 620 C 240 380, 520 700, 860 460 S 1340 380, 1560 520",
        fill: "none",
        stroke: `url(#${CSS_PREFIX}-ribbon-a)`,
        strokeWidth: "150",
        strokeLinecap: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M-80 760 C 300 560, 640 820, 1000 600 S 1400 540, 1560 640",
        fill: "none",
        stroke: `url(#${CSS_PREFIX}-ribbon-b)`,
        strokeWidth: "90",
        strokeLinecap: "round"
      }
    )
  ] }) });
}
function errorKey(reason) {
  return reason === "not-url" ? "settings.error.not-url" : "settings.error.unsupported-scheme";
}
function currentUrl(form) {
  const value = form.getSnapshot().value;
  if (typeof value !== "object" || value === null) return "";
  const raw = value.backgroundUrl;
  return typeof raw === "string" ? raw : "";
}
function AuroraSettingsSection(props) {
  const { form, t } = props;
  const snapshot = (0, import_react.useSyncExternalStore)(
    (onStoreChange) => form.subscribe(onStoreChange),
    () => form.getSnapshot()
  );
  const [input, setInput] = (0, import_react.useState)(() => currentUrl(form));
  const [error, setError] = (0, import_react.useState)("");
  const [status, setStatus] = (0, import_react.useState)("");
  const [pending, setPending] = (0, import_react.useState)(false);
  const writable = snapshot.writable;
  const apply2 = async (raw) => {
    setStatus("");
    if (raw.trim() === "") {
      setError(t("settings.error.empty-input"));
      return;
    }
    const validated = validateBackgroundUrl(raw);
    if (!validated.ok) {
      setError(t(errorKey(validated.reason)));
      return;
    }
    setError("");
    setPending(true);
    try {
      const accepted = await form.set("backgroundUrl", validated.value);
      if (accepted) {
        setInput(validated.value);
        setStatus(t("settings.applied"));
      } else {
        setError(t("settings.write-refused"));
      }
    } finally {
      setPending(false);
    }
  };
  const reset = async () => {
    setError("");
    setStatus("");
    setPending(true);
    try {
      const accepted = await form.set("backgroundUrl", "");
      if (accepted) {
        setInput("");
        setStatus(t("settings.applied"));
      } else {
        setError(t("settings.write-refused"));
      }
    } finally {
      setPending(false);
    }
  };
  if (snapshot.status !== "ready") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-skn-aurora-settings": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("settings.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("settings.unavailable", { status: snapshot.status }) })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-skn-aurora-settings": "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("settings.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("settings.desc") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `${CSS_PREFIX}-label`, htmlFor: `${CSS_PREFIX}-bg-input`, children: [
      t("settings.label"),
      !writable && ` (${t("settings.readonly")})`
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${CSS_PREFIX}-row`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: `${CSS_PREFIX}-bg-input`,
          type: "url",
          value: input,
          placeholder: t("settings.placeholder"),
          disabled: !writable || pending,
          onChange: (event) => {
            setInput(event.target.value);
            setError("");
            setStatus("");
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: !writable || pending, onClick: () => void apply2(input), children: t("settings.apply") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: !writable || pending, onClick: () => void reset(), children: t("settings.reset") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${CSS_PREFIX}-error`, "data-skn-aurora-error": error !== "" ? "true" : void 0, role: "alert", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${CSS_PREFIX}-status`, "data-skn-aurora-status": status !== "" ? "true" : void 0, children: status })
  ] });
}

// src/background.ts
var STYLE_ATTR = `data-${CSS_PREFIX}-style`;
var ACTIVE_BODY_ATTR = `data-${CSS_PREFIX}-active`;
function builtinAuroraBackgroundCss() {
  return [
    "background-color:#0b1026",
    "background-image:radial-gradient(1200px 700px at 18% -10%, rgba(79, 141, 255, 0.42), transparent 60%),radial-gradient(1000px 620px at 85% 12%, rgba(160, 107, 255, 0.34), transparent 55%),radial-gradient(1100px 700px at 55% 115%, rgba(57, 208, 164, 0.26), transparent 60%),linear-gradient(180deg, #0b1026 0%, #121a3e 55%, #090d20 100%)",
    "background-attachment:fixed"
  ].join(";");
}
function imageAuroraBackgroundCss(imageUrl) {
  return [
    "background-color:#0b1026",
    `background-image:linear-gradient(180deg, rgba(7, 11, 28, 0.78), rgba(7, 11, 28, 0.84)),url("${escapeCssUrl(imageUrl)}")`,
    "background-size:auto,cover",
    "background-position:center",
    "background-repeat:no-repeat",
    "background-attachment:fixed"
  ].join(";");
}
function escapeCssUrl(url) {
  return url.replace(/[\\"]/g, "\\$&");
}
function backdropCss() {
  return [
    `[data-${CSS_PREFIX}-backdrop]{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;opacity:.55}`,
    `[data-${CSS_PREFIX}-backdrop] svg{width:100%;height:100%;display:block}`,
    // 双保险：宿主 overlay 层给直接子元素 pointer-events:auto，这里以更高特异性的
    // body 前缀压回 none——选择器只引用自己的 data 属性，不碰宿主 class（R5）。
    `body [data-${CSS_PREFIX}-backdrop]{pointer-events:none}`
  ].join("");
}
function settingsSectionCss() {
  return [
    `[data-${CSS_PREFIX}-settings]{display:flex;flex-direction:column;gap:12px;max-width:560px;padding:18px;border:1px solid rgba(148,176,255,.22);border-radius:14px;color:#e8ecff;background:linear-gradient(160deg, rgba(24,32,66,.72), rgba(14,20,44,.6));backdrop-filter:blur(18px) saturate(1.25);-webkit-backdrop-filter:blur(18px) saturate(1.25);box-shadow:0 10px 36px rgba(3,6,18,.4)}`,
    `[data-${CSS_PREFIX}-settings] h3{margin:0;font-size:15px;font-weight:600;letter-spacing:.02em}`,
    `[data-${CSS_PREFIX}-settings] p{margin:0;font-size:12px;line-height:1.6;color:#a8b6e6}`,
    `[data-${CSS_PREFIX}-settings] .${CSS_PREFIX}-row{display:flex;gap:8px}`,
    `[data-${CSS_PREFIX}-settings] input{flex:1;min-width:0;padding:7px 10px;border-radius:8px;font-size:13px;color:#e8ecff;background:rgba(8,12,30,.6);border:1px solid rgba(148,176,255,.28);outline:none}`,
    `[data-${CSS_PREFIX}-settings] input:focus{border-color:rgba(111,155,255,.75)}`,
    `[data-${CSS_PREFIX}-settings] input:disabled{opacity:.5}`,
    `[data-${CSS_PREFIX}-settings] button{padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;border:1px solid rgba(148,176,255,.35);color:#e8ecff;background:rgba(35,46,92,.55)}`,
    `[data-${CSS_PREFIX}-settings] button:hover:not(:disabled){background:rgba(52,66,126,.7)}`,
    `[data-${CSS_PREFIX}-settings] button:disabled{opacity:.45;cursor:default}`,
    `[data-${CSS_PREFIX}-settings] .${CSS_PREFIX}-status{font-size:12px;color:#8fe3c0;min-height:1em}`,
    `[data-${CSS_PREFIX}-settings] .${CSS_PREFIX}-error{font-size:12px;color:#ff9db1;min-height:1em;white-space:pre-wrap}`
  ].join("");
}
function buildAuroraCss(settingsValue) {
  const imageUrl = readBackgroundUrl(settingsValue);
  const background = imageUrl === "" ? builtinAuroraBackgroundCss() : imageAuroraBackgroundCss(imageUrl);
  return [
    `/* @dsh-eac/skin-aurora \u2014 injected by activate, removed by deactivate (\u516C\u7EA6 R8) */`,
    `body[${ACTIVE_BODY_ATTR}]{${background}}`,
    backdropCss(),
    settingsSectionCss()
  ].join("\n");
}

// src/theme.ts
var AURORA_TOKEN_VALUES = {
  // 表面层：半透明是玻璃拟态的关键（透出 body 的极光背景）
  "--dsw-alias-bg-base": "rgba(11, 16, 38, 0.78)",
  "--dsw-alias-bg-layer-1": "rgba(19, 26, 54, 0.72)",
  "--dsw-alias-bg-layer-2": "rgba(27, 35, 70, 0.66)",
  "--dsw-alias-bg-overlay": "rgba(15, 21, 46, 0.88)",
  "--dsw-specific-sidebar-fill": "rgba(13, 19, 44, 0.62)",
  // 边界：冷色发丝线
  "--dsw-alias-border-l1": "rgba(148, 176, 255, 0.16)",
  "--dsw-alias-border-l2": "rgba(148, 176, 255, 0.24)",
  "--dsw-alias-border-l3": "rgba(148, 176, 255, 0.32)",
  // 文字与品牌
  "--dsw-alias-label-primary": "#e8ecff",
  "--dsw-alias-label-secondary": "#a8b6e6",
  "--dsw-alias-label-dimmed": "#7c8ac0",
  "--dsw-alias-brand-primary": "#6f9bff",
  // 导航选中/悬停 pill（T2.6-fix 补充；实机定位：设置面板与侧栏的导航项选中态用
  // --dsw-specific-sidebar-nav-item-active，基础色板里是近白实体色）——不覆盖会出现
  // "浅色 pill + 亮色文字"的对比度反转（修复前截图 14 的选中项文字不可见）。
  // 覆盖为半透明冷蓝后，label-primary 的亮色文字在 pill 上保持可读：
  "--dsw-specific-sidebar-nav-item-active": "rgba(111, 155, 255, 0.32)",
  "--dsw-specific-sidebar-nav-item-hover": "rgba(148, 176, 255, 0.14)",
  "--dsw-specific-sidebar-nav-item-active-accent": "rgba(79, 141, 255, 0.45)"
};
var AURORA_THEME = {
  id: THEME_ID,
  colorScheme: "dark",
  tokens: AURORA_TOKEN_VALUES
};
var AURORA_OVERRIDE_SOURCE = SKIN_ID;
var AURORA_TOKEN_OVERRIDES = Object.fromEntries(
  Object.entries(AURORA_TOKEN_VALUES).map(([name, value]) => [name, { light: value, dark: value }])
);

// src/client/session.ts
var SETTINGS_SEAT_ID = `${CSS_PREFIX}-settings`;
var BACKDROP_SEAT_ID = `${CSS_PREFIX}-backdrop`;
var SETTINGS_SECTION_ORDER = 91;
var BACKDROP_ORDER = 10;
function activateAuroraSession(ctx, skinCtx, deps) {
  const dom = deps.dom ?? document;
  let tornDown = false;
  const disposers = [];
  skinCtx.logger.info("aurora: activating", { skin: SKIN_ID });
  dom.body.setAttribute(ACTIVE_BODY_ATTR, "");
  let disposeTheme;
  let disposeOverride;
  try {
    disposeTheme = ctx.theme.register(AURORA_THEME);
    disposeOverride = ctx.theme.overrideTokens(AURORA_OVERRIDE_SOURCE, AURORA_TOKEN_OVERRIDES);
  } catch (error) {
    disposeTheme?.();
    dom.body.removeAttribute(ACTIVE_BODY_ATTR);
    throw error;
  }
  disposers.push(disposeTheme);
  disposers.push(disposeOverride);
  const styleNode = dom.createElement("style");
  styleNode.setAttribute(STYLE_ATTR, "");
  const form = ctx.configForms.get(SETTINGS_NAMESPACE);
  styleNode.textContent = buildAuroraCss(form.getSnapshot().value);
  dom.head.appendChild(styleNode);
  disposers.push(() => styleNode.remove());
  const offSettingsSubscription = form.subscribe(() => {
    if (tornDown) return;
    styleNode.textContent = buildAuroraCss(form.getSnapshot().value);
    skinCtx.logger.debug("aurora: background updated from skin settings", {
      background: describeBackground(form.getSnapshot().value)
    });
  });
  disposers.push(offSettingsSubscription);
  const disposeLocale = ctx.locale.register(AURORA_LOCALE_NS, AURORA_LOCALE_DICTS);
  const t = ctx.locale.bind(AURORA_LOCALE_NS);
  disposers.push(disposeLocale);
  const disposeSettingsSeat = ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      { name: "settings.section", id: SETTINGS_SEAT_ID, order: SETTINGS_SECTION_ORDER, label: () => t("nav.label") },
      deps.createSettingsSection({ form, t })
    )
  );
  disposers.push(disposeSettingsSeat);
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
        skinCtx.logger.warn("aurora: teardown step failed", { error: String(error) });
      }
    }
    dom.body.removeAttribute(ACTIVE_BODY_ATTR);
    skinCtx.logger.info("aurora: deactivated \u2014 all side effects unwound");
  }
  return { teardown };
}
function createAuroraActivation(ctx, deps) {
  let activeSession = null;
  let safetyNetRegistered = false;
  return {
    activate(skinCtx) {
      if (activeSession !== null) activeSession.teardown();
      activeSession = activateAuroraSession(ctx, skinCtx, deps);
      if (!safetyNetRegistered) {
        safetyNetRegistered = true;
        ctx.effect(() => () => activeSession?.teardown(), "skn-aurora: session safety net (fiber dispose, R8)");
      }
    },
    deactivate() {
      activeSession?.teardown();
      activeSession = null;
    }
  };
}
function describeBackground(settingsValue) {
  const url = readBackgroundUrl(settingsValue);
  return url === "" ? "(built-in gradient)" : url;
}

// src/client/index.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var inject = ["uiSkinLoader", "theme", "slots", "configForms", "locale"];
function apply(ctx) {
  const activation = createAuroraActivation(ctx, {
    createSettingsSection: (bindings) => () => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AuroraSettingsSection, { form: bindings.form, t: bindings.t }),
    createBackdrop: () => AuroraBackdrop
  });
  const unregister = ctx.uiSkinLoader.registerSkin({
    ...SKIN_META,
    preview: AURORA_PREVIEW_SVG,
    settingsHint: AURORA_SETTINGS_HINT,
    activate: (skinCtx) => activation.activate(skinCtx),
    deactivate: () => activation.deactivate()
  });
  ctx.effect(() => unregister, "skn-aurora: unregister on fiber dispose");
}

    return module.exports;
  },
});

