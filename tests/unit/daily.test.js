import { describe, expect, it } from 'vitest';
import { collectAnalytics, computeMonthSummary, dailyAllowance, incomeTotals } from '../../src/calc.js';

const month = (extra = {}) => ({
    year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, rate: 41.5,
    salaryParts: [{ id: 's1', amount: 30000, currency: 'UAH', uah: 30000, day: 8, received: true }, { id: 's2', amount: 10000, currency: 'UAH', uah: 10000, day: 20, received: false }],
    incomes: [{ id: 'i1', title: 'Фріланс', category: 'extra', amountUAH: 2000, day: 12, isReceived: true }],
    expenses: [{ id: 'e1', title: 'Оренда', category: 'housing', amountUAH: 12000, payDay: 10, isPaid: true }, { id: 'e2', title: 'Зв’язок', category: 'comm', amountUAH: 1000, payDay: 25, isPaid: false }],
    ...extra,
});
const state = (m = month(), next = null) => ({ activeMonthKey: '2026-10', months: { '2026-10': m, ...(next ? { '2026-11': next } : {}) } });

describe('скільки можна витратити сьогодні', () => {
    it('ділить гроші, що вже надійшли, на дні до наступної ЗП включно', () => {
        // 29.10 → 7.11: 10 днів. На руках 32 000 − 12 000 = 20 000; ще сплатити 1 000 → 19 000.
        // Вільний залишок плану: 42 000 − 13 000 = 29 000 — більше, тож межа — гроші на руках.
        const d = dailyAllowance(state(), '2026-10', new Date(2026, 9, 29));
        expect(d).toEqual({ daysLeft: 10, available: 19000, perDay: 1900, end: { month: 11, day: 7 } });
    });
    it('межа — вільний залишок, якщо він менший (усе вже отримано)', () => {
        const m = month({ salaryParts: [{ id: 's1', amount: 30000, currency: 'UAH', uah: 30000, day: 8, received: true }] });
        m.expenses.push({ id: 'e3', title: 'Великий платіж', category: 'other', amountUAH: 15000, payDay: 30, isPaid: false });
        const s = computeMonthSummary(state(m), '2026-10', new Date(2026, 9, 29));
        // доходи 32 000 − платежі 28 000 = 4 000; на руках 20 000 − 16 000 = 4 000
        expect(s.freeBalanceUAH).toBe(4000);
        expect(dailyAllowance(state(m), '2026-10', new Date(2026, 9, 29)).perDay).toBe(400);
    });
    it('враховує місток, цілі й день наступної ЗП з наступного місяця', () => {
        const next = { year: 2026, month: 11, salaryDay: 5, expenses: [{ id: 'n1', amountUAH: 900, payDay: 3, isPaid: false }] };
        const m = month({ goalMoves: [{ id: 'g', goalId: 'goal', amount: 1100, day: 15 }] });
        const d = dailyAllowance(state(m, next), '2026-10', new Date(2026, 9, 29));
        // до 4.11 включно: 7 днів; 19 000 − 900 − 1 100 = 17 000
        expect(d).toMatchObject({ daysLeft: 7, available: 17000, end: { month: 11, day: 4 } });
        expect(d.perDay).toBeCloseTo(2428.57, 2);
    });
    it('не показується поза циклом і не буває від’ємним', () => {
        expect(dailyAllowance(state(), '2026-10', new Date(2026, 9, 5))).toBeNull();
        expect(dailyAllowance(state(), '2026-10', new Date(2026, 10, 8))).toBeNull();
        const m = month();
        m.expenses.push({ id: 'big', amountUAH: 50000, payDay: 28, isPaid: false });
        expect(dailyAllowance(state(m), '2026-10', new Date(2026, 9, 29))).toMatchObject({ available: 0, perDay: 0 });
    });
    it('останній день циклу — 1 день', () => {
        expect(dailyAllowance(state(), '2026-10', new Date(2026, 10, 7)).daysLeft).toBe(1);
    });
});

describe('звіт по доходах', () => {
    const cats = [{ id: 'salary' }, { id: 'extra' }, { id: 'other_inc' }];
    it('зарплата і надходження по категоріях, від більшої', () => {
        const data = collectAnalytics(state(), { period: 'current' });
        expect(incomeTotals(data.incomeByCategory, cats).map(x => [x.category.id, x.amountUAH])).toEqual([['salary', 40000], ['extra', 2000]]);
    });
    it('свої дати: лише доходи в межах періоду; невідома категорія — в «інші»', () => {
        const m = month();
        m.incomes.push({ id: 'i2', category: 'weird', amountUAH: 500, day: 9 });
        const data = collectAnalytics(state(m), { period: 'custom', from: '2026-10-01', to: '2026-10-15' });
        expect(incomeTotals(data.incomeByCategory, cats).map(x => [x.category.id, x.amountUAH])).toEqual([['salary', 30000], ['extra', 2000], ['other_inc', 500]]);
    });
});
