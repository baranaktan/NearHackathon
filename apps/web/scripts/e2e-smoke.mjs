/**
 * Real-browser end-to-end smoke test against NEAR testnet.
 *
 * Builds the app (unless --no-build), serves it with `vite preview` on a free
 * port, injects an EXISTING funded testnet account into the app's storage (no
 * faucet call), and drives the real flows with Playwright:
 *   identity → send 0.05 NEAR to own meta-address → inbox finds it → chain view
 *   → pay 0.02 onward from the stealth account to own meta-address → inbox finds
 *   the new payment → claim both back → invoice → pay it from #/pay → inbox shows it → dry quote →
 *   payroll sample (2) → DAO payout (propose + approve) → inbox finds it →
 *   audit with viewing key → verify the receipt → claim the invoice back.
 * Screenshots go to screenshots/wired/. Every transaction link is printed, with
 * RPC requests per step. Exits non-zero if any step fails OR the browser logged
 * a console error/warning, a page error, or the layout overflowed horizontally.
 *
 *   PERDE_FUNDER_JSON=/path/to/funder.json node scripts/e2e-smoke.mjs [--no-build] [--headed]
 *   node scripts/e2e-smoke.mjs --no-build --faucet-check   # one real faucet account via the UI
 *
 * The funder file is JSON {accountId, secretKey}; default path:
 * ../../packages/core/node_modules/.cache/perde-testnet/funder.json (throwaway
 * testnet key cached by core's testnet tests). The key is never printed.
 */
import { createServer } from 'node:net';
import { execSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'screenshots', 'wired');
const args = process.argv.slice(2);
const funderPath = process.env.PERDE_FUNDER_JSON ?? join(root, '..', '..', 'packages', 'core', 'node_modules', '.cache', 'perde-testnet', 'funder.json');

const funder = args.includes('--faucet-check') ? null : JSON.parse(await readFile(funderPath, 'utf8'));
if (funder && (typeof funder.accountId !== 'string' || typeof funder.secretKey !== 'string' || !funder.secretKey.startsWith('ed25519:'))) {
  throw new Error(`funder file ${funderPath} must hold {accountId, secretKey}`);
}

if (!args.includes('--no-build')) execSync('npm run build', { cwd: root, stdio: 'inherit' });
await mkdir(outDir, { recursive: true });
// A failure capture from an earlier run would be mistaken for this run's.
await rm(join(outDir, 'zz-failure.png'), { force: true });

const port = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const server = await preview({ root, logLevel: 'error', preview: { port, strictPort: true, host: '127.0.0.1', open: false } });
const base = `http://127.0.0.1:${port}/`;
console.log(`vite preview on ${base}`);

/*
 * --faucet-check: ONE real "Create a funded testnet account" click in a fresh
 * browser (uses one of the faucet's ~10 accounts per 12 h per IP), then exit.
 * Reports the created account or the exact error the UI shows.
 */
if (args.includes('--faucet-check')) {
  const b = await chromium.launch();
  let code = 0;
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
    await pg.goto(`${base}#/app/settings`, { waitUntil: 'domcontentloaded' });
    await pg.getByRole('button', { name: 'Create & fund' }).click();
    const ok = pg.getByText('Demo wallet ready').first();
    const failed = pg.getByRole('alert').filter({ hasText: /faucet/i }).first();
    await Promise.race([ok.waitFor({ timeout: 90_000 }), failed.waitFor({ timeout: 90_000 })]);
    if (await ok.isVisible()) {
      const state = JSON.parse(await pg.evaluate(() => localStorage.getItem('perde:state')));
      console.log(`faucet: created ${state.wallet.accountId}`);
      await pg.getByText(/available · updated/).waitFor({ timeout: 30_000 });
    } else {
      code = 2;
      console.log(`faucet: UI error → ${(await failed.innerText()).replace(/\s+/g, ' ')}`);
    }
    await mkdir(outDir, { recursive: true });
    await pg.screenshot({ path: join(outDir, '00-faucet-check--desktop-dark.png'), fullPage: true });
    console.log(`console errors/warnings: ${errs.length}`);
    for (const e of errs) console.log(' - ' + e);
  } finally {
    await b.close();
    await new Promise((r) => server.httpServer.close(r));
  }
  process.exit(code);
}

