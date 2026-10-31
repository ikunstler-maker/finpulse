import { expect, test } from '@playwright/test';
import { openApp, openMore, openTab, savedState, text } from './helpers.js';

const group = (page, id) => page.locator(`[data-group="${id}"]`);
const row = (page, title) => page.locator('.expense-row', { hasText: title });

test('демо-дані: підсумки, групи й відсутність помилок', async ({ page }) => {
    const errors = await openApp(page);
    expect(await text(page, '#kpi-in-hand')).toBe('44 550 ₴');
    expect(await text(page, '#kpi-income')).toBe('52 800,00 ₴');
    expect(await text(page, '#kpi-to-pay')).toBe('22 343,95 ₴');
    expect(await text(page, '#kpi-free')).toBe('22 206,05 ₴');
    await expect(group(page, 'overdue').locator('.expense-row')).toHaveCount(11);
    await expect(group(page, 'soon').locator('.expense-row')).toHaveCount(1);
    await expect(group(page, 'bridge').locator('.expense-row')).toHaveCount(2);
    await expect(group(page, 'paid').locator('.expense-row')).toHaveCount(2);
    await expect(group(page, 'bridge')).toContainText('До ЗП 8 листопада');
    expect(errors).toEqual([]);
});

test('«сплачено» переносить витрату в групу сплачених і зберігається', async ({ page }) => {
    await openApp(page);
    await row(page, 'Оренда квартири').locator('[data-action="toggle-paid"]').click();
    await expect(group(page, 'paid').locator('.expense-row')).toHaveCount(3);
    expect(await text(page, '#kpi-in-hand')).toBe('32 550 ₴');
    await page.reload();
    await expect(group(page, 'paid')).toContainText('Оренда квартири');
    const st = await savedState(page);
    expect(st.months['2026-10'].expenses.find(e => e.title === 'Оренда квартири').isPaid).toBe(true);
});

test('нова витрата в доларах через панель', async ({ page }) => {
    await openApp(page);
    await page.locator('#fab').click();
    await page.locator('#f-title').fill('Хостинг');
    await page.locator('#f-amount').fill('10');
    await page.locator('[data-cur="USD"]').click();
    await page.locator('#f-rate').fill('41.5');
    await expect(page.locator('#f-uah')).toHaveValue('415.00');
    await page.locator('#f-uah').fill('420');
    await expect(page.locator('#f-rate')).toHaveValue('42');
    await page.locator('#f-day').fill('30');
    await page.locator('[data-picker="f-category"] .picker-btn').click();
    await expect(page.locator('[data-picker="f-category"] li[data-value="subscriptions"] .dot')).toHaveCSS('background-color', 'rgb(139, 92, 246)');
    await page.locator('[data-picker="f-category"] li[data-value="subscriptions"]').click();
    await expect(page.locator('[data-picker="f-category"] .picker-list')).toBeHidden();
    await page.locator('#expense-form button[type=submit]').click();
    const r = row(page, 'Хостинг');
    await expect(r).toContainText('420,00 ₴');
    await expect(r).toContainText('$10.00');
    expect(await text(page, '#kpi-free')).toBe('21 786,05 ₴');
    const e = (await savedState(page)).months['2026-10'].expenses.find(x => x.title === 'Хостинг');
    expect(e).toMatchObject({ amountUAH: 420, amountUSD: 10, currency: 'USD', category: 'subscriptions', payDay: 30 });
});

test('форма не зберігає витрату без назви і суми', async ({ page }) => {
    await openApp(page);
    await page.locator('#fab').click();
    await page.locator('#expense-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toHaveText('Вкажіть назву витрати');
    await page.locator('#f-title').fill('Щось');
    await page.locator('#expense-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toHaveText('Вкажіть суму більше нуля');
});

test('редагування, дублювання і видалення витрати', async ({ page }) => {
    await openApp(page);
    await row(page, 'Спортзал').locator('[data-action="edit-expense"]').click();
    await page.locator('#f-amount').fill('1300');
    await page.locator('#expense-form button[type=submit]').click();
    await expect(row(page, 'Спортзал')).toContainText('1 300,00 ₴');

    await row(page, 'Спортзал').locator('[data-action="edit-expense"]').click();
    await page.locator('[data-sheet="duplicate"]').click();
    await expect(row(page, 'Спортзал')).toHaveCount(2);

    await row(page, 'Спортзал').first().locator('[data-action="edit-expense"]').click();
    await page.locator('[data-sheet="delete"]').click();
    await page.locator('[data-confirm="yes"]').click();
    await expect(row(page, 'Спортзал')).toHaveCount(1);
});

test('фільтр категорії показує лише її витрати і підсумок', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="filter-category"][data-category="housing"]').click();
    await expect(page.locator('.expense-row')).toHaveCount(2);
    await expect(page.locator('.filter-note')).toContainText('План 14 500,00 ₴');
    await page.locator('[data-action="filter-category"][data-category="all"]').click();
    await expect(page.locator('.expense-row')).toHaveCount(16);
});

