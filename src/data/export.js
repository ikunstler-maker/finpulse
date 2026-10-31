/**
 * Експорт звіту за період: CSV, JSON, Markdown, Excel (.xlsx). PDF — друк сторінки звіту (src/ui/export.js).
 * Файли створюються в браузері й зберігаються на пристрій. CSV і JSON сумісні з імпортом FinPulse.
 * Тексти (заголовки, «так/ні») передає інтерфейс зі словника — тут їх немає.
 */
import { periodMonthKeys, round2 } from '../calc.js';
import { CATEGORIES, INCOME_CATEGORIES } from './categories.js';
import { DATA_VERSION } from './migrate.js';
import { writeXLSX } from './xlsx.js';

const pad = n => String(n).padStart(2, '0');
export const fmtDate = d => `${pad(d.d)}.${pad(d.m)}.${d.y}`;
const iso = d => `${d.y}-${pad(d.m)}-${pad(d.d)}`;

/**
 * Записи періоду. period — як у звітах; для 'custom' — from/to (YYYY-MM-DD) за датою запису.
 * Повертає { monthKeys, expenses, incomes, totals, byCategory }, де кожен запис:
 * { monthKey, date, title, categoryId, category, amount, foreign, currency, paid, card, from, salary, kind, src }.
 */
export function reportData(state, { period = 'current', from = '', to = '' } = {}, { salary = 'Salary' } = {}) {
    const custom = period === 'custom';
    const keys = custom ? Object.keys(state.months).sort() : periodMonthKeys(state, period).filter(k => state.months[k]);
    const inRange = d => !custom || ((!from || iso(d) >= from) && (!to || iso(d) <= to));
    const cardName = id => (state.cards || []).find(c => c.id === id)?.name || '';
    const expenses = [];
    const incomes = [];
    for (const k of keys) {
        const m = state.months[k];
        const last = new Date(m.year, m.month, 0).getDate();
        const date = day => ({ y: m.year, m: m.month, d: Math.min(Math.max(1, Number(day) || 1), last) });
        for (const e of m.expenses || []) {
            const d = date(e.payDay);
            if (!inRange(d)) continue;
            const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES.find(c => c.id === 'other');
            expenses.push({ monthKey: k, date: d, title: e.title || '', categoryId: cat.id, category: cat.name, amount: round2(e.amountUAH || 0), foreign: e.amountUSD > 0 ? e.amountUSD : 0, currency: e.amountUSD > 0 ? e.currency || 'USD' : '', paid: !!e.isPaid, card: cardName(e.cardId), kind: 'expense', src: e });
        }
        if (Array.isArray(m.salaryParts)) {
            for (const p of m.salaryParts) {
                const d = date(p.day || m.salaryDay);
                if (!inRange(d) || !(p.uah > 0)) continue;
                incomes.push({ monthKey: k, date: d, title: salary, categoryId: 'salary', category: salary, amount: round2(p.uah), foreign: p.currency !== 'UAH' ? p.amount : 0, currency: p.currency !== 'UAH' ? p.currency : '', paid: !!p.received, card: cardName(p.cardId), salary: true, kind: 'salary', src: p });
            }
        } else if (m.incomeUAH > 0 && inRange(date(m.salaryDay))) {
            incomes.push({ monthKey: k, date: date(m.salaryDay), title: salary, categoryId: 'salary', category: salary, amount: round2(m.incomeUAH), foreign: 0, currency: '', paid: true, card: '', salary: true, kind: 'legacy-salary', src: null });
        }
        for (const i of m.incomes || []) {
            const d = date(i.day);
            if (!inRange(d) || !(i.amountUAH > 0)) continue;
            const cat = INCOME_CATEGORIES.find(c => c.id === i.category) || INCOME_CATEGORIES.find(c => c.id === 'other_inc');
            incomes.push({ monthKey: k, date: d, title: i.title || cat.name, categoryId: cat.id, category: cat.name, amount: round2(i.amountUAH), foreign: 0, currency: '', paid: i.isReceived !== false, card: cardName(i.cardId), from: i.debtor || '', kind: 'income', src: i });
        }
    }
    const byDate = (a, b) => iso(a.date).localeCompare(iso(b.date)) || b.amount - a.amount;
    expenses.sort(byDate);
    incomes.sort(byDate);
    const sum = list => round2(list.reduce((s, x) => s + x.amount, 0));
    const group = list => {
        const map = new Map();
        list.forEach(x => map.set(x.category, round2((map.get(x.category) || 0) + x.amount)));
        return [...map].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
    };
    const totals = {
        income: sum(incomes),
        incomeReceived: sum(incomes.filter(x => x.paid)),
        expenses: sum(expenses),
        paid: sum(expenses.filter(x => x.paid)),
    };
    totals.balance = round2(totals.income - totals.expenses);
    return { monthKeys: keys, expenses, incomes, totals, byCategory: { expenses: group(expenses), incomes: group(incomes) } };
}

/* ---------- CSV ---------- */