const initialState = {
  v: 1,
  wallet: { accountId: funder.accountId, secretKey: funder.secretKey, source: 'import', addedAtMs: Date.now() },
  identity: null,
  invoices: [],
  nextInvoiceIndex: 0,
  sent: [],
  claims: {},
  scan: null,
  demo: { dismissed: false, chainViewSeen: false, quoteSeen: false, daoPaid: false },
};

const consoleProblems = [];
const links = [];
const shots = [];
/** RPC traffic per step: {step: {total, byHost: {host: n}, byMethod: {method: n}, failed: n, non2xx: n}}. */
const rpcStats = {};
let currentStep = 'start';
const log = (step, msg) => {
  currentStep = step;
  console.log(`[${step}] ${msg}`);
};
const RPC_HOSTS = /fastnear\.com|drpc\.org|near\.org|intea\.rs|zan\.top/;
function rpcMethod(req) {
  try {
    const body = JSON.parse(req.postData() ?? '{}');
    if (body.method === 'query') return `query:${body.params?.request_type ?? '?'}${body.params?.method_name ? '.' + body.params.method_name : ''}`;
    return body.method ?? '?';
  } catch {
    return '?';
  }
}
function stepStats() {
  rpcStats[currentStep] ??= { total: 0, byHost: {}, byMethod: {}, failed: 0, non2xx: 0 };
  return rpcStats[currentStep];
}
const link = (label, href) => {
  links.push({ label, href });
  console.log(`  ↳ ${label}: ${href}`);
};

const browser = await chromium.launch({ headless: !args.includes('--headed') });