test('зарплата частинами: новий вивід зі своїм курсом', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'incomes');
    await expect(page.locator('.salary-part')).toHaveCount(2);
    await page.locator('[data-action="add-part"]').click();
    await page.locator('#f-amount').fill('100');
    await page.locator('#f-rate').fill('42');
    await page.locator('#f-day').fill('25');
    await page.locator('#f-received').click(); // ще не отримано
    await page.locator('#part-form button[type=submit]').click();
    await expect(page.locator('.salary-part')).toHaveCount(3);
    expect(await text(page, '#incomes-total')).toBe('57 000 ₴');
    expect(await text(page, '#incomes-expected')).toBe('4 200,00 ₴');
    await openTab(page, 'budget');
    expect(await text(page, '#kpi-income')).toBe('57 000,00 ₴');
    expect(await text(page, '#kpi-in-hand')).toBe('44 550 ₴'); // очікуване не на руках
});

test('надходження: від кого, дата, позначка «отримано»', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'incomes');
    await page.locator('[data-action="add-income"][data-category="debt_return"]').click();
    await page.locator('#f-title').fill('Борг за квитки');
    await page.locator('#f-from').fill('Андрій');
    await page.locator('#f-amount').fill('700');
    await page.locator('#f-day').fill('25');
    await page.locator('#income-form button[type=submit]').click();
    const cat = page.locator('[data-income-cat="debt_return"]');
    await expect(cat).toContainText('від Андрій');
    await expect(cat).toContainText('25 жовт');
    await cat.locator('[data-action="toggle-income"]').click();
    await expect(cat).toContainText('очікується');
});

test('звірка з банком: збіг, розбіжність і запис різниці як витрати', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-reconcile"]').click();
    await page.locator('#f-bank').fill('44550');
    await expect(page.locator('#reconcile-result')).toContainText('Збігається');
    await page.locator('#f-bank').fill('44000');
    await expect(page.locator('#reconcile-result')).toContainText('550,00 ₴ менше');
    await page.locator('#reconcile-fix').click();
    await expect(group(page, 'paid')).toContainText('Необліковані витрати');
    expect(await text(page, '#kpi-in-hand')).toBe('44 000 ₴');
});

test('місяці: перехід, створення наступного з поточного', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="next-month"]').click();
    await expect(page.locator('#cycle-name')).toHaveText('Листопад 2026');
    await page.locator('[data-action="next-month"]').click();
    await page.locator('[data-action="create-next-month"]').click();
    await expect(page.locator('#cycle-name')).toHaveText('Грудень 2026');
    await expect(page.locator('#toast')).toContainText('Грудень 2026');
    await page.locator('[data-action="prev-month"]').click();
    await page.locator('[data-action="prev-month"]').click();
    await expect(page.locator('#cycle-name')).toHaveText('Жовтень 2026');
});

test('звіти за поточний місяць: дохід без подвійного обліку', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'reports');
    expect(await text(page, '#report-income')).toBe('52 800 ₴');
    await expect(page.locator('#category-bars .hbar').first()).toContainText('Оренда та ЖКГ');
    await page.locator('[data-action="report-mode"][data-mode="paid"]').click();
    await expect(page.locator('#category-bars .hbar')).toHaveCount(2);
    await page.locator('[data-action="report-period"][data-period="custom"]').click();
    await expect(page.locator('#r-from')).toHaveValue('2026-10-08');
    await expect(page.locator('#r-to')).toHaveValue('2026-11-07');
});

