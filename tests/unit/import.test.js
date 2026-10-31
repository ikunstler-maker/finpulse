import { describe, expect, it } from 'vitest';
import { cardMonthTotals, cardUsage, filterExpenses } from '../../src/calc.js';
import { analyzeCSV, applyImport, contextFromName, detectDelimiter, findHeaderRow, guessCategory, guessMapping, parseAmount, parseCSV, parseDate, planImport, rowsFromCSV, rowsFromJSON } from '../../src/data/import.js';
import { migrateState } from '../../src/data/migrate.js';
import { sanitizeState } from '../../src/data/sanitize.js';

const base = () => migrateState({
    activeMonthKey: '2026-10',
    cards: [{ id: 'c1', name: 'Моно', color: '#1f6feb' }],
    months: {
        '2026-10': { year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, incomeUAH: 0, rate: 41.5, salaryParts: [], incomes: [], expenses: [{ id: 'e1', title: 'Оренда', category: 'housing', amountUAH: 12000, payDay: 10, isPaid: false }] },
    },
});

describe('розбір значень', () => {
    it('суми в різних записах', () => {
        expect(parseAmount('1 234,56')).toBe(1234.56);
        expect(parseAmount('-1234.56')).toBe(-1234.56);
        expect(parseAmount('1,234.56')).toBe(1234.56);
        expect(parseAmount('1.234,56')).toBe(1234.56);
        expect(parseAmount('−80 грн')).toBe(-80);
        expect(parseAmount('abc')).toBeNaN();
        expect(parseAmount('')).toBeNaN();
    });
    it('дати', () => {
        expect(parseDate('29.10.2026 14:03:11')).toEqual({ y: 2026, m: 10, d: 29 });
        expect(parseDate('2026-11-03')).toEqual({ y: 2026, m: 11, d: 3 });
        expect(parseDate('03/11/26')).toEqual({ y: 2026, m: 11, d: 3 });
        expect(parseDate('31.02.2026')).toBeNull();
        expect(parseDate('вчора')).toBeNull();
    });
});

describe('CSV', () => {
    it('роздільник, лапки й переноси', () => {
        expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
        expect(detectDelimiter('a,b\n1,2')).toBe(',');
        const t = parseCSV('﻿Дата,Опис,Сума\r\n01.10.2026,"Кава, ""з собою""",-80\r\n\r\n');
        expect(t).toEqual([['Дата', 'Опис', 'Сума'], ['01.10.2026', 'Кава, "з собою"', '-80']]);
    });
    it('виписка в стилі Monobank: колонки вгадуються, тип за знаком', () => {
        const csv = [
            '"Дата i час операції","Деталі операції",MCC,"Сума в валюті картки (UAH)","Сума в валюті операції","Валюта"',
            '"29.10.2026 13:01:02","Сільпо",5411,-523.40,-523.40,UAH',
            '"28.10.2026 09:00:00","Поповнення від Олени",4829,1500.00,1500.00,UAH',
            '"27.10.2026 20:15:00","Рядок без суми",5411,,0,UAH',
            '"26.10.2026 20:15:00","Незрозуміла сума",5411,abc,0,UAH',
        ].join('\n');
        const table = parseCSV(csv);
        const mapping = guessMapping(table[0]);
        expect(mapping).toMatchObject({ date: 0, title: 1, amount: 3 });
        const { rows, errors } = rowsFromCSV(table, mapping);
        expect(rows.map(r => [r.type, r.amount, r.title])).toEqual([['expense', 523.4, 'Сільпо'], ['income', 1500, 'Поповнення від Олени']]);
        expect(errors).toEqual([{ line: 5, reason: 'amount' }]); // порожня сума — пропуск без помилки
    });
    it('колонка типу і позначка «сплачено» мають пріоритет', () => {
        const table = parseCSV('Дата;Назва;Сума;Тип;Сплачено\n05.11.2026;Зарплата;30000;Дохід;так\n06.11.2026;Інтернет;300;витрата;ні');
        const { rows } = rowsFromCSV(table, guessMapping(table[0]));
        expect(rows).toMatchObject([{ type: 'income', amount: 30000, paid: true }, { type: 'expense', amount: 300, paid: false }]);
    });
});

