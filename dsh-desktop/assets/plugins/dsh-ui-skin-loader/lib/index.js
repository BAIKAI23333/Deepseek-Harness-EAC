// src/adapter/dsh-0.1.7-host.ts
import z from "@deepseek-ai/schemastery";

// src/protocol.ts
var CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";
var SERVICE_NAME = "uiSkinLoader";
var SETTINGS_NAMESPACE = "dsh-ui-skin-loader";
var LOADER_SLOT_PREFIX = "io.github.dsh-eac.skin.loader.";
var DEFAULT_SKIN_ID = "default";

// src/adapter/dsh-0.1.7-host.ts
function createLoaderConfigSchema() {
  return z.object({
    activeSkin: z.string().default(DEFAULT_SKIN_ID).volatile(),
    faultLog: z.array(
      z.object({
        at: z.string(),
        skinId: z.string(),
        kind: z.string(),
        message: z.string()
      })
    ).default([]).volatile(),
    diagnosticsEnabled: z.boolean().default(false).volatile()
  });
}

// src/index.ts
var Config = createLoaderConfigSchema();
function apply(ctx) {
  ctx.inject(["settings"], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      "ui-skin-loader: settings page policy"
    );
  });
}
export {
  CONVENTION_ID,
  Config,
  LOADER_SLOT_PREFIX,
  SERVICE_NAME,
  SETTINGS_NAMESPACE,
  apply,
  createLoaderConfigSchema
};
