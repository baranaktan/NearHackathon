import { expect, go, isMobile, test } from '../support/test';

test.describe('landing', () => {
  test('renders the hero, primary CTA and section links', async ({ page }) => {
    await go(page, '/');
    await expect(page).toHaveTitle('Perde — private payments on NEAR');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Pay anyone\.\s*Reveal no one\./);
    await expect(page.getByRole('link', { name: 'See it work in a minute' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open app' })).toBeVisible();
    // Exactly one h1 on the page.
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('illustration toggle switches the explorer view (click and arrow keys)', async ({ page }) => {
    await go(page, '/');
    const tabs = page.getByRole('tablist', { name: 'Compare views' });
    const without = tabs.getByRole('tab', { name: 'Without Perde' });
    const withPerde = tabs.getByRole('tab', { name: 'With Perde' });
    const before = (await page.getByRole('tabpanel').textContent()) ?? '';
    const startSelected = await without.getAttribute('aria-selected');
    const other = startSelected === 'true' ? withPerde : without;
    await other.click();
    await expect(other).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).not.toHaveText(before);
    // Roving tabindex: arrow key moves selection back.
    await other.focus();
    await page.keyboard.press(other === withPerde ? 'ArrowLeft' : 'ArrowRight');
    const back = other === withPerde ? without : withPerde;
    await expect(back).toHaveAttribute('aria-selected', 'true');
    await expect(back).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveText(before);
  });

  test('"Open app" lands on the guided demo', async ({ page }) => {
    await go(page, '/');
    await page.getByRole('link', { name: 'Open app' }).click();
    await expect(page).toHaveURL(/#\/app\/start$/);
    await expect(page.getByRole('heading', { name: 'See it work in a minute', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle('Guided demo · Perde');
  });
});

test.describe('theme', () => {
  test('toggle switches theme and persists across reloads', async ({ page }) => {
    await go(page, '/app/start');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).first().click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('perde-theme'))).toBe('light');
    const themeColor = await page.locator('meta[name="theme-color"]').first().getAttribute('content');
    expect(themeColor).toBe('#f4eee3');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Switch to dark theme' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Switch to dark theme' }).first().click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('follows prefers-color-scheme when nothing is stored', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ colorScheme: 'light', baseURL });
    const page = await ctx.newPage();
    await page.goto('./#/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await ctx.close();
  });
});

test.describe('app navigation', () => {
  const routes: Array<[string, string, string]> = [
    ['Guided demo', '/app/start', 'See it work in a minute'],
    ['Receive', '/app/receive', 'Your private address'],
    ['Send', '/app/send', 'Pay someone privately'],
    ['Inbox', '/app/inbox', 'Payments behind the curtain'],
    ['Invoice', '/app/invoice', 'Get paid by anyone'],
    ['Payroll', '/app/payroll', 'Pay the whole team, privately'],
    ['DAO payout', '/app/dao', 'Pay a contributor from a DAO treasury'],
    ['Audit', '/app/audit', 'Read-only view for auditors'],
    ['Verify receipt', '/app/verify', 'Check a payment proof'],
    ['Settings & demo', '/app/settings', 'Backstage'],
  ];

  test('every nav item opens its page (sidebar on desktop, tab bar + More sheet on mobile)', async ({ page }) => {
    await go(page, '/app/start');
    for (const [label, path, heading] of routes) {
      if (isMobile(page)) {
        const tabBar = page.locator('nav[aria-label="App"]').filter({ visible: true });
        const short = { 'Guided demo': 'Demo', 'DAO payout': 'DAO', 'Verify receipt': 'Verify', 'Settings & demo': 'Settings' }[label] ?? label;
        const direct = tabBar.getByRole('link', { name: short, exact: true });
        if (await direct.count()) {
          await direct.click();
        } else {
          await tabBar.getByRole('button', { name: 'More' }).click();
          const sheet = page.getByRole('dialog', { name: 'More' });
          await expect(sheet).toBeVisible();
          await sheet.getByRole('link', { name: new RegExp(`^${label.replace(/[&]/g, '\\$&')}`) }).click();
          await expect(sheet).toBeHidden();
        }
      } else {
        await page.locator('aside:has(nav[aria-label="App"])').getByRole('link', { name: label, exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`#${path}$`));
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({ timeout: 30_000 });
      if (!isMobile(page)) await expect(page.locator('aside:has(nav[aria-label="App"]) a[aria-current="page"]')).toHaveCount(1);
      else if (['/app/receive', '/app/send', '/app/inbox'].includes(path)) await expect(page.locator('nav[aria-label="App"] a[aria-current="page"]').filter({ visible: true })).toHaveCount(1);
    }
  });

  test('/app redirects to the guided demo', async ({ page }) => {
    await go(page, '/app');
    await expect(page).toHaveURL(/#\/app\/start$/);
  });

  test('skip link moves focus to the main content', async ({ page }) => {
    await go(page, '/app/send');
    await expect(page.getByRole('heading', { name: 'Pay someone privately' })).toBeVisible();
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await skip.focus();
    await expect(skip).toBeVisible();
    await skip.press('Enter');
    await expect(page.locator('#app-main')).toBeFocused();
  });
});

test.describe('not found', () => {
  test('unknown top-level route shows the 404 stage with a way back', async ({ page }) => {
    await go(page, '/definitely-not-a-page');
    await expect(page.getByText('Nothing on this stage')).toBeVisible();
    await page.getByRole('link', { name: 'Back to Perde' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('unknown app route keeps the app shell', async ({ page }) => {
    await go(page, '/app/nope');
    await expect(page.getByText('Nothing on this stage')).toBeVisible();
    await expect(page.locator('nav[aria-label="App"]').filter({ visible: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to the app' }).click();
    await expect(page).toHaveURL(/#\/app\/start$/);
  });
});
