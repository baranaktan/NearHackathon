/**
 * Shared plumbing for the demo recorder and the screenshot script: paths, the
 * production build, the funded demo account, app-state injection (the same
 * shape apps/web/scripts/e2e-smoke.mjs uses), and the post-take sweep that
 * claims every leftover payment back to the demo wallet.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balanceYocto, fmtNear } from './near.mjs';

export const videoDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const repoRoot = resolve(videoDir, '..', '..');
export const webDir = join(repoRoot, 'apps', 'web');
export const buildDir = join(videoDir, '.build');
export const distDir = join(buildDir, 'dist');
export const stateDir = join(videoDir, '.state');
export const demoOut = join(repoRoot, 'demo');
export const shotsOut = join(repoRoot, 'docs', 'screenshots');
export const overlayPath = join(videoDir, 'lib', 'overlay.js');
export const REPO = 'github.com/baranaktan/Perde';

export const T = { tx: 90_000, scan: 120_000, quote: 45_000 };

/** Build the web app into our own output directory (never apps/web/dist, which another process may be using). */
export function buildApp() {
  const vite = join(webDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error(`vite not found at ${vite}; run "npm run setup" first`);
  console.log(`[build] vite build → ${distDir}`);
  execFileSync(process.execPath, [vite, 'build', '--outDir', distDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: webDir, stdio: 'inherit' });
}

/** The funded throwaway testnet account used for filming. The key is never printed. */
export async function loadDemoAccount() {
  const p = process.env.PERDE_VIDEO_ACCOUNT_JSON ?? join(repoRoot, '.cache', 'demo-account.json');
  const a = JSON.parse(await readFile(p, 'utf8'));
  if (typeof a.accountId !== 'string' || typeof a.secretKey !== 'string' || !a.secretKey.startsWith('ed25519:')) {
    throw new Error(`${p} must hold {accountId, secretKey}`);
  }
  return { accountId: a.accountId, secretKey: a.secretKey };
}

export function initialState(account) {
  return {
    v: 1,
    wallet: { accountId: account.accountId, secretKey: account.secretKey, source: 'import', addedAtMs: Date.now() },
    identity: null,
    invoices: [],
    nextInvoiceIndex: 0,
    sent: [],
    claims: {},
    scan: null,
    demo: { dismissed: false, chainViewSeen: false, quoteSeen: false, daoPaid: false },
  };
}

/** Theme + (optionally) the initial app state, written before the app boots. */
export async function prepareContext(ctx, { theme = 'dark', state = null }) {
  await ctx.addInitScript(
    ([t, s]) => {
      try {
        localStorage.setItem('perde-theme', t);
        if (s && !localStorage.getItem('perde:state')) localStorage.setItem('perde:state', s);
      } catch {
        /* storage blocked */
      }
    },
    [theme, state ? JSON.stringify(state) : null],
  );
}

export async function walletBalance(accountId) {
  try {
    return await balanceYocto(accountId);
  } catch (e) {
    console.warn(`[balance] could not read ${accountId}: ${e.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Takes ledger: which take states exist and whether they were swept.        */
/* ------------------------------------------------------------------------ */

const ledgerPath = join(stateDir, 'ledger.json');

export async function readLedger() {
  try {
    return JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch {
    return { takes: [] };
  }
}

export async function writeLedger(l) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(ledgerPath, JSON.stringify(l, null, 2));
}

export async function saveTakeState(name, storage) {
  await mkdir(stateDir, { recursive: true });
  const file = join(stateDir, `${name}.storage.json`);
  await writeFile(file, JSON.stringify(storage));
  return file;
}

export async function listTakeStates() {
  if (!existsSync(stateDir)) return [];
  return (await readdir(stateDir)).filter((f) => f.endsWith('.storage.json')).map((f) => join(stateDir, f));
}

/* ------------------------------------------------------------------------ */
/* Sweep: claim every unclaimed payment back to the demo wallet, unregister. */
/* ------------------------------------------------------------------------ */

/**
 * Runs headless and unrecorded. Uses the app's own Inbox (full sweep to the
 * suggested demo wallet), so the stealth accounts sign their own claims.
 * Returns the updated storage state.
 */
/** Storage states are keyed by origin; the local server's port changes between runs. */
export function rebase(storageState, base) {
  const origin = new URL(base).origin;
  return { ...storageState, origins: (storageState.origins ?? []).map((o) => (/^http:\/\/127\.0\.0\.1:\d+$/.test(o.origin) ? { ...o, origin } : o)) };
}

export async function sweep(browser, base, storageFile, { unregister = true, log = console.log } = {}) {
  const storageState = rebase(JSON.parse(await readFile(storageFile, 'utf8')), base);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce', storageState });
  await prepareContext(ctx, { theme: 'dark' });
  const page = await ctx.newPage();
  let claimed = 0;
  let skipped = 0;
  try {
    await page.goto(`${base}#/app/inbox`, { waitUntil: 'domcontentloaded' });
    const raw = await page.evaluate(() => localStorage.getItem('perde:state'));
    if (!raw || !JSON.parse(raw).identity) {
      log('[sweep] no identity in this state; nothing to sweep');
      return storageState;
    }
    await page.goto(`${base}#/app/inbox`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
    await page.waitForTimeout(1500);
    const claimButtons = page.getByRole('button', { name: /^(Claim to…|Claim the rest…|Retry claim)$/ });
    for (let i = 0; i < 20; i++) {
      // Balances load per row; wait until no row shows a skeleton in place of its buttons.
      await page.waitForTimeout(800);
      const n = await claimButtons.count();
      if (n <= skipped) break;
      const btn = claimButtons.nth(skipped);
      await btn.click();
      const dlg = page.getByRole('dialog');
      // The dialog no longer pre-fills a destination: type the demo wallet (the sweep's own, never a person's).
      const destInput = dlg.getByLabel('Destination account');
      await destInput.waitFor({ timeout: 15_000 }).catch(() => {});
      if (!(await destInput.inputValue().catch(() => ''))) await destInput.fill((await loadDemoAccount()).accountId).catch(() => {});
      await dlg.getByText(/Destination receives about|Enter a NEAR account id|insufficient|not enough|too little/i).first().waitFor({ timeout: 30_000 }).catch(() => {});
      const claim = dlg.getByRole('button', { name: 'Claim', exact: true });
      if (!(await claim.isEnabled().catch(() => false))) {
        log(`[sweep] payment ${skipped + 1}: claim not possible (${(await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 140)}), skipping`);
        await dlg.getByRole('button', { name: 'Cancel' }).click();
        skipped++;
        continue;
      }
      await claim.click();
      // Wait for this claim to settle (no row is still "Claiming to …").
      await page.getByText(/^Claiming to/).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => /Claiming to/.test(e.textContent ?? '')), null, { timeout: T.tx });
      const err = await page.locator('li [role=alert]').count();
      if (err > 0) {
        log(`[sweep] a claim reported an error: ${(await page.locator('li [role=alert]').first().innerText()).slice(0, 200)}`);
        skipped++;
      } else claimed++;
    }
    log(`[sweep] claimed ${claimed} payment(s), skipped ${skipped}`);
    if (unregister) {
      await page.goto(`${base}#/app/receive`, { waitUntil: 'domcontentloaded' });
      const unreg = page.getByRole('button', { name: 'Unregister and refund the deposit' });
      const reg = page.getByRole('button', { name: /^(Register name|Replace with this meta-address)$/ });
      await Promise.race([unreg.waitFor({ timeout: 30_000 }), reg.waitFor({ timeout: 30_000 })]).catch(() => {});
      if (await unreg.isVisible().catch(() => false)) {
        await unreg.click();
        await reg.waitFor({ timeout: T.tx });
        log('[sweep] name unregistered, storage deposit refunded');
      }
    }
    return await ctx.storageState();
  } finally {
    await ctx.close();
  }
}

export const near = fmtNear;

/** Project-local ffmpeg binary (ffmpeg-static devDependency); no system ffmpeg. */
export const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static');
