import Schema from "@deepseek-ai/schemastery";


// src/settings.ts
var BACKGROUND_URL_FIELD = "backgroundUrl";
var BACKGROUND_URL_DEFAULT = "";

// src/index.ts
function createConfigSchema(s) {
  return s.object({
    [BACKGROUND_URL_FIELD]: s.string().default(BACKGROUND_URL_DEFAULT).volatile()
  });
}
function apply(ctx) {
  ctx.inject(["settings"], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      "skn-aurora: settings page policy"
    );
  });
}
export {
  apply,
  createConfigSchema
};

export const Config = createConfigSchema(Schema);

