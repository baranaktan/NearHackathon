/**
 * axe-core scans (WCAG 2.2 A/AA + best practices) of every route in key
 * states, dark and light, on the project's viewport (desktop Chromium and the
 * Pixel project run this file; see playwright.config.ts). Serious and critical
 * violations fail the test; every finding is written to
 * test-results/axe/<project>/<state>.json for the QA report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect, FIXTURE_WALLET, go, isMobile, KNOWN_INVOICE_0, KNOWN_META, test } from '../support/test';

async function scan(page: Page, testInfo: TestInfo, name: string) {
  // Let entrance animations (reduced motion) and lazy chunks settle.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  const dir = join(testInfo.project.outputDir, '..', 'axe', testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}-${theme}.json`.replace(/[^\w.-]+/g, '_')), JSON.stringify({ name, theme, url: page.url(), violations: summary }, null, 2));
  const blocking = summary.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking, `${name} (${theme}): serious/critical axe violations`).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`@axe ${theme}`, () => {
    test.use({ theme });

    test('public pages: landing, 404, pay (invoice, meta, invalid), kit', async ({ page }, ti) => {
      await go(page, '/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await scan(page, ti, 'landing');
      await page.getByRole('tab', { name: 'With Perde' }).click();
      await scan(page, ti, 'landing-with-perde');
      await go(page, '/nope');
      await expect(page.getByText('Nothing on this stage')).toBeVisible();
      await scan(page, ti, '404');
      await go(page, `/pay?to=${KNOWN_INVOICE_0}&amount=0.5&note=Thanks`);
      await expect(page.getByRole('heading', { name: 'Pay 0.5 NEAR' })).toBeVisible();
      await page.getByRole('button', { name: 'Get quote' }).click();
      await expect(page.getByText('Payer sends about')).toBeVisible();
      await scan(page, ti, 'pay-invoice-quote');
      await go(page, `/pay?to=${encodeURIComponent(KNOWN_META)}&amount=1`);
      await expect(page.getByRole('heading', { name: 'Pay privately' })).toBeVisible();
      await scan(page, ti, 'pay-meta');
      await go(page, '/pay?to=bad');
      await expect(page.getByRole('alert')).toBeVisible();
      await scan(page, ti, 'pay-invalid');
    });

    test('app routes, fresh browser (no wallet, no identity)', async ({ page }, ti) => {
      for (const r of ['start', 'receive', 'send', 'inbox', 'invoice', 'payroll', 'dao', 'audit', 'verify', 'settings']) {
        await go(page, `/app/${r}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (r === 'dao') await expect(page.getByText(/proposals so far/)).toBeVisible();
        await scan(page, ti, `fresh-${r}`);
      }
      // Form errors visible.
      await go(page, '/app/receive');
      await page.getByLabel('Recovery phrase').fill('one two');
      await page.getByRole('button', { name: 'Restore' }).click();
      await expect(page.getByText('Expected 12 words, got 2.')).toBeVisible();
      await scan(page, ti, 'receive-restore-error');
      await go(page, '/app/verify');
      await page.getByLabel('Receipt').fill('garbage');
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await scan(page, ti, 'verify-invalid');
    });

    test.describe('with identity and read-only wallet', () => {
      test.use({ seed: { identity: true, wallet: true, invoices: [{ index: 0, amountYocto: '500000000000000000000000', note: 'Axe invoice', createdAtMs: 1 }] }, chainOptions: { existingAccounts: [FIXTURE_WALLET] } });

      test('app routes with data, dialogs and sheets open', async ({ page }, ti) => {
        for (const r of ['start', 'receive', 'send', 'inbox', 'invoice', 'payroll', 'dao', 'audit', 'settings']) {
          await go(page, `/app/${r}`);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          if (r === 'inbox') await expect(page.getByText('Nothing behind the curtain yet')).toBeVisible({ timeout: 30_000 });
          if (r === 'send') await expect(page.getByText(/^Available /)).toBeVisible();
          if (r === 'dao') await expect(page.getByText(/proposals so far/)).toBeVisible();
          await scan(page, ti, `data-${r}`);
        }
        await go(page, '/app/receive');
        await page.getByRole('button', { name: 'Reveal viewing key' }).click();
        await page.getByRole('button', { name: 'Show recovery phrase' }).click();
        await expect(page.getByRole('dialog', { name: 'Recovery phrase' })).toBeVisible();
        await scan(page, ti, 'dialog-recovery-phrase');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Forget this identity' }).click();
        await expect(page.getByRole('dialog', { name: 'Forget this identity?' })).toBeVisible();
        await scan(page, ti, 'dialog-forget-identity');
        await page.keyboard.press('Escape');
        await go(page, '/app/send');
        await page.getByRole('button', { name: 'Pay myself' }).click();
        await page.getByLabel('Amount').fill('0.05');
        await page.getByRole('button', { name: 'Review payment' }).click();
        await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
        await scan(page, ti, 'send-review');
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await page.getByRole('button', { name: /Chain view|What the chain sees/ }).first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await scan(page, ti, 'sheet-chain-view');
        await page.keyboard.press('Escape');
        await go(page, '/app/payroll');
        await page.getByRole('button', { name: 'Load sample' }).click();
        await expect(page.getByText('2 ready')).toBeVisible();
        await scan(page, ti, 'payroll-rows');
        if (isMobile(page)) {
          await page.locator('nav[aria-label="App"]').filter({ visible: true }).getByRole('button', { name: 'More' }).click();
          await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
          await scan(page, ti, 'sheet-more');
        }
      });
    });
  });
}
