import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const shell = readFileSync(join(root, 'tauri-shell', 'src', 'main.rs'), 'utf8');
const rescue = readFileSync(join(root, 'tauri-shell', 'sidecar', 'rescue-integration.ts'), 'utf8');
const patchDeps = readFileSync(join(root, 'dsh-desktop', 'scripts', 'patch-deps.ts'), 'utf8');
const release = readFileSync(join(root, '.github', 'workflows', 'release-tauri.yml'), 'utf8');
const linuxRelease = release.split('release-tauri-linux:')[1] || '';

test('Tauri setup initializes the packaged resource root before spawning the sidecar', () => {
  assert.match(shell, /app\.path\(\)\.resource_dir\(\)/);
  const setup = shell.indexOf('.setup(move |app|');
  const initialize = shell.indexOf('initialize_packaged_resource_root(app)', setup);
  const spawn = shell.indexOf('Sidecar::spawn().await', setup);
  assert.ok(setup >= 0 && initialize > setup && spawn > initialize,
    'resource_dir must be initialized before the packaged sidecar starts');
});

test('rescue integration resolves both source and packaged sidecar layouts', () => {
  assert.match(rescue, /path\.resolve\(sidecarDir, '\.\.', '\.\.', 'dsh-desktop'\)/);
  assert.match(rescue, /path\.resolve\(sidecarDir, '\.\.', 'dsh-desktop'\)/);
  assert.match(rescue, /resolveDesktopRoot\(\)/);
});

test('Linux releases rebuild the kernel cache from a clean checkout', () => {
  assert.match(linuxRelease, /准备内核依赖缓存[\s\S]*pnpm@11\.7\.0[\s\S]*fetch-kernel\.js/);
});

test('client modules preserve the distinct Node 22 and Node 24 resolver signatures', async () => {
  assert.match(patchDeps, /internal\.version === "v2" \? internal\.resolveSync\(baseUrl, \{/);
  const installed = readFileSync(
    join(root, 'dsh-desktop', 'node_modules', '@deepseek-ai', 'dsh-client-modules', 'lib', 'index.js'),
    'utf8',
  );
  assert.match(installed, /internal\.version === "v2" \? internal\.resolveSync\(baseUrl, \{/);
  assert.match(installed, /specifier: loaderName/);

  const loaderPackage = await import('@deepseek-ai/cordis-plugin-loader') as unknown as {
    ModuleLoader: {
      fromInternal(): {
        version: 'v1' | 'v2';
        resolveSync(...args: unknown[]): { url: string };
      } | undefined;
    };
  };
  const loader = loaderPackage.ModuleLoader.fromInternal();
  assert.ok(loader, `Node ${process.version} must expose the internal module resolver`);
  const parentUrl = pathToFileURL(join(root, 'dsh-desktop', 'package.json')).href;
  const specifier = '@deepseek-ai/dsh-client-modules';
  const resolved = loader.version === 'v2'
    ? loader.resolveSync(parentUrl, { specifier, attributes: {} })
    : loader.resolveSync(specifier, parentUrl, {});
  assert.match(resolved.url, /dsh-client-modules/);
});
