/**
 * Серії регулярних платежів (формат 7).
 * Кожен платіж серії — звичайна витрата місяця з полями `repeat` (правило) і `seriesId`.
 * Платежі створюються наперед лише в місяцях, які вже існують; новий місяць отримує свої
 * платежі зі всіх серій. Розстрочка — правило з `count`; номер платежу — `installment`.
 */
import { dayBefore, isoDate, ruleOccurrences } from '../calc.js';
import { newId } from './migrate.js';

const FIELDS = ['title', 'category', 'amountUAH', 'amountUSD', 'currency', 'cardId'];
const keyOf = m => `${m.year}-${String(m.month).padStart(2, '0')}`;
export const expenseDate = (month, e) => isoDate(month.year, month.month, Math.min(e.payDay || 1, new Date(month.year, month.month, 0).getDate()));

/** Платіж серії в місяці. */
function occurrence(fields, rule, seriesId, day, index) {
    const e = { id: newId('exp'), ...fields, payDay: day, isPaid: false, repeat: { ...rule }, seriesId };
    if (rule.count > 1) e.installment = { current: index + 1, total: rule.count };
    return e;
}

const pick = e => Object.fromEntries(FIELDS.filter(f => e[f] !== undefined).map(f => [f, e[f]]));

/** Останній відомий стан кожної серії до місяця `uptoKey` включно: Map(seriesId → { rule, fields }). */
export function collectSeries(state, uptoKey) {
    const series = new Map();
    for (const key of Object.keys(state.months).sort()) {
        if (key > uptoKey) break;
        for (const e of state.months[key].expenses || []) {
            if (e.seriesId && e.repeat && typeof e.repeat === 'object') series.set(e.seriesId, { rule: e.repeat, fields: pick(e) });
        }
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
            if (e.seriesId === seriesId && !e.isPaid) Object.assign(e, fields, { repeat: { ...rule } });
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
    // той самий день, що й цей платіж, уже зайнятий ним
    month.expenses = month.expenses.filter(e => !(e.seriesId === seriesId && e.id !== expense.id && e.payDay === expense.payDay));
}

export const monthKeyOf = keyOf;
