import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { openApp, savedState, text } from './helpers.js';

test('демо-дані: підсумки бюджету без помилок на сторінці', async ({ page }) => {
    const errors = await openApp(page);
    expect(await text(page, '#kpi-in-hand-uah')).toBe('44 550,00 ₴');
    expect(await text(page, '#kpi-income-display')).toBe('52 800,00 ₴');
    expect(await text(page, '#kpi-remaining-to-pay-uah')).toBe('22 343,95 ₴');
    expect(await text(page, '#kpi-free-balance-uah')).toBe('22 206,05 ₴');
    expect(await text(page, '#count-overdue')).toBe('11');
    expect(await text(page, '#count-paid')).toBe('2');
    expect(errors).toEqual([]);
});

test('відмітка «сплачено» оновлює підсумки й зберігається після перезавантаження', async ({ page }) => {
    await openApp(page);
    const row = page.locator('.expense-row', { hasText: 'Оренда квартири' });
    await row.locator('button').first().click();
    expect(await text(page, '#count-paid')).toBe('3');
    expect(await text(page, '#kpi-in-hand-uah')).toBe('32 550,00 ₴');

    await page.reload();
    expect(await text(page, '#count-paid')).toBe('3');
    const st = await savedState(page);
    expect(st.months['2026-10'].expenses.find(e => e.title === 'Оренда квартири').isPaid).toBe(true);
});

test('нова витрата через форму', async ({ page }) => {
    await openApp(page);
    await page.locator('#mode-edit-btn').click();
    await page.locator('#edit-actions-panel button').first().click();
    await page.locator('#modal-title').fill('Тестова витрата');
    await page.locator('#modal-uah').fill('1000');
    await page.locator('#modal-day').fill('30');
    await page.locator('#expense-form button[type=submit]').click();

    await expect(page.locator('.expense-row', { hasText: 'Тестова витрата' })).toBeVisible();
    expect(await text(page, '#count-all')).toBe('15');
    expect(await text(page, '#kpi-free-balance-uah')).toBe('21 206,05 ₴');
});

test('фільтр «Сплачені» показує лише сплачені витрати', async ({ page }) => {
    await openApp(page);
    await page.locator('#filter-btn-paid').click();
    await expect(page.locator('.expense-row')).toHaveCount(2);
});

test('заощадження з вікна «Зарплата» враховуються один раз', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.openSalarySettingsModal());
    await expect(page.locator('#settings-savings-uah')).toHaveValue('3000');
    await page.locator('#settings-savings-uah').fill('5000');
    await page.locator('#salary-settings-form button[type=submit]').click();

    expect(await text(page, '#kpi-income-display')).toBe('54 800,00 ₴');
    expect(await text(page, '#kpi-in-hand-uah')).toBe('46 550,00 ₴');

    await page.evaluate(() => window.switchMainTab('analytics'));
    await page.evaluate(() => window.setCustomPreset('month'));
    expect(await text(page, '#an-total-income')).toBe('54 800,00 ₴');
});

test('звіти за жовтень показують той самий дохід, що й бюджет', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.switchMainTab('analytics'));
    expect(await text(page, '#an-total-income')).toBe('52 800,00 ₴');
    await expect(page.locator('#chart-legend-list > div').first()).toContainText('Оренда та ЖКГ');
});

test('калькулятор звірки: збіг із таблицею — без попередження', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.openReconciliationModal());
    await page.locator('#recon-actual-input').fill('44550');
    await expect(page.locator('#recon-discrepancy-card')).toBeHidden();
    await page.locator('#recon-actual-input').fill('44000');
    await expect(page.locator('#recon-discrepancy-card')).toBeVisible();
    expect(await text(page, '#recon-diff-display')).toBe('-550,00 ₴');
});

test('бекап: експорт і відновлення повертають ті самі дані', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.openBackupModal());
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.exportDataBackup())]);
    expect(download.suggestedFilename()).toBe('FinPulse_Backup_2026-10-29.json');
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(exported.months['2026-10'].expenses).toHaveLength(14);

    await page.evaluate(() => localStorage.clear());
    await page.locator('#backup-file-input').setInputFiles(await download.path());
    await expect(page.locator('#toast-msg')).toHaveText('Дані успішно відновлено');
    expect(await savedState(page)).toEqual(exported);
});

test('дані старого формату відкриваються', async ({ page }) => {
    const legacy = {
        activeMonthKey: '2026-10',
        appMode: 'view',
        months: {
            '2026-10': {
                year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8,
                incomeUAH: 1000, incomeUSD: 25, rate: 40, savingsUAH: 200, extraIncomeUAH: 0,
                expenses: [{ id: 'e1', title: 'Стара витрата', category: 'food', amountUAH: 100, amountUSD: 0, payDay: 30, isPaid: false }],
            },
        },
    };
    const errors = await openApp(page, { seed: legacy });
    await expect(page.locator('.expense-row', { hasText: 'Стара витрата' })).toBeVisible();
    // Заощадження зі старого поля стають статтею й рахуються один раз
    expect(await text(page, '#kpi-income-display')).toBe('1 200,00 ₴');
    expect(errors).toEqual([]);
});

test('кожна вкладка відкривається без горизонтальної прокрутки', async ({ page }) => {
    const errors = await openApp(page);
    for (const tab of ['budget', 'incomes', 'analytics']) {
        await page.evaluate(t => window.switchMainTab(t), tab);
        const [scrollW, viewW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(scrollW, `вкладка ${tab}`).toBeLessThanOrEqual(viewW);
    }
    expect(errors).toEqual([]);
});

test('шкідливий бекап не виконує код і показує назви як текст', async ({ page }) => {
    await openApp(page);
    const evil = {
        activeMonthKey: '2026-10',
        months: {
            '2026-10': {
                year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, incomeUAH: 1000, rate: 40,
                incomes: [],
                expenses: [{
                    id: "x');window.__pwned=1;('",
                    title: '<img src=x onerror="window.__pwned=1">',
                    category: 'food', amountUAH: 10, amountUSD: 0, payDay: 30, isPaid: false,
                }],
            },
        },
    };
    await page.evaluate(() => window.openBackupModal());
    await page.locator('#backup-file-input').setInputFiles({
        name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)),
    });
    await expect(page.locator('#toast-msg')).toHaveText('Дані успішно відновлено');

    const row = page.locator('.expense-row').first();
    await expect(row).toContainText('<img src=x onerror="window.__pwned=1">');
    await row.locator('button').first().click(); // checkbox uses the sanitized id
    expect(await text(page, '#count-paid')).toBe('1');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
