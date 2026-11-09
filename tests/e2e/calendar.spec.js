import { expect, test } from '@playwright/test';
import { openApp, openTab, savedState, text } from './helpers.js';

test('календар: дні з витратами й доходами, вікно дня, додавання з датою', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'calendar');
    await expect(page.locator('#fab')).toBeHidden();
    // жовтень 2026 починається в четвер: 3 порожні клітинки перед 1-м
    await expect(page.locator('.cal-cell.empty')).toHaveCount(3);
    await expect(page.locator('.cal-cell[data-day]')).toHaveCount(31);
    await expect(page.locator('.cal-cell.today')).toHaveAttribute('data-day', '29');
    await expect(page.locator('.cal-cell.payday')).toHaveAttribute('data-day', '8');
    // 10 жовтня: оренда 12 000
    const d10 = page.locator('.cal-cell[data-day="10"]');
    await expect(d10.locator('.cal-sum').first()).toHaveText('−12к');
    await expect(d10).toHaveAttribute('aria-label', /10 жовтня, витрати 12\s000 ₴/);
    // 8 жовтня: частина зарплати
    await expect(page.locator('.cal-cell[data-day="8"] .cal-sum.in')).toHaveText('+29к');
    await expect(page.locator('.cal-cell[data-day="11"] .cal-sum')).toHaveText('−1,3к');

    await d10.click();
    await expect(page.locator('.sheet h3')).toHaveText('10 жовтня');
    await expect(page.locator('#day-sheet')).toContainText('Оренда квартири');
    // позначити сплаченим просто у вікні дня — вікно оновлюється
    await page.locator('#day-sheet [data-action="toggle-paid"]').first().click();
    await expect(page.locator('#day-sheet [data-action="toggle-paid"]').first()).toHaveAttribute('aria-checked', 'true');

    // додати витрату на 21-ше
    await page.keyboard.press('Escape');
    await page.locator('.cal-cell[data-day="21"]').click();
    await expect(page.locator('#day-sheet')).toContainText('Цього дня записів немає.');
    await page.locator('[data-cal-add="expense"]').click();
    await expect(page.locator('#f-day')).toHaveValue('21');
    await page.locator('#f-title').fill('Квіти');
    await page.locator('#f-amount').fill('350');
    await page.locator('#expense-form button[type=submit]').click();
    await expect(page.locator('.cal-cell[data-day="21"] .cal-sum')).toHaveText('−350');

    // дохід на 22-ге
    await page.locator('.cal-cell[data-day="22"]').click();
    await page.locator('[data-cal-add="income"]').click();
    await expect(page.locator('#f-day')).toHaveValue('22');
    const st = await savedState(page);
    expect(st.months['2026-10'].expenses.find(e => e.title === 'Квіти').payDay).toBe(21);
    expect(await text(page, '.cal-head')).toMatch(/Витрати 30\s613 ₴ · доходи 52\s800 ₴/);
});

test('календар не виходить за край екрана телефона', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'calendar');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const cell = await page.locator('.cal-cell[data-day="15"]').boundingBox();
    expect(cell.width).toBeGreaterThan(30);
});

test('календар: свайп змінює місяць, вертикальний рух — ні', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium');
    await openApp(page);
    await openTab(page, 'calendar');
    const grid = page.locator('.cal-grid');
    const box = await grid.boundingBox();
    const swipe = async (dx, dy = 0) => {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await grid.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: x, clientY: y }], changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
        await grid.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: x + dx, clientY: y + dy }] });
    };
    await swipe(-120);
    await expect(page.locator('#cycle-name')).toHaveText('Листопад 2026');
    await swipe(10, -200); // прокручування сторінки — місяць не змінюється
    await expect(page.locator('#cycle-name')).toHaveText('Листопад 2026');
    await swipe(120);
    await expect(page.locator('#cycle-name')).toHaveText('Жовтень 2026');
});

test('кольори категорій: «Інші» — нейтральний сірий, борги — червоний, подарунки — жовтий', async ({ page }) => {
    await openApp(page);
    const dot = title => page.locator('.expense-row', { hasText: title }).locator('.item-title .dot');
    await expect(dot('Інші дрібні витрати')).toHaveCSS('background-color', 'rgb(148, 163, 184)');
    await expect(dot('Розстрочка за телефон')).toHaveCSS('background-color', 'rgb(239, 68, 68)');
    await expect(dot('Стрижка')).toHaveCSS('background-color', 'rgb(236, 72, 153)');
    await expect(dot('Подарунок на день народження')).toHaveCSS('background-color', 'rgb(234, 179, 8)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(dot('Подарунок на день народження')).toHaveCSS('background-color', 'rgb(250, 204, 21)');
});
