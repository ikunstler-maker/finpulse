import { describe, expect, it } from 'vitest';
import { computeMonthSummary, filterExpenses, goalBalance, goalProgress, payPeriods } from '../../src/calc.js';
import { sanitizeState } from '../../src/data/sanitize.js';

const TODAY = new Date(2026, 9, 20);
const exp = (title, amountUAH, payDay, isPaid = false, category = 'other') => ({ id: title, title, amountUAH, payDay, isPaid, category });
const month = (o = {}) => ({ year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 15, incomeUAH: 0, rate: 40, incomes: [], expenses: [], salaryParts: [], ...o });

describe('цілі (конверти)', () => {
    const st = () => ({
        activeMonthKey: '2026-10',
        goals: [{ id: 'g1', name: 'Відпустка', target: 10000 }],
        months: {
            '2026-09': month({ month: 9, goalMoves: [{ id: 'a', goalId: 'g1', amount: 2000, day: 20 }] }),
            '2026-10': month({
                salaryParts: [{ id: 'p', amount: 5000, currency: 'UAH', uah: 5000, day: 15, received: true }],
                expenses: [exp('Оренда', 3000, 16)],
                goalMoves: [{ id: 'b', goalId: 'g1', amount: 1500, day: 21 }, { id: 'c', goalId: 'g1', amount: -500, day: 25 }],
            }),
        },
    });
    it('накопичення за всі місяці і прогрес', () => {
        expect(goalBalance(st(), 'g1')).toBe(3000);
        expect(goalProgress(st(), st().goals[0])).toEqual({ saved: 3000, pct: 30, left: 7000 });
    });
    it('відкладене зменшує вільний залишок, але не «на руках»', () => {
        const s = computeMonthSummary(st(), '2026-10', TODAY);
        expect(s.goalsAllocatedUAH).toBe(1000);
        expect(s.freeBalanceUAH).toBe(1000); // 5000 − 3000 − 1000
        expect(s.inHandUAH).toBe(5000);
    });
});

describe('дві виплати: аванс і основна', () => {
    const st = () => ({
        months: {
            '2026-10': month({
                salaryDay: 15, secondPayDay: 30,
                salaryParts: [
                    { id: 'a', amount: 400, currency: 'USDT', uah: 16000, day: 15, received: true },
                    { id: 'b', amount: 600, currency: 'USDT', uah: 24000, day: 30, received: false },
                ],
                incomes: [{ id: 'i', category: 'savings', amountUAH: 1000, day: 1 }],
                expenses: [exp('Оренда', 12000, 16), exp('Продукти', 3000, 20, true), exp('Інтернет', 300, 30)],
            }),
            '2026-11': month({ month: 11, salaryDay: 15, expenses: [exp('Підписка', 200, 3), exp('Пізніше', 999, 20)] }),
        },
    });
    it('доходи і платежі по двох періодах, залишок переходить далі', () => {
        const [p1, p2] = payPeriods(st(), '2026-10');
        expect(p1).toMatchObject({ income: 17000, planned: 15000, paid: 3000, balance: 2000, from: { day: 15 }, to: { day: 29 } });
        expect(p2).toMatchObject({ income: 24000, planned: 500, balance: 25500, from: { day: 30 }, to: { month: 11, day: 14 } });
        // кінцевий залишок збігається з вільним залишком місяця
        expect(p2.balance).toBe(computeMonthSummary(st(), '2026-10', TODAY).freeBalanceUAH);
    });
    it('без другої виплати — null', () => {
        expect(payPeriods({ months: { '2026-10': month() } }, '2026-10')).toBeNull();
        expect(payPeriods({ months: { '2026-10': month({ secondPayDay: 10 }) } }, '2026-10')).toBeNull();
    });
});

describe('фільтри й сортування витрат', () => {
    const m = month({ salaryDay: 8, secondPayDay: 25 });
    const next = month({ month: 11, salaryDay: 8 });
    const items = [
        ...[exp('Оренда', 12000, 10, false, 'housing'), exp('Кава', 80, 18, true, 'food'), exp('Зал', 1100, 22, false, 'health'), exp('Інтернет', 300, 28, false, 'comm')]
            .map(e => ({ e, month: m, monthKey: '2026-10', bridge: false })),
        { e: exp('Ягоди', 150, 3, false, 'food'), month: next, monthKey: '2026-11', bridge: true },
    ];
    const titles = opts => filterExpenses(items, opts, TODAY).map(x => x.e.title);
    it('статуси', () => {
        expect(titles({ status: 'overdue' })).toEqual(['Оренда']);
        expect(titles({ status: 'soon' })).toEqual(['Зал']);
        expect(titles({ status: 'paid' })).toEqual(['Кава']);
        expect(titles({ status: 'bridge' })).toEqual(['Ягоди']);
        expect(titles({ status: 'unpaid' })).toEqual(['Оренда', 'Зал', 'Інтернет', 'Ягоди']);
        expect(titles({ status: 'period1' })).toEqual(['Оренда', 'Кава', 'Зал']);
        expect(titles({ status: 'period2' })).toEqual(['Інтернет', 'Ягоди']);
    });
    it('категорії, сума, пошук', () => {
        expect(titles({ categories: ['food'] })).toEqual(['Кава', 'Ягоди']);
        expect(titles({ min: 200, max: 2000 })).toEqual(['Зал', 'Інтернет']);
        expect(titles({ search: 'ІНТ' })).toEqual(['Інтернет']);
    });
    it('сортування', () => {
        expect(titles({ sort: 'amountDesc' })).toEqual(['Оренда', 'Зал', 'Інтернет', 'Ягоди', 'Кава']);
        expect(titles({ sort: 'amountAsc' })[0]).toBe('Кава');
        expect(titles({ sort: 'alpha' })).toEqual(['Зал', 'Інтернет', 'Кава', 'Оренда', 'Ягоди']);
        expect(titles({ sort: 'date' })).toEqual(['Оренда', 'Кава', 'Зал', 'Інтернет', 'Ягоди']);
    });
});

describe('перевірка даних для нових полів', () => {
    it('цілі, переміщення і друга виплата', () => {
        const s = sanitizeState({
            goals: [{ id: 'g1', name: '<b>Авто</b>', target: '5000' }, null],
            months: { '2026-10': { expenses: [], secondPayDay: '25', goalMoves: [{ id: 'm', goalId: 'g1', amount: '100', day: 3 }, { goalId: "x');" }] } },
        });
        expect(s.goals).toEqual([{ id: 'g1', name: '<b>Авто</b>', target: 5000 }]);
        expect(s.months['2026-10'].secondPayDay).toBe(25);
        expect(s.months['2026-10'].goalMoves).toEqual([{ id: 'm', goalId: 'g1', amount: 100, day: 3 }]);
    });
});
