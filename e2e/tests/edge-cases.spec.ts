/**
 * Edge cases a tester would try: hostile amounts, broken or foreign stored
 * state, two tabs, reset, CSV exports from spreadsheets, receipts that were
 * tampered with, and a 600-announcement scan.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnnouncementJson } from '../support/chain-mock';
import { expect, FIXTURE_WALLET, go, KNOWN_META, persistedState, test } from '../support/test';

interface CoreLike {
  deriveStealth: (meta: string) => { stealthAccountId: string; ephemeralPk: string; viewTag: number; r: bigint };
  createReceipt: (p: { meta: string; r: bigint; stealthAccountId: string; tx?: string }) => string;
  keysFromSeed: (seed: Uint8Array) => unknown;
  encodeMetaAddress: (k: unknown) => string;
}
const core = (): Promise<CoreLike> => import(pathToFileURL(join(process.cwd(), '..', 'packages', 'core', 'dist', 'index.js')).href) as Promise<CoreLike>;

/** SYNTHETIC announcements built with @perde/core's real stealth derivation (not recorded chain data). */
async function syntheticAnnouncements(total: number, mine: number[]): Promise<{ list: AnnouncementJson[]; receipts: Map<number, string> }> {
  const c = await core();
  const others = Array.from({ length: 4 }, (_, i) => c.encodeMetaAddress(c.keysFromSeed(new Uint8Array(64).fill(i + 7))));
  const receipts = new Map<number, string>();
  const list: AnnouncementJson[] = [];
  for (let i = 0; i < total; i++) {
    const meta = mine.includes(i) ? KNOWN_META : others[i % others.length]!;
    const d = c.deriveStealth(meta);
    list.push({ index: i, stealth_account: d.stealthAccountId, ephemeral_pk: d.ephemeralPk, view_tag: d.viewTag, amount: '50000000000000000000000', timestamp_ms: 1_794_600_000_000 + i * 1000 });
    if (mine.includes(i)) receipts.set(i, c.createReceipt({ meta, r: d.r, stealthAccountId: d.stealthAccountId, tx: '9Qg1J7dGLUUxN4uAsSsLtczSWUM1zW2DAoqPLQ29VZ2p' }));
  }
  return { list, receipts };
}

test.describe('amount input', () => {
  test.use({ seed: { identity: true, wallet: true }, chainOptions: { existingAccounts: [FIXTURE_WALLET] } });

  test('rejects or refuses every malformed amount and blocks review', async ({ page }) => {
    await go(page, '/app/send');
    await page.getByRole('button', { name: 'Pay myself' }).click();
    const amount = page.getByLabel('Amount');
    const review = page.getByRole('button', { name: 'Review payment' });
    await expect(page.getByText(/^Available /)).toBeVisible();
    const cases: Array<[string, string]> = [
      ['   ', ''],
      ['-1', ''],
      ['1e3', ''],
      ['1,000.5', ''],
      ['12,5', '12.5'],
      ['0.' + '0'.repeat(30) + '1', '0.' + '0'.repeat(24)],
    ];
    for (const [typed, shown] of cases) {
      await amount.fill('');
      await amount.fill(typed);
      await expect(amount, `typed ${JSON.stringify(typed)}`).toHaveValue(shown);
    }
    await amount.fill('0');
    await expect(page.getByText('Amount must be more than 0')).toBeVisible();
    await expect(review).toBeDisabled();
    await amount.fill('0.0000001');
    await expect(page.getByText(/^The minimum is /)).toBeVisible();
    await expect(review).toBeDisabled();
    await amount.fill('999999999');
    await expect(page.getByText(/^Not enough balance:/)).toBeVisible();
    await expect(review).toBeDisabled();
    // Max fills the largest amount that still leaves fee + gas, and review works.
    await page.getByRole('button', { name: 'Max' }).click();
    await expect(amount).not.toHaveValue('');
    await expect(review).toBeEnabled();
    await review.click();
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  });

  test('recipient validation: checksum, viewing key, implicit, mainnet, unregistered and uppercase names', async ({ page }) => {
    await go(page, '/app/send');
    const to = page.getByLabel('Recipient');
    const bad = KNOWN_META.slice(0, -2) + (KNOWN_META.endsWith('a') ? 'bb' : 'aa');
    await to.fill(bad);
    await expect(page.getByText(/Checksum mismatch|damaged or incomplete/)).toBeVisible();
    await to.fill('perdeview:abc');
    await expect(page.getByText('That is a viewing key, not an address.', { exact: false })).toBeVisible();
    await to.fill('a'.repeat(64));
    await expect(page.getByText(/plain implicit account/)).toBeVisible();
    await to.fill('alice.near');
    await expect(page.getByText(/mainnet name/)).toBeVisible();
    await to.fill('аlice.testnet'); // Cyrillic "а" homoglyph
    await expect(page.getByText(/Enter a perde: meta-address or a NEAR account name/)).toBeVisible();
    await to.fill('PERDE-UNREGISTERED-E2E.TESTNET');
    await expect(page.getByText(/perde-unregistered-e2e\.testnet hasn’t registered a Perde meta-address/)).toBeVisible();
    await to.fill(` ${KNOWN_META} `);
    await expect(page.getByText('Your own meta-address')).toBeVisible();
  });
});