describe('JSON', () => {
    it('масив записів', () => {
        const r = rowsFromJSON([{ date: '2026-10-12', title: 'Таксі', amount: -150, category: 'Інші витрати', card: 'Моно' }, { date: 'погано', amount: 1 }]);
        expect(r.kind).toBe('list');
        expect(r.rows).toMatchObject([{ type: 'expense', amount: 150, title: 'Таксі', card: 'Моно' }]);
        expect(r.errors).toHaveLength(1);
    });
    it('резервна копія FinPulse — усі місяці, назви карток', () => {
        const r = rowsFromJSON({ cards: [{ id: 'x', name: 'Приват' }], months: { '2026-09': { expenses: [{ title: 'Оренда', amountUAH: 12000, payDay: 10, isPaid: true, cardId: 'x', category: 'housing' }], incomes: [{ title: 'Порожній шаблон', amountUAH: 0 }, { title: 'Борг', amountUAH: 700, day: 3, debtor: 'Андрій' }] } } });
        expect(r.kind).toBe('backup');
        expect(r.rows).toMatchObject([{ type: 'expense', card: 'Приват', paid: true, date: { y: 2026, m: 9, d: 10 } }, { type: 'income', amount: 700, from: 'Андрій' }]);
    });
    it('не FinPulse і не список — null', () => {
        expect(rowsFromJSON({ hello: 1 })).toBeNull();
    });
});

describe('план і застосування імпорту', () => {
    const rows = [
        { type: 'expense', date: { y: 2026, m: 10, d: 10 }, title: 'Оренда', amount: 12000, category: 'housing', card: '', paid: null }, // дублікат
        { type: 'expense', date: { y: 2026, m: 10, d: 12 }, title: 'Сільпо', amount: 523.4, category: 'Продукти та їжа', card: 'моно', paid: null },
        { type: 'expense', date: { y: 2026, m: 10, d: 12 }, title: 'Сільпо', amount: 523.4, category: '', card: 'Моно', paid: null }, // повтор у файлі — окремий платіж
        { type: 'income', date: { y: 2026, m: 11, d: 2 }, title: 'Фріланс', amount: 2000, category: 'extra', card: 'ПУМБ', paid: null },
    ];
    it('дублікати лише з наявними записами; категорії, картки, нові місяці', () => {
        const st = base();
        const plan = planImport(st, rows);
        expect(plan).toMatchObject({ duplicates: 1, expenses: 2, incomes: 1, months: ['2026-10', '2026-11'], newMonths: ['2026-11'] });
        expect(plan.newCards.map(c => c.name)).toEqual(['ПУМБ']);
        expect(plan.items[0]).toMatchObject({ category: 'food', cardId: 'c1', paid: true });
        expect(st.months['2026-11']).toBeUndefined(); // план нічого не змінює
    });
    it('застосування: записи додано, повторний імпорт нічого не додає', () => {
        const st = base();
        applyImport(st, planImport(st, rows, { markPaid: false }));
        expect(st.months['2026-10'].expenses.map(e => e.title)).toEqual(['Оренда', 'Сільпо', 'Сільпо']);
        expect(st.months['2026-10'].expenses[1]).toMatchObject({ cardId: 'c1', isPaid: false, payDay: 12 });
        expect(st.months['2026-11'].incomes.find(i => i.title === 'Фріланс')).toMatchObject({ amountUAH: 2000, category: 'extra', isReceived: false });
        expect(st.cards.map(c => c.name)).toEqual(['Моно', 'ПУМБ']);
        expect(planImport(st, rows).items).toHaveLength(0);
        expect(sanitizeState(JSON.parse(JSON.stringify(st)))).toEqual(st);
    });
    it('без створення карток — записи без картки', () => {
        const plan = planImport(base(), rows, { createCards: false });
        expect(plan.newCards).toEqual([]);
        expect(plan.items.find(i => i.title === 'Фріланс').cardId).toBeNull();
    });
});

