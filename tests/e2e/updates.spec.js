import { expect, test } from '@playwright/test';
import { openApp, openMore } from './helpers.js';

test('«Що нового»: крапка на «Ще», список з мітками, після перегляду крапка зникає', async ({ page }) => {
    await openApp(page);
    const more = page.locator('[data-action="more"]:visible');
    await expect(more).toHaveClass(/has-news/);
    await openMore(page);
    await expect(page.locator('[data-action="open-updates"] .new-dot')).toBeVisible();
    await page.locator('[data-action="open-updates"]').click();
    await expect(page.locator('.sheet h3')).toHaveText('Що нового');
    const first = page.locator('.update').first();
    await expect(first).toContainText('9 листопада 2026');
    await expect(first.locator('.tag').first()).toBeVisible();
    const reserve = page.locator('.update', { hasText: 'Резерв і платежі без дати' });
    await expect(reserve.locator('.tag-new')).toHaveText('Нове');
    expect(await page.locator('.update').count()).toBeGreaterThanOrEqual(10);
    await expect(page.locator('.tag-security').first()).toHaveText('Безпека');
    await expect(page.locator('.update-tags svg').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).not.toHaveClass(/has-news/);
    await page.reload();
    await expect(page.locator('[data-action="more"]:visible')).not.toHaveClass(/has-news/);
});
