/**
 * Visual QA: builds the app, serves dist/ on a free local port, and saves
 * full-page PNGs of every route × {desktop, mobile} × {dark, light} into
 * screenshots/. Extra captures cover every preview state and the in-between
 * widths. The server is always stopped at the end.
 *
 *   node scripts/screenshots.mjs            # build + capture
 *   node scripts/screenshots.mjs --no-build # reuse dist/
 *   node scripts/screenshots.mjs --only=landing,send
 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const outDir = join(root, 'screenshots');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');

if (!args.includes('--no-build')) execSync('npm run build', { cwd: root, stdio: 'inherit' });
await mkdir(outDir, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = normalize(join(dist, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dist)) throw new Error('outside dist');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/`;
console.log(`serving dist on ${base}`);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
  small: { width: 360, height: 740 },
};

const ROUTES = [
  ['landing', '/'],
  ['receive', '/app/receive?state=ready'],
  ['send', '/app/send'],
  ['inbox', '/app/inbox'],
  ['invoice', '/app/invoice'],
  ['payroll', '/app/payroll'],
  ['audit', '/app/audit?state=done'],
  ['verify', '/app/verify?state=verified'],
  ['settings', '/app/settings'],
  ['kit', '/kit'],
];

const STATES = {
  receive: ['none', 'created', 'registered', 'loading', 'error'],
  send: ['review', 'submitting', 'success', 'error', 'no-sender'],
  inbox: ['scanning', 'empty', 'error', 'no-identity'],
  invoice: ['paid', 'quote-loading', 'quote-error', 'empty'],
  payroll: ['review', 'submitting', 'done', 'error', 'empty'],
  audit: ['idle', 'scanning', 'empty', 'error'],
  verify: ['idle', 'verifying', 'failed', 'invalid'],
  settings: ['missing', 'funding', 'error'],
};

const browser = await chromium.launch();
let count = 0;
const problems = [];

async function capture({ name, path, viewport, theme, setup }) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: viewport === 'desktop' || viewport === 'tablet' ? 1 : 2,
    reducedMotion: 'reduce',
    colorScheme: theme,
  });
  await context.addInitScript((t) => localStorage.setItem('perde-theme', t), theme);
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name}: console ${m.text()}`));
  await page.goto(`${base}#${path}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (setup) await setup(page);
  await page.waitForTimeout(350);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${name} [${viewport}/${theme}]: horizontal overflow ${overflow}px`);
  await page.screenshot({ path: join(outDir, `${name}--${viewport}--${theme}.png`), fullPage: true });
  count++;
  await context.close();
}

try {
  for (const [name, path] of ROUTES) {
    if (only && !only.includes(name)) continue;
    for (const viewport of ['desktop', 'mobile']) {
      for (const theme of ['dark', 'light']) await capture({ name, path, viewport, theme });
    }
  }
  if (!only || only.includes('landing')) {
    const toggle = async (page) => {
      await page.getByRole('tab', { name: 'With Perde' }).click();
      await page.waitForTimeout(500);
    };
    for (const viewport of ['desktop', 'mobile']) {
      await capture({ name: 'landing-with-perde', path: '/', viewport, theme: 'dark', setup: toggle });
      await capture({ name: 'landing-with-perde', path: '/', viewport, theme: 'light', setup: toggle });
    }
    for (const viewport of ['tablet', 'small']) await capture({ name: 'landing', path: '/', viewport, theme: 'dark' });
  }
  for (const [name, states] of Object.entries(STATES)) {
    if (only && !only.includes(name)) continue;
    for (const s of states) await capture({ name: `${name}-${s}`, path: `/app/${name}?state=${s}`, viewport: 'desktop', theme: 'dark' });
    for (const s of states.slice(0, 2)) await capture({ name: `${name}-${s}`, path: `/app/${name}?state=${s}`, viewport: 'small', theme: 'light' });
    await capture({ name, path: `/app/${name}`, viewport: 'tablet', theme: 'dark' });
  }
  if (!only || only.includes('overlays')) {
    await capture({
      name: 'send-chainview',
      path: '/app/send?state=success',
      viewport: 'desktop',
      theme: 'dark',
      setup: (p) => p.getByRole('button', { name: 'Chain view' }).click(),
    });
    await capture({
      name: 'inbox-claim',
      path: '/app/inbox',
      viewport: 'mobile',
      theme: 'dark',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Claim to…' }).first().click();
        await p.getByRole('button', { name: /perde-demo-alice/ }).click();
      },
    });
    await capture({ name: 'mobile-more', path: '/app/inbox', viewport: 'mobile', theme: 'light', setup: (p) => p.getByRole('button', { name: 'More' }).click() });
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`saved ${count} screenshots to ${outDir}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(' - ' + p);
  process.exitCode = 1;
}
