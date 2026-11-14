/**
 * Build apps/web into an isolated output folder (e2e/.app-dist, git-ignored)
 * and serve it with `vite preview`. Used as Playwright's webServer, so the
 * suite always tests a production build of the current sources without
 * touching apps/web/dist.
 *
 *   node scripts/serve.mjs [--no-build]      # port: PERDE_E2E_PORT (default 4317)
 *   PERDE_E2E_OUTDIR=<dir> PERDE_E2E_NO_BUILD=1 node scripts/serve.mjs   # serve an existing build
 *
 * Vite is resolved from apps/web/node_modules (installed by `npm run setup`).
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const e2eRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = resolve(e2eRoot, '..', 'apps', 'web');
const outDir = process.env.PERDE_E2E_OUTDIR ? resolve(process.env.PERDE_E2E_OUTDIR) : join(e2eRoot, '.app-dist');
const port = Number(process.env.PERDE_E2E_PORT ?? 4317);
const skipBuild = process.argv.includes('--no-build') || process.env.PERDE_E2E_NO_BUILD === '1';

const require = createRequire(join(webRoot, 'package.json'));
let vitePath;
try {
  vitePath = require.resolve('vite');
} catch {
  console.error('vite is not installed in apps/web — run `npm run setup` from the repo root first.');
  process.exit(1);
}
const { build, preview } = await import(pathToFileURL(vitePath).href);

if (!skipBuild || !existsSync(join(outDir, 'index.html'))) {
  await build({ root: webRoot, configFile: join(webRoot, 'vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true } });
}
const server = await preview({
  root: webRoot,
  configFile: join(webRoot, 'vite.config.ts'),
  logLevel: 'warn',
  build: { outDir },
  preview: { port, strictPort: true, host: '127.0.0.1', open: false },
});
console.log(`perde e2e preview ready on http://127.0.0.1:${port}/`);

const stop = () => server.httpServer.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