describe('картки', () => {
    const month = {
        expenses: [{ amountUAH: 100, isPaid: true, cardId: 'a' }, { amountUAH: 50, isPaid: false, cardId: 'a' }, { amountUAH: 7, isPaid: true }],
        salaryParts: [{ uah: 1000, received: true, cardId: 'a' }, { uah: 500, received: false, cardId: 'b' }],
        incomes: [{ amountUAH: 300, isReceived: true, cardId: 'a' }, { amountUAH: 0, cardId: 'a' }],
    };
    it('підсумки місяця по картці і без картки', () => {
        expect(cardMonthTotals(month, 'a')).toEqual({ spent: 100, planned: 50, received: 1300, expected: 0, count: 4 });
        expect(cardMonthTotals(month, 'b')).toMatchObject({ expected: 500, count: 1 });
        expect(cardMonthTotals(month, null)).toMatchObject({ spent: 7, count: 1 });
    });
    it('скільки записів використовує картку', () => {
        expect(cardUsage({ months: { x: month } }, 'a')).toBe(5);
    });
    it('фільтр витрат за карткою', () => {
        const items = month.expenses.map((e, i) => ({ e: { ...e, title: `e${i}`, payDay: i + 1, category: 'other' }, month: { year: 2026, month: 10 }, bridge: false }));
        expect(filterExpenses(items, { card: 'a' }).map(x => x.e.title)).toEqual(['e0', 'e1']);
        expect(filterExpenses(items, { card: 'none' }).map(x => x.e.title)).toEqual(['e2']);
    });
    it('перевірка даних: небезпечний cardId і повний номер картки не проходять', () => {
        const s = sanitizeState({ cards: [{ id: 'c1', name: 'Моно', color: 'red', last4: '4441 1111 2222 3333' }], months: { '2026-10': { expenses: [{ id: 'e', cardId: "x');" }, { id: 'f', cardId: 'c1' }] } } });
        expect(s.cards).toEqual([{ id: 'c1', name: 'Моно', color: '#5d6b7a', last4: '3333' }]);
        expect(s.months['2026-10'].expenses[0].cardId).toBeUndefined();
        expect(s.months['2026-10'].expenses[1].cardId).toBe('c1');
    });
    it('перенесення у формат 5 додає порожній список карток', () => {
        const s = migrateState({ months: { '2026-10': { incomeUAH: 0 } } });
        expect(s).toMatchObject({ version: 5, cards: [] });
    });
});

// Вигадана таблиця з тією самою структурою, що й щомісячні таблиці Numbers власниці.
const PLANNER_CSV = [
    ',Підписки,₴,$,Дата',
    'TRUE,Triolan xPon,₴\t330.00,,07.02',
    'FALSE,Мобільний зв’язок - Робочий,₴\t0.00,,',
    'FALSE,Apple One,₴\t606.83,US$\t13.95,28.02',
    'TRUE,Розстрочка за пилосос - 6 платежів,"₴\t2,584.00",US$\t0.00,05.02',
    ',,,US$\t0.00,',
    'TRUE,Продукти,"₴\t10,000.00",US$\t0.00,5',
    ',Додаткові витрати,,US$\t0.00,US$\t0.00',
    'FALSE,Фетр,,US$\t0.00,US$\t0.00',
    'TRUE,Кінезітерапія,₴\t800.00,US$\t0.00,US$\t0.00',
    'TRUE,Психолог,"₴\t1,500.00",US$\t0.00,12',
    'TRUE,Психолог,"₴\t1,500.00",US$\t0.00,12',
    ',Подарунки,,US$\t0.00,0',
    'TRUE,Чай для подруги,₴\t500.00,US$\t0.00,10',
    ',Витрати до ЗП,"₴\t2,034.95",US$\t44.70,',
    ',СУМА ВИТРАТ,"₴\t17,821.83",US$\t13.95,',
    ',Зарплата,"₴\t66,000.00","US$\t1,600.00",04.01',
    ',Бенефіти,"₴\t4,455.00",US$\t100.00,12.02',
    ',Дод заробіток,₴\t830.00,US$\t0.00,US$\t0.00',
    ',Накопичення,,US$\t0.00,',
    ',СУМА ПРИБУТКУ,"₴\t71,285.00",US$\t0.00,',
    ',ЗАЛИШОК ,"₴\t53,463.17",US$\t0.00,',
].join('\r\n');

