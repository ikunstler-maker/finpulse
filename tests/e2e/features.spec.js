import { expect, test } from '@playwright/test';
import { openApp, openTab, savedState, text } from './helpers.js';

test('пошук, фільтри і сортування витрат', async ({ page }) => {
    await openApp(page);
    await page.locator('#expense-search').fill('сервіс');
    await expect(page.locator('[data-group="results"] .expense-row')).toHaveCount(3);
    await expect(page.locator('#expense-search')).toBeFocused();
    await page.locator('#expense-search').fill('');

    await page.locator('[data-action="open-filters"]').click();
    await page.locator('#f-status').selectOption('unpaid');
    await page.locator('#f-sort').selectOption('amountDesc');
    await page.locator('#f-min').fill('1000');
    await page.locator('#filters-form button[type=submit]').click();
    const titles = await page.locator('[data-group="results"] .item-title').allTextContents();
    expect(titles).toEqual(['Оренда квартири', 'Комунальні послуги', 'Дрібний ремонт', 'Розстрочка за телефон', 'Спортзал', 'Інші дрібні витрати']);
    await expect(page.locator('.filter-btn .badge')).toHaveText('3');

    await page.locator('[data-action="open-filters"]').click();
    await page.locator('#f-status').selectOption('bridge');
    await page.locator('#f-min').fill('');
    await page.locator('#f-sort').selectOption('alpha');
    await page.locator('#filters-form button[type=submit]').click();
    expect(await page.locator('[data-group="results"] .item-title').allTextContents()).toEqual(['Музичний сервіс', 'Хмарне сховище']);

    await page.locator('[data-action="reset-filters"]').click();
    await expect(page.locator('[data-group="overdue"]')).toBeVisible();
});

test('цілі: створити, відкласти вільний залишок, взяти назад', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="open-goals"]').click();
    await page.locator('[data-action="new-goal"]').click();
    await page.locator('#f-goal-name').fill('Подушка безпеки');
    await page.locator('#f-goal-target').fill('30000');
    await page.locator('#goal-form button[type=submit]').click();
    await expect(page.locator('.goals-row')).toContainText('1 · відкладено 0 ₴');
    await page.locator('[data-action="open-goals"]').click();
    await page.locator('[data-action="move-goal"]').click();
    await expect(page.locator('#f-move')).toHaveValue('22206.05'); // пропонує вільний залишок
    await page.locator('#f-move').fill('5000');
    await page.locator('#move-form button[type=submit]').click();
    await expect(page.locator('.goals-row')).toContainText('відкладено 5 000 ₴');
    await page.locator('[data-action="open-goals"]').click();
    await expect(page.locator('.goal')).toContainText('5 000 ₴ / 30 000 ₴');
    await page.keyboard.press('Escape');
    expect(await text(page, '#kpi-free')).toBe('17 206,05 ₴');
    expect(await text(page, '#kpi-goals')).toBe('5 000,00 ₴');
    expect(await text(page, '#kpi-in-hand')).toBe('44 550 ₴');

    await page.locator('[data-action="open-goals"]').click();
    await page.locator('[data-action="move-goal"]').click();
    await page.locator('[data-dir="out"]').click();
    await page.locator('#f-move').fill('9000');
    await page.locator('#move-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toContainText('У цілі лише');
    await page.locator('#f-move').fill('1000');
    await page.locator('#move-form button[type=submit]').click();
    await expect(page.locator('.goals-row')).toContainText('відкладено 4 000 ₴');
    const st = await savedState(page);
    expect(st.goals).toHaveLength(1);
    expect(st.months['2026-10'].goalMoves.map(m => m.amount)).toEqual([5000, -1000]);
});

