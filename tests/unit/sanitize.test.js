import { beforeAll, describe, expect, it, vi } from 'vitest';
import { sanitizeState } from '../../src/data/sanitize.js';
import { escapeHtml } from '../../src/utils.js';

let demo;
beforeAll(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    demo = (await import('../../src/data/demo.js')).getDefaultInitialState;
});

describe('escapeHtml', () => {
    it('робить HTML звичайним текстом', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
        expect(escapeHtml("Кава & чай 'вдома'")).toBe('Кава &amp; чай &#39;вдома&#39;');
        expect(escapeHtml(undefined)).toBe('');
    });
});

describe('sanitizeState', () => {
    it('коректні дані не змінює', () => {
        const d = demo();
        expect(sanitizeState(JSON.parse(JSON.stringify(d)))).toEqual(d);
    });

    it('відкидає не-FinPulse файли', () => {
        expect(sanitizeState(null)).toBeNull();
        expect(sanitizeState({ hello: 1 })).toBeNull();
        expect(sanitizeState([1, 2])).toBeNull();
    });

    it('знешкоджує ідентифікатори, числа й категорії зі шкідливого бекапу', () => {
        const evil = {
            activeMonthKey: '2026-10',
            months: {
                '2026-10': {
                    year: '2026', month: 10, name: '<b>Жовтень</b>', salaryDay: 8, incomeUAH: '100', rate: 'abc',
                    expenses: [
                        { id: "x');alert(1);('", title: '<img onerror=alert(1)>', category: 'food" onclick="x', amountUAH: '50', payDay: '<script>', isPaid: 'yes' },
                        null,
                    ],
                    incomes: [{ id: 'ok_1', category: 'savings', amountUAH: 5, day: 1, isReceived: null }],
                },
                'bad key': { expenses: [] },
            },
        };
        const s = sanitizeState(evil);
        const m = s.months['2026-10'];
        const e = m.expenses[0];
        expect(Object.keys(s.months)).toEqual(['2026-10']);
        expect(m.expenses).toHaveLength(1);
        expect(e.id).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(e.category).toBe('other');
        expect(e.amountUAH).toBe(50);
        expect(e.payDay).toBe(0);
        expect(e.isPaid).toBe(true);
        expect(e.title).toBe('<img onerror=alert(1)>'); // текст зберігається, екранується під час показу
        expect(m.year).toBe(2026);
        expect(m.incomeUAH).toBe(100);
        expect(m.rate).toBe(0);
        // null раніше означав «отримано» — зміст зберігається
        expect(m.incomes[0].isReceived).toBe(true);
    });

    it('виправляє активний місяць, якого немає', () => {
        const s = sanitizeState({ activeMonthKey: '1999-01', months: { '2026-09': { expenses: [] }, '2026-10': { expenses: [] } } });
        expect(s.activeMonthKey).toBe('2026-10');
    });
});
