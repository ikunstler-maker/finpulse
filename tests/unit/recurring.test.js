import { describe, expect, it } from 'vitest';
import { nextRecurrence } from '../../src/calc.js';
import { applyImport, planImport, rowsFromJSON } from '../../src/data/import.js';
import { migrateState } from '../../src/data/migrate.js';
import { createNextMonth } from '../../src/data/months.js';
import { sanitizeState } from '../../src/data/sanitize.js';

const month = expenses => ({ year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, incomeUAH: 0, rate: 41.5, salaryParts: [], incomes: [], expenses });
const exp = (id, extra = {}) => ({ id, title: id, category: 'other', amountUAH: 100, payDay: 10, isPaid: true, ...extra });

describe('повторення витрат', () => {
    it('наступний платіж: щомісяця — так, одноразова — ні, розстрочка — до останнього', () => {
        expect(nextRecurrence({ repeat: true })).toEqual({ repeat: true });
        expect(nextRecurrence({})).toBeNull();
        expect(nextRecurrence({ installment: { current: 3, total: 6 } })).toEqual({ installment: { current: 4, total: 6 } });
        expect(nextRecurrence({ installment: { current: 6, total: 6 } })).toBeNull();
    });

    it('старі дані (формат 5): усі витрати стають щомісячними, як і було', () => {
        const st = migrateState({ version: 5, months: { '2026-10': month([exp('a'), exp('b', { repeat: false })]) } });
        expect(st.version).toBe(6);
        expect(st.months['2026-10'].expenses.map(e => e.repeat)).toEqual([true, false]);
    });

    it('у форматі 6 одноразові витрати не позначаються повторюваними при наступному завантаженні', () => {
        const st = migrateState({ version: 6, months: { '2026-10': month([exp('a')]) } });
        expect(st.months['2026-10'].expenses[0].repeat).toBeUndefined();
    });

    it('новий місяць: щомісячні переходять, одноразові — ні, розстрочка рахує платежі', () => {
        const st = migrateState({
            version: 6, activeMonthKey: '2026-10',
            months: { '2026-10': month([exp('rent', { repeat: true }), exp('gift'), exp('phone', { installment: { current: 3, total: 6 } }), exp('tv', { installment: { current: 6, total: 6 } })]) },
        });
        const key = createNextMonth(st, '2026-10');
        const next = st.months[key].expenses;
        expect(next.map(e => e.title)).toEqual(['rent', 'phone']);
        expect(next[0]).toMatchObject({ repeat: true, isPaid: false });
        expect(next[1].installment).toEqual({ current: 4, total: 6 });
        expect(next[1].repeat).toBeUndefined();
        expect(next.every(e => e.id !== 'rent' && e.id !== 'phone')).toBe(true);
    });

    it('перевірка даних: некоректна розстрочка прибирається, repeat — лише так/ні', () => {
        const s = sanitizeState({ months: { '2026-10': { expenses: [
            { id: 'a', installment: { current: 7, total: 6 } },
            { id: 'b', installment: { current: '2', total: '4' }, repeat: 'yes' },
            { id: 'c', installment: '<img>', repeat: 0 },
        ] } } });
        const [a, b, c] = s.months['2026-10'].expenses;
        expect(a.installment).toBeUndefined();
        expect(b).toMatchObject({ installment: { current: 2, total: 4 }, repeat: true });
        expect(c.installment).toBeUndefined();
        expect('repeat' in c).toBe(false);
    });

    it('імпорт: витрати щомісячні; з бекапу зберігаються одноразові й розстрочки', () => {
        const st = migrateState({ version: 6, activeMonthKey: '2026-10', cards: [], months: { '2026-10': month([]) } });
        const backup = { months: { '2026-11': month([exp('rent', { repeat: true }), exp('gift', { repeat: false }), exp('phone', { installment: { current: 2, total: 3 } })]) } };
        const plan = planImport(st, rowsFromJSON(backup).rows, { markPaid: true, createCards: true });
        applyImport(st, plan);
        const got = Object.fromEntries(st.months['2026-11'].expenses.map(e => [e.title, e]));
        expect(got.rent.repeat).toBe(true);
        expect(got.gift.repeat).toBeUndefined();
        expect(got.phone.installment).toEqual({ current: 2, total: 3 });
    });

    it('імпорт бекапу формату 6: витрата без позначки лишається одноразовою', () => {
        const st = migrateState({ version: 6, activeMonthKey: '2026-10', cards: [], months: { '2026-10': month([]) } });
        const backup = { version: 6, months: { '2026-11': month([exp('gift'), exp('rent', { repeat: true })]) } };
        applyImport(st, planImport(st, rowsFromJSON(backup).rows, { markPaid: true, createCards: true }));
        const got = Object.fromEntries(st.months['2026-11'].expenses.map(e => [e.title, e]));
        expect(got.gift.repeat).toBeUndefined();
        expect(got.rent.repeat).toBe(true);
    });
});
