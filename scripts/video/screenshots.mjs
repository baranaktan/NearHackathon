/**
 * README screenshots of real app states with real testnet data, written to
 * docs/screenshots/ as optimised PNGs (sharp, ≤ ~400 KB each).
 *
 *   npm run demo:screenshots              # after a successful `npm run demo:video`
 *   node scripts/video/screenshots.mjs --no-build
 *
 * It continues from the last successful video take's browser state (identity,
 * history; scripts/video/.state/), so the Inbox shows real payments. It sends
 * two small transactions of its own (a payroll batch to its own meta-address and
 * a DAO payout proposal + approval), then sweeps every payment back to the demo
 * wallet. Nothing secret is captured: the recovery phrase is never revealed and
 * no page that shows the wallet key is opened.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serveStatic } from './lib/serve.mjs';
import { T, buildApp, rebase, distDir, loadDemoAccount, near, prepareContext, readLedger, saveTakeState, shotsOut, sweep, walletBalance, writeLedger } from './lib/app.mjs';

const args = process.argv.slice(2);
const MAX_BYTES = 400 * 1024;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

if (!args.includes('--no-build') || !existsSync(join(distDir, 'index.html'))) buildApp();
const account = await loadDemoAccount();
const ledger = await readLedger();
const takeEntry = [...ledger.takes].reverse().find((t) => t.ok && !t.dry && t.state && existsSync(t.state));
if (!takeEntry) throw new Error('no successful video take state found; run `npm run demo:video` first');
console.log(`[shots] continuing from ${takeEntry.name}`);
const storageFile = takeEntry.state;

await mkdir(shotsOut, { recursive: true });
const server = await serveStatic(distDir);
const base = server.url;
const browser = await chromium.launch({ headless: !args.includes('--headed') });
const before = await walletBalance(account.accountId);
const written = [];

async function save(page, name, { fullPage = false, clip } = {}) {
  // Close the app's transient toasts so they do not cover the state being shown.
  for (const b of await page.getByRole('button', { name: 'Dismiss notification' }).all()) await b.click().catch(() => {});
  await page.waitForTimeout(500);
  const buf = await page.screenshot({ fullPage, clip, animations: 'disabled', caret: 'hide' });
  const meta = await sharp(buf).metadata();
  let out;
  for (const colours of [256, 192, 128, 96]) {
    out = await sharp(buf).png({ palette: true, colours, quality: 95, effort: 10, compressionLevel: 9, dither: 0.6 }).toBuffer();
    if (out.length <= MAX_BYTES) break;
  }
  if (out.length > MAX_BYTES) {
    // Last resort: scale down until it fits.
    let w = meta.width;
    while (out.length > MAX_BYTES && w > 600) {
      w = Math.round(w * 0.85);
      out = await sharp(buf).resize({ width: w }).png({ palette: true, colours: 128, effort: 10, compressionLevel: 9 }).toBuffer();
    }
  }
  const file = join(shotsOut, `${name}.png`);
  await writeFile(file, out);
  const m2 = await sharp(out).metadata();
  written.push({ name, w: m2.width, h: m2.height, kb: Math.round(out.length / 1024) });
  console.log(`[shots] ${name}.png ${m2.width}×${m2.height} ${Math.round(out.length / 1024)} KB`);
}

async function newCtx(viewport, theme, storageState) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width < 500 ? 2 : 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
    storageState,
  });
  await prepareContext(ctx, { theme });
  return ctx;
}

const go = (page, hash) => page.goto(`${base}#${hash}`, { waitUntil: 'domcontentloaded' });
const settle = (page) => page.evaluate(() => document.fonts.ready.then(() => true));

let exit = 0;
let storage = rebase(JSON.parse(await readFile(storageFile, 'utf8')), base);
try {
  const ctx = await newCtx(DESKTOP, 'dark', storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));

  // Landing, hero with "With Perde".
  await go(page, '/');
  await page.getByRole('heading', { name: /Pay anyone/ }).waitFor();
  await page.getByRole('tab', { name: 'With Perde' }).click();
  await page.getByText(/Behind the curtain/).waitFor();
  await settle(page);
  await save(page, 'landing');

  await go(page, '/app/start');
  await page.getByRole('heading', { name: 'See it work in a minute' }).waitFor();
  await save(page, 'guided-demo');

  // Send → review (nothing is sent).
  await go(page, '/app/send');
  await page.getByRole('button', { name: 'Pay myself' }).click();
  await page.getByLabel('Amount').fill('0.05');
  await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.hasAttribute('disabled'), null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('heading', { name: 'Review' }).waitFor();
  await save(page, 'send-review');
  // Send it: 0.05 NEAR is enough for the Inbox to offer "Pay someone from here" (swept back at the end).
  await page.getByRole('button', { name: 'Confirm and send' }).click();
  await page.getByRole('heading', { name: 'Paid. The curtain stays closed.' }).waitFor({ timeout: T.tx });

  // Payroll: the sample batch, sent in one transaction.
  await go(page, '/app/payroll');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByText('2 ready').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Review batch' }).click();
  await page.getByRole('button', { name: 'Send 2 payments' }).click();
  await page.getByText('2 of 2 paid in one transaction.').waitFor({ timeout: T.tx });
  await save(page, 'payroll', { fullPage: true });

  // DAO payout: propose + approve.
  await go(page, '/app/dao');
  await page.getByText(/proposals so far/).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Propose payout' }).click();
  await page.getByRole('button', { name: 'Approve & execute' }).waitFor({ timeout: T.tx });
  await page.getByRole('button', { name: 'Approve & execute' }).click();
  await page.getByText('Executed: the DAO paid a fresh account.').waitFor({ timeout: T.tx });
  await page.evaluate(() => window.scrollTo(0, 0));
  await save(page, 'dao-payout', { clip: { x: 0, y: 0, width: 1440, height: 1240 }, fullPage: true });

  // Inbox with real payments, the chain view, and the pay-onward form.
  await go(page, '/app/inbox');
  await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  await page.getByRole('button', { name: 'Pay someone from here' }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await save(page, 'inbox', { fullPage: true });

  const row = page.locator('li', { has: page.getByRole('button', { name: 'Pay someone from here' }) }).first();
  await row.getByRole('button', { name: 'Chain view' }).click();
  await page.getByRole('dialog').getByText(/Announcement #\d+/).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await save(page, 'chain-view');
  await page.keyboard.press('Escape');

  await row.getByRole('button', { name: 'Pay someone from here' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'My own address' }).click();
  await dlg.getByLabel('Amount').fill('0.01');
  await dlg.getByText('Recipient receives').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await save(page, 'pay-onward');
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // Invoice with a real 1Click dry quote (USDC on Ethereum).
  await go(page, '/app/invoice');
  await page.getByLabel(/^Amount/).fill('0.5');
  await page.getByLabel(/^Note/).fill('Design work, November');
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.getByText(/^Invoice #\d+$/).first().waitFor();
  const combo = page.getByRole('combobox');
  await combo.click();
  await combo.fill('USDC eth');
  await page.getByRole('option', { name: /USDC.*Ethereum/ }).first().click();
  await page.getByRole('button', { name: 'Get quote' }).click();
  await page.getByText('Payer sends about').waitFor({ timeout: T.quote });
  await save(page, 'invoice-any-chain', { fullPage: true });

  // Audit with the viewing key.
  await go(page, '/app/audit');
  await page.getByRole('button', { name: 'Use my viewing key' }).click();
  await page.getByRole('button', { name: 'Open read-only view' }).click();
  await page.getByText(/payments · received/).waitFor({ timeout: T.scan });
  await save(page, 'audit', { fullPage: true });

  storage = await ctx.storageState();
  await ctx.close();

  // Light landing.
  const light = await newCtx(DESKTOP, 'light', storage);
  const lp = await light.newPage();
  await go(lp, '/');
  await lp.getByRole('heading', { name: /Pay anyone/ }).waitFor();
  await lp.getByRole('tab', { name: 'With Perde' }).click();
  await lp.getByText(/Behind the curtain/).waitFor();
  await settle(lp);
  await save(lp, 'landing-light');
  await light.close();

  // Mobile (390 CSS px wide, 2× pixels).
  const mob = await newCtx(MOBILE, 'dark', storage);
  const mp = await mob.newPage();
  await go(mp, '/app/inbox');
  await mp.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  await mp.getByRole('button', { name: /Claim to…|Pay someone from here/ }).first().waitFor({ timeout: 30_000 });
  await mp.waitForTimeout(1200);
  await save(mp, 'mobile-inbox');
  await go(mp, '/app/invoice');
  await mp.getByText(/^Invoice #\d+$/).first().waitFor({ timeout: 30_000 });
  await mp.waitForTimeout(1500);
  await save(mp, 'mobile-invoice');
  storage = await mob.storageState();
  await mob.close();
  if (problems.length) console.log(`[shots] page errors: ${problems.join(' | ')}`);
} catch (e) {
  exit = 1;
  console.error(`SCREENSHOTS FAILED: ${e.message}`);
} finally {
  const stateFile = await saveTakeState(`${takeEntry.name}-shots`, storage);
  try {
    const st = await sweep(browser, base, stateFile);
    await saveTakeState(`${takeEntry.name}-shots`, st);
    ledger.takes.push({ name: `${takeEntry.name}-shots`, dry: false, ok: exit === 0, state: stateFile, swept: true, startedAt: new Date().toISOString() });
    await writeLedger(ledger);
  } catch (e) {
    console.error(`[sweep] failed: ${e.message.split('\n')[0]} — run record-demo.mjs --sweep`);
  }
  await browser.close();
  await server.close();
}
const after = await walletBalance(account.accountId);
if (before !== null && after !== null) console.log(`[wallet] ${near(before)} → ${near(after)} NEAR (net ${near(after - before, 5)})`);
console.table(written);
process.exit(exit);
