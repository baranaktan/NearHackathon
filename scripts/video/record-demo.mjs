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
 * layer (cursor, captions, role chip, title and end cards; lib/overlay.js). The wallet is
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
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { serveStatic } from './lib/serve.mjs';
import {
  REPO,
  repoRoot,
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
// Output 1920x1080; the page is laid out at 1024x576 CSS px and rendered at 1.875x, so the
// app's own text is ~1.9x larger than a plain 1080p recording (body ~28 px in the output).
// 1024 is Tailwind's lg breakpoint: the desktop sidebar layout still shows.
const CSS_VIEW = { width: 1024, height: 576 };
const SCALE = 1.875;
const OUT = { width: 1920, height: 1080 };

/* ------------------------------------------------------------------------ */
/* Captions: DEMO.md's "Say / caption" column, tightened (<= ~90 chars/line). */
/* ------------------------------------------------------------------------ */

const S = {
  1: '1 · The problem',
  2: '2 · Receive',
  3: '3 · DAO payout',
  4: '4 · Approve',
  5: '5 · Inbox',
  6: '6 · Pay onward',
  7: '7 · Why NEAR',
};
const ALICE = ['Alice', 'contributor'];
const DAO = ['DAO member', ''];
const SAY = {
  problem: 'A DAO pays Alice. Everyone sees she was paid, how much, and what else she holds.',
  perde: 'With Perde the same payment lands in a fresh account nobody can link to her.',
  identity: 'Alice creates an identity once. Her recovery phrase stays behind the curtain.',
  meta: 'She shares one meta-address. She needs no account for this.',
  dao: 'The DAO proposes a payout: an ordinary SputnikDAO proposal. Amount, fresh account, no recipient.',
  approve: 'The DAO votes in public and the payment executes in the same transaction.',
  scan: 'Alice’s browser scans public announcements with her view key. Only she recognises this one.',
  chain: 'Above: what anyone can read. Below: what only Alice knows.',
  onward: 'She pays someone straight from that account. It signs for itself and pays its own gas.',
  onwardDone: 'Paid onward. Her named account never appears anywhere.',
  near: 'Why NEAR: an implicit account is an ed25519 key. A stealth key already is an account.',
  near2: 'No pool, no relayer, no indexer, no backend.',
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
  await nav(name).scrollIntoViewIfNeeded(); // the sidebar list scrolls in the short viewport
  await sleep(250);
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

const role = (who, sub = '', kind = '') => demo(([w, s, k]) => window.__demo.setRole(w, s, k), [who, sub, kind]);
const asAlice = () => role(ALICE[0], ALICE[1], 'alice');
const asDao = () => role(DAO[0], DAO[1], 'dao');
const noRole = () => role(null);
/** Paste (not type) a long value, the way a person would. */
async function pasteInto(locator, text) {
  await click(locator, { after: 120 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
  await sleep(250);
}

async function take(base, account) {
  // A second, throwaway identity ("someone Alice pays"), generated off-camera. Only its public meta-address is used.
  const core = await import(pathToFileURL(join(repoRoot, 'packages', 'core', 'dist', 'index.js')).href);
  const bobMeta = core.encodeMetaAddress(core.toMetaAddress(core.keysFromMnemonic(core.generateMnemonic())));

  // ---- 0 · Title card ---------------------------------------------------------
  await step('0 title', async () => {
    await page.goto(`${base}#/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Pay anyone/ }).waitFor();
    await demo(() => document.fonts.ready.then(() => true));
    await page.waitForFunction(() => window.__demo?.ready() && document.querySelector('.__title-card'));
    await demo(() => Promise.all(['400 40px "Instrument Serif"', '500 20px "Geist Variable"', '500 20px "Geist Mono Variable"'].map((f) => document.fonts.load(f))));
    await hold(400);
    mark('title', 'Title card');
    await hold(2200);
    await demo(() => window.__demo.openTitle());
    await hold(900);
  });

  // ---- 1 · The problem (landing, Without -> With Perde) -------------------------
  await step('1 problem', async () => {
    mark('s1', S[1]);
    const exhibit = page.locator('figure[aria-labelledby="exhibit-caption"]');
    await caption(S[1], SAY.problem);
    await reveal(exhibit, { align: 'top', top: 50 });
    await hold(500);
    const row = exhibit.locator('tr', { hasText: 'alice.near' }).first();
    await pointAt(row.or(exhibit.getByText('alice.near').first()).first(), { scroll: false });
    await ring(exhibit.locator('[role=tabpanel]'));
    await hold(2600);
    await ring(null);
    await click(page.getByRole('tab', { name: 'With Perde' }), { scroll: false });
    await caption(S[1], SAY.perde);
    await hold(900);
    const alice = exhibit.getByText(/Behind the curtain/).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await pointAt(alice, { scroll: false });
    await ring(alice);
    await hold(2200);
    await ring(null);
  });

  // ---- 2 · Receive (Alice) ---------------------------------------------------------
  let aliceMeta = null;
  await step('2 receive', async () => {
    mark('s2', S[2]);
    await caption(S[2], SAY.identity);
    await demo(() => window.__demo.scrollToY(0, 600));
    await click(page.getByRole('link', { name: 'Open app' }).first(), { scroll: false });
    await asAlice();
    await go('Receive');
    await caption(S[2], SAY.identity);
    await click(page.getByRole('button', { name: 'Create identity' }));
    const curtain = page.getByRole('button', { name: 'Reveal recovery phrase' });
    await curtain.waitFor();
    const phraseBox = curtain.locator('xpath=ancestor::div[contains(@class,"isolate")][1]');
    await pointAt(curtain, { dy: 30 });
    await ring(phraseBox);
    await hold(1500);
    await ring(null);
    await click(page.getByLabel('I have stored these words somewhere safe and offline.'));
    await click(page.getByRole('button', { name: 'Continue' }));
    await page.getByText('Meta-address', { exact: true }).waitFor();
    await caption(S[2], SAY.meta);
    const metaCard = cardOf(page.getByText('Meta-address', { exact: true }));
    aliceMeta = (await page.locator('p', { hasText: /^perde:/ }).first().innerText()).replace(/\s+/g, '');
    if (!/^perde:[A-Za-z0-9]+$/.test(aliceMeta)) throw new Error('could not read Alice’s meta-address');
    await pointAt(metaCard, { scroll: false });
    await ring(metaCard);
    await hold(2400);
    await ring(null);
  });

  // ---- 3 · DAO payout: propose (the DAO) ------------------------------------------------
  let daoStealth = null;
  await step('3 dao propose', async () => {
    mark('s3', S[3]);
    await asDao();
    await go('DAO payout');
    await page.getByText(/proposals so far/).waitFor({ timeout: 30_000 });
    await caption(S[3], SAY.dao);
    const propose = page.getByRole('button', { name: 'Propose payout' });
    await reveal(page.getByRole('heading', { name: '1 · Propose a payout' }), { align: 'top', top: 50 });
    await pasteInto(page.getByLabel('Contributor'), aliceMeta);
    await typeInto(page.getByLabel('Amount'), '0.1', { delay: 110 });
    await hold(500);
    if (DRY) {
      await pointAt(propose);
      await hold(800);
      return;
    }
    await click(propose);
    const approve = page.getByRole('button', { name: 'Approve & execute' });
    await waitResult(approve, { timeout: T.tx });
    links.push({ label: 'dao proposal', href: await txHref(page.getByRole('link', { name: /Proposed in/ })) });
    const proposal = cardOf(page.getByRole('heading', { name: '2 · Approve & execute' })).locator('dl').first();
    await reveal(proposal, { align: 'top', top: 60 });
    await pointAt(proposal.locator('div', { hasText: 'stealth_account' }).last(), { scroll: false });
    await ring(proposal);
    await hold(3200);
    await ring(null);
  });

  // ---- 4 · Approve & execute ----------------------------------------------------------------
  await step('4 dao approve', async () => {
    if (DRY) return;
    mark('s4', S[4]);
    await caption(S[4], SAY.approve);
    await click(page.getByRole('button', { name: 'Approve & execute' }));
    await waitResult(page.getByText('Executed: the DAO paid a fresh account.'), { timeout: T.tx });
    links.push({ label: 'dao vote', href: await txHref(page.getByRole('link', { name: /Vote transaction/ })) });
    const done = page.getByText('Executed: the DAO paid a fresh account.').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    daoStealth = await done.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title')).find((t) => /^[0-9a-f]{64}$/.test(t ?? '')) ?? null);
    await reveal(done, { align: 'center' });
    await ring(done);
    await hold(1800);
    await ring(null);
  });

  // ---- 5 · Inbox (Alice) -------------------------------------------------------------------------
  let row = null;
  await step('5 inbox', async () => {
    mark('s5', S[5]);
    await asAlice();
    await go('Inbox');
    await caption(S[5], SAY.scan);
    const progress = page.getByRole('progressbar', { name: 'Scan progress' }).locator('xpath=..');
    await pointAt(progress, { scroll: false });
    await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
    if (DRY) {
      await hold(1500);
      return;
    }
    row = daoStealth ? page.locator('li', { has: page.locator(`[title="${daoStealth}"]`) }).first() : page.locator('li').first();
    await row.getByRole('button', { name: 'Pay someone from here' }).waitFor({ timeout: 45_000 });
    await reveal(row, { align: 'top', top: 90 });
    await pointAt(row, { scroll: false, dx: -120 });
    await ring(row);
    await hold(1800);
    await ring(null);
    await caption(S[5], SAY.chain);
    await click(row.getByRole('button', { name: 'Chain view' }));
    const sheet = page.getByRole('dialog');
    await sheet.getByText(/Announcement #\d+/).first().waitFor({ timeout: 30_000 });
    await hold(300);
    await pointAt(sheet.getByText(/Announcement #\d+/).first(), { scroll: false });
    await hold(3400);
    await page.keyboard.press('Escape');
    await hold(400);
  });

  // ---- 6 · Pay onward ------------------------------------------------------------------------------
  await step('6 pay onward', async () => {
    if (DRY) return;
    mark('s6', S[6]);
    await caption(S[6], SAY.onward);
    await click(row.getByRole('button', { name: 'Pay someone from here' }));
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Recipient').waitFor({ timeout: 30_000 });
    await pasteInto(dlg.getByLabel('Recipient'), bobMeta);
    await dlg.getByText(/Valid meta-address/).waitFor({ timeout: 15_000 });
    await typeInto(dlg.getByLabel('Amount'), '0.02', { delay: 110 });
    await hold(400);
    await click(dlg.getByRole('button', { name: 'Review payment' }));
    await dlg.getByText('Lands in').waitFor({ timeout: 30_000 });
    await hold(1500);
    await click(dlg.getByRole('button', { name: 'Confirm and pay' }));
    await waitResult(dlg.getByText(/^Paid onward$/).or(dlg.getByRole('button', { name: 'Done' })), { timeout: T.tx, error: dlg.locator('[role=alert]') });
    links.push({ label: 'pay onward', href: await txHref(dlg.getByRole('link', { name: /tx|transaction/i })) });
    await caption(S[6], SAY.onwardDone);
    await hold(2600);
    await click(dlg.getByRole('button', { name: 'Done' }));
    await hold(300);
  });

  // ---- 7 · Why NEAR ----------------------------------------------------------------------------------
  await step('7 why near', async () => {
    mark('s7', S[7]);
    await noRole();
    await page.goto(`${base}#/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Pay anyone/ }).waitFor();
    await caption(S[7], SAY.near);
    await demo(() => window.__demo.scrollIntoSafe(document.getElementById('why-near'), { align: 'top', top: 30, ms: 1100 }));
    await hold(900);
    const implicit = page.locator('#why-near dl > div').first();
    await pointAt(implicit, { scroll: false, dx: -150 });
    await hold(2400);
    await caption(S[7], SAY.near2);
    await demo(() => window.__demo.scrollToY(window.scrollY + 140, 900));
    await hold(1800);
  });

  // ---- 8 · End card -------------------------------------------------------------------------------------
  await step('8 end', async () => {
    mark('end-card', 'End card');
    await demo((repo) => window.__demo.endCard(repo), REPO);
    await page.mouse.move(1100, 700).catch(() => {});
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
    if (size <= 19 * 1024 * 1024 || crf >= 30) break;
    crf += 2;
    console.log(`[convert] ${(size / 1048576).toFixed(1)} MB is over 19 MB; retrying at crf ${crf}`);
  }
  console.log('[convert] demo.webm (VP9)');
  ff([...cut, '-an', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', webm]);
  return { webm: probe(webm), mp4: probe(mp4) };
}

async function writeReadme(markersRel, info, meta) {
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const rows = markersRel.filter((m) => m.id !== 'end').map((m) => `| ${fmt(m.t)} | ${m.label} |`);
  const md = `# Demo video

[\`demo.mp4\`](demo.mp4) (H.264, for X and most players) and [\`demo.webm\`](demo.webm) (VP9) are the same ${fmt(info.mp4.seconds)} recording of the Perde web app on NEAR testnet. [\`poster.png\`](poster.png) is a frame for the thumbnail.

## The story

One story, two parties: **a DAO pays Alice, a contributor, without the chain learning it was Alice. Alice then spends the money without ever touching her named account.** One browser and one funded testnet wallet play both sides; a role chip in the top-right corner says who is acting ("DAO member" while the DAO proposes and approves the payout, "Alice · contributor" while she receives, scans and pays onward).

1. Title card, then the problem: on NEAR every payment names its recipient. The landing page toggles **Without Perde / With Perde**.
2. **Receive** (Alice): she creates an identity and gets one meta-address. The recovery phrase stays behind the curtain.
3. **DAO payout** (the DAO member): the meta-address is pasted, 0.1 NEAR, **Propose payout**. The public SputnikDAO proposal shows an amount and a fresh account, no recipient.
4. **Approve & execute**: the DAO votes and the payment executes in the same transaction.
5. **Inbox** (Alice): her browser scans the public announcements with her view key and finds the payout. The **Chain view** shows what anyone can read and what only she knows.
6. **Pay someone from here**: she pays 0.02 NEAR onward to a second, freshly generated meta-address. The stealth account signs for itself and pays its own gas; her named account never appears.
7. **Why NEAR**: an implicit account is an ed25519 key, so a stealth key already is an account. No pool, relayer, indexer or backend.
8. End card.

Every transaction on screen is real and was signed in the browser on NEAR testnet; nothing is mocked or edited in, and chain waits are shown as they happened. The recorder adds only a presentation layer drawn over the page: a cursor (Playwright's video does not show the OS cursor), captions, the role chip, the title card and the end card. The 12-word recovery phrase stays behind the app's curtain and the wallet key is never shown. The second meta-address ("someone Alice pays") is generated off-camera with \`@perde/core\`; only its public meta-address is used.

The page is laid out at ${CSS_VIEW.width}×${CSS_VIEW.height} CSS px and rendered at ${SCALE}× (1920×1080 output), so the app's own text is large enough to read on a phone while the desktop sidebar layout still shows.

## Timestamps

| Time | Step |
| --- | --- |
${rows.join('\n')}

## How it was recorded

\`\`\`bash
npm run demo:video          # build, record, convert, sweep leftovers back to the demo wallet
npm run demo:video -- --dry # only checks selectors and navigation, no transactions
\`\`\`

The script is [\`scripts/video/record-demo.mjs\`](../scripts/video/record-demo.mjs). It builds the app into \`scripts/video/.build/\`, serves it locally, injects a funded throwaway testnet account (\`.cache/demo-account.json\`, not committed) into the app's storage, records with Playwright's \`recordVideo\`, trims the page-load frames and converts with the project-local \`ffmpeg-static\` binary. After the take it claims what is left of the payout back to the demo wallet, so a take costs only gas, fees and the small onward payment.

Recorded ${meta.recordedAt}. Take: ${meta.takeName}.
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

    // Playwright's video ignores deviceScaleFactor, so the scale is forced at browser level: the window is
    // CSS_VIEW CSS px and renders at SCALE x, and the screencast is the 1920x1080 device-pixel surface.
    const recBrowser = await chromium.launch({
      headless: !HEADED,
      args: [`--force-device-scale-factor=${SCALE}`, `--window-size=${CSS_VIEW.width},${CSS_VIEW.height}`, '--hide-scrollbars'],
    });
    const ctx = await recBrowser.newContext({
      viewport: null,
      bypassCSP: true, // the app ships a strict CSP; the recorder's overlay needs inline styles
      colorScheme: 'dark',
      recordVideo: { dir: rawDir, size: OUT },
    });
    await prepareContext(ctx, { theme: 'dark', state: initialState(account) });
    await ctx.addInitScript((cfg) => {
      window.__DEMO_CFG = cfg;
    }, { titleOnFirstLoad: true, hideCursorUntilMove: false, appBase: base, scale: SCALE });
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
    await recBrowser.close();
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
