import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
    bridgeExpenses,
    carryOverBalance,
    categorySummary,
    categoryTotals,
    collectAnalytics,
    computeMonthSummary,
    getNextMonthKey,
    getPrevMonthKey,
    incomeItemsTotal,
    isExpenseOverdue,
    monthIncomeTotal,
    monthReceivedIncome,
    reconcile,
    setIncomeCategoryTotal,
} from '../../src/calc.js';

let demo;
beforeAll(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    const { getDefaultInitialState } = await import('../../src/data/demo.js');
    demo = () => getDefaultInitialState();
});

const TODAY = new Date(2026, 9, 29); // 29 жовтня 2026

const month = (overrides = {}) => ({
    year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8, incomeUAH: 0, rate: 40,
    incomes: [], expenses: [], ...overrides,
});
const exp = (amountUAH, payDay, isPaid = false, category = 'other') => ({ amountUAH, payDay, isPaid, category });

describe('ключі місяців', () => {
    it('переходить через рік вперед і назад', () => {
        expect(getNextMonthKey('2026-10')).toBe('2026-11');
        expect(getNextMonthKey('2026-12')).toBe('2027-01');
        expect(getPrevMonthKey('2027-01')).toBe('2026-12');
        expect(getPrevMonthKey('2026-10')).toBe('2026-09');
    });
});

describe('прострочені витрати', () => {
    const oct = month();
    it('у поточному місяці — лише дні до сьогодні', () => {
        expect(isExpenseOverdue(exp(1, 28), oct, TODAY)).toBe(true);
        expect(isExpenseOverdue(exp(1, 29), oct, TODAY)).toBe(false);
        expect(isExpenseOverdue(exp(1, 30), oct, TODAY)).toBe(false);
    });
    it('минулий місяць — усе прострочено, майбутній — нічого', () => {
        expect(isExpenseOverdue(exp(1, 31), month({ month: 9 }), TODAY)).toBe(true);
        expect(isExpenseOverdue(exp(1, 31), month({ year: 2025, month: 12 }), TODAY)).toBe(true);
        expect(isExpenseOverdue(exp(1, 1), month({ month: 11 }), TODAY)).toBe(false);
    });
});

describe('доходи', () => {
    const m = month({
        incomeUAH: 1000,
        savingsUAH: 300, // застаріле дзеркало — не має додаватися
        incomes: [
            { category: 'savings', amountUAH: 300, isReceived: true },
            { category: 'extra', amountUAH: 200, isReceived: false },
            { category: 'other_inc', amountUAH: 50 }, // без позначки вважається отриманим
        ],
    });
    it('сума статей і отриманих статей', () => {
        expect(incomeItemsTotal(m)).toBe(550);
        expect(incomeItemsTotal(m, { receivedOnly: true })).toBe(350);
    });
    it('заощадження не рахуються двічі', () => {
        expect(monthIncomeTotal(m)).toBe(1550);
        expect(monthReceivedIncome(m)).toBe(1350);
    });
});

describe('місток до ЗП наступного місяця', () => {
    it('бере витрати до дня ЗП (не включно)', () => {
        const next = month({ month: 11, salaryDay: 8, expenses: [exp(10, 7), exp(20, 8), exp(5, 1)] });
        const b = bridgeExpenses(next);
        expect(b.total).toBe(15);
        expect(b.items).toHaveLength(2);
    });
    it('без наступного місяця — нуль', () => {
        expect(bridgeExpenses(undefined)).toEqual({ items: [], total: 0 });
    });
});

describe('підсумок місяця на демо-даних', () => {
    it('збігається з тим, що показує сторінка', () => {
        const s = computeMonthSummary(demo(), '2026-10', TODAY);
        expect(s.totalIncomeUAH).toBeCloseTo(52800, 2);
        expect(s.totalPlannedUAH).toBeCloseTo(30262.77, 2);
        expect(s.totalPaidUAH).toBeCloseTo(8250, 2);
        expect(s.bridgeTotalUAH).toBeCloseTo(331.18, 2);
        expect(s.inHandUAH).toBeCloseTo(44550, 2);
        expect(s.remainingToPayUAH).toBeCloseTo(22343.95, 2);
        expect(s.freeBalanceUAH).toBeCloseTo(22206.05, 2);
        expect(s.overdueCount).toBe(11);
        expect(s.pendingCount).toBe(12);
        expect(s.paidCount).toBe(2);
        expect(s.pctPaid).toBe(27);
    });
    it('«на руках» не буває від’ємним', () => {
        const st = { months: { '2026-10': month({ incomeUAH: 100, expenses: [exp(500, 1, true)] }) } };
        expect(computeMonthSummary(st, '2026-10', TODAY).inHandUAH).toBe(0);
    });
    it('порожній місяць — без ділення на нуль', () => {
        const st = { months: { '2026-10': month({ rate: 0 }) } };
        const s = computeMonthSummary(st, '2026-10', TODAY);
        expect(s.pctPaid).toBe(0);
        expect(s.pctPending).toBe(0);
        expect(s.inHandUSD).toBe(0);
    });
});

