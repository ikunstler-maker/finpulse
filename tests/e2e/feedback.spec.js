import { expect, test } from '@playwright/test';
import { openApp, openMore } from './helpers.js';

test('відгук: тип з іконками, поле опису, попередження про приватність', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    // поки скрипт власниці не підключено, пункту в меню немає; вікно відкриваємо напряму
    await expect(page.locator('[data-action="open-feedback"]')).toHaveCount(0);
    await page.evaluate(() => {
        const b = document.createElement('button');
        b.dataset.action = 'open-feedback';
        b.id = 'fb-test';
        document.body.append(b);
    });
    await page.locator('#fb-test').dispatchEvent('click');
    await expect(page.locator('.sheet h3')).toHaveText('Надіслати відгук');
    await page.locator('[data-picker="f-fb-type"] .picker-btn').click();
    const opts = page.locator('[data-picker="f-fb-type"] li');
    await expect(opts).toHaveCount(7);
    await expect(opts.nth(1)).toHaveText('Баг — щось не працює');
    await expect(opts.nth(6)).toHaveText('Інше');
    await expect(page.locator('[data-picker="f-fb-type"] li svg')).toHaveCount(7);
    expect(await page.locator('[data-picker="f-fb-type"]').textContent()).not.toMatch(/\p{Extended_Pictographic}/u);
    await opts.nth(3).click();
    await expect(page.locator('#f-fb-type')).toHaveValue('add');
    await expect(page.locator('.warn-note')).toContainText('Не вписуйте суми');
    await page.locator('#f-fb-text').fill('Хочу темну тему для календаря');
});
