import { expect, go, KNOWN_INVOICE_0, KNOWN_INVOICE_1, KNOWN_META, test } from '../support/test';

test.describe('invoice creation (identity, no wallet)', () => {
  test.use({ seed: { identity: true } });

  test('creates deterministic one-time accounts with pay link and QR', async ({ page }) => {
    await go(page, '/app/invoice');
    await expect(page.getByText('No invoice yet')).toBeVisible();
    await page.getByLabel(/^Amount/).fill('0.5');
    await page.getByLabel(/^Note/).fill('November retainer');
    await page.getByRole('button', { name: 'Create invoice' }).click();
    await expect(page.getByText('Invoice #0', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'November retainer' })).toBeVisible();
    const link0 = (await page.locator('[title*="#/pay?to="]').first().getAttribute('title'))!;
    const q = new URLSearchParams(link0.split('#/pay?')[1]);
    expect(q.get('to')).toBe(KNOWN_INVOICE_0);
    expect(q.get('amount')).toBe('0.5');
    expect(q.get('note')).toBe('November retainer');
    await expect(page.getByRole('img', { name: 'QR code for invoice 0' })).toBeVisible();
    await expect(page.getByText('Waiting for payment')).toBeVisible();

    // Second invoice: any amount, next index.
    await page.getByRole('button', { name: 'Create invoice' }).click();
    await expect(page.getByText('Invoice #1', { exact: true })).toBeVisible();
    const link1 = (await page.locator('[title*="#/pay?to="]').first().getAttribute('title'))!;
    expect(new URLSearchParams(link1.split('#/pay?')[1]).get('to')).toBe(KNOWN_INVOICE_1);
    await expect(page.getByRole('list').getByRole('button', { name: /#0/ })).toBeVisible();

    // The pay link opens the public pay page for that invoice.
    await page.goto(link0);
    await expect(page.getByRole('heading', { name: 'Pay 0.5 NEAR', level: 1 })).toBeVisible();
    await expect(page.getByText('November retainer')).toBeVisible();
    await expect(page.getByText('Note from the link — written by whoever made it, not verified.')).toBeVisible();
  });

  test('rejects bad amounts and caps the note length', async ({ page }) => {
    await go(page, '/app/invoice');
    const amount = page.getByLabel(/^Amount/);
    await amount.fill('0');
    await page.getByRole('button', { name: 'Create invoice' }).click();
    await expect(page.getByText(/Amount must be more than 0/)).toBeVisible();
    await amount.fill('0.1234567890123456789012345678');
    await expect(amount).toHaveValue('0.123456789012345678901234'); // sanitised to 24 decimals as typed
    await page.getByLabel(/^Note/).fill('x'.repeat(500));
    await expect(page.getByLabel(/^Note/)).toHaveValue('x'.repeat(140));
    await page.getByRole('button', { name: 'Create invoice' }).click();
    await expect(page.getByText('Invoice #0', { exact: true })).toBeVisible();
  });
});

test.describe('#/pay parameter validation', () => {
  const invalid: Array<[string, string, RegExp]> = [
    ['no recipient', '', /no recipient/],
    ['empty to', 'to=', /no recipient/],
    ['duplicate to', `to=${KNOWN_INVOICE_0}&to=${KNOWN_INVOICE_1}`, /repeats a parameter/],
    ['plain account name', 'to=alice.testnet', /must be a perde: meta-address or a 64-hex/],
    ['javascript: url', 'to=javascript:alert(1)', /must be a perde: meta-address or a 64-hex/],
    ['uppercase hex', `to=${KNOWN_INVOICE_0.toUpperCase()}`, /must be a perde: meta-address or a 64-hex/],
    ['damaged meta checksum', `to=${encodeURIComponent(KNOWN_META.slice(0, -1) + (KNOWN_META.endsWith('X') ? 'Y' : 'X'))}`, /damaged \(bad characters or checksum\)/],
    ['negative amount', `to=${KNOWN_INVOICE_0}&amount=-1`, /not a plain decimal/],
    ['scientific amount', `to=${KNOWN_INVOICE_0}&amount=1e3`, /not a plain decimal/],
    ['comma amount', `to=${KNOWN_INVOICE_0}&amount=1,5`, /not a plain decimal/],
    ['too many decimals', `to=${KNOWN_INVOICE_0}&amount=0.${'1'.repeat(25)}`, /not a plain decimal/],
    ['zero amount', `to=${KNOWN_INVOICE_0}&amount=0.000`, /more than 0/],
    ['huge amount', `to=${KNOWN_INVOICE_0}&amount=${'9'.repeat(40)}`, /implausibly large/],
    ['note too long', `to=${KNOWN_INVOICE_0}&note=${'n'.repeat(141)}`, /longer than 140/],
  ];
  for (const [name, query, reason] of invalid) {
    test(`rejects: ${name}`, async ({ page }) => {
      await go(page, `/pay?${query}`);
      await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText(reason);
      await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);
    });
  }

  test('hostile note is rendered as inert text (no HTML, no script, bidi stripped)', async ({ page }) => {
    const note = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>‮gnp.exe​';
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.25&note=${encodeURIComponent(note)}`);
    await expect(page.getByRole('heading', { name: 'Pay 0.25 NEAR' })).toBeVisible();
    const shown = page.getByText('<img src=x', { exact: false });
    await expect(shown).toBeVisible();
    expect(await shown.textContent()).not.toMatch(/[‮​]/);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.locator('main img, main script').count()).toBe(0);
  });

  test('meta-address link opens the private pay form with the recipient locked', async ({ page }) => {
    await go(page, `/pay?to=${encodeURIComponent(KNOWN_META)}&amount=1.25&note=Thanks`);
    await expect(page.getByRole('heading', { name: 'Pay privately', level: 1 })).toBeVisible();
    await expect(page.getByText(KNOWN_META)).toBeVisible();
    await expect(page.getByLabel('Recipient')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Amount')).toHaveValue('1.25');
    await expect(page.getByText('Create a funded testnet account')).toBeVisible();
  });

  test('invoice link without a wallet explains what to do and shows a real (recorded) dry quote', async ({ page }) => {
    await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.5`);
    await expect(page.getByRole('heading', { name: 'Pay 0.5 NEAR' })).toBeVisible();
    await expect(page.getByText('Set up a wallet above first.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay 0.5 NEAR' })).toBeDisabled();
    await page.getByRole('button', { name: 'Get quote' }).click();
    await expect(page.getByText('Payer sends about')).toBeVisible();
    await expect(page.getByText(/Invoice receives/)).toBeVisible();
  });
});