describe('підсумок категорії', () => {
    const list = [exp(100, 1, true, 'food'), exp(300, 2, false, 'food'), exp(50, 3, true, 'home')];
    it('усі категорії', () => {
        expect(categorySummary(list)).toEqual({ total: 450, spent: 150, remaining: 300, pct: 33 });
    });
    it('одна категорія', () => {
        expect(categorySummary(list, 'food')).toEqual({ total: 400, spent: 100, remaining: 300, pct: 25 });
    });
});

describe('залишок для наступного місяця', () => {
    it('доходи мінус витрати і місток', () => {
        const m = month({ incomeUAH: 1000, incomes: [{ category: 'savings', amountUAH: 200 }], expenses: [exp(300, 10)] });
        expect(carryOverBalance(m, [exp(100, 5), exp(999, 9)], 8)).toBe(800);
    });
    it('не буває від’ємним', () => {
        expect(carryOverBalance(month({ expenses: [exp(10, 10)] }), [], 8)).toBe(0);
    });
});

describe('калькулятор звірки', () => {
    const m = month({
        incomeUAH: 1000,
        savingsUAH: 500,
        incomes: [{ category: 'savings', amountUAH: 500, isReceived: true }],
        expenses: [exp(200, 10, true), exp(300, 20)],
    });
    const next = month({ month: 11, expenses: [exp(100, 3)] });
    it('очікувана сума на руках без подвійних заощаджень', () => {
        const r = reconcile(m, next, 1300);
        expect(r.expectedInHand).toBe(1300);
        expect(r.hasDiscrepancy).toBe(false);
        expect(r.toPay).toBe(400);
        expect(r.safeBalance).toBe(900);
    });
    it('розбіжність більше 5 ₴', () => {
        const r = reconcile(m, next, 1200);
        expect(r.diff).toBe(100);
        expect(r.hasDiscrepancy).toBe(true);
        expect(reconcile(m, next, 1296).hasDiscrepancy).toBe(false);
    });
});

describe('звіти', () => {
    const st = () => ({
        activeMonthKey: '2026-10',
        months: {
            '2026-09': month({ month: 9, incomeUAH: 1000, incomeUSDT: 25, expenses: [exp(100, 10, true, 'food')] }),
            '2026-10': month({
                incomeUAH: 2000, incomeUSDT: 50, savingsUAH: 300,
                incomes: [{ category: 'savings', amountUAH: 300, day: 1 }],
                expenses: [exp(400, 10, false, 'home'), exp(50, 2, true, 'food')],
            }),
        },
    });
    it('поточний місяць без подвійних заощаджень', () => {
        const a = collectAnalytics(st(), { period: 'current' });
        expect(a.totalIncome).toBe(2300);
        expect(a.expenses).toHaveLength(2);
    });
    it('3 місяці включають попередній', () => {
        const a = collectAnalytics(st(), { period: '3m' });
        expect(a.selectedMonths).toHaveLength(2);
        expect(a.totalIncome).toBe(3300);
        expect(a.totalIncomeUSD).toBe(75);
    });
    it('довільний діапазон — за датами ЗП, надходжень і витрат', () => {
        const a = collectAnalytics(st(), { period: 'custom', from: '2026-10-01', to: '2026-10-07' });
        // ЗП 8 жовтня поза діапазоном; заощадження 1 жовтня і витрата 2 жовтня — в ньому
        expect(a.totalIncome).toBe(300);
        expect(a.expenses.map(e => e.amountUAH)).toEqual([50]);
    });
    it('суми по категоріях від більшої до меншої', () => {
        const cats = [{ id: 'food' }, { id: 'home' }, { id: 'gifts' }];
        const t = categoryTotals([exp(10, 1, false, 'food'), exp(40, 1, false, 'home'), exp(5, 1, false, 'food')], cats);
        expect(t.map(x => [x.category.id, x.amountUAH])).toEqual([['home', 40], ['food', 15]]);
    });
});

describe('сума категорії з вікна «Зарплата»', () => {
    it('різниця лягає на статтю-шаблон, інші статті не змінюються', () => {
        const m = month({
            incomes: [
                { id: 'a', category: 'savings', amountUAH: 0, isPreset: true, isReceived: false },
                { id: 'b', category: 'savings', amountUAH: 100 },
            ],
        });
        setIncomeCategoryTotal(m, 'savings', 600);
        expect(m.incomes[0].amountUAH).toBe(500);
        expect(m.incomes[0].isReceived).toBe(true);
        expect(m.incomes[1].amountUAH).toBe(100);
        expect(m.savingsUAH).toBe(600);
    });
    it('та сама сума — нічого не змінює', () => {
        const m = month({ incomes: [{ category: 'extra', amountUAH: 70, isPreset: true, isReceived: false }] });
        setIncomeCategoryTotal(m, 'extra', 70);
        expect(m.incomes[0]).toMatchObject({ amountUAH: 70, isReceived: false });
        expect(m.extraIncomeUAH).toBe(70);
    });
});

describe('демо-дані', () => {
    it('не містять імен людей', () => {
        for (const m of Object.values(demo().months)) {
            for (const i of m.incomes || []) expect(i.debtor || '').toBe('');
        }
    });
});
