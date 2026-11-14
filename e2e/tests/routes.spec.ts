import { expect, FIXTURE_WALLET, go, KNOWN_META, test } from '../support/test';

test.describe('fresh browser: every route renders its no-wallet / no-identity state', () => {
  test('guided demo', async ({ page }) => {
    await go(page, '/app/start');
    await expect(page.getByRole('heading', { name: 'See it work in a minute', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Run the demo for me' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run steps 1–4' })).toBeEnabled();
    await expect(page.getByRole('main').locator('a[href="#/app/settings"]').first()).toBeVisible(); // step 1: get a demo wallet
  });

  test('receive offers create or restore', async ({ page }) => {
    await go(page, '/app/receive');
    await expect(page.getByRole('button', { name: 'Create identity' })).toBeVisible();
    await expect(page.getByLabel('Recovery phrase')).toBeVisible();
  });

  test('send asks for a wallet and validates nothing yet', async ({ page }) => {
    await go(page, '/app/send');
    await expect(page.getByText('No account to pay from')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get a demo wallet', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  });

  test('inbox and invoice need an identity', async ({ page }) => {
    for (const r of ['/app/inbox', '/app/invoice']) {
      await go(page, r);
      await expect(page.getByText('No identity in this browser')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Set up receiving' })).toBeVisible();
    }
  });

  test('payroll asks for a wallet and an identity for the sample', async ({ page }) => {
    await go(page, '/app/payroll');
    await expect(page.getByText('No account to pay from')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load sample' })).toBeDisabled();
    await expect(page.getByText('No rows yet')).toBeVisible();
  });

  test('DAO page reads the recorded DAO state and asks for a wallet to propose', async ({ page }) => {
    await go(page, '/app/dao');
    await expect(page.getByText('No account to propose from')).toBeVisible();
    await expect(page.getByText(/proposals so far/)).toBeVisible();
  });

  test('audit and verify start empty', async ({ page }) => {
    await go(page, '/app/audit');
    await expect(page.getByRole('button', { name: 'Open read-only view' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Use my viewing key' })).toHaveCount(0);
    await go(page, '/app/verify');
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled();
  });

  test('settings offers both wallet options and shows the network', async ({ page }) => {
    await go(page, '/app/settings');
    await expect(page.getByRole('button', { name: 'Create & fund' })).toBeVisible();
    await expect(page.getByLabel('Account id')).toBeVisible();
    await expect(page.getByLabel('Full-access secret key')).toHaveAttribute('type', 'password');
    await expect(page.getByText('perde-pay.testnet').first()).toBeVisible();
    await expect(page.getByText(/^v\d/)).toBeVisible();
  });
});

test.describe('identity + read-only wallet (recorded chain data)', () => {
  test.use({ seed: { identity: true, wallet: true }, chainOptions: { existingAccounts: [FIXTURE_WALLET] } });

  test('send shows the recorded balance, contract minimum and fee', async ({ page }) => {
    await go(page, '/app/send');
    await expect(page.getByText(/^Available [\d,.]+ NEAR$/)).toBeVisible();
    await expect(page.getByText(/^Minimum [\d.]+ NEAR\. Plus a [\d.]+ NEAR announcement fee/)).toBeVisible();
    await page.getByRole('button', { name: 'Pay myself' }).click();
    await expect(page.getByLabel('Recipient')).toHaveValue(KNOWN_META);
    await expect(page.getByText('Your own meta-address')).toBeVisible();
  });

  test('inbox scans the recorded announcements and finds nothing for this identity', async ({ page }) => {
    await go(page, '/app/inbox');
    await expect(page.getByText(/announcements checked/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nothing behind the curtain yet')).toBeVisible();
  });

  test('audit with own viewing key completes read-only', async ({ page }) => {
    await go(page, '/app/audit');
    await page.getByRole('button', { name: 'Use my viewing key' }).click();
    await page.getByRole('button', { name: 'Open read-only view' }).click();
    await expect(page.getByText('No payments for this key')).toBeVisible({ timeout: 30_000 });
  });
});
