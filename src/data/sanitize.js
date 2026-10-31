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

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** cardId лише безпечного вигляду; інакше запис просто без картки. */
function cleanCardId(out, rec) {
    if (!('cardId' in rec)) return;
    if (SAFE_ID.test(str(rec.cardId))) out.cardId = rec.cardId;
    else delete out.cardId;
}

/** repeat — лише так/ні; розстрочка — цілі числа 1…360, номер не більший за кількість. */
function cleanRecurrence(e) {
    if ('repeat' in e) {
        if (e.repeat) e.repeat = true;
        else delete e.repeat;
    }
    if ('installment' in e) {
        const i = e.installment;
        const current = Math.trunc(num(i?.current));
        const total = Math.trunc(num(i?.total));
        if (current >= 1 && total >= 1 && total <= 360 && current <= total) e.installment = { current, total };
        else delete e.installment;
    }
    return e;
}

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
    cleanCardId(out, rec);
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
            .filter(Boolean)
            .map(cleanRecurrence);
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
                    ...(SAFE_ID.test(str(x.cardId)) ? { cardId: x.cardId } : {}),
                }));
        }
        if ('goalMoves' in m) {
            out.goalMoves = (Array.isArray(m.goalMoves) ? m.goalMoves : [])
                .filter(x => x && typeof x === 'object' && SAFE_ID.test(str(x.goalId)))
                .map(x => ({ id: SAFE_ID.test(str(x.id)) ? x.id : newId('gm'), goalId: x.goalId, amount: num(x.amount), day: num(x.day, 1) }));
        }
        if ('secondPayDay' in m) out.secondPayDay = num(m.secondPayDay);
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
    if ('cards' in raw) {
        out.cards = (Array.isArray(raw.cards) ? raw.cards : [])
            .filter(c => c && typeof c === 'object')
            .map(c => {
                const card = { id: SAFE_ID.test(str(c.id)) ? c.id : newId('card'), name: str(c.name).slice(0, 40), color: COLOR.test(str(c.color)) ? c.color : '#5d6b7a' };
                const last4 = str(c.last4).replace(/\D/g, '').slice(-4);
                if (last4.length === 4) card.last4 = last4;
                return card;
            });
    }
    if ('goals' in raw) {
        out.goals = (Array.isArray(raw.goals) ? raw.goals : [])
            .filter(g => g && typeof g === 'object')
            .map(g => ({ id: SAFE_ID.test(str(g.id)) ? g.id : newId('goal'), name: str(g.name), target: num(g.target) }));
    }
    if ('appMode' in raw) out.appMode = raw.appMode === 'edit' ? 'edit' : 'view';
    return out;
}
