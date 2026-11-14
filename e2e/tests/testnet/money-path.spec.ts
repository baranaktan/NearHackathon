/**
 * The whole money path on REAL NEAR testnet, as assertions. Every payment goes
 * to this run's own fresh identity and is claimed back to the funder at the
 * end, so the run costs only fees and gas (≈0.05–0.1 NEAR).
 */
import { claimAll, expect, FUNDER_PATH, go, loadFunder, T, test, walletBalance } from '../../support/live';

test.skip(!loadFunder(), `no funded testnet account at ${FUNDER_PATH} (set PERDE_FUNDER_JSON)`);
test.describe.configure({ mode: 'serial' });

// If a step fails, still sweep whatever this run's identity holds back to the funder.
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) await claimAll(page).catch(() => undefined);
});

test('send → inbox → chain view → pay onward → claim; name; invoice; quote; payroll; DAO; audit; receipts', async ({ page, funder }) => {
  const startBalance = await walletBalance(page);
  test.info().annotations.push({ type: 'funder-balance-start', description: `${startBalance} NEAR (${funder.accountId})` });
  let receipt = '';
  let meta = '';

  await test.step('create a fresh identity', async () => {
    await go(page, '/app/receive');
    await page.getByRole('button', { name: 'Create identity' }).click();
    await page.getByRole('button', { name: 'Reveal recovery phrase' }).click();
    await page.getByLabel('I have stored these words somewhere safe and offline.').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    meta = (await page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first().textContent())!.trim();
    expect(meta).toMatch(/^perde:/);
  });

  await test.step('send 0.05 NEAR to own meta-address', async () => {
    await go(page, '/app/send');
    await page.getByRole('button', { name: 'Pay myself' }).click();
    await page.getByLabel('Amount').fill('0.05');
    await expect(page.getByRole('button', { name: 'Review payment' })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Review payment' }).click();
    await page.getByRole('button', { name: 'Confirm and send' }).click();
    await expect(page.getByRole('heading', { name: 'Paid. The curtain stays closed.' })).toBeVisible({ timeout: T.tx });
    receipt = await page.locator('textarea[readonly]').inputValue();
    expect(receipt).toMatch(/^perdereceipt:/);
    await expect(page.getByRole('link', { name: /View transaction/ }).first()).toHaveAttribute('href', /testnet\.nearblocks\.io\/txns\//);
  });

  await test.step('inbox finds it; chain view shows the real announcement', async () => {
    await go(page, '/app/inbox');
    await expect(page.getByText(/announcements checked/)).toBeVisible({ timeout: T.scan });
    await expect(page.getByRole('button', { name: 'Claim to…' }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Chain view' }).nth(1).click();
    await expect(page.getByText(/Announcement #\d+/).first()).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
  });

  await test.step('pay 0.02 onward from the stealth account to own meta-address', async () => {
    const row = page.locator('li', { has: page.getByRole('button', { name: 'Pay someone from here' }) }).first();
    await row.getByRole('button', { name: 'Pay someone from here' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'My own address' }).click();
    await d.getByLabel('Amount').fill('0.02');
    await expect(d.getByText('Recipient receives')).toBeVisible({ timeout: 30_000 });
    await d.getByRole('button', { name: 'Review payment' }).click();
    await d.getByRole('button', { name: 'Confirm and pay' }).click();
    await expect(d.getByText('Still nothing links it to you.')).toBeVisible({ timeout: T.tx });
    await d.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Partly paid onward').first()).toBeVisible({ timeout: T.scan });
  });

  await test.step('register the wallet name, then pay by name', async () => {
    await go(page, '/app/receive');
    const register = page.getByRole('button', { name: /^(Register name|Replace with this meta-address)$/ });
    await expect(register.or(page.getByText('Registered', { exact: true }))).toBeVisible({ timeout: 30_000 });
    if (await register.isVisible()) await register.click();
    await expect(page.getByText(`Also reachable as ${funder.accountId}`)).toBeVisible({ timeout: T.tx });
    await go(page, '/app/send');
    await page.getByLabel('Recipient').fill(funder.accountId.toUpperCase());
    await expect(page.getByText(/Your own meta-address|Registered meta-address found/)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Amount').fill('0.02');
    await page.getByRole('button', { name: 'Review payment' }).click();
    await expect(page.getByRole('main').getByText(funder.accountId).first()).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and send' }).click();
    await expect(page.getByRole('heading', { name: 'Paid. The curtain stays closed.' })).toBeVisible({ timeout: T.tx });
  });

  let payLink = '';
  await test.step('invoice → pay from #/pay → inbox shows it; real dry quote', async () => {
    await go(page, '/app/invoice');
    await page.getByLabel(/^Amount/).fill('0.1');
    await page.getByLabel(/^Note/).fill('E2E invoice');
    await page.getByRole('button', { name: 'Create invoice' }).click();
    await expect(page.getByText('Invoice #0', { exact: true })).toBeVisible();
    payLink = (await page.locator('[title*="#/pay?to="]').first().getAttribute('title'))!;
    await page.goto(payLink);
    const pay = page.getByRole('button', { name: 'Pay 0.1 NEAR' });
    await expect(pay).toBeEnabled({ timeout: 30_000 });
    await pay.click();
    await expect(page.getByText('Paid 0.1 NEAR')).toBeVisible({ timeout: T.tx });
    await page.getByRole('button', { name: 'Get quote' }).click();
    const sends = page.getByText('Payer sends about').locator('..');
    await expect(sends).toBeVisible({ timeout: 45_000 });
    const n = Number(/([\d.]+)/.exec((await sends.innerText()).replace(/,/g, ''))?.[1]);
    expect(n).toBeGreaterThan(0);
    await go(page, '/app/inbox');
    await expect(page.getByText('Invoice #0').first()).toBeVisible({ timeout: T.scan });
  });

  await test.step('payroll sample batch (2 payments, one transaction)', async () => {
    await go(page, '/app/payroll');
    await page.getByRole('button', { name: 'Load sample' }).click();
    await expect(page.getByText('2 ready')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Review batch' }).click();
    await page.getByRole('button', { name: 'Send 2 payments' }).click();
    await expect(page.getByText('2 of 2 paid in one transaction.')).toBeVisible({ timeout: T.tx });
  });

  await test.step('DAO payout: propose → approve → inbox finds it', async () => {
    await go(page, '/app/dao');
    await expect(page.getByText(/proposals so far/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Propose payout' }).click();
    await page.getByRole('button', { name: 'Approve & execute' }).click({ timeout: T.tx });
    await expect(page.getByText('Executed: the DAO paid a fresh account.')).toBeVisible({ timeout: T.tx });
    const titles = await page.locator('div.rounded-lg', { hasText: 'Executed: the DAO paid a fresh account.' }).last().locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
    const daoStealth = titles.find((t) => /^[0-9a-f]{64}$/.test(t ?? ''));
    expect(daoStealth).toBeTruthy();
    await go(page, '/app/inbox');
    await expect(page.locator(`[title="${daoStealth}"]`).first()).toBeVisible({ timeout: T.scan });
  });

  await test.step('audit with the viewing key lists the payments read-only', async () => {
    await go(page, '/app/audit');
    await page.getByRole('button', { name: 'Use my viewing key' }).click();
    await page.getByRole('button', { name: 'Open read-only view' }).click();
    await expect(page.getByText(/payments · received/)).toBeVisible({ timeout: T.scan });
  });

  await test.step('receipt deep link verifies; a tampered receipt fails', async () => {
    await go(page, `/app/verify?${new URLSearchParams({ r: receipt })}`);
    await expect(page.getByRole('heading', { name: 'Verified payment' })).toBeVisible({ timeout: 60_000 });
    const data = JSON.parse(Buffer.from(receipt.slice('perdereceipt:'.length), 'base64url').toString()) as Record<string, string>;
    const stealth = data.stealth!;
    const tampered = 'perdereceipt:' + Buffer.from(JSON.stringify({ ...data, stealth: (stealth[0] === 'a' ? 'b' : 'a') + stealth.slice(1) })).toString('base64url');
    await go(page, '/app/verify');
    await page.getByLabel('Receipt').fill(tampered);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText(/The stealth account derives from the meta-address — fail/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Verified payment' })).toHaveCount(0);
  });

  await test.step('claim everything back and unregister the name (refund)', async () => {
    const n = await claimAll(page);
    expect(n).toBeGreaterThanOrEqual(5);
    await go(page, '/app/receive');
    await page.getByRole('button', { name: 'Unregister and refund the deposit' }).click();
    await expect(page.getByRole('button', { name: 'Register name' })).toBeVisible({ timeout: T.tx });
    const end = await walletBalance(page);
    test.info().annotations.push({ type: 'funder-balance-end', description: `${end} NEAR (spent ${(startBalance - end).toFixed(4)})` });
    console.log(`[money-path] funder ${funder.accountId}: ${startBalance} → ${end} NEAR (net ${(end - startBalance).toFixed(4)})`);
    expect(startBalance - end).toBeLessThan(0.3);
  });
});
