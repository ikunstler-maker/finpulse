import { expect, test } from '@playwright/test';
import { openApp, text } from './helpers.js';

test('застосунок відкривається без інтернету після першого візиту', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // тепер сторінкою керує service worker і файли в кеші
    await expect(page.locator('#kpi-in-hand')).not.toHaveText('');
    await context.setOffline(true);
    await page.reload();
    expect(await text(page, '#kpi-in-hand')).toBe('44 550 ₴');
    await context.setOffline(false);
});

test('маніфест для встановлення на головний екран', async ({ page }) => {
    await openApp(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await page.request.get(new URL(href, page.url()).toString());
    const manifest = await res.json();
    expect(manifest).toMatchObject({ short_name: 'FinPulse', display: 'standalone', lang: 'uk' });
});