test('дві виплати: аванс і основна показуються окремими періодами', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'incomes');
    await page.locator('[data-action="salary-day"]').click();
    await page.locator('#f-second-day').fill('5');
    await page.locator('#day-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toContainText('пізніше за 8');
    await page.locator('#f-second-day').fill('15');
    await page.locator('#day-form button[type=submit]').click();
    await expect(page.locator('.salary-section')).toContainText('виплати 8-го і 15-го');
    await openTab(page, 'budget');
    const periods = page.locator('#pay-periods .rowline');
    await expect(periods).toHaveCount(2);
    await expect(periods.nth(0)).toContainText('8 жовт – 14 жовт');
    await expect(periods.nth(1)).toContainText('15 жовт – 7 лист');
    // кінцевий залишок другого періоду = вільний залишок
    expect((await periods.nth(1).locator('.val').textContent()).replace(/\s/g, ' ')).toBe((await text(page, '#kpi-free')));
    await page.locator('[data-action="open-filters"]').click();
    await expect(page.locator('#f-status option[value="period1"]')).toHaveText('До виплати 15-го');
});

test('підказка курсу: підставляє курс і рахує гривні', async ({ page }) => {
    await page.route('https://bank.gov.ua/**', r => r.fulfill({ json: [{ rate: 41.3254, cc: 'USD', exchangedate: '29.10.2026' }] }));
    await page.route('https://whitebit.com/**', r => r.fulfill({ json: { success: true, result: { last: '41.82' } } }));
    await openApp(page);
    await page.locator('#fab').click();
    await page.locator('#f-amount').fill('100');
    await page.locator('[data-cur="USDT"]').click();
    await page.locator('[data-rate-load]').click();
    await expect(page.locator('[data-rate-hint]')).toContainText('НБУ: $1 = 41,3254 ₴ (29.10.2026)');
    await page.locator('[data-rate-use="41.82"]').click();
    await expect(page.locator('#f-rate')).toHaveValue('41.82');
    await expect(page.locator('#f-uah')).toHaveValue('4182.00');
});

test('підказка курсу: без мережі — зрозуміле повідомлення', async ({ page }) => {
    await page.route(/bank\.gov\.ua|whitebit\.com/, r => r.abort());
    await openApp(page);
    await page.locator('#fab').click();
    await page.locator('[data-cur="USD"]').click();
    await page.locator('[data-rate-load]').click();
    await expect(page.locator('[data-rate-hint]')).toContainText('Не вдалося отримати курс');
});

test('цілі не виходять за край екрана', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="open-goals"]').click();
    await page.locator('[data-action="new-goal"]').click();
    await page.locator('#f-goal-name').fill('Дуже довга назва цілі для перевірки переносу тексту');
    await page.locator('#f-goal-target').fill('1000000');
    await page.locator('#goal-form button[type=submit]').click();
    await page.locator('[data-action="open-goals"]').click();
    const [card, btn] = await Promise.all([page.locator('.sheet').boundingBox(), page.locator('[data-action="move-goal"]').boundingBox()]);
    expect(btn.x + btn.width).toBeLessThanOrEqual(card.x + card.width);
    const [scrollW, viewW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scrollW).toBeLessThanOrEqual(viewW);
});

test('компактний вигляд: більше записів на екран, запам’ятовується', async ({ page }) => {
    await openApp(page);
    const rowH = async () => (await page.locator('.expense-row').first().boundingBox()).height;
    const normal = await rowH();
    await page.locator('[data-action="more"]:visible').click();
    await page.locator('[data-action="open-density"]').click();
    await page.locator('[data-density-set="compact"]').click();
    await page.keyboard.press('Escape');
    const compact = await rowH();
    expect(compact).toBeLessThan(normal);
    expect(compact).toBeGreaterThanOrEqual(44);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
});

test('пошук і фільтри не прилипають до підсумку', async ({ page }) => {
    await openApp(page);
    const [summary, toolbar] = await Promise.all([page.locator('.summary').boundingBox(), page.locator('.toolbar').boundingBox()]);
    const vp = page.viewportSize();
    if (vp.width < 960) expect(toolbar.y - (summary.y + summary.height)).toBeGreaterThanOrEqual(12);
});
