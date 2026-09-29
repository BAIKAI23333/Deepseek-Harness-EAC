// Reproduce the kernel's runtime resolution for the smoke profile and check entry membership.
const STAGED = 'D:/DeepSeek Harness/dsh max/dsh_desktop/tauri-shell/staged-resources/dsh-desktop';
process.env.DSH_HOME = 'D:/tmp/pack-smoke2/dsh-home';

const appBootPath = STAGED + '/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js';
const dshPath = STAGED + '/node_modules/@deepseek-ai/dsh/lib/profile-boot-BZ2ZjNWi.js';

const appBoot = await import('file:///' + appBootPath.split('\\').join('/'));
const dshBoot = await import('file:///' + dshPath.split('\\').join('/'));

// INSTALL_ANCHOR as the CLI computes it: @deepseek-ai/dsh's own package.json
const { INSTALL_ANCHOR } = await import('file:///' + (STAGED + '/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js').split('\\').join('/')).then(m => ({ INSTALL_ANCHOR: undefined })).catch(() => ({}));
const anchor = new URL('../package.json', 'file:///' + (STAGED + '/node_modules/@deepseek-ai/dsh/lib/profile-boot-BZ2ZjNWi.js').split('\\').join('/'));
import { fileURLToPath } from 'node:url';
const installAnchor = fileURLToPath(anchor);

const profile = appBoot.loadProfile('dsh', 'web', installAnchor, process.env.DSH_HOME, { userLayer: true });
console.log('skipped bundles:', profile.skippedBundles.map(s => s.packageName));

const resolution = await appBoot.createRuntimeResolution({ installAnchor, profile });
const entries = resolution.entries;
console.log('resolution entries:', entries.length);
for (const name of ['@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/schemastery', '@deepseek-ai/cordis', '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/cosmokit', 'react']) {
  const e = entries.find(x => x.name === name);
  console.log(name, '→', e ? `${e.scope} @ ${e.packageDir}` : 'MISSING');
}
console.log('localPackageNames:', resolution.localPackageNames);
