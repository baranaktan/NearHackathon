import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { expect, go, KNOWN_META, KNOWN_MNEMONIC, test } from '../support/test';

test.describe('identity lifecycle (no wallet, nothing on chain)', () => {
  test('KNOWN_META is what @perde/core derives from the test mnemonic', async () => {
    const dist = join(process.cwd(), '..', 'packages', 'core', 'dist', 'index.js');
    expect(existsSync(dist), 'packages/core must be built (npm run build) for this cross-check').toBe(true);
    const core = (await import(pathToFileURL(dist).href)) as { keysFromMnemonic: (m: string) => unknown; encodeMetaAddress: (k: unknown) => string };
    expect(core.encodeMetaAddress(core.keysFromMnemonic(KNOWN_MNEMONIC))).toBe(KNOWN_META);
  });

  test('create → reveal phrase → confirm → meta-address, QR and pay link; persists across reload', async ({ page }) => {
    await go(page, '/app/receive');
    await page.getByRole('button', { name: 'Create identity' }).click();
    await expect(page.getByRole('heading', { name: 'Write down your recovery phrase' })).toBeVisible();
    // Words are not in the DOM until revealed.
    const phrase = page.getByRole('list', { name: 'Recovery phrase' });
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByRole('button', { name: 'Reveal recovery phrase' }).click();
    const words = (await phrase.locator('li span[translate="no"]').allTextContents()).map((w) => w.trim());
    expect(words).toHaveLength(12);
    expect(words.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    await page.getByLabel('I have stored these words somewhere safe and offline.').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    const meta = page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first();
    await expect(meta).toHaveText(/^perde:[1-9A-HJ-NP-Za-km-z]{60,}$/);
    const metaText = (await meta.textContent())!.trim();
    await expect(page.getByRole('img', { name: 'QR code of your pay link' })).toBeVisible();
    const payLink = await page.locator('[title*="#/pay?to="]').first().getAttribute('title');
    expect(new URL(payLink!.replace('#/pay?', 'pay?')).searchParams.get('to')).toBe(metaText);
    await expect(page.getByText('No account to sign with')).toBeVisible();

    await page.reload();
    await expect(page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first()).toHaveText(metaText);
    // The phrase can be shown again from the dialog and matches what was revealed.
    // Open with the keyboard so focus-return is testable in every engine (WebKit does not focus buttons on click).
    await page.getByRole('button', { name: 'Show recovery phrase' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Recovery phrase' });
    await dialog.getByRole('button', { name: 'Reveal recovery phrase' }).click();
    // Read via page.evaluate: Playwright's allTextContents() inside an open modal <dialog> crashes Firefox's
    // content process (Playwright 1.65 / Firefox build 1572 on Windows; plain DOM reads are fine).
    await expect(dialog.locator('li span[translate="no"]').first()).not.toHaveText('•••••');
    expect(await page.evaluate(() => [...document.querySelectorAll('dialog[open] li span[translate="no"]')].map((e) => e.textContent?.trim()))).toEqual(words);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Show recovery phrase' })).toBeFocused();
  });

  test('restore from the known mnemonic gives the deterministic meta-address; forget clears it', async ({ page }) => {
    await go(page, '/app/receive');
    await page.getByLabel('Recovery phrase').fill(`  ${KNOWN_MNEMONIC.toUpperCase().replace(/ /g, '   ')}  `);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first()).toHaveText(KNOWN_META);
    await expect(page.getByRole('status').filter({ hasText: 'Identity restored' }).first()).toBeVisible();

    // Forget: dialog, focus trap, Esc closes without forgetting, then confirm.
    await page.getByRole('button', { name: 'Forget this identity' }).click();
    const dialog = page.getByRole('dialog', { name: 'Forget this identity?' });
    await expect(dialog).toBeVisible();
    // Native modal dialog: the page behind is inert, so Tab only ever reaches the dialog's controls
    // (or leaves the document for the browser UI, where activeElement is <body>).
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        if (!el.closest('dialog[open]')) return `OUTSIDE:${el.outerHTML.slice(0, 80)}`;
        // Firefox/WebKit also stop on the scrollable dialog body; only count real controls.
        return el.matches('button, a[href], input, textarea, select') ? `dialog:${el.textContent?.trim() || el.getAttribute('aria-label')}` : 'dialog-container';
      });
      expect(where).not.toMatch(/^OUTSIDE/);
      seen.add(where);
    }
    expect([...seen].filter((w) => w.startsWith('dialog:')).sort()).toEqual(['dialog:Cancel', 'dialog:Close', 'dialog:Forget identity']);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('p[translate="no"]').filter({ hasText: /^perde:/ }).first()).toHaveText(KNOWN_META);
    await page.getByRole('button', { name: 'Forget this identity' }).click();
    await dialog.getByRole('button', { name: 'Forget identity' }).click();
    await expect(page.getByRole('button', { name: 'Create identity' })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('perde:state') ?? '{}') as { identity: unknown });
    expect(stored.identity).toBeNull();
  });

  test('restore rejects wrong word counts and invalid checksums with a field error', async ({ page }) => {
    await go(page, '/app/receive');
    const field = page.getByLabel('Recovery phrase');
    await field.fill('abandon abandon abandon');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Expected 12 words, got 3.')).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await field.fill(Array(12).fill('abandon').join(' '));
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText(/don’t form a valid recovery phrase/)).toBeVisible();
    await field.fill('   ');
    await expect(page.getByRole('button', { name: 'Restore' })).toBeDisabled();
  });

  test('viewing key: hidden until revealed, then shown in full and copyable', async ({ page, context, browserName }) => {
    test.info().annotations.push({ type: 'note', description: 'clipboard read is only granted in Chromium; other engines check the "Copied" state' });
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await go(page, '/app/receive');
    await page.getByLabel('Recovery phrase').fill(KNOWN_MNEMONIC);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText(/perdeview:•+/)).toBeVisible();
    await expect(page.getByText(/perdeview:[1-9A-HJ-NP-Za-km-z]{40,}/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Reveal viewing key' }).click();
    const key = page.getByText(/^perdeview:[1-9A-HJ-NP-Za-km-z]{40,}$/);
    await expect(key).toBeVisible();
    const keyText = (await key.textContent())!.trim();
    await page.getByRole('button', { name: 'Copy viewing key' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied to clipboard' })).toHaveCount(1);
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(keyText);
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.getByText(/^perdeview:[1-9A-HJ-NP-Za-km-z]{40,}$/)).toHaveCount(0);
  });
});