function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push(`${tag}: [${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleProblems.push(`${tag}: [pageerror] ${e.message}`));
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !RPC_HOSTS.test(new URL(req.url()).host)) return;
    const s = stepStats();
    const host = new URL(req.url()).host;
    const m = rpcMethod(req);
    s.total++;
    s.byHost[host] = (s.byHost[host] ?? 0) + 1;
    s.byMethod[m] = (s.byMethod[m] ?? 0) + 1;
  });
  page.on('requestfailed', (req) => {
    if (RPC_HOSTS.test(new URL(req.url()).host) && req.method() === 'POST') stepStats().failed++;
  });
  page.on('response', (res) => {
    if (RPC_HOSTS.test(new URL(res.url()).host) && res.request().method() === 'POST' && res.status() >= 300) stepStats().non2xx++;
  });
}

async function newContext(viewport, theme, storageState) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width < 500 ? 2 : 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(
    ([t, state]) => {
      localStorage.setItem('perde-theme', t);
      if (state && !localStorage.getItem('perde:state')) localStorage.setItem('perde:state', state);
    },
    [theme, storageState ? null : JSON.stringify(initialState)],
  );
  return context;
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) consoleProblems.push(`${name}: horizontal overflow ${overflow}px`);
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  shots.push(file);
}

const go = (page, hash) => page.goto(`${base}#${hash}`, { waitUntil: 'domcontentloaded' });
const T = { tx: 90_000, scan: 120_000 };

let exitCode = 0;
let receipt;
let payLink;
const desktop = { width: 1440, height: 900 };

try {
  const ctx = await newContext(desktop, 'dark');
  const page = await ctx.newPage();
  watch(page, 'desktop');

  // 0. Guided demo with the injected wallet.
  log('start', 'guided demo page');
  await go(page, '/app/start');
  await page.getByRole('heading', { name: 'See it work in a minute' }).waitFor();
  await shot(page, '01-guided-demo--desktop-dark');

  // 1. Identity.
  log('identity', 'create + confirm');
  await go(page, '/app/receive');
  await page.getByRole('button', { name: 'Create identity' }).click();
  await page.getByRole('button', { name: 'Reveal recovery phrase' }).click();
  await shot(page, '02-receive-phrase--desktop-dark');
  await page.getByLabel('I have stored these words somewhere safe and offline.').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Meta-address', { exact: true }).waitFor();
  await page.getByText(/Register under|Registered/).first().waitFor({ timeout: 20_000 });
  await shot(page, '03-receive-ready--desktop-dark');

  // 2. Send 0.05 NEAR to own meta-address.
  log('send', '0.05 NEAR to own meta-address');
  await go(page, '/app/send');
  await page.getByRole('button', { name: 'Pay myself' }).click();
  await page.getByLabel('Amount').fill('0.05');
  const review = page.getByRole('button', { name: 'Review payment' });
  await review.waitFor();
  await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.hasAttribute('disabled'), null, { timeout: 30_000 });
  await review.click();
  await page.getByRole('heading', { name: 'Review' }).waitFor();
  await shot(page, '04-send-review--desktop-dark');
  await page.getByRole('button', { name: 'Confirm and send' }).click();
  await page.getByRole('heading', { name: 'Paid. The curtain stays closed.' }).waitFor({ timeout: T.tx });
  receipt = await page.locator('textarea[readonly]').inputValue();
  link('send tx', await page.getByRole('link', { name: /View transaction/ }).first().getAttribute('href'));
  await shot(page, '05-send-success--desktop-dark');

  // 3. Inbox finds it.
  log('inbox', 'scan');
  await go(page, '/app/inbox');
  await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  await page.getByRole('button', { name: 'Claim to…' }).first().waitFor({ timeout: 30_000 });
  await shot(page, '06-inbox-found--desktop-dark');

  // 4. Chain view of that payment.
  log('chain', 'chain view');
  await page.getByRole('button', { name: 'Chain view' }).nth(1).click();
  await page.getByText(/Announcement #\d+/).first().waitFor({ timeout: 30_000 });
  await shot(page, '07-chain-view--desktop-dark');
  await page.keyboard.press('Escape');

  // 5. Pay 0.02 NEAR onward from that stealth account to our own meta-address: the stealth key signs, the wallet never appears.
  log('onward', 'pay 0.02 NEAR onward from the stealth account to own meta-address');
  const hex64 = (titles) => titles.filter((t) => /^[0-9a-f]{64}$/.test(t ?? ''));
  const rowOf = (id) => page.locator('li', { has: page.locator(`[title="${id}"]`) }).first();
  const firstRow = page.locator('li', { has: page.getByRole('button', { name: 'Pay someone from here' }) }).first();
  const firstStealth = hex64(await firstRow.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title'))))[0];
  if (!firstStealth) throw new Error('no stealth account on the first inbox row');
  await firstRow.getByRole('button', { name: 'Pay someone from here' }).click();
  const onwardDialog = page.getByRole('dialog');
  await onwardDialog.getByRole('button', { name: 'My own address' }).click();
  await onwardDialog.getByLabel('Amount').fill('0.02');
  await onwardDialog.getByText('Recipient receives').waitFor({ timeout: 30_000 });
  await shot(page, '08a-onward-form--desktop-dark');
  await onwardDialog.getByRole('button', { name: 'Review payment' }).click();
  await onwardDialog.getByRole('button', { name: 'Confirm and pay' }).waitFor();
  await shot(page, '08b-onward-review--desktop-dark');
  await onwardDialog.getByRole('button', { name: 'Confirm and pay' }).click();
  await onwardDialog.getByText('Still nothing links it to you.').waitFor({ timeout: T.tx });
  link('onward tx', await onwardDialog.getByRole('link', { name: /View transaction/ }).first().getAttribute('href'));
  const onwardStealth = hex64(await onwardDialog.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title')))).find((t) => t !== firstStealth);
  if (!onwardStealth) throw new Error('the onward payment did not show its fresh account');
  const settlement = await onwardDialog
    .locator('dl', { hasText: 'Stays in this stealth account' })
    .innerText({ timeout: 5000 })
    .catch(() => '(leftover not shown)');
  log('onward', settlement.replace(/\s+/g, ' '));
  await shot(page, '08c-onward-done--desktop-dark');
  await onwardDialog.getByRole('button', { name: 'Done' }).click();

  // 6. The onward payment shows up in the Inbox as a new payment (rescan runs after paying yourself).
  log('onward', `inbox finds the onward payment ${onwardStealth.slice(0, 8)}…`);
  await page.locator(`[title="${onwardStealth}"]`).first().waitFor({ timeout: T.scan });
  await rowOf(firstStealth).getByText('Partly paid onward').waitFor({ timeout: 30_000 });
  await shot(page, '08d-inbox-after-onward--desktop-dark');
  await rowOf(firstStealth).getByRole('button', { name: 'Chain view' }).click();
  await page.getByText('Paid onward · signed by the stealth account itself').first().waitFor({ timeout: 30_000 });
  await shot(page, '08e-chain-view-onward--desktop-dark');
  await page.keyboard.press('Escape');

  // 7. Claim both back to the wallet (full sweeps): the remainder of the first payment, then the onward one.
  log('claim', 'full sweep of the remainder to the demo wallet');
  await rowOf(firstStealth).getByRole('button', { name: 'Claim the rest…' }).click();
  await page.getByText('Destination receives about').waitFor({ timeout: 30_000 });
  await shot(page, '08-claim-dialog--desktop-dark');
  await page.getByRole('dialog').getByRole('button', { name: 'Claim', exact: true }).click();
  await rowOf(firstStealth).getByText(/^Claimed .* to /).waitFor({ timeout: T.tx });
  link('claim tx (remainder)', await rowOf(firstStealth).getByRole('link', { name: /Claim tx/ }).getAttribute('href'));
  log('claim', 'full sweep of the onward payment to the demo wallet');
  await rowOf(onwardStealth).getByRole('button', { name: 'Claim to…' }).click();
  await page.getByText('Destination receives about').waitFor({ timeout: 30_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Claim', exact: true }).click();
  await rowOf(onwardStealth).getByText(/^Claimed .* to /).waitFor({ timeout: T.tx });
  link('claim tx (onward payment)', await rowOf(onwardStealth).getByRole('link', { name: /Claim tx/ }).getAttribute('href'));
  await shot(page, '09-inbox-claimed--desktop-dark');

  // 6. Invoice.
  log('invoice', 'create 0.5 NEAR invoice');
  await go(page, '/app/invoice');
  await page.getByLabel('Amount').fill('0.5');
  await page.getByLabel(/^Note/).fill('E2E invoice');
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.getByText('Invoice #0', { exact: true }).waitFor();
  payLink = await page.locator('[title*="#/pay?to="]').first().getAttribute('title');
  await shot(page, '10-invoice--desktop-dark');

  // 7. Pay it from the public pay page with testnet NEAR.
  log('pay', 'pay the invoice from #/pay');
  await page.goto(payLink, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Pay 0.5 NEAR' }).waitFor();
  const payBtn = page.getByRole('button', { name: 'Pay 0.5 NEAR' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Pay 0.5 NEAR' && !b.disabled), null, { timeout: 30_000 });
  await payBtn.click();
  await page.getByText('Paid 0.5 NEAR').waitFor({ timeout: T.tx });
  link('invoice payment tx', await page.getByRole('link', { name: /View transaction/ }).first().getAttribute('href'));

  // 8. Real 1Click dry quote into the invoice account.
  log('quote', 'dry quote');
  await page.getByRole('button', { name: 'Get quote' }).click();
  await page.getByText('Payer sends about').waitFor({ timeout: 45_000 });
  const quoteText = await page.locator('text=Payer sends about').locator('..').innerText();
  log('quote', quoteText.replace(/\s+/g, ' '));
  await shot(page, '11-pay-invoice-paid-and-quote--desktop-dark');

  // 9. Inbox shows the invoice payment.
  log('inbox', 'invoice payment visible');
  await go(page, '/app/inbox');
  await page.getByText('Invoice #0').first().waitFor({ timeout: T.scan });
  await shot(page, '12-inbox-invoice--desktop-dark');

  // 10. Payroll sample (2 rows to own meta-address, one transaction).
  log('payroll', 'sample batch of 2');
  await go(page, '/app/payroll');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByText('2 ready').waitFor({ timeout: 20_000 });
  await shot(page, '13-payroll-rows--desktop-dark');
  await page.getByRole('button', { name: 'Review batch' }).click();
  await page.getByRole('button', { name: 'Send 2 payments' }).click();
  await page.getByText('2 of 2 paid in one transaction.').waitFor({ timeout: T.tx });
  link('payroll tx', await page.getByRole('link', { name: /View transaction/ }).first().getAttribute('href'));
  await shot(page, '14-payroll-done--desktop-dark');

  // 11. DAO payout: propose 0.02 NEAR to own meta-address, approve, find it.
  log('dao', 'propose + approve 0.02 NEAR');
  await go(page, '/app/dao');
  await page.getByText(/proposals so far/).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Propose payout' }).click();
  await page.getByRole('button', { name: 'Approve & execute' }).waitFor({ timeout: T.tx });
  link('dao proposal tx', await page.getByRole('link', { name: /Proposed in/ }).getAttribute('href'));
  await shot(page, '15-dao-proposed--desktop-dark');
  await page.getByRole('button', { name: 'Approve & execute' }).click();
  await page.getByText('Executed: the DAO paid a fresh account.').waitFor({ timeout: T.tx });
  link('dao vote tx', await page.getByRole('link', { name: /Vote transaction/ }).getAttribute('href'));
  const titles = await page
    .locator('div.rounded-lg', { hasText: 'Executed: the DAO paid a fresh account.' })
    .last()
    .locator('[title]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  const daoStealth = titles.find((t) => /^[0-9a-f]{64}$/.test(t ?? '')) ?? null;
  await shot(page, '16-dao-executed--desktop-dark');
  await go(page, '/app/inbox');
  await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  if (daoStealth) {
    await page.locator(`[title="${daoStealth}"]`).first().waitFor({ timeout: 30_000 });
    log('dao', `inbox found the DAO payout ${daoStealth.slice(0, 8)}…`);
  }
  await shot(page, '17-inbox-after-dao--desktop-dark');

  // 12. Audit with the viewing key.
  log('audit', 'viewing key scan');
  await go(page, '/app/audit');
  await page.getByRole('button', { name: 'Use my viewing key' }).click();
  await page.getByRole('button', { name: 'Open read-only view' }).click();
  await page.getByText(/payments · received/).waitFor({ timeout: T.scan });
  await shot(page, '18-audit--desktop-dark');

  // 13. Verify the receipt from step 2 via deep link.
  log('verify', 'receipt deep link');
  await go(page, `/app/verify?${new URLSearchParams({ r: receipt })}`);
  await page.getByRole('heading', { name: 'Verified payment' }).waitFor({ timeout: 60_000 });
  await shot(page, '19-verify--desktop-dark');

  // 14. Claim the invoice payment back to the wallet.
  log('claim', 'invoice back to the wallet');
  await go(page, '/app/inbox');
  await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  const invRow = page.locator('li', { hasText: 'Invoice #0' }).first();
  await invRow.getByRole('button', { name: 'Claim to…' }).click();
  await page.getByText('Destination receives about').waitFor({ timeout: 30_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Claim', exact: true }).click();
  await invRow.getByText(/^Claimed /).waitFor({ timeout: T.tx });
  link('invoice claim tx', await invRow.getByRole('link', { name: /Claim tx/ }).getAttribute('href'));

  await go(page, '/app/settings');
  await page.getByText('Demo wallet', { exact: true }).first().waitFor();
  await shot(page, '20-settings--desktop-dark');
  await go(page, '/app/start');
  await page.getByRole('heading', { name: 'See it work in a minute' }).waitFor();
  await shot(page, '21-guided-demo-progress--desktop-dark');

  const storage = await ctx.storageState();
  await ctx.close();

  // Mobile (dark) and a few light captures, reusing the same browser state.
  log('screens', 'mobile + light');
  const mobile = await newContext({ width: 390, height: 844 }, 'dark', storage);
  const mp = await mobile.newPage();
  watch(mp, 'mobile');
  for (const [name, hash, ready] of [
    ['landing', '/', 'Pay anyone.'],
    ['start', '/app/start', 'See it work in a minute'],
    ['receive', '/app/receive', 'Your private address'],
    ['send', '/app/send', 'Pay someone privately'],
    ['inbox', '/app/inbox', 'Payments behind the curtain'],
    ['invoice', '/app/invoice', 'Get paid by anyone'],
    ['payroll', '/app/payroll', 'Pay the whole team, privately'],
    ['dao', '/app/dao', 'Pay a contributor from a DAO treasury'],
    ['audit', '/app/audit', 'Read-only view for auditors'],
    ['verify', `/app/verify?${new URLSearchParams({ r: receipt })}`, 'Check a payment proof'],
    ['settings', '/app/settings', 'Backstage'],
  ]) {
    await go(mp, hash);
    await mp.getByText(ready).first().waitFor({ timeout: 30_000 });
    if (name === 'inbox') await mp.getByText(/announcements checked/).waitFor({ timeout: T.scan });
    if (name === 'verify') await mp.getByRole('heading', { name: 'Verified payment' }).waitFor({ timeout: 60_000 });
    await shot(mp, `m-${name}--mobile-dark`);
  }
  await mp.goto(payLink, { waitUntil: 'domcontentloaded' });
  await mp.getByRole('heading', { name: 'Pay 0.5 NEAR' }).waitFor();
  await shot(mp, 'm-pay-invoice--mobile-dark');
  await mobile.close();

  const light = await newContext(desktop, 'light', storage);
  const lp = await light.newPage();
  watch(lp, 'light');
  for (const [name, hash, ready] of [
    ['landing', '/', 'Pay anyone.'],
    ['inbox', '/app/inbox', 'Payments behind the curtain'],
    ['send', '/app/send', 'Pay someone privately'],
    ['settings', '/app/settings', 'Backstage'],
  ]) {
    await go(lp, hash);
    await lp.getByText(ready).first().waitFor({ timeout: 30_000 });
    if (name === 'inbox') await lp.getByText(/announcements checked/).waitFor({ timeout: T.scan });
    await shot(lp, `l-${name}--desktop-light`);
  }
  await lp.goto(payLink, { waitUntil: 'domcontentloaded' });
  await lp.getByRole('heading', { name: 'Pay 0.5 NEAR' }).waitFor();
  await shot(lp, 'l-pay-invoice--desktop-light');
  const lm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce', storageState: storage });
  await lm.addInitScript(() => localStorage.setItem('perde-theme', 'light'));
  const lmp = await lm.newPage();
  watch(lmp, 'light-mobile');
  await go(lmp, '/app/inbox');
  await lmp.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  await shot(lmp, 'l-inbox--mobile-light');
  await lm.close();
  await light.close();
} catch (e) {
  exitCode = 1;
  console.error('E2E FAILED:', e);
  try {
    const pages = browser.contexts().flatMap((c) => c.pages());
    const last = pages[pages.length - 1];
    if (last) await last.screenshot({ path: join(outDir, 'zz-failure.png'), fullPage: true });
  } catch {
    /* no page to capture */
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

await writeFile(
  join(outDir, 'e2e-summary.json'),
  JSON.stringify(
    { ranAt: new Date().toISOString(), ok: exitCode === 0 && consoleProblems.length === 0, account: funder.accountId, links, consoleProblems, rpcStats, screenshots: shots.map((s) => s.slice(root.length + 1)) },
    null,
    2,
  ),
);
console.log(`\n${links.length} transaction links, ${shots.length} screenshots in ${outDir}`);
console.log('\nRPC requests per step (total · hosts · failed/non-2xx):');
let rpcTotal = 0;
for (const [step, s] of Object.entries(rpcStats)) {
  rpcTotal += s.total;
  const hosts = Object.entries(s.byHost).map(([h, n]) => `${h.split('.').slice(-2, -1)[0]}=${n}`).join(' ');
  console.log(`  ${step.padEnd(10)} ${String(s.total).padStart(4)} · ${hosts} · failed ${s.failed} / non-2xx ${s.non2xx}`);
}
console.log(`  ${'TOTAL'.padEnd(10)} ${String(rpcTotal).padStart(4)}`);
console.log(`\nconsole errors/warnings + page errors + layout problems: ${consoleProblems.length}`);
for (const p of consoleProblems) console.log(' - ' + p);
if (exitCode === 0 && consoleProblems.length > 0) {
  console.error('E2E FAILED: the run finished, but the browser reported the problems above.');
  exitCode = 3;
}
process.exit(exitCode);