const BOM = String.fromCharCode(0xfeff);
const csvCell = v => {
    const s = String(v ?? '');
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const decimal = n => (n ? String(round2(n)).replace('.', ',') : '');

/** CSV з «;» і BOM (Excel відкриває кирилицю правильно). Колонки впізнає імпорт FinPulse. */
export function toCSV(data, L) {
    const h = L.headers;
    const lines = [[h.date, h.title, h.amount, h.foreign, h.currency, h.type, h.category, h.card, h.paid, h.from]];
    for (const x of [...data.expenses, ...data.incomes]) {
        lines.push([fmtDate(x.date), x.title, decimal(x.amount), decimal(x.foreign), x.currency, x.kind === 'expense' ? L.typeExpense : L.typeIncome, x.category, x.card, x.paid ? L.yes : L.no, x.from || '']);
    }
    return `${BOM}${lines.map(r => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

/* ---------- JSON ---------- */

/** Формат резервної копії (лише записи періоду) — відкривається імпортом FinPulse. */
export function toJSON(state, data, period) {
    const months = {};
    const ensure = k => {
        const m = state.months[k];
        if (!months[k]) months[k] = { year: m.year, month: m.month, name: m.name, salaryDay: m.salaryDay, rate: m.rate, salaryParts: [], incomes: [], expenses: [] };
        return months[k];
    };
    for (const x of data.expenses) ensure(x.monthKey).expenses.push({ ...x.src });
    for (const x of data.incomes) {
        if (x.kind === 'salary') ensure(x.monthKey).salaryParts.push({ ...x.src });
        else if (x.kind === 'legacy-salary') ensure(x.monthKey).salaryParts.push({ id: `sal_${x.monthKey.replace('-', '')}`, amount: x.amount, currency: 'UAH', uah: x.amount, day: x.date.d, received: true });
        else ensure(x.monthKey).incomes.push({ ...x.src });
    }
    const used = new Set([...data.expenses, ...data.incomes].map(x => x.src?.cardId).filter(Boolean));
    return JSON.stringify({
        app: 'FinPulse', kind: 'report', version: DATA_VERSION, period,
        totals: data.totals,
        cards: (state.cards || []).filter(c => used.has(c.id)),
        months,
    }, null, 2);
}

/* ---------- Markdown ---------- */

const mdCell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const mdTable = (head, rows, right = []) => [
    `| ${head.map(mdCell).join(' | ')} |`,
    `| ${head.map((_, i) => (right.includes(i) ? '---:' : '---')).join(' | ')} |`,
    ...rows.map(r => `| ${r.map(mdCell).join(' | ')} |`),
].join('\n');

/** money — функція форматування суми з інтерфейсу. */
export function toMarkdown(data, L, money) {
    const h = L.headers;
    const t = data.totals;
    const parts = [
        `# ${L.title}`, '', L.periodLine, '',
        `## ${L.summary}`, '',
        mdTable([L.metric, h.amount], [[L.income, money(t.income)], [L.expensesAll, money(t.expenses)], [L.paidLine, money(t.paid)], [L.balance, money(t.balance)]], [1]),
        '', `## ${L.byCategory}`, '',
        data.byCategory.expenses.length ? mdTable([h.category, h.amount], data.byCategory.expenses.map(c => [c.category, money(c.amount)]), [1]) : L.empty,
        '', `## ${L.incomesBy}`, '',
        data.byCategory.incomes.length ? mdTable([h.category, h.amount], data.byCategory.incomes.map(c => [c.category, money(c.amount)]), [1]) : L.empty,
        '', `## ${L.sheetExpenses}`, '',
        data.expenses.length ? mdTable([h.date, h.title, h.category, h.amount, h.paid], data.expenses.map(x => [fmtDate(x.date), x.title, x.category, money(x.amount), x.paid ? L.yes : L.no]), [3]) : L.empty,
        '', `## ${L.sheetIncomes}`, '',
        data.incomes.length ? mdTable([h.date, h.title, h.category, h.amount, h.paid], data.incomes.map(x => [fmtDate(x.date), x.title, x.category, money(x.amount), x.paid ? L.yes : L.no]), [3]) : L.empty,
        '',
    ];
    return parts.join('\n');
}

/* ---------- Excel ---------- */

export function toXLSX(data, L) {
    const h = L.headers;
    const t = data.totals;
    const rowsOf = list => [
        [h.date, h.title, h.category, h.amount, h.foreign, h.currency, h.card, h.paid, h.from],
        ...list.map(x => [fmtDate(x.date), x.title, x.category, x.amount, x.foreign || null, x.currency, x.card, x.paid ? L.yes : L.no, x.from || '']),
    ];
    return writeXLSX([
        {
            name: L.summary,
            widths: [34, 16],
            rows: [
                [L.title, L.periodLine],
                [L.income, t.income], [L.expensesAll, t.expenses], [L.paidLine, t.paid], [L.balance, t.balance],
                [],
                [L.byCategory, h.amount], ...data.byCategory.expenses.map(c => [c.category, c.amount]),
                [],
                [L.incomesBy, h.amount], ...data.byCategory.incomes.map(c => [c.category, c.amount]),
            ],
        },
        { name: L.sheetExpenses, widths: [12, 36, 26, 14, 10, 8, 16, 10, 16], rows: rowsOf(data.expenses) },
        { name: L.sheetIncomes, widths: [12, 36, 26, 14, 10, 8, 16, 10, 16], rows: rowsOf(data.incomes) },
    ]);
}
