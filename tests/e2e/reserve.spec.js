import { expect, test } from '@playwright/test';
import { openApp, openTab, savedState, text } from './helpers.js';

const row = (page, title) => page.locator('.expense-row', { hasText: title });

test('витрата без дати: група «Без дати», не прострочена, потім — призначити день', async ({ page }) => {
    await openApp(page);
    const toPay = await text(page, '#kpi-to-pay');
    await page.locator('#fab').click();
    await page.locator('#f-title').fill('Стоматолог');
    await page.locator('#f-amount').fill('1500');
    await page.locator('#f-nodate').check();
    await expect(page.locator('#f-day')).toBeDisabled();
    await page.locator('#expense-form button[type=submit]').click();
    const group = page.locator('[data-group="nodate"]');
    await expect(group).toContainText('Без дати');
    await expect(group.locator('.expense-row')).toContainText('без дати');
    await expect(page.locator('[data-group="overdue"]')).not.toContainText('Стоматолог');
    expect(await text(page, '#kpi-to-pay')).not.toBe(toPay);

    // календар: рядок «Без дати» над сіткою
    await openTab(page, 'calendar');
    await expect(page.locator('.cal-undated')).toHaveText(/Без дати: 1 · 1\s500 ₴/);
    await page.locator('.cal-undated').click();
    await page.locator('#day-sheet [data-action="edit-expense"]').click();
    await page.locator('#f-nodate').uncheck();
    await page.locator('#f-day').fill('30');
    await page.locator('#expense-form button[type=submit]').click();
    await expect(page.locator('.cal-undated')).toHaveCount(0);
    await expect(page.locator('.cal-cell[data-day="30"] .cal-sum')).toHaveText('−2,5к');
    const e = (await savedState(page)).months['2026-10'].expenses.find(x => x.title === 'Стоматолог');
    expect(e.noDate).toBeUndefined();
    expect(e.payDay).toBe(30);
});

test('резерв: сума на місяць, витрати частинами, перевищення, закриття', async ({ page }) => {
    await openApp(page);
    await page.locator('#fab').click();
    await page.locator('[data-kind="reserve"]').click();
    await expect(page.locator('#f-day-field')).toBeHidden();
    await expect(page.locator('#f-repeat')).toHaveValue('month');
    await page.locator('#f-title').fill('Кафе');
    await page.locator('#f-amount').fill('2000');
    await page.locator('#expense-form button[type=submit]').click();
    const r = row(page, 'Кафе');
    await expect(page.locator('[data-group="reserve"]')).toContainText('Кафе');
    await expect(r).toContainText('витрачено 0,00 ₴ з 2 000,00 ₴');
    await expect(r.locator('.amount strong')).toHaveText('2 000,00 ₴');

    await r.locator('[data-action="open-reserve"]').click();
    await page.locator('#f-spend').fill('450');
    await page.locator('#f-spend-note').fill('Кава з подругою');
    await page.locator('#spend-form button[type=submit]').click();
    await expect(page.locator('#reserve-status')).toHaveText(/Витрачено 450,00 ₴ з 2\s000,00 ₴ · лишилось 1\s550,00 ₴/);
    await page.locator('#f-spend').fill('1700');
    await page.locator('#spend-form button[type=submit]').click();
    await expect(page.locator('#reserve-status')).toContainText('перевищено на 150,00 ₴');
    // видалити останню витрату
    await page.locator('[data-spend-del]').last().click();
    await expect(page.locator('#reserve-status')).toContainText('лишилось 1 550,00 ₴');
    await page.keyboard.press('Escape');
    await expect(r.locator('.amount strong')).toHaveText('1 550,00 ₴');

    // у календарі — витрата з резерву в її день (29-те)
    await openTab(page, 'calendar');
    await page.locator('.cal-cell[data-day="29"]').click();
    await expect(page.locator('#day-sheet')).toContainText('З резерву «Кафе» · Кава з подругою');
    await page.keyboard.press('Escape');
    await openTab(page, 'budget');

    // закрити резерв: залишок звільняється
    await r.locator('[data-action="toggle-paid"]').click();
    await expect(page.locator('[data-group="paid"]')).toContainText('Кафе');
    const st = await savedState(page);
    const cafe = st.months['2026-10'].expenses.find(e => e.title === 'Кафе');
    expect(cafe).toMatchObject({ amountUAH: 2000, isPaid: true, reserve: { spends: [{ amount: 450, day: 29, note: 'Кава з подругою' }] } });
    expect(st.version).toBe(8);
});

test('щомісячні «Продукти» → резерв: у списку один рядок', async ({ page }) => {
    await openApp(page);
    await row(page, 'Продукти').first().locator('[data-action="edit-expense"]').click();
    await page.locator('[data-kind="reserve"]').click();
    await page.locator('#expense-form button[type=submit]').click();
    const scope = page.locator('[data-scope="following"]');
    if (await scope.count()) await scope.click();
    const st = await savedState(page);
    expect(st.months['2026-10'].expenses.filter(e => e.title === 'Продукти')).toHaveLength(1);
    expect(st.months['2026-11'].expenses.filter(e => e.title === 'Продукти')).toHaveLength(1);
    await expect(row(page, 'Продукти')).toHaveCount(1);
});
