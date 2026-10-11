import fs = require('node:fs');
import path = require('node:path');

export const PNPM_VERSION = '11.28.2';
export const PNPM_RUNTIME_FILES = ['bin/pnpm.cjs', 'bin/pnpm.mjs', 'dist/pnpm.mjs'];

export interface PackageManagerInvocation {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Use a JS entry, never a .cmd shim or a package manager from the user's PATH. */
export function bundledPackageManager(appRoot: string, node: string): PackageManagerInvocation {
  const root = path.join(appRoot, 'vendor', 'pnpm');
  const entry = path.join(root, 'bin', 'pnpm.cjs');
  let version: unknown;
  try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; }
  catch { throw new Error('Bundled pnpm is missing; rebuild the runtime with npm run fetch-pnpm.'); }
  if (version !== PNPM_VERSION || PNPM_RUNTIME_FILES.some((file) => !fs.existsSync(path.join(root, file)))) {
    throw new Error(`Bundled pnpm must be ${PNPM_VERSION}; rebuild the runtime with npm run fetch-pnpm.`);
  }
  if (!fs.existsSync(node)) throw new Error('Bundled Node runtime is missing.');
  // Pnpm lifecycle commands may invoke node. Put this runtime first without
  // discarding the system tools needed by explicitly approved build scripts.
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const inherited = process.env[pathKey] || '';
  return { command: node, args: [entry], env: { [pathKey]: [path.dirname(node), inherited].filter(Boolean).join(path.delimiter) } };
}


export const NPM_VERSION = '11.21.0';
export const NPM_SECURITY_PINS = {
  'brace-expansion': '5.0.12',
  'http-cache-semantics': '4.3.0',
  'ip-address': '10.7.3',
  'postcss-selector-parser': '7.1.6',
  undici: '6.28.1',
} as const;

/** The npm private tree is not covered by application overrides or root audit. */
export function validateNpmRuntime(root: string): void {
  const fail = (detail: string): never => { throw new Error('Bundled npm is unsafe or incomplete (' + detail + '); run npm run fetch-npm.'); };
  for (const [name, expected] of Object.entries({ npm: NPM_VERSION, ...NPM_SECURITY_PINS })) {
    const packageRoot = name === 'npm' ? root : path.join(root, 'node_modules', name);
    let pkg: { name?: string; version?: string };
    try { pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')); }
    catch { fail(name + ' metadata missing'); }
    if (pkg!.name !== name || pkg!.version !== expected) fail(name + ' must be ' + expected);
  }
  for (const entry of ['bin/npm-cli.js', 'lib/cli.js']) {
    if (!fs.existsSync(path.join(root, entry))) fail(entry + ' missing');
  }
  let cache: string;
  try { cache = fs.readFileSync(path.join(root, 'node_modules/http-cache-semantics/index.js'), 'utf8'); }
  catch { fail('cache implementation missing'); }
  if (!cache!.includes('EAC_CACHE_SECURITY_ZEROED_V1') ||
      !cache!.includes('if (this._securityZeroLifetime()) return this._evaluateRequestMissResult(req);') ||
      cache!.split('if (this._securityZeroLifetime()) return false;').length !== 3) fail('cache security guards missing');
}

export function bundledNpmCli(appRoot: string): string {
  const root = path.join(appRoot, 'vendor', 'npm');
  validateNpmRuntime(root);
  return path.join(root, 'bin', 'npm-cli.js');
}
