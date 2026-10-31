import { describe, expect, it } from 'vitest';
import { cardMonthTotals, cardUsage, filterExpenses } from '../../src/calc.js';
import { applyImport, detectDelimiter, guessMapping, parseAmount, parseCSV, parseDate, planImport, rowsFromCSV, rowsFromJSON } from '../../src/data/import.js';
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
            '"27.10.2026 20:15:00","Помилковий рядок",5411,,0,UAH',
        ].join('\n');
        const table = parseCSV(csv);
        const mapping = guessMapping(table[0]);
        expect(mapping).toMatchObject({ date: 0, title: 1, amount: 3 });
        const { rows, errors } = rowsFromCSV(table, mapping);
        expect(rows.map(r => [r.type, r.amount, r.title])).toEqual([['expense', 523.4, 'Сільпо'], ['income', 1500, 'Поповнення від Олени']]);
        expect(errors).toEqual([{ line: 4, reason: 'amount' }]);
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
        { type: 'expense', date: { y: 2026, m: 10, d: 12 }, title: 'Сільпо', amount: 523.4, category: '', card: 'Моно', paid: null }, // дублікат у файлі
        { type: 'income', date: { y: 2026, m: 11, d: 2 }, title: 'Фріланс', amount: 2000, category: 'extra', card: 'ПУМБ', paid: null },
    ];
    it('дублікати, категорії, картки, нові місяці', () => {
        const st = base();
        const plan = planImport(st, rows);
        expect(plan).toMatchObject({ duplicates: 2, expenses: 1, incomes: 1, months: ['2026-10', '2026-11'], newMonths: ['2026-11'] });
        expect(plan.newCards.map(c => c.name)).toEqual(['ПУМБ']);
        expect(plan.items[0]).toMatchObject({ category: 'food', cardId: 'c1', paid: true });
        expect(st.months['2026-11']).toBeUndefined(); // план нічого не змінює
    });
    it('застосування: записи додано, повторний імпорт нічого не додає', () => {
        const st = base();
        applyImport(st, planImport(st, rows, { markPaid: false }));
        expect(st.months['2026-10'].expenses.map(e => e.title)).toEqual(['Оренда', 'Сільпо']);
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
