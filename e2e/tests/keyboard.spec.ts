/** Keyboard-only walkthrough of the core receive → invoice flow: tab order, visible focus, Enter and Esc. */
import type { Page } from '@playwright/test';
import { expect, go, KNOWN_INVOICE_0, KNOWN_META, KNOWN_MNEMONIC, test } from '../support/test';

/** Press Tab until `matches` is focused (bounded), asserting every stop shows a visible focus indicator. */
async function tabTo(page: Page, matches: (el: Element) => boolean, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((src) => {
      const el = document.activeElement;
      if (!el || el === document.body) return { hit: false, visible: true, what: 'body' };
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
      const fn = new Function('el', `return (${src})(el)`) as (e: Element) => boolean;
      return { hit: fn(el), visible: ring || el.matches('.sr-only'), what: el.outerHTML.slice(0, 120) };
    }, matches.toString());
    expect(info.visible, `no visible focus indicator on ${info.what}`).toBe(true);
    if (info.hit) return;
  }
  throw new Error('target never received focus by Tab');
}

test('restore identity and create an invoice with the keyboard only', async ({ page }) => {
  await go(page, '/app/receive');
  await expect(page.getByRole('heading', { name: 'Your private address' })).toBeVisible();
  await tabTo(page, (el) => el.tagName === 'TEXTAREA');
  await page.keyboard.type(KNOWN_MNEMONIC);
  await tabTo(page, (el) => el.tagName === 'BUTTON' && el.textContent?.trim() === 'Restore');
  await page.keyboard.press('Enter');
  await expect(page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first()).toHaveText(KNOWN_META);

  // Dialog: Enter opens it, focus moves inside, Esc closes and returns focus.
  await tabTo(page, (el) => el.textContent?.trim() === 'Forget this identity');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Forget this identity?' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Forget this identity' })).toBeFocused();

  await go(page, '/app/invoice');
  await expect(page.getByRole('heading', { name: 'Get paid by anyone' })).toBeVisible();
  await tabTo(page, (el) => el.tagName === 'INPUT' && (el as HTMLInputElement).inputMode === 'decimal');
  await page.keyboard.type('0.5');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Keyboard invoice');
  await page.keyboard.press('Enter'); // submits the form
  await expect(page.getByText('Invoice #0', { exact: true })).toBeVisible();
  const link = await page.locator('[title*="#/pay?to="]').first().getAttribute('title');
  expect(new URLSearchParams(link!.split('#/pay?')[1]).get('to')).toBe(KNOWN_INVOICE_0);
});
