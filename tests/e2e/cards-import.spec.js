import { expect, test } from '@playwright/test';
import { openApp, openMore, openTab, savedState, text } from './helpers.js';

const row = (page, title) => page.locator('.expense-row', { hasText: title });

test('картки: додати, вказати у витраті, фільтр і підсумки, видалити', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-cards"]').click();
    await expect(page.locator('#card-list .card-item')).toHaveCount(3); // 2 демо-картки + «без картки»
    await page.locator('[data-action="new-card"]').click();
    await page.locator('#f-card-name').fill('ПУМБ');
    await page.locator('#f-card-last4').fill('12');
    await page.locator('#card-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toHaveText('Останні цифри — рівно 4 цифри');
    await page.locator('#f-card-last4').fill('9876');
    await page.locator('#card-form button[type=submit]').click();
    await expect(page.locator('#toast')).toHaveText('Картку додано');

    await row(page, 'Спортзал').locator('[data-action="edit-expense"]').click();
    const cardId = await page.locator('#f-card option', { hasText: 'ПУМБ ·9876' }).getAttribute('value');
    await page.locator('#f-card').selectOption(cardId);
    await page.locator('#expense-form button[type=submit]').click();
    await expect(row(page, 'Спортзал').locator('.card-chip')).toHaveText('ПУМБ');

    await page.locator('[data-action="open-filters"]').click();
    await page.locator('#f-filter-card').selectOption(cardId);
    await page.locator('#filters-form button[type=submit]').click();
    await expect(page.locator('[data-group="results"] .expense-row')).toHaveCount(1);
    await page.locator('[data-action="reset-filters"]').click();

    await openMore(page);
    await page.locator('[data-action="open-cards"]').click();
    await expect(page.locator('.card-item', { hasText: 'ПУМБ' })).toContainText('заплановано 1 100,00 ₴');
    await page.locator('.card-item', { hasText: 'ПУМБ' }).click();
    await page.locator('[data-sheet="delete"]').click();
    await expect(page.locator('.sheet-text')).toContainText('в 1 записах');
    await page.locator('[data-confirm="yes"]').click();
    await expect(row(page, 'Спортзал').locator('.card-chip')).toHaveCount(0);
    const st = await savedState(page);
    expect(st.cards.map(c => c.name)).toEqual(['Основна', 'Зарплатна']);
    expect(JSON.stringify(st)).not.toContain(cardId);
});

test('картка в частині зарплати і в надходженні', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'incomes');
    await expect(page.locator('.salary-part').first().locator('.card-chip')).toHaveText('Зарплатна');
    await page.locator('[data-action="add-income"][data-category="extra"]').click();
    await page.locator('#f-title').fill('Переклад');
    await page.locator('#f-amount').fill('900');
    await page.locator('#f-card').selectOption({ label: 'Основна' });
    await page.locator('#income-form button[type=submit]').click();
    await expect(page.locator('.income-row', { hasText: 'Переклад' }).locator('.card-chip')).toHaveText('Основна');
});

const MONO_CSV = [
    '"Дата i час операції","Деталі операції",MCC,"Сума в валюті картки (UAH)","Сума в валюті операції","Валюта"',
    '"20.10.2026 13:01:02","Сільпо",5411,-523.40,-523.40,UAH',
    '"21.10.2026 09:00:00","Поповнення від Олени",4829,1500.00,1500.00,UAH',
    '"22.10.2026 20:15:00","Без суми",5411,,0,UAH',
    '"03.11.2026 10:00:00","Таксі",4121,-180,-180,UAH',
].join('\r\n');

async function chooseFile(page, name, content) {
    await openMore(page);
    await page.locator('[data-action="open-import"]').click();
    await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
}

test('імпорт CSV: колонки вгадано, перегляд, імпорт, повтор без дублікатів, скасування', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, 'mono.csv', MONO_CSV);
    await expect(page.locator('#map-date')).toHaveValue('0');
    await expect(page.locator('#map-title')).toHaveValue('1');
    await expect(page.locator('#map-amount')).toHaveValue('3');
    await page.locator('#map-next').click();
    await expect(page.locator('#import-summary')).toContainText('Витрат: 2, надходжень: 1');
    await expect(page.locator('#import-summary')).not.toContainText('помилками'); // рядок без суми — не помилка
    await page.locator('#opt-backup').uncheck();
    await page.locator('#import-apply').click();
    await expect(page.locator('#toast')).toHaveText('Імпортовано записів: 3');
    await expect(page.locator('[data-group="paid"]')).toContainText('Сільпо');
    await expect(page.locator('[data-group="bridge"]')).toContainText('Таксі'); // 3 листопада — до ЗП
    const st = await savedState(page);
    expect(st.months['2026-10'].incomes.find(i => i.title === 'Поповнення від Олени')).toMatchObject({ amountUAH: 1500, isReceived: true });

    await chooseFile(page, 'mono.csv', MONO_CSV);
    await page.locator('#map-next').click();
    await expect(page.locator('#import-summary')).toContainText('Витрат: 0, надходжень: 0');
    await expect(page.locator('#import-summary')).toContainText('дублікатів: 3');
    await expect(page.locator('#import-apply')).toBeDisabled();

    await page.keyboard.press('Escape');
    await openMore(page);
    await page.locator('[data-action="open-import"]').click();
    await page.locator('[data-sheet="undo"]').click();
    await expect(page.locator('#toast')).toHaveText('Імпорт скасовано');
    await expect(row(page, 'Сільпо')).toHaveCount(0);
    expect(await text(page, '#kpi-in-hand')).toBe('44 550 ₴');
});

