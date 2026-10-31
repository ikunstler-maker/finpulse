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
export const FIELDS = ['date', 'title', 'amount', 'usd', 'type', 'category', 'card', 'paid'];
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
    amount: ['сума', 'сума в валюті картки (uah)', 'сума в валюті картки', 'сума, грн', 'amount', 'sum', 'сумма', 'uah', 'грн', '₴'],
    usd: ['$', 'usd', 'us$', 'сума, $', 'долари'],
    type: ['тип', 'type', 'вид'],
    category: ['категорія', 'category', 'категория'],
    card: ['картка', 'карта', 'card', 'рахунок', 'account'],
    paid: ['сплачено', 'paid', 'статус', 'status'],
};

/** Вгадати, яка колонка що означає, за назвами заголовків (і за значеннями, якщо є рядки). */
export function guessMapping(header, body = []) {
    const norm = header.map(h => h.trim().toLowerCase());
    const mapping = {};
    for (const field of FIELDS) {
        let idx = norm.findIndex(h => SYNONYMS[field].includes(h));
        if (idx < 0) idx = norm.findIndex(h => SYNONYMS[field].some(s => s.length > 3 && h.startsWith(s)));
        if (idx >= 0 && !Object.values(mapping).includes(idx)) mapping[field] = idx;
    }
    if (body.length) {
        const free = i => !Object.values(mapping).includes(i);
        const col = i => body.map(r => (r[i] ?? '').trim()).filter(Boolean);
        // Колонка з TRUE/FALSE (галочки з Numbers чи Excel) — «сплачено».
        if (mapping.paid == null) {
            const idx = header.findIndex((_, i) => free(i) && col(i).length && col(i).every(v => parseBool(v) !== null && !/^[-+01]$/.test(v)));
            if (idx >= 0) mapping.paid = idx;
        }
        // Назва — перша вільна колонка, де переважно текст (заголовок буває назвою розділу).
        if (mapping.title == null) {
            const idx = header.findIndex((_, i) => {
                const v = col(i);
                return free(i) && v.length && v.filter(x => Number.isNaN(parseAmount(x)) && parseBool(x) === null && !parseDate(x)).length / v.length > 0.6;
            });
            if (idx >= 0) mapping.title = idx;
        }
    }
    return mapping;
}

/** Рядок із назвами колонок: перший серед перших 6, де знайшлися дата або сума. */
export function findHeaderRow(table) {
    for (let i = 0; i < Math.min(6, table.length); i++) {
        const m = guessMapping(table[i]);
        if (m.amount != null || m.date != null) return i;
    }
    return 0;
}

const MONTH_NAMES = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];

/** Місяць і рік із назви файлу («02.2026-…», «Лютий 2026») чи першого рядка. */
export function contextFromName(...texts) {
    for (const text of texts) {
        const s = String(text || '').toLowerCase();
        let m = /(^|[^\d])(\d{1,2})[._-](20\d{2})(?!\d)/.exec(s);
        if (m) {
            const month = Number(m[2]);
            if (month >= 1 && month <= 12) return { year: Number(m[3]), month };
        }
        m = /(20\d{2})[._-](\d{1,2})(?!\d)/.exec(s);
        if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) };
        const y = /(20\d{2})/.exec(s);
        const mi = MONTH_NAMES.findIndex(n => s.includes(n));
        if (y && mi >= 0) return { year: Number(y[1]), month: mi + 1 };
    }
    return null;
}

/* ---------- Значення ---------- */

