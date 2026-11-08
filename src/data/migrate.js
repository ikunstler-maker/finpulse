/**
 * ВЕРСІЇ ФОРМАТУ ДАНИХ
 * 3 — зарплата одним полем `incomeUAH` (+ `incomeUSDT`, `rate`).
 * 4 — зарплата частинами `salaryParts` (кожен вивід: сума, валюта, гривні, день, отримано).
 * 5 — банківські картки `cards` ({ id, name, color, last4 }) і необов'язкове `cardId` у витратах,
 *     надходженнях і частинах ЗП. Старі записи — без картки.
 * 6 — повторення витрат: `repeat: true` (щомісяця) або `installment: { current, total }`
 *     (розстрочка, платіж N з M). Під час переходу всі наявні витрати стають щомісячними,
 *     бо раніше новий місяць копіював усі витрати.
 * 7 — гнучкі серії: `repeat: { unit, every, start, count?, until? }` і `seriesId` (платежі однієї серії).
 *     `repeat: true` → щомісяця з дати платежу; `installment` → щомісяця з `count` = кількість платежів;
 *     витрати з однаковою назвою й категорією — одна серія.
 * Ключ localStorage не змінюється; старі дані й бекапи переносяться при завантаженні.
 */
import { averageSalaryRate, isoDate, round2, salaryTotal, shiftBack } from '../calc.js';

export const DATA_VERSION = 7;

let counter = 0;
export const newId = prefix => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Одна частина зі старих полів місяця: точна сума в гривнях зберігається. */
export function legacySalaryPart(month) {
    const uah = round2(month.incomeUAH || 0);
    const foreign = month.incomeUSDT || month.incomeUSD || 0;
    const base = { id: newId('sal'), day: month.salaryDay || 8, received: true };
    if (foreign > 0) return { ...base, amount: foreign, currency: 'USDT', uah };
    return { ...base, amount: uah, currency: 'UAH', uah };
}

/** Оновлює старі поля з частин, щоб старі звіти й бекапи лишалися узгодженими. */
export function syncSalaryFields(month) {
    if (!Array.isArray(month.salaryParts)) return;
    month.incomeUAH = round2(salaryTotal(month));
    month.incomeUSDT = round2(month.salaryParts.filter(p => p.currency !== 'UAH').reduce((s, p) => s + (p.amount || 0), 0));
    month.incomeUSD = month.incomeUSDT;
    const avg = averageSalaryRate(month);
    if (avg > 0) month.rate = Math.round(avg * 10000) / 10000;
}

/** Формат 6 → 7: позначки повторення стають правилами серій. */
function toRules(month, seriesIds) {
    const y = month.year;
    const m = month.month;
    if (!(y > 0 && m >= 1 && m <= 12)) return;
    const last = new Date(y, m, 0).getDate();
    const seen = new Map(); // однакові рядки в одному місяці — окремі серії (1-ша «Кава», 2-га «Кава»…)
    for (const e of month.expenses || []) {
        if (e.repeat && typeof e.repeat === 'object') continue;
        const date = isoDate(y, m, Math.min(Math.max(1, e.payDay || 1), last));
        const inst = e.installment;
        let rule = null;
        if (inst && inst.total > 0) rule = { unit: 'month', every: 1, start: shiftBack(date, 'month', 1, (inst.current || 1) - 1), count: inst.total };
        else if (e.repeat === true) rule = { unit: 'month', every: 1, start: date };
        if (!rule) {
            delete e.repeat;
            continue;
        }
        const base = `${String(e.title || '').trim().toLowerCase()}|${e.category || ''}|${rule.count || ''}`;
        const nth = seen.get(base) || 0;
        seen.set(base, nth + 1);
        const key = `${base}#${nth}`;
        if (!seriesIds.has(key)) seriesIds.set(key, newId('ser'));
        e.repeat = rule;
        e.seriesId = seriesIds.get(key);
    }
}

export function migrateState(state) {
    if (!state || !state.months) return state;
    const before6 = !(state.version >= 6);
    const before7 = !(state.version >= 7);
    const seriesIds = new Map();
    for (const key of Object.keys(state.months).sort()) {
        const month = state.months[key];
        if (!month || typeof month !== 'object') continue;
        if (before6) {
            for (const e of month.expenses || []) if (!('repeat' in e) && !e.installment) e.repeat = true;
        }
        if (before7) toRules(month, seriesIds);
        if (!Array.isArray(month.salaryParts)) {
            month.salaryParts = (month.incomeUAH || 0) > 0 ? [legacySalaryPart(month)] : [];
        }
    }
    if (!Array.isArray(state.cards)) state.cards = [];
    state.version = DATA_VERSION;
    return state;
}
