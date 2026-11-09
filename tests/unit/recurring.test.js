import { describe, expect, it } from 'vitest';
import { dayBefore, ruleOccurrences, shiftBack } from '../../src/calc.js';
import { applyImport, planImport, rowsFromJSON } from '../../src/data/import.js';
import { migrateState } from '../../src/data/migrate.js';
import { createNextMonth } from '../../src/data/months.js';
import { sanitizeState } from '../../src/data/sanitize.js';
import { applyFromHere, cutSeries } from '../../src/data/series.js';

const month = (y, m, expenses) => ({ year: y, month: m, name: '', salaryDay: 8, incomeUAH: 0, rate: 41.5, salaryParts: [], incomes: [], expenses });
const exp = (id, extra = {}) => ({ id, title: id, category: 'other', amountUAH: 100, payDay: 10, isPaid: true, ...extra });
const days = (rule, y, m) => ruleOccurrences(rule, y, m).map(o => o.day);

describe('правила повторення', () => {
    it('щотижня, кожні 4 тижні, кожні 50 днів', () => {
        expect(days({ unit: 'week', every: 1, start: '2026-10-02' }, 2026, 10)).toEqual([2, 9, 16, 23, 30]);
        expect(days({ unit: 'week', every: 1, start: '2026-10-02' }, 2026, 11)).toEqual([6, 13, 20, 27]);
        expect(days({ unit: 'week', every: 4, start: '2026-10-02' }, 2026, 11)).toEqual([27]);
        expect(days({ unit: 'week', every: 4, start: '2026-10-02' }, 2026, 12)).toEqual([25]);
        expect(days({ unit: 'day', every: 50, start: '2026-10-05' }, 2026, 11)).toEqual([24]);
        expect(days({ unit: 'day', every: 50, start: '2026-10-05' }, 2026, 12)).toEqual([]);
        expect(days({ unit: 'day', every: 50, start: '2026-10-05' }, 2027, 1)).toEqual([13]);
    });
    it('щомісяця, раз на 2 місяці, щороку; 31-ше — останній день', () => {
        expect(days({ unit: 'month', every: 1, start: '2026-01-31' }, 2026, 2)).toEqual([28]);
        expect(days({ unit: 'month', every: 2, start: '2026-10-15' }, 2026, 11)).toEqual([]);
        expect(days({ unit: 'month', every: 2, start: '2026-10-15' }, 2026, 12)).toEqual([15]);
        expect(days({ unit: 'year', every: 1, start: '2025-11-03' }, 2026, 11)).toEqual([3]);
        expect(days({ unit: 'year', every: 1, start: '2025-11-03' }, 2026, 10)).toEqual([]);
        expect(days({ unit: 'month', every: 1, start: '2026-10-15' }, 2026, 9)).toEqual([]);
    });
    it('кількість платежів і дата закінчення; номер платежу', () => {
        const r = { unit: 'month', every: 1, start: '2026-09-11', count: 3 };
        expect(ruleOccurrences(r, 2026, 11)).toEqual([{ day: 11, index: 2 }]);
        expect(days(r, 2026, 12)).toEqual([]);
        expect(days({ unit: 'week', every: 1, start: '2026-10-02', until: '2026-10-20' }, 2026, 10)).toEqual([2, 9, 16]);
        expect(days({ unit: 'week', every: 1, start: '2026-10-02', count: 2 }, 2026, 10)).toEqual([2, 9]);
    });
    it('зсув старту назад і день перед датою', () => {
        expect(shiftBack('2026-10-11', 'month', 1, 2)).toBe('2026-08-11');
        expect(shiftBack('2026-03-31', 'month', 1, 1)).toBe('2026-02-28');
        expect(shiftBack('2026-01-10', 'week', 2, 1)).toBe('2025-12-27');
        expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    });
});