test.describe('stored state', () => {
  test('corrupted JSON: app starts fresh, keeps a backup, does not crash', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('corrupt')) {
        sessionStorage.setItem('corrupt', '1');
        localStorage.setItem('perde:state', '{"v":1,"wallet":{"accountId":"x.testnet",');
      }
    });
    await go(page, '/app/receive');
    await expect(page.getByRole('button', { name: 'Create identity' })).toBeVisible();
    await page.getByRole('button', { name: 'Create identity' }).click();
    expect(await page.evaluate(() => localStorage.getItem('perde:state:unreadable-backup'))).toBe('{"v":1,"wallet":{"accountId":"x.testnet",');
  });

  test('state from another schema version is not silently destroyed', async ({ page }) => {
    const future = JSON.stringify({ ...persistedState({ identity: true }), v: 2 });
    await page.addInitScript((s) => {
      if (!sessionStorage.getItem('v2')) {
        sessionStorage.setItem('v2', '1');
        localStorage.setItem('perde:state', s);
      }
    }, future);
    await go(page, '/app/receive');
    await expect(page.getByRole('button', { name: 'Create identity' })).toBeVisible();
    await page.getByRole('button', { name: 'Create identity' }).click();
    expect(await page.evaluate(() => localStorage.getItem('perde:state:unreadable-backup'))).toBe(future);
  });

  test.describe('with identity', () => {
    test.use({ seed: { identity: true } });

    test('malformed records are dropped, the rest survives', async ({ page }) => {
      await page.addInitScript(() => {
        if (sessionStorage.getItem('mangled')) return;
        sessionStorage.setItem('mangled', '1');
        const s = JSON.parse(localStorage.getItem('perde:state')!);
        s.invoices = [{ index: 0, amountYocto: 'NaN', note: 7, createdAtMs: -1 }, { index: 'x' }, null];
        s.sent = [{ id: 1 }];
        localStorage.setItem('perde:state', JSON.stringify(s));
      });
      await go(page, '/app/invoice');
      await expect(page.getByText('Invoice #0', { exact: true })).toBeVisible();
      await expect(page.getByText('Any amount', { exact: true })).toBeVisible();
      await go(page, '/app/receive');
      await expect(page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first()).toHaveText(KNOWN_META);
    });

    test('two tabs: a change in one shows up in the other', async ({ page, context }) => {
      await go(page, '/app/invoice');
      const other = await context.newPage();
      await other.goto('./#/app/invoice');
      await expect(other.getByText('No invoice yet')).toBeVisible();
      await page.getByLabel(/^Note/).fill('From tab one');
      await page.getByRole('button', { name: 'Create invoice' }).click();
      await expect(other.getByRole('heading', { name: 'From tab one' })).toBeVisible();
      await other.close();
    });

    test('reset everything wipes keys, identity and invoices', async ({ page }) => {
      await go(page, '/app/settings');
      await page.getByRole('button', { name: /^Reset/ }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Reset this browser?' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: /^Reset/ }).click();
      await expect(dialog).toBeHidden();
      const after = await page.evaluate(() => [localStorage.getItem('perde:state'), localStorage.getItem('perde:state:unreadable-backup')]);
      expect(after[1]).toBeNull();
      expect(JSON.parse(after[0] ?? '{}')).toMatchObject({ wallet: null, identity: null, invoices: [], sent: [] });
      await go(page, '/app/receive');
      await expect(page.getByRole('button', { name: 'Create identity' })).toBeVisible();
    });

    test.describe('reload', () => {
      // A reload cancels in-flight requests of the old document: Firefox logs the aborted font downloads,
      // WebKit reports the cancelled fetches as "access control checks" errors. Nothing else is allowed.
      test.use({ allowConsole: /downloadable font: download failed|due to access control checks|Importing a module script failed|error loading dynamically imported module|classified as a bounce tracker|argument of an unloaded document/ });
      test('reload in the middle of a scan resumes cleanly', async ({ page, chain }) => {
      chain.set({ rpcDelayMs: 800 });
      await go(page, '/app/inbox');
      await expect(page.getByRole('progressbar', { name: 'Scan progress' }).or(page.locator('[aria-busy="true"]')).first()).toBeVisible();
      await page.reload();
      await expect(page.getByText('Nothing behind the curtain yet')).toBeVisible({ timeout: 45_000 });
      });
    });
  });
});

