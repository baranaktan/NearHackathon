// Makes sure packages/core/dist is present and not older than packages/core/src,
// installing and building @perde/core if needed. Child output goes to stderr so
// callers can keep stdout machine-readable (demo --json).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CORE_DIR = join(ROOT, 'packages', 'core');
const DIST_ENTRY = join(CORE_DIR, 'dist', 'index.js');

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

function run(args) {
  // Constant arguments only; one command string avoids Node's DEP0190 warning for shell + args on Windows.
  const command = `npm ${args.join(' ')}`;
  const res = spawnSync(command, { cwd: CORE_DIR, stdio: ['ignore', 2, 2], shell: true });
  if (res.status !== 0) throw new Error(`${command} failed in packages/core (exit ${res.status})`);
}

/** Builds core when dist is missing or stale, then imports it. */
export async function loadCore() {
  const stale = !existsSync(DIST_ENTRY) || statSync(DIST_ENTRY).mtimeMs < newestMtime(join(CORE_DIR, 'src'));
  if (stale) {
    if (!existsSync(join(CORE_DIR, 'node_modules'))) {
      process.stderr.write('[setup] installing @perde/core dependencies (npm ci)…\n');
      run(['ci', '--no-audit', '--no-fund']);
    }
    process.stderr.write('[setup] building @perde/core (packages/core/dist missing or older than src)…\n');
    run(['run', 'build']);
  }
  return import(pathToFileURL(DIST_ENTRY).href);
}
