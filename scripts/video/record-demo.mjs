/**
 * Records the Perde demo video from the production build against NEAR testnet,
 * following DEMO.md step by step, then converts it for X.
 *
 *   npm run demo:video                      # build, record, convert, sweep
 *   node scripts/video/record-demo.mjs --dry      # selectors + navigation only, no transactions
 *   node scripts/video/record-demo.mjs --headed   # watch it
 *   node scripts/video/record-demo.mjs --no-build # reuse scripts/video/.build/dist
 *   node scripts/video/record-demo.mjs --sweep    # only claim leftovers of earlier takes
 *   node scripts/video/record-demo.mjs --convert-only  # re-encode the last raw take
 *
 * Output: demo/demo.webm, demo/demo.mp4, demo/README.md (timestamps), and
 * scripts/video/.build/ (raw take, markers, review frames; gitignored).
 *
 * Everything on screen is the real app. The recorder only adds a presentation
 * layer (cursor, captions, title and end cards; lib/overlay.js). The wallet is
 * the throwaway testnet account in .cache/demo-account.json, injected into the
 * app's storage the way apps/web/scripts/e2e-smoke.mjs does it; its key is
 * never printed, and the recovery phrase stays behind the app's curtain.
 *
 * Funds: after every take (also a failed one) a headless sweep claims every
 * payment of that take back to the wallet and unregisters the name, so a
 * failed take costs only gas and fees. Take states live in
 * scripts/video/.state/ (gitignored) so `--sweep` can finish an interrupted one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serveStatic } from './lib/serve.mjs';
import {
  REPO,
  T,
  buildApp,
  buildDir,
  demoOut,
  distDir,
  ffmpegPath,
  initialState,
  listTakeStates,
  loadDemoAccount,
  near,
  overlayPath,
  prepareContext,
  readLedger,
  saveTakeState,
  sweep,
  walletBalance,
  writeLedger,
} from './lib/app.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const HEADED = args.includes('--headed');
const VIEW = { width: 1920, height: 1080 };

/* ------------------------------------------------------------------------ */
/* Captions: DEMO.md's "Say" column, tightened (≤ ~110 chars, ≤ 2 lines).    */
/* ------------------------------------------------------------------------ */

const S = {
  1: '1 · The problem',
  2: '2 · Why NEAR',
  3: '3 · Receive',
  4: '4 · Send by name',
  5: '5 · Inbox',
  6: '6 · Claim',
  7: '7 · DAO payout',
  8: '8 · Invoice, any chain',
  9: '9 · Payroll & audit',
  10: '10 · Honest limits',
};
const SAY = {
  problem: 'On NEAR, every payment names its recipient: who was paid, how much, and everything else they hold.',
  perde: 'With Perde, the same payment goes to a brand-new account that nobody can link to Alice.',
  near1: 'A NEAR implicit account is just an ed25519 public key. So a stealth key already is a NEAR account.',
  near2: 'No pool holding funds, no relayer, no indexer, no backend: a static site talking to public testnet RPC.',
  live: 'From here on: the real app, signing real NEAR testnet transactions in this browser.',
  identity: 'Alice creates an identity once. Her 12-word recovery phrase stays behind the curtain.',
  meta: 'She gets one meta-address to share, as text, link or QR code. It never appears on-chain.',
  register: 'She registers it under her NEAR name, so people can simply pay that name.',
  sendName: 'A payer types Alice’s NEAR name. (Here the demo wallet pays the name it just registered.)',
  review: 'The payer’s browser derives a one-time account for Alice. It has never existed on-chain before.',
  sending: 'One contract call records an announcement and moves the funds, atomically.',
  chainSent: 'What the chain shows: a transfer to a fresh 64-hex account. Alice’s name appears nowhere.',
  scan: 'Alice’s browser scans the public announcements with her view key. Only she can recognise this one.',
  chainInbox: 'The chain view: on top, what any observer can read on-chain. Below, what only Alice knows.',
  claim: 'She claims it. The stealth account signs for itself with a key derived in her browser.',
  claimed: 'The claim is signed by the 64-hex stealth account itself, which pays its own gas. No relayer.',
  dao: 'The real use: a DAO treasury pays a contributor through a normal SputnikDAO proposal.',
  proposal: 'The vote and the amount are public, but the proposal names no recipient, only a fresh account.',
  executed: 'Approved and executed in one vote. The contributor finds the payout in their own inbox.',
  invoice: 'An invoice is a one-time account with no announcement at all, so an exchange or another chain can pay it.',
  quote: 'A live NEAR Intents quote: pay in USDC on Ethereum, the invoice receives NEAR. Dry-run preview, not executed.',
  payroll: 'Payroll: several private payments in one NEAR transaction.',
  audit: 'An accountant gets a viewing key: they see every incoming payment and cannot spend any of it.',
  limits: 'Perde hides who was paid. Amounts, senders and timing stay public. Unaudited testnet prototype.',
  real: 'Everything you saw was real NEAR testnet transactions.',
};

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

