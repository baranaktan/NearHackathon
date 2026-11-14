/**
 * Lighthouse against the production preview (vite preview of a fresh build).
 *
 *   npm --prefix e2e run lighthouse -- [--label after] [--dist <existing build dir>] [--runs 3] [--html]
 *
 * Audits `/` and `/#/app/start` with Lighthouse's mobile (default) and desktop
 * presets in Playwright's Chromium, and writes a small summary
 * (docs/qa/lighthouse/summary-<label>.json: category scores, core metrics,
 * failing audits; median of --runs). With --html it also saves the full HTML
 * report of the landing page (mobile + desktop) for the last run.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';

const e2eRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(e2eRoot, '..', 'docs', 'qa', 'lighthouse');
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const label = arg('--label', 'latest');
const dist = arg('--dist', null);
const runs = Number(arg('--runs', '1'));
const port = Number(process.env.PERDE_LH_PORT ?? 4319);

const env = { ...process.env, PERDE_E2E_PORT: String(port) };
if (dist) Object.assign(env, { PERDE_E2E_OUTDIR: resolve(dist), PERDE_E2E_NO_BUILD: '1' });
const server = spawn(process.execPath, [join(e2eRoot, 'scripts', 'serve.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => String(d).includes('ready on') && ok());
  server.once('exit', (c) => fail(new Error(`preview exited ${c}`)));
});
const base = `http://127.0.0.1:${port}/`;

const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-first-run', '--disable-extensions'] });
const pages = [
  ['landing', base],
  ['app-start', `${base}#/app/start`],
];
const presets = [
  ['mobile', undefined],
  ['desktop', desktopConfig],
];
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
const METRICS = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive'];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const summary = { label, ranAt: new Date().toISOString(), lighthouse: null, runsPerPage: runs, chromium: chromium.executablePath().split(/[\/]/).slice(-3).join('/'), results: {} };
try {
  for (const [name, url] of pages) {
    for (const [preset, config] of presets) {
      const all = [];
      let last;
      for (let i = 0; i < runs; i++) {
        const r = await lighthouse(url, { port: chrome.port, output: ['json', 'html'], logLevel: 'error' }, config);
        last = r;
        all.push(r.lhr);
      }
      const lhr = all[all.length - 1];
      summary.lighthouse = lhr.lighthouseVersion;
      const scores = Object.fromEntries(CATS.map((c) => [c, Math.round(median(all.map((l) => l.categories[c].score)) * 100)]));
      const metrics = Object.fromEntries(METRICS.map((m) => [m, lhr.audits[m]?.displayValue ?? null]));
      const failing = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual')
        .map((a) => ({ id: a.id, score: a.score, title: a.title, displayValue: a.displayValue ?? undefined }));
      summary.results[`${name}/${preset}`] = { url: url.replace(base, '/'), scores, allRuns: all.map((l) => Object.fromEntries(CATS.map((c) => [c, Math.round(l.categories[c].score * 100)]))), metrics, failing };
      console.log(`${name.padEnd(10)} ${preset.padEnd(8)} ${CATS.map((c) => `${c}=${scores[c]}`).join(' ')}  LCP ${metrics['largest-contentful-paint']} CLS ${metrics['cumulative-layout-shift']} TBT ${metrics['total-blocking-time']}`);
      if (args.includes('--html') && name === 'landing') {
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, `landing-${preset}-${label}.html`), last.report[1]);
      }
    }
  }
} finally {
  await chrome.kill();
  server.kill();
}
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, `summary-${label}.json`), JSON.stringify(summary, null, 2) + '\n');
console.log(`wrote ${join(outDir, `summary-${label}.json`)}`);