describe('щомісячні таблиці (Numbers / Excel)', () => {
    it('місяць із назви файлу чи заголовка', () => {
        expect(contextFromName('02.2026-Заплановані витрати - Лютий 2026.csv')).toEqual({ year: 2026, month: 2 });
        expect(contextFromName('Квітень.csv', 'Заплановані витрати - Квітень 2026')).toEqual({ year: 2026, month: 4 });
        expect(contextFromName('2026-11 budget.csv')).toEqual({ year: 2026, month: 11 });
        expect(contextFromName('виписка.csv')).toBeNull();
    });
    it('рядок заголовків не перший', () => {
        expect(findHeaderRow(parseCSV('Заплановані витрати - Лютий 2026,,,\n,Підписки,₴,Дата\nTRUE,Кава,₴ 50,07.02'))).toBe(1);
    });
    it('категорія за назвою, далі за розділом', () => {
        expect(guessCategory('Triolan xPon', 'subscriptions')).toBe('comm');
        expect(guessCategory('Розстрочка Samsung', null)).toBe('debts');
        expect(guessCategory('Щось нове', 'gifts')).toBe('gifts');
        expect(guessCategory('Щось нове')).toBe('other');
    });
    it('розбір таблиці: розділи, підсумки, доходи, $, галочки, дати без року', () => {
        const a = analyzeCSV(PLANNER_CSV, '02.2026-Лютий.csv', { defaultDay: 8 });
        expect(a.mapping).toMatchObject({ paid: 0, title: 1, amount: 2, usd: 3, date: 4 });
        expect(a.ctx).toMatchObject({ year: 2026, month: 2, lockMonth: true });
        const { rows, errors, moved } = rowsFromCSV(a.table, a.mapping, { ctx: a.ctx });
        expect(errors).toEqual([]);
        expect(moved).toBe(1); // «Зарплата 04.01» скопійована з іншого місяця
        const exp = rows.filter(r => r.type === 'expense');
        expect(exp.map(r => r.title)).toEqual(['Triolan xPon', 'Apple One', 'Розстрочка за пилосос - 6 платежів', 'Продукти', 'Кінезітерапія', 'Психолог', 'Психолог', 'Чай для подруги']);
        expect(Math.round(exp.reduce((s, r) => s + r.amount, 0) * 100) / 100).toBe(17820.83);
        expect(exp.find(r => r.title === 'Apple One')).toMatchObject({ usd: 13.95, paid: false, category: 'subscriptions', date: { y: 2026, m: 2, d: 28 } });
        expect(exp.find(r => r.title === 'Кінезітерапія')).toMatchObject({ date: { d: 8 }, category: 'health' });
        expect(exp.find(r => r.title === 'Чай для подруги').category).toBe('gifts');
        expect(exp.find(r => r.title === 'Продукти').date).toEqual({ y: 2026, m: 2, d: 5 });
        const inc = rows.filter(r => r.type === 'income');
        expect(inc).toMatchObject([
            { salary: true, amount: 66000, usd: 1600, date: { y: 2026, m: 2, d: 4 } },
            { category: 'other_inc', amount: 4455, usd: 100 },
            { category: 'extra', amount: 830, date: { d: 8 } },
        ]);
    });
    it('застосування: частина ЗП у доларах, витрата в доларах, однакові рядки лишаються, повтор — дублікати', () => {
        const a = analyzeCSV(PLANNER_CSV, '02.2026-Лютий.csv');
        const rows = rowsFromCSV(a.table, a.mapping, { ctx: a.ctx }).rows;
        const st = migrateState({ activeMonthKey: '2026-02', months: {} });
        const plan = planImport(st, rows);
        expect(plan).toMatchObject({ expenses: 8, salaryParts: 1, duplicates: 0, months: ['2026-02'] });
        applyImport(st, plan);
        const m = st.months['2026-02'];
        expect(m.salaryParts).toMatchObject([{ amount: 1600, currency: 'USD', uah: 66000, day: 4, received: true }]);
        expect(m.expenses.find(e => e.title === 'Apple One')).toMatchObject({ amountUAH: 606.83, amountUSD: 13.95, currency: 'USD', isPaid: false });
        expect(m.expenses.filter(e => e.title === 'Психолог')).toHaveLength(2);
        expect(planImport(st, rows)).toMatchObject({ expenses: 0, incomes: 0, duplicates: 11 });
    });
});
