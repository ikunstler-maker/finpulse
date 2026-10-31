/**
 * ІМПОРТ З CSV І JSON
 *
 * Будь-яке джерело спершу перетворюється на «рядки» { type, date: {y,m,d}, title, amount, category?, card?, paid? }
 * (amount — гривні, завжди додатне), потім planImport рахує, що буде додано, а applyImport додає.
 * Усе — у браузері, без мережі.
 */
import { CATEGORIES, INCOME_CATEGORIES } from './categories.js';
import { newId } from './migrate.js';
import { ensurePresetIncomes } from './presets.js';

const MONTHS = 'Січень,Лютий,Березень,Квітень,Травень,Червень,Липень,Серпень,Вересень,Жовтень,Листопад,Грудень'.split(',');
export const FIELDS = ['date', 'title', 'amount', 'type', 'category', 'card', 'paid'];
const MAX_ROWS = 5000;

/* ---------- CSV ---------- */

export function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
    const counts = [';', ',', '\t'].map(d => [d, firstLine.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** CSV з лапками ("…", "" всередині), будь-якими переносами рядків. */
export function parseCSV(text, delimiter = detectDelimiter(text)) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const src = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delimiter) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

const SYNONYMS = {
    date: ['дата', 'date', 'дата операції', 'дата і час операції', 'дата и время операции', 'час', 'day', 'день'],
    title: ['назва', 'опис', 'опис операції', 'деталі операції', 'призначення', 'title', 'description', 'name', 'описание', 'коментар', 'comment'],
    amount: ['сума', 'сума в валюті картки (uah)', 'сума в валюті картки', 'сума, грн', 'amount', 'sum', 'сумма', 'uah', 'грн'],
    type: ['тип', 'type', 'вид'],
    category: ['категорія', 'category', 'категория'],
    card: ['картка', 'карта', 'card', 'рахунок', 'account'],
    paid: ['сплачено', 'paid', 'статус', 'status'],
};

/** Вгадати, яка колонка що означає, за назвами заголовків. */
export function guessMapping(header) {
    const norm = header.map(h => h.trim().toLowerCase());
    const mapping = {};
    for (const field of FIELDS) {
        let idx = norm.findIndex(h => SYNONYMS[field].includes(h));
        if (idx < 0) idx = norm.findIndex(h => SYNONYMS[field].some(s => s.length > 3 && h.startsWith(s)));
        if (idx >= 0 && !Object.values(mapping).includes(idx)) mapping[field] = idx;
    }
    return mapping;
}

/* ---------- Значення ---------- */

/** «1 234,56», «-1234.56», «1,234.56», «−80» → число; NaN, якщо не число. */
export function parseAmount(raw) {
    if (typeof raw === 'number') return raw;
    let s = String(raw ?? '').trim().replace(/[\s\u00a0\u202f]/g, '').replace(/[\u2212\u2013]/g, '-').replace(/(грн|uah|₴|\$|usd)/gi, '');
    if (!s) return NaN;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma > -1) {
        s = s.replace(',', '.');
    }
    return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD (час ігнорується) → {y,m,d} або null. */
export function parseDate(raw) {
    const s = String(raw ?? '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    let y; let mo; let d;
    if (m) [, y, mo, d] = m.map(Number);
    else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s))) {
        [, d, mo, y] = m.map(Number);
        if (y < 100) y += 2000;
    } else return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { y, m: mo, d };
}

const YES = ['так', 'yes', 'true', '1', 'сплачено', 'отримано', 'paid', 'done', '+'];
const NO = ['ні', 'no', 'false', '0', 'очікується', 'не сплачено', 'planned', '-'];
function parseBool(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    if (YES.includes(s)) return true;
    if (NO.includes(s)) return false;
    return null;
}

const INCOME_WORDS = ['дохід', 'доход', 'надходження', 'income', 'поповнення', 'зарахування'];
const EXPENSE_WORDS = ['витрата', 'расход', 'expense', 'списання', 'оплата'];

/* ---------- Джерела → рядки ---------- */

/**
 * Рядки з CSV за зіставленням колонок. Без колонки «тип» — тип за знаком суми
 * (мінус — витрата, як у виписках банків), або всі витрати, якщо знаків немає.
 */
