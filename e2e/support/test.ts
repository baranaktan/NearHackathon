/**
 * Shared Playwright fixtures for the offline suite.
 *
 * Every test gets:
 *  - `chain`: the recorded-fixture route mock for RPC / 1Click / faucet
 *    (support/chain-mock.ts), installed before the first navigation;
 *  - automatic checks after the test body: zero console errors/warnings,
 *    zero page errors, no request to an origin outside the allow-list, no
 *    chain request the fixtures could not answer, and no horizontal overflow
 *    on the last page.
 *
 * Tests that simulate failures declare the console noise they expect with
 * `test.use({ allowConsole: /…/ })` — only network-failure messages the
 * browser itself prints, never app errors.
 */
import { generateKeyPairSync } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { ChainMock, type ChainMockOptions } from './chain-mock';
import { FAUCET_HOST, ONECLICK_HOST, RPC_HOST_RE } from './rpc-key.mjs';

export { expect };

export const KNOWN_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
/** Derived with @perde/core from KNOWN_MNEMONIC (also asserted against core in identity.spec.ts). */
export const KNOWN_META =
  'perde:XEs19o3wLmbQ5FsNyX2dHdc7sgtL1SfmGrJbjtxiDhwB51Q3tHd4VTCXM8HH8URojB1yqkmBF7Zoe45ppiUBGpCDFBidX';
export const KNOWN_INVOICE_0 = '8a30b197599df1f407e586db6a7bdec380e96b3c775e4a112a568140d5057fa9';
export const KNOWN_INVOICE_1 = 'b28de55a598da3a3a626299182b58beee0389b142c0cc8974e4ebb7159eb27bc';
/** The account the recorded fixtures read as "the wallet" (public contract account; the key below cannot sign for it). */
export const FIXTURE_WALLET = 'perde-pay.testnet';
/** A fresh ed25519 key in NEAR format, generated per run. It controls nothing on any network. */
export const THROWAWAY_KEY = throwawayNearKey();

export interface StateSeed {
  wallet?: boolean;
  identity?: boolean;
  invoices?: Array<{ index: number; amountYocto: string | null; note: string; createdAtMs: number }>;
  extra?: Record<string, unknown>;
}

export function persistedState(seed: StateSeed = {}): Record<string, unknown> {
  return {
    v: 1,
    wallet: seed.wallet ? { accountId: FIXTURE_WALLET, secretKey: THROWAWAY_KEY, source: 'import', addedAtMs: 1 } : null,
    identity: seed.identity ? { mnemonic: KNOWN_MNEMONIC, confirmed: true, createdAtMs: 1 } : null,
    invoices: seed.invoices ?? [],
    nextInvoiceIndex: seed.invoices?.length ?? 0,
    sent: [],
    claims: {},
    scan: null,
    demo: { dismissed: false, chainViewSeen: false, quoteSeen: false, daoPaid: false },
    ...seed.extra,
  };
}

/** Origins the app may contact; anything else is a failure. */
const ALLOWED_HOST = (host: string) => host === '127.0.0.1' || host === 'localhost' || RPC_HOST_RE.test(host) || host === ONECLICK_HOST || host === FAUCET_HOST;

interface Fixtures {
  chainOptions: ChainMockOptions;
  /** Console messages (error/warning) this test expects, e.g. the browser's own "Failed to load resource" for aborted requests. */
  allowConsole: RegExp | null;
  /** Persisted app state to seed before the first page load (null = fresh browser). */
  seed: StateSeed | null;
  theme: 'dark' | 'light';
  chain: ChainMock;
  problems: string[];
}

export const test = base.extend<Fixtures>({
  chainOptions: [{}, { option: true }],
  allowConsole: [null, { option: true }],
  seed: [null, { option: true }],
  theme: ['dark', { option: true }],
  problems: async ({}, use) => {
    await use([]);
  },
  chain: async ({ context, chainOptions }, use) => {
    const mock = new ChainMock(chainOptions);
    await mock.install(context);
    await use(mock);
  },
  page: async ({ page, chain, allowConsole, seed, theme, problems }, use, testInfo) => {
    await page.addInitScript(
      ([t, state]) => {
        try {
          if (!sessionStorage.getItem('e2e-seeded')) {
            sessionStorage.setItem('e2e-seeded', '1');
            localStorage.setItem('perde-theme', t as string);
            if (state) localStorage.setItem('perde:state', state as string);
          }
        } catch {
          /* storage disabled in this test */
        }
      },
      [theme, seed ? JSON.stringify(persistedState(seed)) : null] as const,
    );
    page.on('console', async (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      let text = m.text();
      // Firefox prints object arguments as "JSHandle@object": resolve them so the message is readable.
      if (text.includes('JSHandle@')) {
        const parts = await Promise.all(m.args().map((a) => a.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v))).catch(() => '<argument of an unloaded document>')));
        text = parts.join(' ');
      }
      if (allowConsole?.test(text)) return;
      problems.push(`console ${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => {
      if (allowConsole?.test(e.message)) return; // e.g. WebKit rejecting fetches that a reload cancelled
      problems.push(`page error: ${e.message}`);
    });
    page.on('request', (r) => {
      const u = new URL(r.url());
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !ALLOWED_HOST(u.hostname)) problems.push(`unexpected origin: ${u.origin}`);
    });
    await use(page);
    if (!page.isClosed() && testInfo.status === testInfo.expectedStatus) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
      if (overflow > 0) problems.push(`horizontal overflow of ${overflow}px on ${page.url()}`);
    }
    for (const u of chain.unhandled) problems.push(`chain request without a recorded fixture: ${u}`);
    if (testInfo.status === testInfo.expectedStatus) expect(problems, 'console errors/warnings, page errors, unexpected origins, unrecorded chain calls, overflow').toEqual([]);
  },
});

/** Hash-route navigation. */
export async function go(page: Page, hash: string): Promise<void> {
  await page.goto(`./#${hash}`, { waitUntil: 'domcontentloaded' });
}

export async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** "ed25519:<base58(seed ‖ public key)>", the NEAR secret-key format. */
export function throwawayNearKey(): string {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d as string, 'base64url');
  const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url');
  return `ed25519:${base58(new Uint8Array([...seed, ...pub]))}`;
}
