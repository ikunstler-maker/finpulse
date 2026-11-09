import { describe, expect, it } from 'vitest';
import { computeMonthSummary, dailyAllowance, expensePaid, expensePending, expensePlanned, filterExpenses, isExpenseOverdue, upcomingPayments } from '../../src/calc.js';
import { migrateState } from '../../src/data/migrate.js';
import { createNextMonth } from '../../src/data/months.js';
import { sanitizeState } from '../../src/data/sanitize.js';

const month = (y, m, expenses, extra = {}) => ({ year: y, month: m, name: '', salaryDay: 8, incomeUAH: 0, rate: 41.5, incomes: [], expenses,
    salaryParts: [{ id: 's', amount: 40000, currency: 'UAH', uah: 40000, day: 8, received: true }], ...extra });
const today = new Date(2026, 9, 29);

describe('резерв', () => {
    const r = (spends, extra = {}) => ({ id: 'r', title: 'Продукти', category: 'food', amountUAH: 8000, payDay: 1, isPaid: false, reserve: { spends }, ...extra });
    it('план, витрачено, залишок; перевищення; закритий', () => {
        const a = r([{ id: '1', amount: 3000, day: 5 }, { id: '2', amount: 200 }]);
        expect([expensePlanned(a), expensePaid(a), expensePending(a)]).toEqual([8000, 3200, 4800]);
        const over = r([{ id: '1', amount: 8600 }]);
        expect([expensePlanned(over), expensePaid(over), expensePending(over)]).toEqual([8600, 8600, 0]);
        const closed = r([{ id: '1', amount: 5000 }], { isPaid: true });
        expect([expensePlanned(closed), expensePaid(closed), expensePending(closed)]).toEqual([5000, 5000, 0]);
    });
    it('у підсумку: «на руках» зменшує витрачене, «ще сплатити» — залишок', () => {
        const st = { months: { '2026-10': month(2026, 10, [r([{ id: '1', amount: 3000, day: 5 }])]) } };
        const s = computeMonthSummary(st, '2026-10', today);
        expect(s).toMatchObject({ totalPaidUAH: 3000, totalPendingUAH: 5000, totalPlannedUAH: 8000, inHandUAH: 37000, freeBalanceUAH: 32000, overdueCount: 0 });
        // день — від залишку резерву: (37 000 − 5 000) / 10 днів
        expect(dailyAllowance(st, '2026-10', today).perDay).toBe(3200);
    });
});

describe('без дати', () => {
    const nd = { id: 'n', title: 'Стоматолог', category: 'health', amountUAH: 1500, payDay: 3, isPaid: false, noDate: true };
    it('не прострочується, не в найближчих, не в нагадуваннях, не в «місточку»', () => {
        const m = month(2026, 10, [nd]);
        expect(isExpenseOverdue(nd, m, today)).toBe(false);
        expect(computeMonthSummary({ months: { '2026-10': m } }, '2026-10', today)).toMatchObject({ totalPendingUAH: 1500, overdueCount: 0 });
        const items = [{ e: nd, month: m, monthKey: '2026-10', bridge: false }];
        expect(filterExpenses(items, { status: 'soon' }, today)).toHaveLength(0);
        expect(filterExpenses(items, { status: 'unpaid' }, today)).toHaveLength(1);
        expect(upcomingPayments({ months: { '2026-10': month(2026, 10, [{ ...nd, payDay: 29 }]) } }, today, 3)).toHaveLength(0);
        const st = { months: { '2026-09': month(2026, 9, []), '2026-10': m } };
        expect(computeMonthSummary(st, '2026-09', today).bridgeTotalUAH).toBe(0);
    });
    it('несплачене «без дати» переходить у новий місяць; щомісячний резерв — новий, з нуля', () => {
        const st = migrateState({ version: 8, activeMonthKey: '2026-10', months: { '2026-10': month(2026, 10, [
            nd,
            { ...nd, id: 'p', title: 'Сплачене', isPaid: true },
            { id: 'r', title: 'Продукти', category: 'food', amountUAH: 8000, payDay: 1, isPaid: false, seriesId: 'sr', repeat: { unit: 'month', every: 1, start: '2026-10-01' }, reserve: { spends: [{ id: 'x', amount: 7000 }] } },
        ]) } });
        createNextMonth(st, '2026-10');
        expect(st.months['2026-10'].expenses.map(e => e.id)).toEqual(['p', 'r']);
        const nov = st.months['2026-11'].expenses;
        expect(nov.find(e => e.title === 'Стоматолог')).toMatchObject({ noDate: true, isPaid: false });
        expect(nov.find(e => e.title === 'Продукти')).toMatchObject({ amountUAH: 8000, reserve: { spends: [] } });
    });
});

describe('формат 8', () => {
    it('старі дані відкриваються, версія 8; перевірка нових полів', () => {
        const st = migrateState({ version: 7, months: { '2026-10': month(2026, 10, [{ id: 'a', title: 'x', amountUAH: 1, payDay: 1 }]) } });
        expect(st.version).toBe(8);
        const s = sanitizeState({ months: { '2026-10': { expenses: [
            { id: 'a', noDate: 'yes', reserve: { spends: [{ id: 'ok', amount: '120.5', day: 40, note: 'Сільпо' }, { amount: -5 }, 'bad'] } },
            { id: 'b', noDate: 0, reserve: '<img>' },
        ] } } });
        const [a, b] = s.months['2026-10'].expenses;
        expect(a.noDate).toBe(true);
        expect(a.reserve).toEqual({ spends: [{ id: 'ok', amount: 120.5, note: 'Сільпо' }] });
        expect('noDate' in b).toBe(false);
        expect('reserve' in b).toBe(false);
    });
});
