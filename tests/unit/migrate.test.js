import { beforeAll, describe, expect, it, vi } from 'vitest';
import { monthIncomeTotal, monthReceivedIncome, salaryForeignTotal, averageSalaryRate } from '../../src/calc.js';
import { DATA_VERSION, migrateState, syncSalaryFields } from '../../src/data/migrate.js';
import { createNextMonth } from '../../src/data/months.js';

let prepareState;
beforeAll(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    ({ prepareState } = await import('../../src/state.js'));
});

const legacyMonth = () => ({
    year: 2026, month: 10, name: 'Жовтень 2026', salaryDay: 8,
    incomeUAH: 72000.5, incomeUSDT: 1600, rate: 45, incomes: [], expenses: [],
});

describe('перенесення формату 3 → 4 (зарплата частинами)', () => {
    it('стара ЗП стає однією отриманою частиною з точною сумою в гривнях', () => {
        const st = migrateState({ activeMonthKey: '2026-10', months: { '2026-10': legacyMonth() } });
        const m = st.months['2026-10'];
        expect(st.version).toBe(DATA_VERSION);
        expect(m.salaryParts).toHaveLength(1);
        expect(m.salaryParts[0]).toMatchObject({ amount: 1600, currency: 'USDT', uah: 72000.5, day: 8, received: true });
        expect(monthIncomeTotal(m)).toBe(72000.5);
        expect(monthReceivedIncome(m)).toBe(72000.5);
    });

    it('ЗП лише в гривнях', () => {
        const m = { ...legacyMonth(), incomeUSDT: 0, incomeUSD: 0 };
        migrateState({ months: { '2026-10': m } });
        expect(m.salaryParts[0]).toMatchObject({ amount: 72000.5, currency: 'UAH', uah: 72000.5 });
    });

    it('повторне перенесення нічого не змінює', () => {
        const st = migrateState({ months: { '2026-10': legacyMonth() } });
        const before = JSON.stringify(st);
        migrateState(st);
        expect(JSON.stringify(st)).toBe(before);
    });

    it('старий бекап проходить перевірку і перенесення', () => {
        const st = prepareState({ activeMonthKey: '2026-10', months: { '2026-10': legacyMonth() } });
        expect(st.months['2026-10'].salaryParts).toHaveLength(1);
        expect(st.months['2026-10'].incomes.length).toBeGreaterThan(0); // шаблони надходжень
    });
});

describe('зарплата частинами', () => {
    const m = () => ({
        ...legacyMonth(),
        salaryParts: [
            { id: 'a', amount: 700, currency: 'USDT', uah: 28980, day: 8, received: true },
            { id: 'b', amount: 500, currency: 'USDT', uah: 20820, day: 20, received: false },
        ],
    });
    it('сума, отримане, валюта і середній курс', () => {
        const x = m();
        expect(monthIncomeTotal(x)).toBe(49800);
        expect(monthReceivedIncome(x)).toBe(28980);
        expect(salaryForeignTotal(x)).toBe(1200);
        expect(averageSalaryRate(x)).toBeCloseTo(41.5, 6);
    });
    it('старі поля оновлюються з частин (для старих бекапів)', () => {
        const x = m();
        syncSalaryFields(x);
        expect(x).toMatchObject({ incomeUAH: 49800, incomeUSDT: 1200, rate: 41.5 });
    });
});

describe('новий місяць з поточного', () => {
    it('витрати несплачені, частини ЗП очікувані, залишок — у заощадження', () => {
        const st = migrateState({
            activeMonthKey: '2026-10',
            months: {
                '2026-10': {
                    ...legacyMonth(), incomeUAH: 1000, incomeUSDT: 0,
                    expenses: [{ id: 'e', title: 'Оренда', category: 'housing', amountUAH: 300, payDay: 10, isPaid: true }, { id: 'f', title: 'Зв’язок', category: 'comm', amountUAH: 100, payDay: 3, isPaid: true }],
                },
            },
        });
        const key = createNextMonth(st, '2026-10');
        const n = st.months[key];
        expect(key).toBe('2026-11');
        expect(n.name).toBe('Листопад 2026');
        expect(n.expenses.every(e => !e.isPaid)).toBe(true);
        expect(n.salaryParts.every(p => !p.received)).toBe(true);
        // 1000 − (300 + 100) − місток (витрата 3-го числа наступного місяця, 100) = 500
        expect(n.incomes.find(i => i.category === 'savings').amountUAH).toBe(500);
    });
    it('існуючий місяць не перезаписує', () => {
        const st = migrateState({ months: { '2026-10': legacyMonth(), '2026-11': { ...legacyMonth(), month: 11, expenses: [{ id: 'x', title: 'Своє', amountUAH: 1, payDay: 1 }] } } });
        createNextMonth(st, '2026-10');
        expect(st.months['2026-11'].expenses[0].title).toBe('Своє');
    });
});
