/** Layout and loading resilience found while reviewing the demo video, plus lazy-chunk failures. */
import type { Locator } from '@playwright/test';
import { expect, go, KNOWN_INVOICE_0, test } from '../support/test';

/** True when every line break inside `el` falls next to whitespace (no word split mid-word). */
async function wrapsOnlyAtSpaces(el: Locator): Promise<{ ok: boolean; lines: string[] }> {
  return el.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const chars: Array<{ c: string; top: number }> = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent ?? '';
      for (let i = 0; i < text.length; i++) {
        const r = document.createRange();
        r.setStart(t, i);
        r.setEnd(t, i + 1);
        const rect = r.getClientRects()[0];
        if (rect) chars.push({ c: text[i]!, top: Math.round(rect.top) });
      }
    }
    const lines: string[] = [];
    let ok = true;
    let cur = '';
    for (let i = 0; i < chars.length; i++) {
      if (i > 0 && chars[i]!.top > chars[i - 1]!.top + 2) {
        if (!/\s/.test(chars[i - 1]!.c) && !/\s/.test(chars[i]!.c)) ok = false;
        lines.push(cur);
        cur = '';
      }
      cur += chars[i]!.c;
    }
    lines.push(cur);
    return { ok, lines };
  });
}

test.describe('quote result layout', () => {
  test.use({ seed: { identity: true, invoices: [{ index: 0, amountYocto: '500000000000000000000000', note: 'Layout', createdAtMs: 1 }] } });

  test('token and chain names wrap only between words (invoice page and pay page)', async ({ page }) => {
    for (const where of ['/app/invoice', `/pay?to=${KNOWN_INVOICE_0}&amount=0.5`]) {
      await go(page, where);
      await page.getByRole('button', { name: 'Get quote' }).click();
      const asset = page.getByTestId('quote-asset');
      await expect(asset).toBeVisible();
      await expect(asset).toHaveText(/\S+ · \S+/);
      const r = await wrapsOnlyAtSpaces(asset);
      expect(r.ok, `asset label split mid-word: ${JSON.stringify(r.lines)}`).toBe(true);
      expect(await asset.evaluate((e) => getComputedStyle(e).wordBreak)).not.toBe('break-all');
    }
  });
});

test('landing starts loading the guided demo when the CTA is reached for, not before', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', (r) => /GuidedDemoPage-[\w-]+\.js$/.test(r.url()) && chunks.push(r.url()));
  await go(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(chunks, 'not fetched on load (keeps the landing page light)').toHaveLength(0);
  const cta = page.getByRole('link', { name: 'See it work in a minute' }).first();
  await cta.hover();
  await expect.poll(() => chunks.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await cta.click();
  await expect(page.getByRole('heading', { name: 'See it work in a minute', level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Loading page')).toHaveCount(0);
});

test.describe('lazy chunk failure', () => {
  // Expected noise: the browser's report of the aborted download, React's own console.error for the error the
  // boundary caught (Firefox prints it as "JSHandle@object"), and Firefox's FOUC warning on the reload.
  test.use({
    allowConsole: /Failed to load resource|net::ERR_|dynamically imported module|Importing a module script failed|NetworkError|access control checks|JSHandle@object|Layout was forced before the page was fully loaded/i,
  });

  test('a page chunk that cannot download shows a reload prompt, not a blank app', async ({ page }) => {
    await go(page, '/app/start');
    await expect(page.getByRole('heading', { name: 'See it work in a minute', level: 1 })).toBeVisible();
    await page.route(/InboxPage-[\w-]+\.js$/, (route) => route.abort('connectionreset'));
    await go(page, '/app/inbox');
    const alert = page.getByRole('alert').filter({ hasText: 'This page couldn’t load' });
    await expect(alert).toBeVisible();
    // The shell (navigation) is still there, so other pages keep working.
    await expect(page.locator('nav[aria-label="App"]').filter({ visible: true })).toBeVisible();
    await page.unroute(/InboxPage-[\w-]+\.js$/);
    await alert.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('heading', { name: 'Payments behind the curtain', level: 1 })).toBeVisible();
  });
});
