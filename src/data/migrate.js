/**
 * ВЕРСІЇ ФОРМАТУ ДАНИХ
 * 3 — зарплата одним полем `incomeUAH` (+ `incomeUSDT`, `rate`).
 * 4 — зарплата частинами `salaryParts` (кожен вивід: сума, валюта, гривні, день, отримано).
 * Ключ localStorage не змінюється; старі дані й бекапи переносяться при завантаженні.
 */
import { averageSalaryRate, round2, salaryTotal } from '../calc.js';

export const DATA_VERSION = 4;

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

export function migrateState(state) {
    if (!state || !state.months) return state;
    for (const month of Object.values(state.months)) {
        if (!Array.isArray(month.salaryParts)) {
            month.salaryParts = (month.incomeUAH || 0) > 0 ? [legacySalaryPart(month)] : [];
        }
    }
    state.version = DATA_VERSION;
    return state;
}