test.describe('payroll CSV', () => {
  test.use({ seed: { identity: true, wallet: true }, chainOptions: { existingAccounts: [FIXTURE_WALLET] } });

  test('spreadsheet exports (BOM, semicolons, quotes) and bad rows are reported per line', async ({ page }) => {
    await go(page, '/app/payroll');
    const csv = page.getByLabel('Recipients (CSV)');
    await csv.fill(`﻿recipient;amount;memo\n${KNOWN_META};0,05;"Rent; Nov"\nperde-unregistered-e2e.testnet;0,05;x\n${KNOWN_META};-1;neg\nnot a name;1;y\n${KNOWN_META};1e3;sci`);
    const rows = page.getByRole('list', { name: 'CSV rows' }).getByRole('listitem');
    await expect(rows).toHaveCount(5);
    await expect(page.getByText('No Perde meta-address registered for this name')).toBeVisible();
    await expect(page.getByText('Amount must be positive')).toBeVisible();
    await expect(page.getByText('Not a perde: address or NEAR name')).toBeVisible();
    await expect(page.getByText('1 ready')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review batch' })).toBeDisabled();
  });

  test('50 rows fill one batch; row 51 is over the limit', async ({ page }) => {
    await go(page, '/app/payroll');
    const lines = Array.from({ length: 51 }, (_, i) => `${KNOWN_META},0.01,row ${i + 1}`);
    await page.getByLabel('Recipients (CSV)').fill(lines.join('\n'));
    await expect(page.getByText('50 ready')).toBeVisible();
    await expect(page.getByText('Over the 50-row limit for one transaction')).toBeVisible();
    await page.getByLabel('Recipients (CSV)').fill(lines.slice(0, 50).join('\n'));
    await expect(page.getByText('50 ready')).toBeVisible();
    await page.getByRole('button', { name: 'Review batch' }).click();
    await expect(page.getByRole('heading', { name: 'Review batch' })).toBeVisible();
    await expect(page.getByText(/transactions?/).first()).toBeVisible();
  });

  test('file upload reads the same parser', async ({ page }) => {
    await go(page, '/app/payroll');
    await page.locator('input[type=file]').setInputFiles({ name: 'team.csv', mimeType: 'text/csv', buffer: Buffer.from(`recipient,amount,memo\r\n${KNOWN_META},0.02,"A, B"\r\n`) });
    await expect(page.getByText('1 ready')).toBeVisible();
  });
});

test.describe('receipts', () => {
  test('invalid input explains what a receipt looks like', async ({ page }) => {
    await go(page, '/app/verify');
    const field = page.getByLabel('Receipt');
    await field.fill('hello');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText('A receipt starts with “perdereceipt:”.')).toBeVisible();
    await field.fill('perdereceipt:zzzz');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText(/This is not a readable Perde receipt/)).toBeVisible();
    await go(page, '/app/verify?r=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    await expect(page.getByText('A receipt starts with “perdereceipt:”.')).toBeVisible();
  });

  test('a SYNTHETIC announced payment verifies by deep link; a tampered receipt fails', async ({ page, chain }) => {
    const { list, receipts } = await syntheticAnnouncements(30, [17]);
    chain.set({ announcements: list });
    const receipt = receipts.get(17)!;
    await go(page, `/app/verify?${new URLSearchParams({ r: receipt })}`);
    await expect(page.getByRole('heading', { name: 'Verified payment' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/announcement #17/)).toBeVisible();
    // Tamper with what the receipt proves: claim a different stealth account, or a different r.
    const data = JSON.parse(Buffer.from(receipt.slice('perdereceipt:'.length), 'base64url').toString()) as Record<string, string>;
    const flip = (hex: string) => (hex[0] === 'a' ? 'b' : 'a') + hex.slice(1);
    for (const field of ['stealth', 'r'] as const) {
      const tampered = 'perdereceipt:' + Buffer.from(JSON.stringify({ ...data, [field]: flip(data[field]!) })).toString('base64url');
      await go(page, '/app/verify');
      await page.getByLabel('Receipt').fill(tampered);
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await expect(page.getByText(/The stealth account derives from the meta-address — fail/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Verified payment' })).toHaveCount(0);
    }
  });
});

test.describe('inbox scale', () => {
  test.use({ seed: { identity: true } });

  test('600 announcements (SYNTHETIC) scan in a few seconds and find exactly our 3 payments', async ({ page, chain }) => {
    test.setTimeout(120_000);
    const mine = [5, 333, 598];
    const { list } = await syntheticAnnouncements(600, mine);
    chain.set({ announcements: list, existingAccounts: list.filter((a) => mine.includes(a.index)).map((a) => a.stealth_account) });
    const started = Date.now();
    await go(page, '/app/inbox');
    await expect(page.getByText(/600 announcements checked/)).toBeVisible({ timeout: 60_000 });
    const ms = Date.now() - started;
    test.info().annotations.push({ type: 'scan-ms', description: String(ms) });
    expect(ms).toBeLessThan(20_000);
    for (const i of mine) await expect(page.locator(`[title="${list[i]!.stealth_account}"]`).first()).toBeVisible();
    // 200 per page: 3 full pages plus the empty read that ends the scan.
    expect(chain.calls.filter((c) => c.key.includes('get_announcements')).length).toBeLessThanOrEqual(4);
  });
});
