/** Layout and loading resilience found while reviewing the demo video, plus lazy-chunk failures. */
import type { Locator } from '@playwright/test';
import { expect, go, KNOWN_INVOICE_0, KNOWN_META, test } from '../support/test';

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

/*
 * Regression for the one flaky failure of the full suite (mobile-iphone, navigation spec): WebKit printed
 * "WalletSetup-….js was preloaded using link preload but not used within a few seconds from the window's
 * load event". Vite's runtime helper used to add <link rel="modulepreload"> for a lazy page's shared chunks;
 * when the page chunk itself was still downloading at load + 3 s (the browsers' one-shot unused-preload
 * check), those links counted as unused. Under load that window was hit by chance; a slow network hits it
 * every time. This test makes the page chunk slow on purpose so the timing is deterministic.
 */
test('entering a lazy page while its chunk is still downloading at load + 3 s prints no unused-preload warning', async ({ page }) => {
  await go(page, '/app/start');
  await expect(page.getByRole('heading', { name: 'See it work in a minute', level: 1 })).toBeVisible();
  await page.waitForLoadState('load');
  const releaseAt = Date.now() + 4_500;
  await page.route(/SettingsPage-[\w-]+\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, Math.max(0, releaseAt - Date.now())));
    await route.continue();
  });
  await go(page, '/app/settings');
  await expect(page.getByRole('heading', { name: 'Backstage', level: 1 })).toBeVisible({ timeout: 20_000 });
  // The page arrived after the browser's check; give a late warning a moment to reach the console listener.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200))));
});

test.describe('animation chunk failure', () => {
  // Only the browser's own report of the aborted download is expected. Deliberately NOT allowed: the unhandled
  // rejection ("Failed to fetch dynamically imported module" / "Importing a module script failed") the app used to cause.
  test.use({ allowConsole: /^Failed to load resource|Loading failed for the module with source .*motion-features-/ });

  test('if the animation chunk cannot download, pages still show their content: no animation, no unhandled rejection', async ({ page }) => {
    await page.route(/motion-features-[\w-]+\.js$/, (route) => route.abort('connectionreset'));
    // A well-formed receipt whose r does not derive the stealth account: the Verify page shows its (animated) result card.
    const receipt = 'perdereceipt:' + Buffer.from(JSON.stringify({ v: 1, meta: KNOWN_META, r: '01' + '00'.repeat(31), stealth: 'ab'.repeat(32) })).toString('base64url');
    await go(page, `/app/verify?${new URLSearchParams({ r: receipt })}`);
    const heading = page.getByRole('heading', { name: 'Receipt does not check out' });
    await expect(heading).toBeVisible();
    // The card fades in when animation is available; without it, it must not stay transparent.
    const effectiveOpacity = () => heading.evaluate((el) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    });
    await expect.poll(effectiveOpacity).toBe(1);
  });
});

test.describe('lazy chunk failure', () => {
  // Expected noise: the browser's report of the aborted download, React's own console.error for the error the
  // boundary caught (Firefox prints it as "JSHandle@object"), and Firefox's FOUC warning on the reload.
  // Firefox words the aborted download as "Loading failed for the module with source …InboxPage…" now that the
  // chunk is fetched by import() itself instead of a runtime <link rel="modulepreload">.
  test.use({
    allowConsole: /Failed to load resource|net::ERR_|dynamically imported module|Importing a module script failed|NetworkError|access control checks|JSHandle@object|Layout was forced before the page was fully loaded|Loading failed for the module with source .*InboxPage-/i,
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
