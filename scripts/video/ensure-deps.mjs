// Installs scripts/video's own dev dependencies (Playwright, ffmpeg-static,
// sharp) from its lockfile when they are missing, and checks that apps/web's
// dependencies (vite) are installed, since the recorder builds the app.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const need = ['playwright', 'ffmpeg-static', 'sharp'].filter((p) => !existsSync(join(here, 'node_modules', p, 'package.json')));

if (need.length) {
  console.error(`[video] installing ${need.join(', ')} into scripts/video (npm ci)…`);
  const res = spawnSync('npm ci --no-audit --no-fund', { cwd: here, stdio: ['ignore', 2, 2], shell: true });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
if (!existsSync(join(root, 'apps', 'web', 'node_modules', 'vite'))) {
  console.error('[video] apps/web dependencies are missing: run "npm run setup" first.');
  process.exit(1);
}
// Chromium for this Playwright version (a no-op when it is already in the shared cache).
const pw = spawnSync('npx playwright install chromium', { cwd: here, stdio: ['ignore', 2, 2], shell: true });
if (pw.status !== 0) process.exit(pw.status ?? 1);
