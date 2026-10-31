import { expect, test } from '@playwright/test';
import { writeXLSX } from '../../src/data/xlsx.js';
import { openApp, openMore, openTab, savedState } from './helpers.js';

const readDownload = async download => Buffer.concat(await (await download.createReadStream()).toArray());

test('імпорт Excel: кожен аркуш — свій місяць з назви аркуша', async ({ page }) => {
    await openApp(page, { firstRun: true });
    await page.locator('[data-welcome="empty"]').click();
    const book = writeXLSX([
        { name: 'Серпень 2026', rows: [['Дата', 'Назва', 'Сума', 'Сплачено'], ['03', 'Інтернет', 300, 'TRUE'], ['10', 'Оренда квартири', 12000, 'FALSE']] },
        { name: 'Вересень 2026', rows: [['Дата', 'Назва', 'Сума', 'Сплачено'], ['03', 'Інтернет', 300, 'FALSE'], ['15.08', 'Кава', 85.5, 'TRUE']] },
    ]);
    await openMore(page);
    await page.locator('[data-action="open-import"]').click();
    await page.locator('#import-file').setInputFiles({ name: 'Бюджет.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(book) });
    await expect(page.locator('.sheet .sheet-text').first()).toHaveText('Файлів: 2');
    await expect(page.locator('#import-summary')).toContainText('Витрат: 4');
    await expect(page.locator('#import-summary')).toContainText('Місяці: 08.2026, 09.2026');
    await expect(page.locator('#import-summary')).toContainText('перенесених у місяць таблиці: 1');
    await page.locator('#opt-backup').uncheck();
    await page.locator('#import-apply').click();
    const st = await savedState(page);
    expect(st.months['2026-08'].expenses.map(e => [e.title, e.amountUAH, e.isPaid])).toEqual([['Інтернет', 300, true], ['Оренда квартири', 12000, false]]);
    expect(st.months['2026-09'].expenses.find(e => e.title === 'Кава')).toMatchObject({ payDay: 15, amountUAH: 85.5 });
});

test('старий .xls і зіпсований .xlsx — зрозуміла помилка', async ({ page }) => {
    await openApp(page);
    await openMore(page);
    await page.locator('[data-action="open-import"]').click();
    await page.locator('#import-file').setInputFiles({ name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(page.locator('#form-error')).toContainText('Збережіть його як .xlsx');
    await page.locator('#import-file').setInputFiles({ name: 'broken.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') });
    await expect(page.locator('#form-error')).toContainText('Не вдалося прочитати Excel-файл «broken.xlsx»');
});

test('експорт звіту: CSV, Excel, JSON, Markdown і PDF (друк)', async ({ page }) => {
    await openApp(page);
    await openTab(page, 'reports');
    const save = async format => {
        await page.locator('[data-action="open-export"]').click();
        const [d] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-export="${format}"]`).click()]);
        expect(d.suggestedFilename()).toBe(`FinPulse_Report_2026-10.${format}`);
        return readDownload(d);
    };
    const csv = (await save('csv')).toString('utf8');
    expect(csv.split('\r\n')[0]).toBe('﻿Дата;Назва;Сума;Сума у валюті;Валюта;Тип;Категорія;Картка;Сплачено;Від кого');
    expect(csv).toContain('10.10.2026;Оренда квартири;12000;;;витрата;Оренда та ЖКГ;Зарплатна;ні;');
    expect(csv).toContain('08.10.2026;Зарплата;28980;700;USDT;надходження;Зарплата;Зарплатна;так;');

    const xlsx = await save('xlsx');
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    const json = JSON.parse((await save('json')).toString('utf8'));
    expect(json).toMatchObject({ app: 'FinPulse', kind: 'report' });
    expect(json.months['2026-10'].expenses).toHaveLength(14);
    const md = (await save('md')).toString('utf8');
    expect(md).toContain('# Звіт FinPulse');
    expect(md).toContain('## Витрати за категоріями');

    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.locator('[data-action="open-export"]').click();
    await page.locator('[data-export="pdf"]').click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    await expect(page.locator('#print-root h1')).toHaveText('Звіт FinPulse');
    await expect(page.locator('#print-root')).toContainText('Оренда квартири');
    await expect(page.locator('#print-root')).toBeHidden(); // на екрані не видно, лише під час друку
});