describe('перехід на формат 7', () => {
    it('щомісячні й розстрочки стають серіями; однакові витрати різних місяців — одна серія', () => {
        const st = migrateState({ version: 6, months: {
            '2026-10': month(2026, 10, [exp('Оренда', { repeat: true }), exp('Подарунок'), exp('Телефон', { payDay: 11, installment: { current: 3, total: 6 } })]),
            '2026-11': month(2026, 11, [exp('Оренда', { repeat: true })]),
        } });
        expect(st.version).toBe(8);
        const [rent, gift, phone] = st.months['2026-10'].expenses;
        expect(rent.repeat).toEqual({ unit: 'month', every: 1, start: '2026-10-10' });
        expect(gift.repeat).toBeUndefined();
        expect(gift.seriesId).toBeUndefined();
        expect(phone.repeat).toEqual({ unit: 'month', every: 1, start: '2026-08-11', count: 6 });
        expect(phone.installment).toEqual({ current: 3, total: 6 });
        expect(st.months['2026-11'].expenses[0].seriesId).toBe(rent.seriesId);
    });
    it('два однакові рядки в одному місяці — дві серії, обидва переходять у новий місяць', () => {
        const st = migrateState({ version: 6, activeMonthKey: '2026-10', months: {
            '2026-10': month(2026, 10, [exp('Кава', { payDay: 3, repeat: true }), exp('Кава', { payDay: 17, repeat: true })]),
        } });
        const [a, b] = st.months['2026-10'].expenses;
        expect(a.seriesId).not.toBe(b.seriesId);
        createNextMonth(st, '2026-10');
        expect(st.months['2026-11'].expenses.map(e => e.payDay)).toEqual([3, 17]);
    });
    it('дуже старі дані (формат 5): усі витрати стають щомісячними', () => {
        const st = migrateState({ version: 5, months: { '2026-10': month(2026, 10, [exp('a'), exp('b', { repeat: false })]) } });
        expect(st.months['2026-10'].expenses.map(e => e.repeat?.unit ?? null)).toEqual(['month', null]);
    });
});

describe('новий місяць із серій', () => {
    it('щотижневі — кілька платежів, «кожні 50 днів» — коли настане, розстрочка — до останнього', () => {
        const st = migrateState({ version: 7, activeMonthKey: '2026-10', months: { '2026-10': month(2026, 10, [
            exp('Кава', { payDay: 2, seriesId: 's1', repeat: { unit: 'week', every: 1, start: '2026-10-02' } }),
            exp('Фільтр', { payDay: 5, seriesId: 's2', repeat: { unit: 'day', every: 50, start: '2026-10-05' } }),
            exp('Телефон', { payDay: 11, seriesId: 's3', repeat: { unit: 'month', every: 1, start: '2026-08-11', count: 4 }, installment: { current: 3, total: 4 } }),
            exp('Подарунок'),
        ]) } });
        createNextMonth(st, '2026-10');
        const nov = st.months['2026-11'].expenses;
        expect(nov.filter(e => e.title === 'Кава').map(e => e.payDay)).toEqual([6, 13, 20, 27]);
        expect(nov.find(e => e.title === 'Фільтр').payDay).toBe(24);
        expect(nov.find(e => e.title === 'Телефон').installment).toEqual({ current: 4, total: 4 });
        expect(nov.some(e => e.title === 'Подарунок')).toBe(false);
        expect(nov.every(e => !e.isPaid)).toBe(true);
        createNextMonth(st, '2026-11');
        const dec = st.months['2026-12'].expenses;
        expect(dec.some(e => e.title === 'Телефон')).toBe(false); // останній платіж був у листопаді
        expect(dec.some(e => e.title === 'Фільтр')).toBe(false); // наступний — 13 січня
        createNextMonth(st, '2026-12');
        expect(st.months['2027-01'].expenses.find(e => e.title === 'Фільтр').payDay).toBe(13); // серію не загублено
    });
});

