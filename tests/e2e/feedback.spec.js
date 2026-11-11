import { expect, test } from '@playwright/test';
import { openApp, openMore } from './helpers.js';

test('відгук: тип з іконками, поле опису, попередження про приватність', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-feedback"]').click();
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

test('відгук надсилається на скрипт таблиці: тип, текст, контакт, без фінансових даних', async ({ page }) => {
    let sent = null;
    await page.route(/script\.google\.com\/macros\/s\//, async route => {
        sent = JSON.parse(route.request().postData());
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
    });
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-feedback"]').click();
    await page.locator('#feedback-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toHaveText('Оберіть тип відгуку');
    await page.locator('[data-picker="f-fb-type"] .picker-btn').click();
    await page.locator('[data-picker="f-fb-type"] li[data-value="bug"]').click();
    await page.locator('#f-fb-text').fill('Календар не гортається');
    await page.locator('#f-fb-contact').fill('@tester');
    await page.locator('#feedback-form button[type=submit]').click();
    await expect(page.locator('#toast')).toHaveText('Дякуємо! Відгук надіслано.');
    expect(sent).toMatchObject({ app: 'finpulse', type: 'bug', text: 'Календар не гортається', contact: '@tester' });
    expect(sent.tech).toContain('FinPulse');
    expect(JSON.stringify(sent)).not.toContain('Оренда');
});

test('відгук: помилка сервера — зрозуміле повідомлення, вікно лишається', async ({ page }) => {
    await page.route(/script\.google\.com\/macros\/s\//, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":false,"error":"too_many"}' }));
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-feedback"]').click();
    await page.locator('[data-picker="f-fb-type"] .picker-btn').click();
    await page.locator('[data-picker="f-fb-type"] li[data-value="add"]').click();
    await page.locator('#f-fb-text').fill('Додайте темну тему');
    await page.locator('#feedback-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toHaveText('Зараз забагато відгуків. Спробуйте за годину.');
    await expect(page.locator('#f-fb-text')).toHaveValue('Додайте темну тему');
});