/** «1 234,56», «-1234.56», «1,234.56», «−80» → число; NaN, якщо не число. */
export function parseAmount(raw) {
    if (typeof raw === 'number') return raw;
    let s = String(raw ?? '').trim().replace(/[\s\u00a0\u202f]/g, '').replace(/[\u2212\u2013]/g, '-').replace(/(грн|uah|₴|us\$|\$|usd)/gi, '');
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

/**
 * DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD (час ігнорується) → {y,m,d} або null.
 * З контекстом { year, month } також «DD.MM» і просто «DD» (число місяця).
 */
export function parseDate(raw, ctx = null) {
    const s = String(raw ?? '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    let y; let mo; let d;
    if (m) [, y, mo, d] = m.map(Number);
    else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s))) {
        [, d, mo, y] = m.map(Number);
        if (y < 100) y += 2000;
    } else if (ctx && (m = /^(\d{1,2})[./](\d{1,2})$/.exec(s))) {
        [, d, mo] = m.map(Number);
        y = ctx.year;
    } else if (ctx && /^\d{1,2}$/.test(s)) {
        d = Number(s);
        mo = ctx.month;
        y = ctx.year;
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

const norm = t => String(t || '').toLowerCase().replace(/[’ʼ']/g, "'").replace(/\s+/g, ' ').trim();

/** Підсумкові рядки планувальних таблиць: їх не імпортуємо. */
const SUMMARY_SKIP = ['витрати', 'сума', 'сума витрат', 'прибуток', 'сума прибутку', 'залишок', 'капітал', 'витрати до зп', 'передбачено витрат станом на зараз', 'разом', 'всього', 'total'];
/** Підсумкові рядки, що є доходами: назва → категорія надходження (salary — частина ЗП). */
const SUMMARY_INCOME = {
    'зарплата': 'salary', 'зп': 'salary', 'бенефіти': 'other_inc', 'дод заробіток': 'extra', 'додатковий заробіток': 'extra',
    'накопичення': 'savings', 'заощадження': 'savings', 'борг': 'debt_return', 'благодійні надходження': 'charity_in',
};
/** Заголовки розділів → категорія витрат (null — без підказки). */
const SECTIONS = { 'підписки': 'subscriptions', 'подарунки': 'gifts', 'благодійність': 'charity', 'додаткові витрати': null, 'борги': 'debts' };

/**
 * Рядки з CSV за зіставленням колонок. Без колонки «тип» — тип за знаком суми
 * (мінус — витрата, як у виписках банків), або всі витрати, якщо знаків немає.
 * ctx { year, month, defaultDay } — для дат без року чи місяця і рядків без дати.
 */
export function rowsFromCSV(table, mapping, { hasHeader = true, ctx = null } = {}) {
    const body = (hasHeader ? table.slice(1) : table).slice(0, MAX_ROWS);
    const cell = (r, f) => (mapping[f] == null ? '' : (r[mapping[f]] ?? '').trim());
    const rows = [];
    const errors = [];
    let moved = 0;
    const anyNegative = body.some(r => parseAmount(cell(r, 'amount')) < 0);
    let section = hasHeader && mapping.title != null ? SECTIONS[norm(table[0][mapping.title])] ?? null : null;
    body.forEach((r, i) => {
        const line = i + (hasHeader ? 2 : 1);
        const title = cell(r, 'title');
        const key = norm(title);
        const rawAmount = parseAmount(cell(r, 'amount'));
        const hasAmount = Number.isFinite(rawAmount) && rawAmount !== 0;
        if (!title && !hasAmount) return; // порожній чи службовий рядок
        if (SUMMARY_SKIP.includes(key)) return;
        if (key in SECTIONS && !hasAmount) {
            section = SECTIONS[key];
            return;
        }
        if (!hasAmount) {
            // Запланований рядок без суми («Фетр» без ціни) — пропускаємо мовчки; помилка — лише незрозуміла сума.
            if (!cell(r, 'amount') || key in SUMMARY_INCOME || Number.isFinite(rawAmount)) return;
            return errors.push({ line, reason: 'amount' });
        }
        const rawDate = cell(r, 'date');
        let date = parseDate(rawDate, ctx);
        if (!date && ctx && ctx.defaultDay) date = { y: ctx.year, m: ctx.month, d: ctx.defaultDay };
        if (!date) return errors.push({ line, reason: 'date' });
        if (ctx && ctx.lockMonth && (date.y !== ctx.year || date.m !== ctx.month)) {
            // Аркуш одного місяця: дата з іншого місяця — найчастіше скопійований рядок; лишаємо число дня.
            date = { y: ctx.year, m: ctx.month, d: Math.min(date.d, new Date(ctx.year, ctx.month, 0).getDate()) };
            moved++;
        }
        const usd = parseAmount(cell(r, 'usd'));
        const base = {
            date, title, amount: Math.round(Math.abs(rawAmount) * 100) / 100,
            card: cell(r, 'card'), paid: parseBool(cell(r, 'paid')),
        };
        if (Number.isFinite(usd) && usd > 0) base.usd = Math.round(usd * 100) / 100;
        if (key in SUMMARY_INCOME) {
            const cat = SUMMARY_INCOME[key];
            return rows.push({ ...base, type: 'income', salary: cat === 'salary', category: cat === 'salary' ? '' : cat });
        }
        const typeRaw = cell(r, 'type').toLowerCase();
        let type = INCOME_WORDS.some(w => typeRaw.includes(w)) ? 'income' : EXPENSE_WORDS.some(w => typeRaw.includes(w)) ? 'expense' : null;
        if (!type) type = anyNegative && rawAmount > 0 ? 'income' : 'expense';
        rows.push({ ...base, type, category: cell(r, 'category') || (type === 'expense' ? guessCategory(title, section) : '') });
    });
    return { rows, errors, moved };
}

/**
 * Повний розбір одного CSV-файлу: рядок заголовків, колонки, місяць із назви файлу.
 * Повертає те, що потрібно вікну імпорту (table — від рядка заголовків).
 */
export function analyzeCSV(text, fileName = '', { defaultDay = 1 } = {}) {
    const all = parseCSV(text);
    const table = all.slice(findHeaderRow(all));
    const mapping = guessMapping(table[0] || [], table.slice(1));
    const found = contextFromName(fileName, (all[0] || []).join(' '));
    const ctx = found ? { ...found, defaultDay, lockMonth: true } : null;
    return { table, mapping, ctx };
}

const TITLE_CATEGORIES = [
    ['comm', ['triolan', 'мобільн', "зв'язок", 'інтернет', 'kyivstar', 'київстар', 'vodafone', 'lifecell', 'домофон']],
    ['housing', ['оренда', 'комунальн', 'квартир', 'електроенерг', 'ріелтор', 'доставка води', 'газ ', 'опалення']],
    ['debts', ['розстрочк', 'борг', 'кредит', 'погашення']],
    ['subscriptions', ['apple one', 'lightroom', 'faceapp', 'inshot', 'verba', 'prom ', 'prom -', 'google one', 'gemini', 'higgsfield', 'helsi', 'домен', 'хостинг', 'підписк', 'netflix', 'spotify', 'youtube', 'icloud', 'chatgpt', 'premium']],
    ['food', ['продукт', 'їжа', 'сільпо', 'атб', 'novus', 'ресторан', 'кафе']],
    ['beauty', ['манікюр', 'епіляц', 'вій', 'перукар', 'стрижк', 'педикюр', 'нарощ', 'косметолог', 'холодне відновлення']],
    ['health', ['подолог', 'спортзал', 'apollo', 'антидепрес', 'медкоміс', 'лікар', 'аптек', 'ліки', 'кінезітерап', 'стоматолог', 'зуб', 'папілом', 'спорт піт', 'психолог', 'аналіз', 'кт ', 'швів', 'перев', 'судмед', 'уколи', 'стерилізац', 'брів', 'брови']],
    ['gifts', ['подарун', 'квіти', 'дн ', 'день народж']],
    ['charity', ['благод', 'донат', 'збір']],
    ['home', ['майстер', 'ремонт', 'фетр', 'вебкамер', 'смартфон', 'iphone', 'техніка']],
];

/** Категорія витрати за назвою, далі — за розділом таблиці. */
export function guessCategory(title, section = null) {
    const t = ` ${norm(title)} `;
    const hit = TITLE_CATEGORIES.find(([, words]) => words.some(w => t.includes(w)));
    return hit ? hit[0] : section || 'other';
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

const keyOf = (monthKey, type, day, amount, title) => `${monthKey}|${type}|${day}|${Number(amount).toFixed(2)}|${title.trim().toLowerCase()}`;
const monthKeyOf = d => `${d.y}-${String(d.m).padStart(2, '0')}`;

/**
 * Що буде додано, без змін у даних. Дублікат — запис, який уже є в застосунку
 * (той самий місяць, день, сума й назва). Однакові рядки в самому файлі зберігаються:
 * у планувальних таблицях це часто окремі платежі.
 */
export function planImport(state, rows, { markPaid = true, createCards = true } = {}) {
    const existing = new Map();
    const add = k => existing.set(k, (existing.get(k) || 0) + 1);
    for (const [k, m] of Object.entries(state.months)) {
        (m.expenses || []).forEach(e => add(keyOf(k, 'expense', e.payDay, e.amountUAH || 0, e.title || '')));
        (m.incomes || []).forEach(i => add(keyOf(k, 'income', i.day || 1, i.amountUAH || 0, i.title || '')));
        (m.salaryParts || []).forEach(p => add(keyOf(k, 'salary', p.day || 1, p.uah || 0, '')));
    }
    const cardByName = new Map((state.cards || []).map(c => [c.name.trim().toLowerCase(), c.id]));
    const newCards = [];
    const items = [];
    let duplicates = 0;
    for (const r of rows) {
        const monthKey = monthKeyOf(r.date);
        const category = r.salary ? '' : findCategory(r.category, r.type);
        const title = r.salary ? '' : r.title.trim() || (r.type === 'income' ? INCOME_CATEGORIES : CATEGORIES).find(c => c.id === category).name;
        const key = keyOf(monthKey, r.salary ? 'salary' : r.type, r.date.d, r.amount, title);
        if (existing.get(key) > 0) {
            existing.set(key, existing.get(key) - 1);
            duplicates++;
            continue;
        }
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
        items.push({ ...r, title, monthKey, category, cardId, paid: r.paid == null ? markPaid : r.paid });
    }
    const months = [...new Set(items.map(i => i.monthKey))].sort();
    const sum = list => Math.round(list.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    return {
        items,
        duplicates,
        newCards,
        months,
        newMonths: months.filter(k => !state.months[k]),
        expenses: items.filter(i => i.type === 'expense').length,
        incomes: items.filter(i => i.type === 'income').length,
        salaryParts: items.filter(i => i.salary).length,
        expenseTotal: sum(items.filter(i => i.type === 'expense')),
        incomeTotal: sum(items.filter(i => i.type === 'income')),
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
        if (item.salary) {
            const part = item.usd
                ? { id: newId('sal'), amount: item.usd, currency: 'USD', uah: item.amount, day: item.date.d, received: !!item.paid }
                : { id: newId('sal'), amount: item.amount, currency: 'UAH', uah: item.amount, day: item.date.d, received: !!item.paid };
            if (item.cardId) part.cardId = item.cardId;
            if (!Array.isArray(month.salaryParts)) month.salaryParts = [];
            month.salaryParts.push(part);
        } else if (item.type === 'expense') {
            const e = { id: newId('exp'), title: item.title, category: item.category, amountUAH: item.amount, amountUSD: item.usd || 0, payDay: item.date.d, isPaid: !!item.paid };
            if (item.usd) e.currency = 'USD';
            if (item.cardId) e.cardId = item.cardId;
            month.expenses.push(e);
        } else {
            const inc = { id: newId('inc'), title: item.title, category: item.category, amountUAH: item.amount, day: item.date.d, isReceived: !!item.paid, isPreset: false, debtor: item.from || '' };
            if (item.usd) Object.assign(inc, { amountUSD: item.usd, currency: 'USD' });
            if (item.cardId) inc.cardId = item.cardId;
            month.incomes.push(inc);
        }
    }
    return state;
}