describe('«цей і наступні»', () => {
    const state = () => migrateState({ version: 7, activeMonthKey: '2026-10', months: {
        '2026-10': month(2026, 10, [
            exp('Кава', { id: 'k1', payDay: 2, seriesId: 's1', repeat: { unit: 'week', every: 1, start: '2026-10-02' } }),
            exp('Кава', { id: 'k2', payDay: 9, isPaid: false, seriesId: 's1', repeat: { unit: 'week', every: 1, start: '2026-10-02' } }),
            exp('Кава', { id: 'k3', payDay: 16, isPaid: false, seriesId: 's1', repeat: { unit: 'week', every: 1, start: '2026-10-02' } }),
        ]),
        '2026-11': month(2026, 11, [exp('Кава', { id: 'k4', payDay: 6, isPaid: false, seriesId: 's1', repeat: { unit: 'week', every: 1, start: '2026-10-02' } })]),
    } });
    it('нова частота з цього платежу: старі лишаються, наступні перебудовано', () => {
        const st = state();
        const k2 = st.months['2026-10'].expenses[1];
        k2.amountUAH = 150;
        applyFromHere(st, '2026-10', k2, { unit: 'week', every: 2, start: '2026-10-09' });
        const oct = st.months['2026-10'].expenses;
        expect(oct.map(e => [e.payDay, e.amountUAH])).toEqual([[2, 100], [9, 150], [23, 150]]);
        expect(oct[0].repeat.until).toBe('2026-10-08');
        expect(oct[1].seriesId).not.toBe('s1');
        expect(st.months['2026-11'].expenses.map(e => e.payDay)).toEqual([6, 20]);
        expect(st.months['2026-11'].expenses[0].seriesId).toBe(oct[1].seriesId);
        createNextMonth(st, '2026-11');
        expect(st.months['2026-12'].expenses.map(e => e.payDay)).toEqual([4, 18]);
    });
    it('припинити серію: наступні несплачені зникають і більше не з’являються', () => {
        const st = state();
        cutSeries(st, 's1', '2026-10-09');
        expect(st.months['2026-10'].expenses.map(e => e.id)).toEqual(['k1']);
        expect(st.months['2026-11'].expenses).toEqual([]);
        createNextMonth(st, '2026-11');
        expect(st.months['2026-12'].expenses).toEqual([]);
    });
});

describe('перевірка даних і імпорт', () => {
    it('некоректне правило прибирається; правильне лишається', () => {
        const s = sanitizeState({ months: { '2026-10': { expenses: [
            { id: 'a', repeat: { unit: 'hour', every: 1, start: '2026-10-01' } },
            { id: 'b', repeat: { unit: 'week', every: '2', start: '2026-10-01', count: '5', until: 'x' }, seriesId: 's_1' },
            { id: 'c', repeat: true, seriesId: "x');" },
            { id: 'd', installment: { current: 7, total: 6 } },
        ] } } });
        const [a, b, c, d] = s.months['2026-10'].expenses;
        expect('repeat' in a).toBe(false);
        expect(b.repeat).toEqual({ unit: 'week', every: 2, start: '2026-10-01', count: 5 });
        expect(b.seriesId).toBe('s_1');
        expect(c.repeat).toBe(true);
        expect('seriesId' in c).toBe(false);
        expect(d.installment).toBeUndefined();
    });
    it('імпорт таблиці: щомісячні серії; бекап формату 7 — зі своїми правилами', () => {
        const st = migrateState({ version: 7, activeMonthKey: '2026-10', cards: [], months: { '2026-10': month(2026, 10, []) } });
        const backup = { version: 7, months: { '2026-11': month(2026, 11, [
            exp('Кава', { payDay: 6, seriesId: 'sx', repeat: { unit: 'week', every: 1, start: '2026-10-02' } }),
            exp('Подарунок'),
            exp('Телефон', { payDay: 11, installment: { current: 2, total: 3 } }),
        ]) } };
        applyImport(st, planImport(st, rowsFromJSON(backup).rows, {}));
        const got = Object.fromEntries(st.months['2026-11'].expenses.map(e => [e.title, e]));
        expect(got['Кава'].repeat).toEqual({ unit: 'week', every: 1, start: '2026-10-02' });
        expect(got['Кава'].seriesId).toBe('sx');
        expect(got['Подарунок'].repeat).toBeUndefined();
        expect(got['Телефон'].repeat).toEqual({ unit: 'month', every: 1, start: '2026-10-11', count: 3 });
        expect(got['Телефон'].installment).toEqual({ current: 2, total: 3 });
    });
});
