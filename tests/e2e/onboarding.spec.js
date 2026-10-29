import { expect, test } from '@playwright/test';
import { openApp, savedState } from './helpers.js';

test('перший візит: вибір «порожній бюджет»', async ({ page }) => {
    await openApp(page, { firstRun: true });
    await expect(page.locator('.sheet h3')).toHaveText('Вітаємо у FinPulse');
    await page.locator('[data-welcome="empty"]').click();
    await expect(page.locator('.empty-state')).toContainText('ще немає витрат');
    await expect(page.locator('#cycle-name')).toHaveText('Жовтень 2026');
    const st = await savedState(page);
    expect(st.months['2026-10'].expenses).toEqual([]);
    expect(st.demo).toBeUndefined();
    await page.reload();
    await expect(page.locator('.sheet')).toHaveCount(0); // більше не питаємо
});

test('перший візит: приклад з банером і переходом на порожній', async ({ page }) => {
    await openApp(page, { firstRun: true });
    await page.locator('[data-welcome="demo"]').click();
    await expect(page.locator('.demo-banner')).toContainText('приклад');
    await page.locator('[data-action="demo-start"]').click();
    await page.locator('[data-confirm="yes"]').click();
    await expect(page.locator('.demo-banner')).toHaveCount(0);
    await expect(page.locator('.empty-state')).toBeVisible();
});

test('приклад можна залишити як свої дані', async ({ page }) => {
    await openApp(page, { firstRun: true });
    await page.locator('[data-welcome="demo"]').click();
    await page.locator('[data-action="demo-keep"]').click();
    await expect(page.locator('.demo-banner')).toHaveCount(0);
    expect((await savedState(page)).demo).toBeUndefined();
});

test('наявні дані — без вітання; сторінки політики доступні з меню', async ({ page }) => {
    await openApp(page, { firstRun: true, seed: { activeMonthKey: '2026-10', months: { '2026-10': { year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, incomeUAH: 1000, expenses: [] } } } });
    await expect(page.locator('.sheet')).toHaveCount(0);
    await page.locator('[data-action="more"]:visible').click();
    for (const [link, title] of [['Конфіденційність', 'Політика конфіденційності'], ['Умови', 'Умови використання'], ['Як працює шифрування', 'Як працює шифрування']]) {
        const href = await page.locator('.sheet .links a', { hasText: link }).getAttribute('href');
        const res = await page.request.get(new URL(href, page.url()).toString());
        expect(res.ok()).toBe(true);
        expect(await res.text()).toContain(title);
    }
});