let page;
let videoT0 = 0;
const markers = [];
const links = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => (Date.now() - videoT0) / 1000;
const mark = (id, label) => {
  markers.push({ id, label, t: now() });
  console.log(`  ⏱ ${now().toFixed(1)}s  ${label}`);
};
const hold = (ms) => page.waitForTimeout(ms);

async function step(name, fn, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const t = Date.now();
    try {
      console.log(`[step] ${name}${attempt ? ` (retry ${attempt})` : ''}`);
      await fn();
      console.log(`[step] ${name} ✓ ${((Date.now() - t) / 1000).toFixed(1)}s`);
      return;
    } catch (e) {
      const alert = await page
        .locator('[role=alert]')
        .first()
        .innerText({ timeout: 500 })
        .catch(() => null);
      const msg = `${name} failed: ${e.message.split('\n')[0]}${alert ? ` | app says: ${alert.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`;
      if (attempt >= retries) throw new Error(msg);
      console.warn(`[step] ${msg} — retrying`);
      await sleep(1500);
    }
  }
}

const demo = (fn, arg) => page.evaluate(fn, arg);
const caption = (label, text) => demo(([l, t]) => window.__demo.caption(l, t), [label, text]);
const ring = async (locator) => {
  if (!locator) return demo(() => window.__demo.ring(null));
  const h = await locator.elementHandle();
  await page.evaluate((e) => window.__demo.ring(e), h);
};
const focusOn = async (locator) => {
  if (!locator) return demo(() => window.__demo.focus(null));
  const h = await locator.elementHandle();
  await page.evaluate((e) => window.__demo.focus(e), h);
};

/** Bring the element into the safe area (above the caption zone) with a smooth scroll. */
async function reveal(locator, opts = {}) {
  await locator.waitFor({ state: 'visible', timeout: opts.timeout ?? 30_000 });
  const h = await locator.elementHandle();
  await page.evaluate(([e, o]) => window.__demo.scrollIntoSafe(e, o), [h, opts]);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Glide the cursor to (x, y) along a slightly curved, eased path. */
async function glide(x, y) {
  const from = await demo(() => window.__demo.cursorPos());
  const dist = Math.hypot(x - from.x, y - from.y);
  if (dist < 3) return;
  const steps = Math.round(Math.min(42, Math.max(14, dist / 22)));
  const bend = Math.min(60, dist * 0.08) * (from.x < x ? 1 : -1);
  for (let i = 1; i <= steps; i++) {
    const t = easeInOut(i / steps);
    const arc = Math.sin(Math.PI * t) * bend;
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t - arc);
    await sleep(10);
  }
}

async function pointAt(locator, { dx = 0, dy = 0, scroll = true, timeout = 30_000 } = {}) {
  if (scroll) await reveal(locator, { timeout });
  else await locator.waitFor({ state: 'visible', timeout });
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  await glide(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy);
  return b;
}

async function click(locator, { timeout = 30_000, pause = 160, after = 220, scroll = true } = {}) {
  await locator.waitFor({ state: 'visible', timeout });
  const t0 = Date.now();
  while (!(await locator.isEnabled())) {
    if (Date.now() - t0 > timeout) throw new Error('element stayed disabled');
    await sleep(200);
  }
  await pointAt(locator, { scroll });
  await sleep(pause);
  // Click where the cursor is drawn, so the ripple and the real click coincide.
  const b = await locator.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(after);
}

async function typeInto(locator, text, { delay = 48 } = {}) {
  await click(locator, { after: 120 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delay + Math.round(Math.random() * 30));
  }
}

/** The app's Card is a <section class="rounded-xl …">. */
const cardOf = (loc) => loc.locator('xpath=ancestor::section[contains(@class,"rounded-xl")][1]');
const nav = (name) => page.getByRole('navigation', { name: 'App' }).getByRole('link', { name, exact: true }).first();
async function go(name) {
  await click(nav(name), { scroll: false });
  await page.waitForTimeout(250);
  await demo(() => window.scrollTo(0, 0));
}

/** Wait for either a success locator or an app error; throw with the app's message on error. */
async function waitResult(ok, { timeout = T.tx, error = page.locator('[role=alert]') } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await ok.first().isVisible().catch(() => false)) return;
    const e = error.first();
    if (await e.isVisible().catch(() => false)) throw new Error(`app error: ${(await e.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`);
    await sleep(250);
  }
  throw new Error(`timed out after ${timeout / 1000}s`);
}

async function txHref(locator) {
  const href = await locator.first().getAttribute('href').catch(() => null);
  return href;
}

/* ------------------------------------------------------------------------ */
/* The take                                                                  */
/* ------------------------------------------------------------------------ */

async function take(base, account) {
  const { accountId } = account;

  // ---- Title card, then 1 · The problem -------------------------------------
  await step('title + landing', async () => {
    await page.goto(`${base}#/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Pay anyone/ }).waitFor();
    await demo(() => document.fonts.ready.then(() => true));
    await page.waitForFunction(() => window.__demo?.ready() && document.querySelector('.__title-card'));
    await demo(() => Promise.all(['400 40px "Instrument Serif"', '500 20px "Geist Variable"', '500 20px "Geist Mono Variable"'].map((f) => document.fonts.load(f))));
    await hold(400);
    mark('title', 'Title card');
    await hold(2800);
    await demo(() => window.__demo.openTitle());
    await hold(1200);
  });

  await step('1 problem', async () => {
    mark('s1', S[1]);
    const exhibit = page.locator('figure[aria-labelledby="exhibit-caption"]');
    await caption(S[1], SAY.problem);
    const row = exhibit.locator('tr', { hasText: 'alice.near' }).first();
    await pointAt(row.or(exhibit.getByText('alice.near').first()).first(), { scroll: false });
    await ring(exhibit.locator('[role=tabpanel]'));
    await hold(3300);
    await ring(null);
    await click(page.getByRole('tab', { name: 'With Perde' }), { scroll: false });
    await caption(S[1], SAY.perde);
    await hold(1300);
    const alice = exhibit.getByText(/Behind the curtain/).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await pointAt(alice, { scroll: false });
    await ring(alice);
    await hold(2800);
    await ring(null);
  });

  // ---- 2 · Why NEAR ---------------------------------------------------------
  await step('2 why near', async () => {
    mark('s2', S[2]);
    await caption(S[2], SAY.near1);
    await click(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Why NEAR' }).or(page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Why NEAR' })).first(), { scroll: false });
    await page.waitForFunction(() => Math.abs(document.getElementById('why-near').getBoundingClientRect().top) < 140, null, { timeout: 8000 }).catch(() => {});
    await hold(900);
    const implicit = page.locator('#why-near dl > div').first();
    await pointAt(implicit, { scroll: false, dx: -300 });
    await hold(2400);
    await caption(S[2], SAY.near2);
    await demo(() => window.__demo.scrollToY(window.scrollY + 260, 1000));
    await hold(2700);
  });

  // ---- 3 · Receive ----------------------------------------------------------
  await step('3 guided demo', async () => {
    mark('s3', S[3]);
    await demo(() => window.__demo.scrollToY(0, 1200));
    await hold(200);
    await click(page.getByRole('link', { name: 'See it work in a minute' }).first(), { scroll: false });
    await page.getByRole('heading', { name: 'See it work in a minute' }).waitFor();
    await caption(S[3], SAY.live);
    await hold(1400);
  });

  await step('3 identity', async () => {
    await go('Receive');
    await click(page.getByRole('button', { name: 'Create identity' }));
    const curtain = page.getByRole('button', { name: 'Reveal recovery phrase' });
    await curtain.waitFor();
    await caption(S[3], SAY.identity);
    const phraseBox = curtain.locator('xpath=ancestor::div[contains(@class,"isolate")][1]');
    await pointAt(curtain, { dy: 40 });
    await ring(phraseBox);
    await hold(2200);
    await ring(null);
    await click(page.getByLabel('I have stored these words somewhere safe and offline.'));
    await click(page.getByRole('button', { name: 'Continue' }));
    await page.getByText('Meta-address', { exact: true }).waitFor();
    await caption(S[3], SAY.meta);
    const metaCard = cardOf(page.getByText('Meta-address', { exact: true }));
    await pointAt(page.getByRole('img', { name: /QR code/ }).or(page.locator('svg[aria-label*="QR"]')).first(), { scroll: false }).catch(() => pointAt(metaCard, { scroll: false }));
    await ring(metaCard);
    await hold(2500);
    await ring(null);
  });

  await step('3 register', async () => {
    await caption(S[3], SAY.register);
    const card = cardOf(page.getByRole('heading', { name: 'Pay me at a NEAR name' }));
    await reveal(card, { align: 'center' });
    const btn = page.getByRole('button', { name: /^(Register name|Replace with this meta-address)$/ });
    await btn.waitFor({ timeout: 30_000 });
    if (DRY) {
      await pointAt(btn);
      await hold(1500);
      return;
    }
    await click(btn);
    await waitResult(page.getByText('Registered', { exact: true }), { timeout: T.tx });
    await ring(card);
    await hold(1400);
    await ring(null);
  });

  // ---- 4 · Send by name -----------------------------------------------------
  let stealthSent = null;
  await step('4 send', async () => {
    mark('s4', S[4]);
    await go('Send');
    await caption(S[4], SAY.sendName);
    // A dry run registers nothing, so it pays its own meta-address instead of the name.
    if (DRY) await click(page.getByRole('button', { name: 'Pay myself' }));
    else await typeInto(page.getByLabel('Recipient'), accountId, { delay: 42 });
    await page.getByText(/Your own meta-address|Registered meta-address found/).waitFor({ timeout: 30_000 });
    await hold(500);
    await typeInto(page.getByLabel('Amount'), '0.05', { delay: 110 });
    await hold(400);
    await click(page.getByRole('button', { name: 'Review payment' }));
    await page.getByRole('heading', { name: 'Review' }).waitFor();
    await caption(S[4], SAY.review);
    const landsIn = page.locator('dl > div', { hasText: 'Lands in' }).first();
    await pointAt(landsIn, { dx: 60 });
    await ring(landsIn);
    stealthSent = await landsIn.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title')).find((t) => /^[0-9a-f]{64}$/.test(t ?? '')) ?? null);
    await hold(3000);
    await ring(null);
    if (DRY) {
      await pointAt(page.getByRole('button', { name: 'Confirm and send' }));
      await hold(1000);
      await click(page.getByRole('button', { name: 'Back', exact: true }));
      return;
    }
    await click(page.getByRole('button', { name: 'Confirm and send' }));
    await caption(S[4], SAY.sending);
    const progress = cardOf(page.getByRole('heading', { name: 'Sending' }));
    await ring(progress).catch(() => {});
    await waitResult(page.getByRole('heading', { name: 'Paid. The curtain stays closed.' }), { timeout: T.tx });
    await ring(null);
    links.push({ label: 'send', href: await txHref(page.getByRole('link', { name: /View transaction/ })) });
    await hold(1100);
  });

  await step('4 chain view (sent)', async () => {
    if (DRY) return;
    await click(page.getByRole('button', { name: 'What the chain sees' }));
    const sheet = page.getByRole('dialog');
    await sheet.getByText(/Announcement #\d+/).first().waitFor({ timeout: 30_000 });
    await caption(S[4], SAY.chainSent);
    await hold(300);
    await pointAt(sheet.getByText(/Announcement #\d+/).first(), { scroll: false });
    await hold(3200);
    await page.keyboard.press('Escape');
    await hold(400);
  });

  // ---- 5 · Inbox --------------------------------------------------------------
  let row = null;
  await step('5 inbox', async () => {
    mark('s5', S[5]);
    await go('Inbox');
    await caption(S[5], SAY.scan);
    const progress = page.getByRole('progressbar', { name: 'Scan progress' }).locator('xpath=..');
    await pointAt(progress, { scroll: false });
    await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
    if (DRY) {
      await hold(2000);
      return;
    }
    row = stealthSent ? page.locator('li', { has: page.locator(`[title="${stealthSent}"]`) }).first() : page.locator('li', { has: page.getByRole('button', { name: 'Claim to…' }) }).first();
    await row.getByRole('button', { name: 'Claim to…' }).waitFor({ timeout: 30_000 });
    await pointAt(row, { dx: -200 });
    await ring(row);
    await hold(2000);
    await ring(null);
  });

  // ---- 6 · Claim ----------------------------------------------------------------
  await step('6 claim', async () => {
    if (DRY) return;
    mark('s6', S[6]);
    await caption(S[6], SAY.claim);
    await click(row.getByRole('button', { name: 'Claim to…' }));
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Destination receives about').waitFor({ timeout: 30_000 });
    await hold(2000);
    await click(dlg.getByRole('button', { name: 'Claim', exact: true }));
    await waitResult(row.getByText(/^Claimed .* to /), { timeout: T.tx, error: row.locator('[role=alert]') });
    links.push({ label: 'claim', href: await txHref(row.getByRole('link', { name: /Claim tx/ })) });
    await ring(row);
    await hold(700);
    await ring(null);
    await click(row.getByRole('button', { name: 'Chain view' }));
    const sheet = page.getByRole('dialog');
    const claimBlock = sheet.getByText('Claim transaction').first();
    await claimBlock.waitFor({ timeout: 30_000 });
    await caption(S[6], SAY.chainInbox);
    await hold(2800);
    await caption(S[6], SAY.claimed);
    await demo(() => {
      const d = document.querySelector('dialog[open]');
      const t = [...d.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent === 'Claim transaction');
      const box = d.querySelector('.overflow-y-auto') || d;
      if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return !!box;
    });
    await hold(900);
    await pointAt(claimBlock, { scroll: false });
    await hold(3000);
    await page.keyboard.press('Escape');
    await hold(400);
  });

  // ---- 7 · DAO payout ---------------------------------------------------------------
  let daoStealth = null;
  await step('7 dao', async () => {
    mark('s7', S[7]);
    await go('DAO payout');
    await caption(S[7], SAY.dao);
    await page.getByText(/proposals so far/).waitFor({ timeout: 30_000 });
    const propose = page.getByRole('button', { name: 'Propose payout' });
    await pointAt(page.getByRole('heading', { name: '1 · Propose a payout' }));
    await hold(1200);
    if (DRY) {
      await pointAt(propose);
      await hold(1000);
      return;
    }
    await click(propose);
    const approve = page.getByRole('button', { name: 'Approve & execute' });
    await waitResult(approve, { timeout: T.tx });
    links.push({ label: 'dao proposal', href: await txHref(page.getByRole('link', { name: /Proposed in/ })) });
    await caption(S[7], SAY.proposal);
    const proposal = cardOf(page.getByRole('heading', { name: '2 · Approve & execute' })).locator('dl').first();
    await reveal(proposal, { align: 'center' });
    await pointAt(proposal.locator('div', { hasText: 'stealth_account' }).last(), { scroll: false });
    await ring(proposal);
    await hold(3400);
    await ring(null);
    await click(approve);
    await waitResult(page.getByText('Executed: the DAO paid a fresh account.'), { timeout: T.tx });
    links.push({ label: 'dao vote', href: await txHref(page.getByRole('link', { name: /Vote transaction/ })) });
    const done = page.getByText('Executed: the DAO paid a fresh account.').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    daoStealth = await done.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title')).find((t) => /^[0-9a-f]{64}$/.test(t ?? '')) ?? null);
    await caption(S[7], SAY.executed);
    await reveal(done);
    await ring(done);
    await hold(1100);
    await ring(null);
    await click(page.getByRole('link', { name: 'Open my Inbox' }));
    await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
    const daoRow = daoStealth ? page.locator('li', { has: page.locator(`[title="${daoStealth}"]`) }).first() : page.locator('li').first();
    await daoRow.waitFor({ timeout: 30_000 });
    await pointAt(daoRow, { dx: -200 });
    await ring(daoRow);
    await hold(1900);
    await ring(null);
  });

  // ---- 8 · Invoice + any chain --------------------------------------------------------
  await step('8 invoice', async () => {
    mark('s8', S[8]);
    await go('Invoice');
    await typeInto(page.getByLabel(/^Amount/), '0.5', { delay: 120 });
    await typeInto(page.getByLabel(/^Note/), 'Design work, November', { delay: 38 });
    await click(page.getByRole('button', { name: 'Create invoice' }));
    await page.getByText(/^Invoice #\d+$/).first().waitFor();
    await caption(S[8], SAY.invoice);
    const pay = cardOf(page.getByText('Pay to this one-time account'));
    await reveal(pay.or(page.getByRole('img', { name: /QR/ })).first(), { align: 'center' }).catch(() => {});
    await pointAt(page.locator('[title*="#/pay?to="]').first(), { scroll: false }).catch(() => {});
    await hold(2800);
  });

  await step('8 quote', async () => {
    const panel = cardOf(page.getByRole('heading', { name: 'Pay from any chain' }));
    await reveal(panel, { align: 'top', top: 90 });
    const combo = page.getByRole('combobox');
    await combo.waitFor({ timeout: 30_000 });
    await typeInto(combo, 'USDC eth', { delay: 70 });
    const opt = page.getByRole('option', { name: /USDC.*Ethereum/ }).first();
    await opt.waitFor({ timeout: 10_000 });
    await hold(500);
    await click(opt, { scroll: false });
    await hold(400);
    await click(panel.getByRole('button', { name: 'Get quote' }));
    await caption(S[8], SAY.quote);
    await waitResult(page.getByText('Payer sends about'), { timeout: T.quote });
    const result = page.getByText('Payer sends about').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await reveal(result);
    await pointAt(result, { scroll: false, dx: -150 });
    await ring(result);
    await hold(3500);
    await ring(null);
  });

  // ---- 9 · Payroll + audit ----------------------------------------------------------------
  await step('9 payroll', async () => {
    mark('s9', S[9]);
    await go('Payroll');
    await caption(S[9], SAY.payroll);
    await click(page.getByRole('button', { name: 'Load sample' }));
    await page.getByText('2 ready').waitFor({ timeout: 20_000 });
    await hold(800);
    await click(page.getByRole('button', { name: 'Review batch' }));
    const send = page.getByRole('button', { name: 'Send 2 payments' });
    await send.waitFor();
    if (DRY) {
      await pointAt(send);
      await hold(1000);
      return;
    }
    await click(send);
    await waitResult(page.getByText('2 of 2 paid in one transaction.'), { timeout: T.tx });
    links.push({ label: 'payroll', href: await txHref(page.getByRole('link', { name: /View transaction/ })) });
    const done = page.getByText('2 of 2 paid in one transaction.');
    await pointAt(done);
    await hold(1200);
  });

  await step('9 audit', async () => {
    await go('Audit');
    await caption(S[9], SAY.audit);
    await click(page.getByRole('button', { name: 'Use my viewing key' }));
    await hold(500);
    await click(page.getByRole('button', { name: 'Open read-only view' }));
    await page.getByText(/payments · received/).waitFor({ timeout: T.scan });
    const table = cardOf(page.getByText('Incoming payments visible to this viewing key'));
    await reveal(table, { align: 'top', top: 90, timeout: 5000 }).catch(() => {});
    await pointAt(table, { scroll: false, dy: -40 }).catch(() => {});
    await hold(3300);
  });

  // ---- 10 · What the curtain hides, end card ------------------------------------------------
  await step('10 limits + end', async () => {
    mark('s10', S[10]);
    await page.goto(`${base}#/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Pay anyone/ }).waitFor();
    await caption(S[10], SAY.limits);
    await demo(() => window.__demo.scrollIntoSafe(document.getElementById('privacy'), { align: 'top', top: 40, ms: 1300 }));
    await hold(900);
    await pointAt(page.getByText('Sender, amount and time'), { scroll: false });
    await hold(3000);
    await caption(S[10], SAY.real);
    await hold(2200);
    mark('end-card', 'End card');
    await demo((repo) => window.__demo.endCard(repo), REPO);
    await page.mouse.move(1960, 1100).catch(() => {});
    await hold(3800);
    mark('end', 'End');
  });
}

/* ------------------------------------------------------------------------ */
/* Conversion                                                                */
/* ------------------------------------------------------------------------ */

function ff(argv) {
  execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
}

function probe(file) {
  let out = '';
  try {
    execFileSync(ffmpegPath, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    out = e.stderr?.toString() ?? '';
  }
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  const vid = /Video: ([^\n]+)/.exec(out);
  return {
    seconds: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : null,
    video: vid ? vid[1].trim() : null,
    bytes: statSync(file).size,
  };
}

async function convert(raw, startS, endS) {
  await mkdir(demoOut, { recursive: true });
  const webm = join(demoOut, 'demo.webm');
  const mp4 = join(demoOut, 'demo.mp4');
  const cut = ['-ss', startS.toFixed(2), '-to', endS.toFixed(2), '-i', raw];
  console.log(`[convert] trimming ${startS.toFixed(2)}s → ${endS.toFixed(2)}s`);
  console.log('[convert] demo.mp4 (H.264, yuv420p, faststart)');
  let crf = 23;
  for (;;) {
    ff([...cut, '-an', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-r', '30', '-g', '60', '-movflags', '+faststart', mp4]);
    const size = statSync(mp4).size;
    if (size <= 25 * 1024 * 1024 || crf >= 30) break;
    crf += 2;
    console.log(`[convert] ${(size / 1048576).toFixed(1)} MB is over 25 MB; retrying at crf ${crf}`);
  }
  console.log('[convert] demo.webm (VP9)');
  ff([...cut, '-an', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', webm]);
  return { webm: probe(webm), mp4: probe(mp4) };
}

async function writeReadme(markersRel, info, meta) {
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const rows = markersRel.filter((m) => m.id !== 'end').map((m) => `| ${fmt(m.t)} | ${m.label} |`);
  const md = `# Demo video

[\`demo.mp4\`](demo.mp4) (H.264, for X and most players) and [\`demo.webm\`](demo.webm) (VP9) are the same ${fmt(info.mp4.seconds)} recording of the Perde web app on NEAR testnet. It follows [DEMO.md](../DEMO.md) step by step. [\`poster.png\`](poster.png) is a frame for the thumbnail.

## What it shows

The production build of \`apps/web\`, driven by Playwright in Chromium at 1920×1080. Every transaction on screen is real and was signed in the browser on NEAR testnet: registering a name, a private payment by NEAR name, the inbox scan, a claim signed by the stealth account itself, a SputnikDAO proposal and its execution, a payroll batch and an audit with a viewing key. The NEAR Intents quote is a real 1Click **dry** quote (nothing executed). Nothing is mocked or edited in; long chain waits are shown as they happened.

The recorder adds only a presentation layer drawn over the page: a cursor (Playwright's video does not show the OS cursor), captions, the title card and the end card. The 12-word recovery phrase stays behind the app's curtain and the wallet key is never shown.

## Timestamps

| Time | Step |
| --- | --- |
${rows.join('\n')}

## How it was recorded

\`\`\`bash
npm run demo:video          # build, record, convert, sweep leftovers back to the demo wallet
npm run demo:video -- --dry # only checks selectors and navigation, no transactions
\`\`\`

The script is [\`scripts/video/record-demo.mjs\`](../scripts/video/record-demo.mjs). It builds the app into \`scripts/video/.build/\`, serves it locally, injects a funded throwaway testnet account (\`.cache/demo-account.json\`, not committed) into the app's storage, records with Playwright's \`recordVideo\`, trims the page-load frames and converts with the project-local \`ffmpeg-static\` binary. After the take it claims every payment it created back to the demo wallet and unregisters the name, so a take costs only gas and fees.

Recorded ${meta.recordedAt}. Take: ${meta.takeName}. Explorer: ${meta.explorerNote}
`;
  await writeFile(join(demoOut, 'README.md'), md);
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

const account = await loadDemoAccount();
await mkdir(buildDir, { recursive: true });
if (!args.includes('--no-build') && !args.includes('--convert-only') && !args.includes('--sweep')) buildApp();
if (!existsSync(join(distDir, 'index.html'))) throw new Error(`no build at ${distDir}; run without --no-build`);

const server = await serveStatic(distDir);
const base = server.url;
console.log(`[serve] ${base}`);
const browser = await chromium.launch({ headless: !HEADED });

let exitCode = 0;
try {
  if (args.includes('--convert-only')) {
    const last = JSON.parse(await readFile(join(buildDir, 'last-take.json'), 'utf8'));
    const info = await convert(last.raw, last.startS, last.endS);
    console.log(info);
  } else if (args.includes('--sweep')) {
    const ledger = await readLedger();
    for (const file of await listTakeStates()) {
      const entry = ledger.takes.find((t) => t.state === file);
      if (entry?.swept || entry?.dry || /-dry.storage/.test(file)) continue;
      console.log(`[sweep] ${file}`);
      const st = await sweep(browser, base, file);
      await saveTakeState(file.replace(/^.*[\\/]/, '').replace('.storage.json', ''), st);
      if (entry) entry.swept = true;
    }
    await writeLedger(ledger);
  } else {
    const takeName = `take-${new Date().toISOString().replace(/[:.]/g, '-')}${DRY ? '-dry' : ''}`;
    const rawDir = join(buildDir, 'raw', takeName);
    await mkdir(rawDir, { recursive: true });
    const before = await walletBalance(account.accountId);
    console.log(`[wallet] ${account.accountId}: ${before === null ? '?' : near(before)} NEAR before the take`);

    const ctx = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      recordVideo: { dir: rawDir, size: VIEW },
    });
    await prepareContext(ctx, { theme: 'dark', state: initialState(account) });
    await ctx.addInitScript((cfg) => {
      window.__DEMO_CFG = cfg;
    }, { titleOnFirstLoad: true, hideCursorUntilMove: false, appBase: base });
    await ctx.addInitScript({ path: overlayPath });

    const problems = [];
    videoT0 = Date.now();
    page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`[console] ${m.text().slice(0, 300)}`));

    const ledger = await readLedger();
    const entry = { name: takeName, dry: DRY, startedAt: new Date().toISOString(), state: null, swept: false, ok: false };
    ledger.takes.push(entry);
    let stateFile = null;
    try {
      await take(base, account);
      entry.ok = true;
    } catch (e) {
      exitCode = 1;
      console.error(`\nTAKE FAILED: ${e.message}`);
      await page.screenshot({ path: join(rawDir, 'failure.png') }).catch(() => {});
      console.error(`failure screenshot: ${join(rawDir, 'failure.png')}`);
    } finally {
      stateFile = await saveTakeState(takeName, await ctx.storageState());
      entry.state = stateFile;
      await writeLedger(ledger);
      await ctx.close();
    }
    const raw = await page.video().path();
    console.log(`[video] raw take: ${raw}`);
    if (problems.length) {
      console.log(`[browser] ${problems.length} console error(s)/page error(s):`);
      for (const p of problems) console.log('  - ' + p);
    }

    // Sweep this take's payments back to the wallet (also after a failed take).
    if (!DRY) {
      try {
        const st = await sweep(browser, base, stateFile);
        await saveTakeState(takeName, st);
        entry.swept = true;
        await writeLedger(ledger);
      } catch (e) {
        console.error(`[sweep] failed: ${e.message.split('\n')[0]} — run with --sweep later`);
      }
    }
    const after = await walletBalance(account.accountId);
    if (before !== null && after !== null) console.log(`[wallet] ${near(after)} NEAR after the take and sweep (net ${near(after - before, 5)} NEAR)`);
    entry.balanceBefore = before?.toString() ?? null;
    entry.balanceAfter = after?.toString() ?? null;
    await writeLedger(ledger);

    if (exitCode === 0) {
      const start = markers.find((m) => m.id === 'title').t + 0.1;
      const end = markers.find((m) => m.id === 'end').t;
      const rel = markers.map((m) => ({ ...m, t: Math.max(0, m.t - start) }));
      const meta = {
        takeName,
        recordedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        explorerNote: 'testnet.nearblocks.io answered headless Chromium with a Cloudflare check, so the video uses the in-app Chain view, which reads the same transaction and announcement from RPC.',
      };
      await writeFile(join(buildDir, 'last-take.json'), JSON.stringify({ raw, startS: start, endS: end, markers: rel, links, takeName }, null, 2));
      if (DRY) {
        const out = join(buildDir, 'dry.webm');
        await copyFile(raw, out);
        console.log(`\n[dry] selectors and navigation OK; raw dry take: ${out} (${(end - start).toFixed(1)} s between title and end)`);
      } else {
        const info = await convert(raw, start, end);
        // Thumbnail: the title card, fully drawn.
        const posterRaw = join(buildDir, 'poster-raw.png');
        ff(['-ss', '2.0', '-i', join(demoOut, 'demo.mp4'), '-frames:v', '1', posterRaw]);
        const sharp = (await import('sharp')).default;
        await sharp(posterRaw).png({ palette: true, colours: 256, effort: 10, compressionLevel: 9 }).toFile(join(demoOut, 'poster.png'));
        await writeReadme(rel, info, meta);
        console.log('\nOutput:');
        for (const [k, v] of Object.entries(info)) console.log(`  demo/demo.${k}: ${v.seconds?.toFixed(2)} s · ${(v.bytes / 1048576).toFixed(2)} MB · ${v.video}`);
        console.log('\nTimestamps:');
        for (const m of rel) console.log(`  ${m.t.toFixed(1).padStart(6)} s  ${m.label}`);
        console.log('\nTransactions:');
        for (const l of links) console.log(`  ${l.label}: ${l.href}`);
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(exitCode);
