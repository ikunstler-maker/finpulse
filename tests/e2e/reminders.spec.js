import { expect, test } from '@playwright/test';
import { openApp, openMore, text } from './helpers.js';

test('смуга найближчих платежів і налаштування днів', async ({ page }) => {
    await openApp(page);
    const banner = page.locator('#reminder-banner');
    // 29.10, за 1 день: лише «Інші дрібні витрати» 30-го
    expect(await text(page, '#reminder-banner strong')).toBe('Найближчим часом: 1 платіж на 1 000,00 ₴');
    await expect(banner).toContainText('Інші дрібні витрати');
    await expect(banner).toContainText('завтра');

    await banner.locator('[data-action="open-reminders"]').click();
    await page.locator('#rem-days').selectOption('7');
    // до 5.11: ще «Музичний сервіс» 3.11 з листопада
    await expect(banner.locator('li')).toHaveCount(2);
    await expect(banner).toContainText('Музичний сервіс');
    await page.locator('#rem-banner').click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('finpulse_reminders')))).toMatchObject({ days: 7, banner: false });
});

test('сповіщення раз на день після дозволу', async ({ page }) => {
    await page.addInitScript(() => {
        window.__shown = [];
        class FakeNotification {
            constructor(title, options) { window.__shown.push({ title, body: options?.body }); }
            static permission = 'default';
            static requestPermission() { FakeNotification.permission = 'granted'; return Promise.resolve('granted'); }
        }
        window.Notification = FakeNotification;
        // з service worker (як на телефоні) сповіщення показує реєстрація
        if (window.ServiceWorkerRegistration) {
            ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
                window.__shown.push({ title, body: options?.body });
                return Promise.resolve();
            };
        }
    });
    await openApp(page);
    await openMore(page);
    await page.locator('.menu [data-action="open-reminders"]').click();
    await page.locator('#rem-notify').click();
    await expect(page.locator('#rem-notify')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#rem-notify-note')).toHaveText('Сповіщення увімкнено на цьому пристрої.');
    await expect.poll(() => page.evaluate(() => window.__shown.length)).toBe(1);
    const shown = await page.evaluate(() => window.__shown);
    expect(shown[0].title.replace(/[\s\u00a0\u202f]+/g, ' ')).toBe('FinPulse: 1 платіж на 1 000 ₴');
    expect(shown[0].body).toContain('завтра: Інші дрібні витрати');
    // повторне відкриття того ж дня — без нового сповіщення (дозвіл у підробці скидається, тож ставимо знову)
    await page.addInitScript(() => { window.Notification.permission = 'granted'; });
    await page.reload();
    await expect(page.locator('#kpi-in-hand')).not.toHaveText('');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__shown.length)).toBe(0);
    // наступного дня — знову
    await page.clock.setFixedTime(new Date('2026-10-30T09:00:00+02:00'));
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__shown.length)).toBe(1);
});

test('календар .ics з несплаченими платежами', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('.menu [data-action="open-reminders"]').click();
    await page.locator('#rem-time').fill('10:30');
    await page.locator('#rem-time').dispatchEvent('change');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#rem-ics').click()]);
    expect(download.suggestedFilename()).toBe('FinPulse_Payments_2026-10-29.ics');
    const ics = Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8');
    // жовтень: 30-те; листопад: 4 витрати з демо
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ics).toContain('UID:exp_14-20261030@finpulse');
    expect(ics).toContain('TRIGGER:-PT810M');
    await expect(page.locator('#toast')).toContainText('5 платежів');
});
