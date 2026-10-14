'use strict';

import fs = require('node:fs');
import path = require('node:path');
import cp = require('node:child_process');
import crypto = require('node:crypto');
import { NPM_VERSION, NPM_SECURITY_PINS, validateNpmRuntime } from '../lib/desktop/package-manager';
const { patchHttpCacheSemantics } = require('./patch-deps') as { patchHttpCacheSemantics(target: string): boolean };

export function findBundledNpm(nodeExecPath: string): string | null {
  const nodeDir = path.dirname(nodeExecPath);
  return [path.join(nodeDir, 'node_modules', 'npm'), path.resolve(nodeDir, '..', 'lib', 'node_modules', 'npm')]
    .find(candidate => fs.existsSync(path.join(candidate, 'bin', 'npm-cli.js'))) || null;
}

type LockEntry = { version?: string; integrity?: string; link?: boolean };

function buildInputs(root: string): { lockBytes: Buffer; packages: Record<string, LockEntry>; npmIntegrity: string } {
  const expected = { npm: NPM_VERSION, ...NPM_SECURITY_PINS };
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockBytes = fs.readFileSync(path.join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  for (const deps of [manifest.dependencies, lock.packages?.['']?.dependencies]) {
    if (!deps || Object.keys(deps).length !== Object.keys(expected).length ||
        Object.entries(expected).some(([name, version]) => deps[name] !== version)) {
      throw new Error('npm runtime build manifest/lock differs from the reviewed security pins');
    }
  }
  const npmEntry = lock.packages?.['node_modules/npm'];
  if (npmEntry?.version !== NPM_VERSION || typeof npmEntry.integrity !== 'string') {
    throw new Error('npm runtime source integrity/version is missing from the lock');
  }
  return { lockBytes, packages: lock.packages, npmIntegrity: npmEntry.integrity };
}

/** npm ships bundled dependencies that ignore outer overrides; replace the reviewed closure explicitly. */
export function copyBundledNpm(buildRoot: string, destination: string): void {
  const source = fs.realpathSync(buildRoot);
  const dest = path.resolve(destination);
  const overlaps = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  };
  if (overlaps(dest, source) || overlaps(source, dest)) {
    throw new Error('npm runtime destination must not contain its build source');
  }
  const inputs = buildInputs(source);
  const nm = path.join(source, 'node_modules');
  const entries = Object.entries(inputs.packages).filter(([location]) => /^node_modules\/(?:@[^/]+\/)?[^/]+$/.test(location));
  for (const [location, entry] of entries) {
    const pkg = JSON.parse(fs.readFileSync(path.join(source, location, 'package.json'), 'utf8'));
    if (entry.link || !entry.integrity || pkg.name !== location.slice('node_modules/'.length) || pkg.version !== entry.version) {
      throw new Error('npm runtime installed input does not match its lock: ' + location);
    }
  }
  if (fs.existsSync(dest) && (!fs.lstatSync(dest).isDirectory() || fs.lstatSync(dest).isSymbolicLink())) {
    throw new Error('npm runtime destination must be a real managed directory');
  }
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.npm-stage-'));
  const backup = path.join(parent, '.npm-previous-' + crypto.randomUUID());
  if (path.dirname(staging) !== parent || path.dirname(backup) !== parent) throw new Error('npm runtime managed path escaped');
  let movedPrevious = false;
  try {
    fs.cpSync(path.join(nm, 'npm'), staging, { recursive: true });
    const overlays: Record<string, string> = {};
    for (const [location, entry] of entries) {
      const name = location.slice('node_modules/'.length);
      if (name === 'npm') continue;
      const target = path.join(staging, location);
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(path.join(source, location), target, { recursive: true });
      overlays[name] = entry.version!;
    }
    patchHttpCacheSemantics(path.join(staging, 'node_modules/http-cache-semantics/index.js'));
    validateNpmRuntime(staging);
    fs.writeFileSync(path.join(staging, 'eac-runtime.json'), JSON.stringify({
      schemaVersion: 1, npmVersion: NPM_VERSION,
      sourceIntegrity: inputs.npmIntegrity,
      buildLockSha256: crypto.createHash('sha256').update(inputs.lockBytes).digest('hex'),
      replacements: overlays, cachePatch: 'EAC_CACHE_SECURITY_ZEROED_V1',
    }, null, 2) + '\n');
    if (fs.existsSync(dest)) { fs.renameSync(dest, backup); movedPrevious = true; }
    try { fs.renameSync(staging, dest); }
    catch (error) {
      if (movedPrevious && !fs.existsSync(dest)) fs.renameSync(backup, dest);
      throw error;
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  if (movedPrevious) {
    try { fs.rmSync(backup, { recursive: true, force: true }); }
    catch { console.warn('npm runtime is ready; its locked previous build was retained for cleanup.'); }
  }
}

function main(): void {
  const root = path.resolve(__dirname, '..');
  const buildRoot = path.join(__dirname, 'npm-runtime');
  buildInputs(buildRoot);
  const npmRoot = findBundledNpm(process.execPath);
  const bootstrap = process.env.npm_execpath || (npmRoot && path.join(npmRoot, 'bin', 'npm-cli.js'));
  if (!bootstrap || !fs.existsSync(bootstrap)) throw new Error('A build-time npm CLI is required to hydrate the integrity-locked runtime.');
  const result = cp.spawnSync(process.execPath, [bootstrap, 'ci', '--prefix', buildRoot, '--ignore-scripts', '--no-audit', '--no-fund'], {
    stdio: 'inherit', windowsHide: true, timeout: 300_000,
  });
  if (result.error || result.status !== 0) throw result.error || new Error('npm runtime dependency installation failed: ' + result.status);
  copyBundledNpm(buildRoot, path.join(root, 'vendor', 'npm'));
  console.log('Bundled npm@' + NPM_VERSION + ' with reviewed, integrity-locked security replacements.');
}

if (require.main === module) main();
