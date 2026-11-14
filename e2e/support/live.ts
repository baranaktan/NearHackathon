/**
 * Fixtures for the LIVE testnet suite (playwright.testnet.config.ts). No
 * mocks: the app talks to real NEAR testnet RPC and 1Click (dry quotes only).
 * A funded throwaway account is injected into the app's storage — never the
 * faucet. Every test fails on any console error/warning, page error, request
 * to an unexpected origin, or horizontal overflow of the last page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { FAUCET_HOST, ONECLICK_HOST, RPC_HOST_RE } from './rpc-key.mjs';

export { expect };

export const FUNDER_PATH = process.env.PERDE_FUNDER_JSON ?? join(process.cwd(), '..', 'packages', 'core', 'node_modules', '.cache', 'perde-testnet', 'funder.json');

export function loadFunder(): { accountId: string; secretKey: string } | null {
  if (!existsSync(FUNDER_PATH)) return null;
  const f = JSON.parse(readFileSync(FUNDER_PATH, 'utf8')) as { accountId?: unknown; secretKey?: unknown };
  if (typeof f.accountId !== 'string' || typeof f.secretKey !== 'string' || !f.secretKey.startsWith('ed25519:')) throw new Error(`${FUNDER_PATH} must hold {accountId, secretKey}`);
  return { accountId: f.accountId, secretKey: f.secretKey };
}

const ALLOWED = (host: string) => host === '127.0.0.1' || RPC_HOST_RE.test(host) || host === ONECLICK_HOST || host === FAUCET_HOST;

export const test = base.extend<{ problems: string[]; funder: { accountId: string; secretKey: string } }>({
  funder: async ({}, use) => {
    const f = loadFunder();
    if (!f) throw new Error('no funder (checked in the config before any test runs)');
    await use(f);
  },
  problems: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, funder, problems }, use, testInfo) => {
    await page.addInitScript((state) => {
      if (!localStorage.getItem('perde:state')) localStorage.setItem('perde:state', state);
    }, JSON.stringify({ v: 1, wallet: { accountId: funder.accountId, secretKey: funder.secretKey, source: 'import', addedAtMs: Date.now() }, identity: null, invoices: [], nextInvoiceIndex: 0, sent: [], claims: {}, scan: null, demo: { dismissed: false, chainViewSeen: false, quoteSeen: false, daoPaid: false } }));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console ${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !ALLOWED(u.hostname)) problems.push(`unexpected origin: ${u.origin}`);
    });
    await use(page);
    if (!page.isClosed()) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
      if (overflow > 0) problems.push(`horizontal overflow of ${overflow}px on ${page.url()}`);
    }
    if (testInfo.status === testInfo.expectedStatus) expect(problems, 'console errors/warnings, page errors, unexpected origins, overflow').toEqual([]);
  },
});

export const go = (page: Page, hash: string) => page.goto(`./#${hash}`, { waitUntil: 'domcontentloaded' });
export const T = { tx: 90_000, scan: 120_000 };

/** Spendable balance shown for the wallet in Settings, in NEAR (number, display precision). */
export async function walletBalance(page: Page): Promise<number> {
  await go(page, '/app/settings');
  const line = page.getByText(/available · updated/).first();
  await line.waitFor({ timeout: 30_000 });
  const text = (await line.locator('..').innerText()).replace(/,/g, '');
  const m = /([\d.]+)\s*NEAR/.exec(text);
  if (!m) throw new Error(`no balance in "${text}"`);
  return Number(m[1]);
}

/** Claim every unclaimed payment in the Inbox back to the wallet (full sweeps). Returns how many were claimed. */
export async function claimAll(page: Page): Promise<number> {
  await go(page, '/app/inbox');
  await page.getByText(/announcements checked/).waitFor({ timeout: T.scan });
  let claimed = 0;
  for (let guard = 0; guard < 12; guard++) {
    const buttons = page.getByRole('button', { name: /^(Claim to…|Claim the rest…)$/ });
    await page.waitForTimeout(1500); // balances load per row
    const n = await buttons.count();
    if (n === 0) break;
    await buttons.first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('button.rounded-full').first().click(); // the destination starts empty; take the suggested demo wallet
    await expect(dialog.getByText('Destination receives about')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Claim', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /Claiming to/ })).toHaveCount(0, { timeout: T.tx });
    await expect(page.getByRole('alert').filter({ hasText: /claim/i })).toHaveCount(0);
    claimed++;
  }
  return claimed;
}
