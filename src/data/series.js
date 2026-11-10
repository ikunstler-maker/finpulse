/**
 * Серії регулярних платежів (формат 7).
 * Кожен платіж серії — звичайна витрата місяця з полями `repeat` (правило) і `seriesId`.
 * Платежі створюються наперед лише в місяцях, які вже існують; новий місяць отримує свої
 * платежі зі всіх серій. Розстрочка — правило з `count`; номер платежу — `installment`.
 */
import { dayBefore, isoDate, isUndated, ruleOccurrences } from '../calc.js';
import { newId } from './migrate.js';

const FIELDS = ['title', 'category', 'amountUAH', 'amountUSD', 'currency', 'cardId', 'noDate'];
const keyOf = m => `${m.year}-${String(m.month).padStart(2, '0')}`;
export const expenseDate = (month, e) => isoDate(month.year, month.month, Math.min(e.payDay || 1, new Date(month.year, month.month, 0).getDate()));

/** Платіж серії в місяці. */
function occurrence(fields, rule, seriesId, day, index) {
    const { isReserve, ...rest } = fields;
    const e = { id: newId('exp'), ...rest, payDay: day, isPaid: false, repeat: { ...rule }, seriesId };
    if (isReserve) e.reserve = { spends: [] };
    if (rule.count > 1) e.installment = { current: index + 1, total: rule.count };
    return e;
}

const pick = e => ({ ...Object.fromEntries(FIELDS.filter(f => e[f] !== undefined).map(f => [f, e[f]])), ...(e.reserve ? { isReserve: true } : {}) });

/**
 * Живі серії до місяця `uptoKey` включно: Map(seriesId → { rule, fields }) з останнім станом серії.
 * Серія жива, якщо її платіж є хоча б в одному з двох останніх наявних місяців, де він мав бути за правилом.
 * Так старі імпортовані рядки (наприклад, разова витрата торік, позначена «щомісяця») не повертаються,
 * а видалення одного платежу («лише цей») не зупиняє серію.
 */
export function collectSeries(state, uptoKey) {
    const keys = Object.keys(state.months).sort().filter(k => k <= uptoKey);
    const series = new Map();
    const present = new Map();
    for (const key of keys) {
        for (const e of state.months[key].expenses || []) {
            if (!(e.seriesId && e.repeat && typeof e.repeat === 'object')) continue;
            series.set(e.seriesId, { rule: e.repeat, fields: pick(e) });
            if (!present.has(e.seriesId)) present.set(e.seriesId, new Set());
            present.get(e.seriesId).add(key);
        }
    }
    for (const [id, { rule }] of series) {
        const expected = [];
        for (let i = keys.length - 1; i >= 0 && expected.length < 2; i--) {
            const m = state.months[keys[i]];
            if (ruleOccurrences(rule, m.year, m.month).length) expected.push(keys[i]);
        }
        if (expected.length && !expected.some(k => present.get(id).has(k))) series.delete(id);
    }
    return series;
}

/** Платежі серій для нового місяця (y, m). */
export function seriesExpensesFor(series, y, m) {
    const out = [];
    for (const [seriesId, { rule, fields }] of series) {
        for (const { day, index } of ruleOccurrences(rule, y, m)) out.push(occurrence(fields, rule, seriesId, day, index));
    }
    return out.sort((a, b) => a.payDay - b.payDay);
}

/**
 * Додає платежі серії в існуючі місяці від дати `fromIso` (не включаючи вже наявні того ж дня).
 * skipId — витрата, з якої серію створено (вона вже є платежем).
 */
export function fillSeries(state, seriesId, rule, fields, fromIso, skipId = null) {
    for (const key of Object.keys(state.months).sort()) {
        const month = state.months[key];
        if (`${key}-31` < fromIso) continue;
        const existing = new Set(month.expenses.filter(e => e.seriesId === seriesId).map(e => e.payDay));
        for (const { day, index } of ruleOccurrences(rule, month.year, month.month)) {
            if (isoDate(month.year, month.month, day) < fromIso || existing.has(day)) continue;
            month.expenses.push(occurrence(fields, rule, seriesId, day, index));
        }
        for (const e of month.expenses) {
            if (e.id === skipId) continue;
            if (e.seriesId === seriesId && !e.isPaid) {
                const { isReserve, ...rest } = fields;
                Object.assign(e, rest, { repeat: { ...rule } });
                if (!rest.noDate) delete e.noDate;
                if (isReserve && !e.reserve) e.reserve = { spends: [] };
                if (!isReserve) delete e.reserve;
            }
        }
    }
}

/** Прибрати несплачені платежі серії після дати (виключно) і завершити старе правило на дні перед `fromIso`. */
export function cutSeries(state, seriesId, fromIso, keepId = null) {
    const until = dayBefore(fromIso);
    for (const month of Object.values(state.months)) {
        month.expenses = month.expenses.filter(e => {
            if (e.seriesId !== seriesId || e.id === keepId) return true;
            const d = expenseDate(month, e);
            return d < fromIso || e.isPaid;
        });
        for (const e of month.expenses) {
            if (e.seriesId === seriesId && e.id !== keepId && e.repeat && typeof e.repeat === 'object') e.repeat = { ...e.repeat, until };
        }
    }
}

/**
 * Зберегти платіж серії з новим правилом «цей і наступні»: стара серія закінчується перед ним,
 * нова починається з нього (rule = null — платіж стає одноразовим).
 */
export function applyFromHere(state, monthKey, expense, rule) {
    const month = state.months[monthKey];
    const from = expenseDate(month, expense);
    if (expense.seriesId) cutSeries(state, expense.seriesId, from, expense.id);
    delete expense.repeat;
    delete expense.installment;
    delete expense.seriesId;
    if (!rule) return;
    const seriesId = newId('ser');
    expense.repeat = { ...rule };
    expense.seriesId = seriesId;
    const here = ruleOccurrences(rule, month.year, month.month).find(o => o.day === expense.payDay);
    if (rule.count > 1 && here) expense.installment = { current: here.index + 1, total: rule.count };
    fillSeries(state, seriesId, rule, pick(expense), from, expense.id);
    // той самий день, що й цей платіж, уже зайнятий ним; резерв чи «без дати» — сам представляє свій місяць
    month.expenses = month.expenses.filter(e => !(e.seriesId === seriesId && e.id !== expense.id && (e.payDay === expense.payDay || isUndated(expense))));
}

export const monthKeyOf = keyOf;
