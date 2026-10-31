import { describe, expect, it } from 'vitest';
import { getDefaultInitialState } from '../../src/data/demo.js';
import { reportData, toCSV, toJSON, toMarkdown, toXLSX } from '../../src/data/export.js';
import { analyzeCSV, applyImport, planImport, rowsFromCSV, rowsFromJSON } from '../../src/data/import.js';
import { createEmptyState } from '../../src/data/months.js';
import { prepareState } from '../../src/state.js';
import { readXLSX } from '../../src/data/xlsx.js';

const L = {
    headers: { date: 'Дата', title: 'Назва', amount: 'Сума', foreign: 'Сума у валюті', currency: 'Валюта', type: 'Тип', category: 'Категорія', card: 'Картка', paid: 'Сплачено', from: 'Від кого' },
    typeExpense: 'витрата', typeIncome: 'надходження', yes: 'так', no: 'ні',
    title: 'Звіт FinPulse', periodLine: 'Жовтень 2026', summary: 'Підсумок', metric: 'Показник', income: 'Доходи', expensesAll: 'Усі витрати',
    paidLine: 'Сплачено', balance: 'Залишок плану', byCategory: 'Витрати за категоріями', incomesBy: 'Доходи за категоріями',
    sheetExpenses: 'Витрати', sheetIncomes: 'Доходи', empty: '—',
};
const money = n => `${n.toFixed(2)} ₴`;
const demo = () => prepareState(getDefaultInitialState());

describe('дані звіту', () => {
    it('поточний місяць: усі витрати, зарплата частинами, надходження; підсумки як у звітах', () => {
        const d = reportData(demo(), { period: 'current' }, { salary: 'Зарплата' });
        expect(d.monthKeys).toEqual(['2026-10']);
        expect(d.expenses).toHaveLength(14);
        expect(d.incomes.map(x => x.title)).toEqual(['Заощадження з попереднього місяця', 'Зарплата', 'Зарплата']);
        expect(d.totals).toMatchObject({ income: 52800, expenses: 30262.77, paid: 8250, balance: 22537.23 });
        expect(d.byCategory.expenses[0]).toEqual({ category: 'Оренда та ЖКГ', amount: 14500 });
    });
    it('свої дати: лише записи в межах', () => {
        const d = reportData(demo(), { period: 'custom', from: '2026-10-08', to: '2026-10-12' }, { salary: 'Зарплата' });
        expect(d.expenses.map(x => x.date.d)).toEqual([9, 10, 11, 12]);
        expect(d.incomes.map(x => x.title)).toEqual(['Зарплата']);
    });
});

describe('формати', () => {
    const data = () => reportData(demo(), { period: 'current' }, { salary: 'Зарплата' });

    it('CSV повертається імпортом без змін сум (у порожній бюджет)', () => {
        const csv = toCSV(data(), L);
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv.split('\r\n')[0]).toBe('﻿Дата;Назва;Сума;Сума у валюті;Валюта;Тип;Категорія;Картка;Сплачено;Від кого');
        const a = analyzeCSV(csv.slice(1), 'report.csv');
        expect(a.mapping).toMatchObject({ date: 0, title: 1, amount: 2, usd: 3, type: 5, category: 6, card: 7, paid: 8 });
        const parsed = rowsFromCSV(a.table, a.mapping, { ctx: a.ctx });
        expect(parsed.errors).toEqual([]);
        const st = createEmptyState(new Date(2026, 9, 29));
        const plan = planImport(st, parsed.rows, {});
        expect(plan).toMatchObject({ expenses: 14, incomes: 3, salaryParts: 2, expenseTotal: 30262.77, incomeTotal: 52800 });
        applyImport(st, plan);
        expect(st.months['2026-10'].expenses.find(e => e.title === 'Оренда квартири')).toMatchObject({ category: 'housing', amountUAH: 12000 });
    });

    it('JSON відкривається імпортом: дублікатів у тих самих даних немає, у порожньому — усе', () => {
        const st = demo();
        const json = JSON.parse(toJSON(st, data(), { period: 'current' }));
        expect(json).toMatchObject({ app: 'FinPulse', kind: 'report', version: 6 });
        expect(json.months['2026-10'].salaryParts).toHaveLength(2);
        expect(json.cards.map(c => c.name).sort()).toEqual(['Зарплатна', 'Основна']);
        const rows = rowsFromJSON(json).rows;
        expect(planImport(st, rows, {}).items).toHaveLength(0);
        const empty = createEmptyState(new Date(2026, 9, 29));
        const plan = planImport(empty, rows, {});
        expect(plan).toMatchObject({ expenses: 14, salaryParts: 2, expenseTotal: 30262.77, incomeTotal: 52800 });
        applyImport(empty, plan);
        expect(empty.months['2026-10'].salaryParts.map(p => p.currency)).toEqual(['USDT', 'USDT']);
        expect(empty.months['2026-10'].expenses.find(e => e.title === 'Розстрочка за телефон').installment).toEqual({ current: 3, total: 6 });
    });

    it('Markdown: таблиці, екранування «|»', () => {
        const d = data();
        d.expenses[0].title = 'A | B';
        const md = toMarkdown(d, L, money);
        expect(md.startsWith('# Звіт FinPulse\n\nЖовтень 2026\n')).toBe(true);
        expect(md).toContain('| Доходи | 52800.00 ₴ |');
        expect(md).toContain('A \\| B');
        expect(md).toContain('| --- | ---: |');
    });

    it('Excel: три аркуші, суми числами', async () => {
        const sheets = await readXLSX(toXLSX(data(), L));
        expect(sheets.map(s => s.name)).toEqual(['Підсумок', 'Витрати', 'Доходи']);
        expect(sheets[0].rows[1]).toEqual(['Доходи', '52800']);
        expect(sheets[1].rows).toHaveLength(15);
        expect(sheets[1].rows[0][0]).toBe('Дата');
        expect(sheets[2].rows.slice(1).map(r => r[1])).toEqual(['Заощадження з попереднього місяця', 'Зарплата', 'Зарплата']);
    });
});

describe('нові місяці без вигаданих заощаджень', () => {
    it('порожній бюджет і місяць з імпорту в жовтні 2026 — заощадження 0', () => {
        const st = createEmptyState(new Date(2026, 9, 29));
        expect(st.months['2026-10'].incomes.find(i => i.category === 'savings').amountUAH).toBe(0);
        const other = createEmptyState(new Date(2026, 8, 1));
        const plan = planImport(other, [{ type: 'expense', date: { y: 2026, m: 10, d: 5 }, title: 'Кава', amount: 50, category: '' }], {});
        applyImport(other, plan);
        expect(other.months['2026-10'].incomes.find(i => i.category === 'savings').amountUAH).toBe(0);
    });
});
