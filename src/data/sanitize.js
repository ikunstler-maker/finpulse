/**
 * Перевірка даних із localStorage та файлу бекапу.
 * Значення, які потрапляють у розмітку (id в onclick, числа, категорії), приводяться
 * до безпечних типів; коректні дані не змінюються.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CATEGORY = /^[a-z_]{1,32}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const SAFE_CURRENCY = ['UAH', 'USD', 'USDT'];

const num = (v, fallback = 0) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const str = v => (v === undefined || v === null ? '' : String(v));

let counter = 0;
const newId = prefix => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

function cleanRecord(rec, prefix, fields) {
    if (!rec || typeof rec !== 'object') return null;
    const out = { ...rec };
    out.id = SAFE_ID.test(str(rec.id)) ? rec.id : newId(prefix);
    out.title = str(rec.title);
    out.category = SAFE_CATEGORY.test(str(rec.category)) ? rec.category : fields.defaultCategory;
    for (const f of fields.numbers) if (f in rec) out[f] = num(rec[f]);
    // Зберігаємо зміст позначок: isReceived «отримано, якщо не false», інші — truthy.
    for (const f of fields.booleans) {
        if (f in rec && rec[f] !== undefined) out[f] = f === 'isReceived' ? rec[f] !== false : !!rec[f];
    }
    if ('debtor' in rec) out.debtor = str(rec.debtor);
    if ('currency' in rec) out.currency = SAFE_CURRENCY.includes(rec.currency) ? rec.currency : 'USD';
    return out;
}

/** Повертає очищену копію стану або null, якщо це не дані FinPulse. */
export function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || !raw.months || typeof raw.months !== 'object') return null;

    const months = {};
    for (const [key, m] of Object.entries(raw.months)) {
        if (!MONTH_KEY.test(key) || !m || typeof m !== 'object') continue;
        const out = { ...m };
        for (const f of ['year', 'month', 'salaryDay', 'incomeUAH', 'incomeUSD', 'incomeUSDT', 'rate', 'savingsUAH', 'extraIncomeUAH']) {
            if (f in m) out[f] = num(m[f]);
        }
        out.name = str(m.name);
        out.expenses = (Array.isArray(m.expenses) ? m.expenses : [])
            .map(e => cleanRecord(e, 'exp', { defaultCategory: 'other', numbers: ['amountUAH', 'amountUSD', 'payDay'], booleans: ['isPaid'] }))
            .filter(Boolean);
        if ('salaryParts' in m) {
            out.salaryParts = (Array.isArray(m.salaryParts) ? m.salaryParts : [])
                .filter(x => x && typeof x === 'object')
                .map(x => ({
                    id: SAFE_ID.test(str(x.id)) ? x.id : newId('sal'),
                    amount: num(x.amount),
                    currency: SAFE_CURRENCY.includes(x.currency) ? x.currency : 'UAH',
                    uah: num(x.uah),
                    day: num(x.day, 1),
                    received: x.received !== false,
                }));
        }
        if ('incomes' in m) {
            out.incomes = (Array.isArray(m.incomes) ? m.incomes : [])
                .map(i => cleanRecord(i, 'inc', { defaultCategory: 'other_inc', numbers: ['amountUAH', 'day'], booleans: ['isReceived', 'isPreset'] }))
                .filter(Boolean);
        }
        months[key] = out;
    }

    const keys = Object.keys(months).sort();
    const activeMonthKey = months[raw.activeMonthKey] || keys.length === 0 ? raw.activeMonthKey : keys[keys.length - 1];
    const out = { ...raw, activeMonthKey, months };
    if ('version' in raw) out.version = num(raw.version);
    if ('appMode' in raw) out.appMode = raw.appMode === 'edit' ? 'edit' : 'view';
    return out;
}