test('імпорт CSV: без колонки дати — підказка', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, 'x.csv', 'Щось;Сума\nабв;100');
    await page.locator('#map-next').click();
    await expect(page.locator('#form-error')).toHaveText('Оберіть колонку суми і колонку дати (або місяць таблиці)');
});

test('імпорт JSON: список записів з карткою, яку створено автоматично', async ({ page }) => {
    await openApp(page);
    const json = JSON.stringify([
        { date: '2026-10-25', title: 'Аптека', amount: -340, category: 'Здоров’я та медицина', card: 'Приват' },
        { date: '2026-10-26', title: 'Кешбек', amount: 55, type: 'дохід', card: 'Приват' },
    ]);
    await chooseFile(page, 'records.json', json);
    await expect(page.locator('#import-summary')).toContainText('Витрат: 1, надходжень: 1');
    await expect(page.locator('#import-summary')).toContainText('Нові картки: Приват');
    await page.locator('#opt-backup').uncheck();
    await page.locator('#import-apply').click();
    const st = await savedState(page);
    const card = st.cards.find(c => c.name === 'Приват');
    expect(card).toBeTruthy();
    expect(st.months['2026-10'].expenses.find(e => e.title === 'Аптека')).toMatchObject({ category: 'health', cardId: card.id, amountUAH: 340 });
});

test('імпорт JSON: неправильний файл — зрозуміле повідомлення', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, 'bad.json', '{"hello": 1}');
    await expect(page.locator('#form-error')).toHaveText('У цьому JSON немає записів, які можна імпортувати');
});

const sheet = (month, salaryDate) => [
    ',Підписки,₴,$,Дата',
    `TRUE,Інтернет,₴\t300.00,,07.${month}`,
    `FALSE,Хмара,₴\t83.00,US$\t1.99,20.${month}`,
    'TRUE,Продукти,"₴\t8,000.00",US$\t0.00,5',
    'FALSE,Фетр,,US$\t0.00,US$\t0.00',
    ',СУМА ВИТРАТ,"₴\t8,383.00",US$\t1.99,',
    `,Зарплата,"₴\t50,000.00","US$\t1,200.00",${salaryDate}`,
    ',ЗАЛИШОК ,"₴\t41,617.00",US$\t0.00,',
].join('\r\n');

test('імпорт кількох щомісячних таблиць одразу: місяць із назви файлу', async ({ page }) => {
    await openApp(page, { firstRun: true });
    await page.locator('[data-welcome="empty"]').click();
    await openMore(page);
    await page.locator('[data-action="open-import"]').click();
    await page.locator('#import-file').setInputFiles([
        { name: '08.2026-Серпень.csv', mimeType: 'text/csv', buffer: Buffer.from(sheet('08', '04.08')) },
        { name: '09.2026-Вересень.csv', mimeType: 'text/csv', buffer: Buffer.from(sheet('09', '04.08')) }, // дата ЗП скопійована з серпня
    ]);
    await expect(page.locator('.sheet .sheet-text').first()).toHaveText('Файлів: 2');
    await expect(page.locator('#import-summary')).toContainText('Витрат: 6, надходжень: 0. Частин зарплати: 2.');
    await expect(page.locator('#import-summary')).toContainText('Разом витрат 16 766,00 ₴');
    await expect(page.locator('#import-summary')).toContainText('перенесених у місяць таблиці: 1');
    await page.locator('#opt-backup').uncheck();
    await page.locator('#import-apply').click();
    const st = await savedState(page);
    expect(st.months['2026-08'].expenses.map(e => e.title)).toEqual(['Інтернет', 'Хмара', 'Продукти']);
    expect(st.months['2026-09'].salaryParts).toMatchObject([{ amount: 1200, currency: 'USD', uah: 50000, day: 4 }]);
    expect(st.months['2026-08'].expenses.find(e => e.title === 'Хмара')).toMatchObject({ isPaid: false, amountUSD: 1.99, category: 'subscriptions' }); // з розділу «Підписки»
});

test('імпорт однієї таблиці: місяць можна змінити у вікні колонок', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-import"]').click();
    await page.locator('#import-file').setInputFiles({ name: 'table.csv', mimeType: 'text/csv', buffer: Buffer.from(sheet('11', '8')) });
    await expect(page.locator('#ctx-month')).toHaveValue('');
    await page.locator('#ctx-month').selectOption('11');
    await page.locator('#ctx-year').fill('2026');
    await page.locator('#map-next').click();
    await expect(page.locator('#import-summary')).toContainText('Витрат: 3');
    await expect(page.locator('#import-summary')).toContainText('Місяці: 11.2026');
});