test('бекап: збереження і відновлення', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-backup"]').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-sheet="export"]').click()]);
    expect(download.suggestedFilename()).toBe('FinPulse_Backup_2026-10-29.json');
    const exported = JSON.parse(await (await download.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8')));
    expect(exported.version).toBe(6);

    await page.keyboard.press('Escape');
    await page.evaluate(() => localStorage.clear());
    await openMore(page);
    await page.locator('[data-action="open-backup"]').click();
    await page.locator('#backup-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await expect(page.locator('#toast')).toHaveText('Дані успішно відновлено');
    expect(await savedState(page)).toEqual(exported);
});

test('дані й бекапи старого формату відкриваються', async ({ page }) => {
    const legacy = {
        activeMonthKey: '2026-10', appMode: 'view',
        months: {
            '2026-10': {
                year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8,
                incomeUAH: 1000, incomeUSD: 25, rate: 40, savingsUAH: 200, extraIncomeUAH: 0,
                expenses: [{ id: 'e1', title: 'Стара витрата', category: 'food', amountUAH: 100, amountUSD: 0, payDay: 30, isPaid: false }],
            },
        },
    };
    const errors = await openApp(page, { seed: legacy });
    await expect(row(page, 'Стара витрата')).toBeVisible();
    expect(await text(page, '#kpi-income')).toBe('1 200,00 ₴');
    await openTab(page, 'incomes');
    await expect(page.locator('.salary-part')).toContainText('25 USDT');
    expect(errors).toEqual([]);
});

test('шкідливий бекап не виконує код і показує назви як текст', async ({ page }) => {
    await openApp(page);
    const evil = {
        activeMonthKey: '2026-10',
        months: {
            '2026-10': {
                year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, incomeUAH: 1000, rate: 40, incomes: [],
                expenses: [{ id: "x');window.__pwned=1;('", title: '<img src=x onerror="window.__pwned=1">', category: 'food', amountUAH: 10, amountUSD: 0, payDay: 30, isPaid: false }],
            },
        },
    };
    await openMore(page);
    await page.locator('[data-action="open-backup"]').click();
    await page.locator('#backup-file').setInputFiles({ name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
    await expect(page.locator('#toast')).toHaveText('Дані успішно відновлено');
    const r = page.locator('.expense-row').first();
    await expect(r).toContainText('<img src=x onerror="window.__pwned=1">');
    await r.locator('[data-action="toggle-paid"]').click();
    await expect(group(page, 'paid').locator('.expense-row')).toHaveCount(1);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('тема: світла, темна, як у системі', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-theme"]').click();
    await page.locator('[data-theme-set="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openMore(page);
    await page.locator('[data-action="open-theme"]').click();
    await page.locator('[data-theme-set="system"]').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('кожна вкладка без горизонтальної прокрутки, кнопки достатнього розміру', async ({ page }) => {
    const errors = await openApp(page);
    for (const tab of ['budget', 'incomes', 'reports']) {
        await openTab(page, tab);
        const [scrollW, viewW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(scrollW, `вкладка ${tab}`).toBeLessThanOrEqual(viewW);
    }
    await openTab(page, 'budget');
    const small = await page.evaluate(() => [...document.querySelectorAll('.check, .item-main, #fab')]
        .filter(el => el.offsetParent).map(el => el.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length);
    expect(small).toBe(0);
    expect(errors).toEqual([]);
});

test('компактний рядок: дата під чекбоксом, без назви категорії, довга назва у два рядки', async ({ page }) => {
    await openApp(page);
    const r = row(page, 'Оренда квартири');
    await expect(r.locator('.check .item-date')).toHaveText('10 жовт');
    await expect(r.locator('.item-title .dot')).toHaveCount(1);
    await expect(r).not.toContainText('Оренда та ЖКГ');
    await expect(r).not.toContainText('прострочено'); // без позначки «прострочено N дн.»
    await expect(r).toHaveClass(/overdue/); // дата й рамка червоні

    await page.locator('#fab').click();
    await page.locator('#f-title').fill('Дуже довга назва витрати, яка не поміщається в один рядок на телефоні і має перенестися');
    await page.locator('#f-amount').fill('10');
    await page.locator('#expense-form button[type=submit]').click();
    const title = row(page, 'Дуже довга назва').locator('.item-title');
    const lh = await title.evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
    const h = (await title.boundingBox()).height;
    expect(h).toBeLessThanOrEqual(lh * 2 + 1);
});

test('вікно редагування: по центру, закривається хрестиком, сторінка під ним не прокручується', async ({ page }) => {
    await openApp(page);
    await row(page, 'Спортзал').locator('[data-action="edit-expense"]').click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/modal-open/);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    const box = await sheet.boundingBox();
    const vp = page.viewportSize();
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await expect(page.locator('#f-category')).toHaveValue('health');
    await page.locator('.sheet-close').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/modal-open/);
});

test('верхня панель на всю ширину і напівпрозора; синхронізація ліворуч від місяця; «Ще» з трьома рисочками', async ({ page }) => {
    await openApp(page);
    const vp = page.viewportSize();
    const top = await page.locator('header.top').boundingBox();
    // на телефоні — від краю до краю; на комп'ютері панель у межах колонки застосунку
    if (vp.width < 960) {
        expect(top.x).toBe(0);
        expect(top.width).toBe(vp.width);
    }
    const style = await page.locator('header.top').evaluate(el => {
        const cs = getComputedStyle(el);
        return { blur: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor };
    });
    expect(style.blur).toContain('blur');
    expect(style.bg).toMatch(/rgba\(.*, 0\.\d+\)|color\(srgb .* \/ 0\.\d+\)/);
    // вміст під панеллю не видно по боках: панель перекриває всю ширину при прокрутці
    await page.mouse.wheel(0, 600);
    const after = await page.locator('header.top').boundingBox();
    expect(after.y).toBe(0);
    if (vp.width < 960) {
        await expect(page.locator('.nav [data-action="more"] svg path')).toHaveAttribute('d', 'M4 7h16M4 12h16M4 17h16');
        await expect(page.locator('header.top .brand')).toBeHidden();
    }
});

test('повторювані платежі й розстрочка: позначка 3/6, у новому місяці — наступний платіж', async ({ page }) => {
    await openApp(page);
    await expect(row(page, 'Розстрочка за телефон').locator('.chip.installment')).toHaveText('3/6');
    // одноразова витрата
    await page.locator('#fab').click();
    await page.locator('#f-title').fill('Квіти');
    await page.locator('#f-amount').fill('300');
    await expect(page.locator('#f-repeat')).toHaveValue('once');
    await expect(page.locator('#f-installment')).toBeHidden();
    await page.locator('#expense-form button[type=submit]').click();
    // розстрочка з помилкою, потім правильна
    await page.locator('#fab').click();
    await page.locator('#f-title').fill('Пилосос');
    await page.locator('#f-amount').fill('1000');
    await page.locator('#f-repeat').selectOption('installment');
    await expect(page.locator('#f-installment')).toBeVisible();
    await page.locator('#f-inst-current').fill('5');
    await page.locator('#f-inst-total').fill('4');
    await page.locator('#expense-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toContainText('Номер платежу');
    await page.locator('#f-inst-current').fill('1');
    await page.locator('#expense-form button[type=submit]').click();
    await expect(row(page, 'Пилосос').locator('.chip.installment')).toHaveText('1/4');
    const oct = (await savedState(page)).months['2026-10'].expenses;
    expect(oct.find(e => e.title === 'Квіти').repeat).toBeUndefined();
    expect(oct.find(e => e.title === 'Пилосос').installment).toEqual({ current: 1, total: 4 });

    // у демо листопад уже є — прибираємо його і створюємо з жовтня
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('finpulse_app_state_v3'));
        delete s.months['2026-11'];
        localStorage.setItem('finpulse_app_state_v3', JSON.stringify(s));
    });
    await page.reload();
    await page.locator('[data-action="next-month"]').click();
    await page.locator('[data-action="create-next-month"]').click();
    await expect(page.locator('#cycle-name')).toHaveText('Листопад 2026');
    const nov = (await savedState(page)).months['2026-11'].expenses;
    const titles = nov.map(e => e.title);
    expect(titles).not.toContain('Квіти');
    expect(titles).not.toContain('Подарунок на день народження');
    expect(titles).toContain('Оренда квартири');
    expect(nov.find(e => e.title === 'Розстрочка за телефон').installment).toEqual({ current: 4, total: 6 });
    expect(nov.find(e => e.title === 'Пилосос').installment).toEqual({ current: 2, total: 4 });
    await expect(row(page, 'Пилосос').locator('.chip.installment')).toHaveText('2/4');
});
