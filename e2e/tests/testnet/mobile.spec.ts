/** The core money path on a phone viewport, real testnet: send to self → inbox → claim back. */
import { claimAll, expect, FUNDER_PATH, go, loadFunder, T, test, walletBalance } from '../../support/live';

test.skip(!loadFunder(), `no funded testnet account at ${FUNDER_PATH} (set PERDE_FUNDER_JSON)`);

test('mobile: identity → send 0.03 to self → inbox finds it → claim back', async ({ page, funder }) => {
  const start = await walletBalance(page);
  await go(page, '/app/receive');
  await page.getByRole('button', { name: 'Create identity' }).click();
  await page.getByRole('button', { name: 'Reveal recovery phrase' }).click();
  await page.getByLabel('I have stored these words somewhere safe and offline.').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await go(page, '/app/send');
  await page.getByRole('button', { name: 'Pay myself' }).click();
  await page.getByLabel('Amount').fill('0.03');
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Review payment' }).click();
  await page.getByRole('button', { name: 'Confirm and send' }).click();
  await expect(page.getByRole('heading', { name: 'Paid. The curtain stays closed.' })).toBeVisible({ timeout: T.tx });
  // Navigate with the tab bar, like a phone user.
  await page.locator('nav[aria-label="App"]').filter({ visible: true }).getByRole('link', { name: 'Inbox' }).click();
  await expect(page.getByRole('button', { name: 'Claim to…' }).first()).toBeVisible({ timeout: T.scan });
  expect(await claimAll(page)).toBe(1);
  const end = await walletBalance(page);
  console.log(`[mobile] funder ${funder.accountId}: ${start} → ${end} NEAR`);
  expect(start - end).toBeLessThan(0.05);
});