export function rowsFromCSV(table, mapping, { hasHeader = true } = {}) {
    const body = (hasHeader ? table.slice(1) : table).slice(0, MAX_ROWS);
    const cell = (r, f) => (mapping[f] == null ? '' : (r[mapping[f]] ?? '').trim());
    const rows = [];
    const errors = [];
    const anyNegative = body.some(r => parseAmount(cell(r, 'amount')) < 0);
    body.forEach((r, i) => {
        const line = i + (hasHeader ? 2 : 1);
        const date = parseDate(cell(r, 'date'));
        const amount = parseAmount(cell(r, 'amount'));
        if (!date) return errors.push({ line, reason: 'date' });
        if (!Number.isFinite(amount) || amount === 0) return errors.push({ line, reason: 'amount' });
        const typeRaw = cell(r, 'type').toLowerCase();
        let type = INCOME_WORDS.some(w => typeRaw.includes(w)) ? 'income' : EXPENSE_WORDS.some(w => typeRaw.includes(w)) ? 'expense' : null;
        if (!type) type = anyNegative && amount > 0 ? 'income' : 'expense';
        rows.push({
            type, date, title: cell(r, 'title'), amount: Math.round(Math.abs(amount) * 100) / 100,
            category: cell(r, 'category'), card: cell(r, 'card'), paid: parseBool(cell(r, 'paid')),
        });
    });
    return { rows, errors };
}

/**
 * Рядки з JSON: резервна копія FinPulse (усі місяці) або масив записів
 * [{ date, title, amount, type?, category?, card?, paid? }] (також { records|expenses|items: [...] }).
 */
export function rowsFromJSON(data) {
    if (data && typeof data === 'object' && data.months && typeof data.months === 'object') return rowsFromBackup(data);
    const list = Array.isArray(data) ? data : data && (data.records || data.expenses || data.items || data.transactions);
    if (!Array.isArray(list)) return null;
    const header = ['date', 'title', 'amount', 'type', 'category', 'card', 'paid'];
    const table = [header, ...list.slice(0, MAX_ROWS).map(o => (o && typeof o === 'object'
        ? [o.date ?? o.day ?? '', o.title ?? o.name ?? o.description ?? '', o.amount ?? o.sum ?? o.amountUAH ?? '', o.type ?? '', o.category ?? '', o.card ?? '', o.paid ?? o.isPaid ?? o.received ?? '']
        : ['', '', '', '', '', '', ''])).map(r => r.map(v => (typeof v === 'boolean' ? (v ? 'так' : 'ні') : String(v))))];
    return { ...rowsFromCSV(table, { date: 0, title: 1, amount: 2, type: 3, category: 4, card: 5, paid: 6 }), kind: 'list' };
}

function rowsFromBackup(data) {
    const cardName = id => (Array.isArray(data.cards) ? data.cards.find(c => c && c.id === id)?.name : '') || '';
    const rows = [];
    for (const [key, m] of Object.entries(data.months)) {
        const [y, mo] = key.split('-').map(Number);
        if (!y || !mo || !m) continue;
        const date = d => ({ y, m: mo, d: Math.min(Math.max(1, Number(d) || 1), 31) });
        (m.expenses || []).forEach(e => e && e.amountUAH > 0 && rows.push({
            type: 'expense', date: date(e.payDay), title: String(e.title || ''), amount: e.amountUAH, category: e.category || '', card: cardName(e.cardId), paid: !!e.isPaid,
        }));
        (m.incomes || []).forEach(inc => inc && inc.amountUAH > 0 && rows.push({
            type: 'income', date: date(inc.day), title: String(inc.title || ''), amount: inc.amountUAH, category: inc.category || '', card: cardName(inc.cardId), paid: inc.isReceived !== false, from: inc.debtor || '',
        }));
    }
    return { rows, errors: [], kind: 'backup' };
}

/* ---------- План і застосування ---------- */

function findCategory(raw, type) {
    const list = type === 'income' ? INCOME_CATEGORIES : CATEGORIES;
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return type === 'income' ? 'other_inc' : 'other';
    const hit = list.find(c => c.id === s || c.name.toLowerCase() === s)
        || list.find(c => c.name.toLowerCase().split(/[\s/,]+/).some(w => w.length > 3 && s.includes(w)));
    return hit ? hit.id : type === 'income' ? 'other_inc' : 'other';
}

