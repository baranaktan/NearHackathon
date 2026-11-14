/**
 * Failure paths: every external dependency fails in a controlled way and the
 * UI must explain it in plain words and recover on retry. The only console
 * noise allowed is the browser's own report of the failed request.
 */
import { expect, FIXTURE_WALLET, go, KNOWN_INVOICE_0, test } from '../support/test';

/** The browser's own report of a request the mock failed on purpose (Chromium / Firefox / WebKit wording). */
const NETWORK_NOISE = /Failed to load resource|net::ERR_|Could not connect to the server|NetworkError|Fetch API cannot load|status of 500|CORS request did not succeed/i;

test.describe('RPC failures', () => {
  test.use({ seed: { identity: true, wallet: true }, chainOptions: { rpc: 'down', existingAccounts: [FIXTURE_WALLET] }, allowConsole: NETWORK_NOISE });

  test('all RPC endpoints down → friendly error, then retry works', async ({ page, chain }) => {
    await go(page, '/app/send');
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t read the Perde contract' });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText('NEAR testnet didn’t respond');
    expect(chain.calls.some((c) => c.host.includes('drpc')) && chain.calls.some((c) => c.host.includes('fastnear'))).toBe(true);
    chain.set({ rpc: 'fixtures' });
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(/^Minimum [\d.]+ NEAR\./)).toBeVisible();
  });

  test('inbox scan with RPC down → "Scan interrupted", retry completes', async ({ page, chain }) => {
    await go(page, '/app/inbox');
    const alert = page.getByRole('alert').filter({ hasText: 'Scan interrupted' });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/didn’t respond|network request failed/);
    chain.set({ rpc: 'fixtures' });
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Nothing behind the curtain yet')).toBeVisible({ timeout: 30_000 });
  });

  test('malformed RPC JSON is treated as an unavailable endpoint, not a crash', async ({ page, chain }) => {
    chain.set({ rpc: 'malformed' });
    await go(page, '/app/settings');
    await expect(page.getByText(/NEAR testnet didn’t respond/).first()).toBeVisible({ timeout: 30_000 });
    chain.set({ rpc: 'http500' });
    await go(page, '/app/inbox');
    await expect(page.getByRole('alert').filter({ hasText: 'Scan interrupted' })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('slow network', () => {
  test.use({ seed: { identity: true, wallet: true }, chainOptions: { rpcDelayMs: 1200, existingAccounts: [FIXTURE_WALLET] }, allowConsole: NETWORK_NOISE });

  test('inbox shows progress while a slow scan runs, then the result', async ({ page }) => {
    await go(page, '/app/inbox');
    await expect(page.getByRole('progressbar', { name: 'Scan progress' }).or(page.locator('[aria-busy="true"]')).first()).toBeVisible();
    await expect(page.getByText('Nothing behind the curtain yet')).toBeVisible({ timeout: 45_000 });
  });

  test('invoice payment: double-click sends ONE transaction and shows progress', async ({ page, chain }) => {
    test.setTimeout(120_000);
    chain.set({ sendTx: 'hang' });
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.05`);
    const pay = page.getByRole('button', { name: 'Pay 0.05 NEAR' });
    await expect(pay).toBeEnabled({ timeout: 30_000 });
    await pay.dblclick();
    await expect(page.getByRole('list', { name: 'Payment progress' }).or(page.getByLabel('Payment progress')).first()).toBeVisible();
    await expect(pay).toHaveCount(0);
    await expect.poll(() => chain.count('send_tx'), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1500);
    // One signed transaction. (Core may retry the same signed tx on the next endpoint; it never signs twice.)
    const signed = new Set(chain.calls.filter((c) => c.method === 'send_tx').map((c) => c.key));
    expect(signed.size).toBe(1);
    // The connection drops after the broadcast: the UI must say "check before retrying", with the hash.
    chain.releaseHung();
    const alert = page.getByRole('alert').filter({ hasText: 'Payment not sent' });
    await expect(alert).toBeVisible({ timeout: 90_000 });
    await expect(alert.getByRole('link', { name: /Check this transaction first/ })).toBeVisible();
  });
});

test.describe('offline at submit time', () => {
  test.use({ seed: { identity: true, wallet: true }, chainOptions: { existingAccounts: [FIXTURE_WALLET] }, allowConsole: NETWORK_NOISE });

  test('paying an invoice while offline fails with a clear message and nothing is broadcast', async ({ page, context, chain }) => {
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.05`);
    const pay = page.getByRole('button', { name: 'Pay 0.05 NEAR' });
    await expect(pay).toBeEnabled({ timeout: 30_000 });
    // Playwright still hands intercepted requests to route handlers while offline, so the mock goes down too.
    await context.setOffline(true);
    chain.set({ rpc: 'down' });
    await pay.click();
    const alert = page.getByRole('alert').filter({ hasText: 'Payment not sent' });
    await expect(alert).toBeVisible({ timeout: 45_000 });
    await expect(alert).toContainText(/network request failed|didn’t respond/);
    expect(chain.count('send_tx')).toBe(0);
    await context.setOffline(false);
    chain.set({ rpc: 'fixtures' });
    await expect(page.getByRole('button', { name: 'Pay 0.05 NEAR' })).toBeEnabled();
  });
});

test.describe('1Click failures', () => {
  test.use({ allowConsole: NETWORK_NOISE });

  test('quote HTTP 500 → error state, retry gets a quote', async ({ page, chain }) => {
    chain.set({ oneClick: 'http500' });
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.5`);
    await page.getByRole('button', { name: 'Get quote' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'No quote for this route' });
    await expect(alert).toBeVisible();
    chain.set({ oneClick: 'fixtures' });
    await page.getByRole('button', { name: 'Get quote' }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByText('Payer sends about')).toBeVisible();
  });

  test('quote timeout → "didn’t respond" after the client timeout, no hang', async ({ page, chain }) => {
    test.setTimeout(90_000);
    chain.set({ oneClick: 'timeout' });
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.5`);
    await page.getByRole('button', { name: 'Get quote' }).click();
    await expect(page.getByRole('button', { name: /Fetching quote|Get quote/ })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /didn’t respond/ })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole('button', { name: 'Get quote' })).toBeEnabled();
  });

  test('token list down → error with retry', async ({ page, chain }) => {
    chain.set({ oneClick: 'down' });
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.5`);
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load the 1Click token list' });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    chain.set({ oneClick: 'fixtures' });
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toBeHidden();
    await page.getByRole('button', { name: 'Get quote' }).click();
    await expect(page.getByText('Payer sends about')).toBeVisible();
  });
});

test.describe('faucet', () => {
  test.use({ chainOptions: { faucet: 'rate-limited' }, allowConsole: /status of 429|Failed to load resource|CORS request did not succeed/i });

  test('HTTP 429 → explains the rate limit and points to "use an existing account"', async ({ page, chain }) => {
    await go(page, '/app/settings');
    await page.getByRole('button', { name: 'Create & fund' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'rate-limited' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Use an existing testnet account instead');
    expect(chain.faucetCalls).toHaveLength(1); // a 429 is not retried
    await expect(page.getByRole('button', { name: 'Create & fund' })).toBeVisible(); // not offered as "Try again"
    await expect(page.getByLabel('Account id')).toBeVisible();
  });
});