const keyOf = (monthKey, type, day, amount, title) => `${monthKey}|${type}|${day}|${amount.toFixed(2)}|${title.trim().toLowerCase()}`;
const monthKeyOf = d => `${d.y}-${String(d.m).padStart(2, '0')}`;

/** Що буде додано, без змін у даних. */
export function planImport(state, rows, { markPaid = true, createCards = true } = {}) {
    const existing = new Set();
    for (const [k, m] of Object.entries(state.months)) {
        (m.expenses || []).forEach(e => existing.add(keyOf(k, 'expense', e.payDay, e.amountUAH || 0, e.title || '')));
        (m.incomes || []).forEach(i => existing.add(keyOf(k, 'income', i.day || 1, i.amountUAH || 0, i.title || '')));
    }
    const cardByName = new Map((state.cards || []).map(c => [c.name.trim().toLowerCase(), c.id]));
    const newCards = [];
    const items = [];
    let duplicates = 0;
    for (const r of rows) {
        const monthKey = monthKeyOf(r.date);
        const title = r.title.trim() || (r.type === 'income' ? INCOME_CATEGORIES : CATEGORIES).find(c => c.id === findCategory(r.category, r.type)).name;
        const key = keyOf(monthKey, r.type, r.date.d, r.amount, title);
        if (existing.has(key)) { duplicates++; continue; }
        existing.add(key);
        let cardId = null;
        const cardName = String(r.card || '').trim();
        if (cardName) {
            cardId = cardByName.get(cardName.toLowerCase()) || null;
            if (!cardId && createCards) {
                cardId = newId('card');
                cardByName.set(cardName.toLowerCase(), cardId);
                newCards.push({ id: cardId, name: cardName.slice(0, 40) });
            }
        }
        items.push({ ...r, title, monthKey, category: findCategory(r.category, r.type), cardId, paid: r.paid == null ? markPaid : r.paid });
    }
    const months = [...new Set(items.map(i => i.monthKey))].sort();
    return {
        items,
        duplicates,
        newCards,
        months,
        newMonths: months.filter(k => !state.months[k]),
        expenses: items.filter(i => i.type === 'expense').length,
        incomes: items.filter(i => i.type === 'income').length,
        total: Math.round(items.reduce((s, i) => s + (i.type === 'expense' ? -i.amount : i.amount), 0) * 100) / 100,
    };
}

const CARD_COLORS = ['#1f6feb', '#157a5b', '#d9822b', '#b3372d', '#8b6fd6', '#2aa198', '#16202c', '#c2185b'];

/** Додає записи плану в дані (змінює state). */
export function applyImport(state, plan) {
    if (!Array.isArray(state.cards)) state.cards = [];
    plan.newCards.forEach((c, i) => state.cards.push({ ...c, color: CARD_COLORS[(state.cards.length + i) % CARD_COLORS.length] }));
    const template = state.months[state.activeMonthKey] || {};
    for (const item of plan.items) {
        if (!state.months[item.monthKey]) {
            const [y, m] = item.monthKey.split('-').map(Number);
            const month = { year: y, month: m, name: `${MONTHS[m - 1]} ${y}`, salaryDay: template.salaryDay || 1, incomeUAH: 0, rate: template.rate || 0, salaryParts: [], incomes: [], expenses: [] };
            ensurePresetIncomes(month);
            state.months[item.monthKey] = month;
        }
        const month = state.months[item.monthKey];
        if (item.type === 'expense') {
            const e = { id: newId('exp'), title: item.title, category: item.category, amountUAH: item.amount, amountUSD: 0, payDay: item.date.d, isPaid: !!item.paid };
            if (item.cardId) e.cardId = item.cardId;
            month.expenses.push(e);
        } else {
            const inc = { id: newId('inc'), title: item.title, category: item.category, amountUAH: item.amount, day: item.date.d, isReceived: !!item.paid, isPreset: false, debtor: item.from || '' };
            if (item.cardId) inc.cardId = item.cardId;
            month.incomes.push(inc);
        }
    }
    return state;
}
