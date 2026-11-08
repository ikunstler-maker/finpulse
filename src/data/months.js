import { carryOverBalance, getNextMonthKey } from '../calc.js';
import { monthName } from '../ui/format.js';
import { DATA_VERSION, newId } from './migrate.js';
import { ensurePresetIncomes } from './presets.js';
import { collectSeries, seriesExpensesFor } from './series.js';

/**
 * Створює наступний місяць з поточного: платежі всіх регулярних серій, що припадають на нього
 * (щотижневі — кілька разів, «кожні 50 днів» — коли настане; розстрочки — з номером платежу;
 * одноразові не переносяться), ті самі частини ЗП
 * (ще не отримані), а заощадженнями стає вільний залишок поточного місяця.
 */
export function createNextMonth(state, key) {
    const cur = state.months[key];
    const nextKey = getNextMonthKey(key);
    if (!cur || state.months[nextKey]) return nextKey;
    const [y, m] = nextKey.split('-').map(Number);
    const expenses = seriesExpensesFor(collectSeries(state, key), y, m);
    const savings = carryOverBalance(cur, expenses, cur.salaryDay);
    const next = {
        year: y,
        month: m,
        name: monthName(y, m),
        salaryDay: cur.salaryDay,
        ...(cur.secondPayDay ? { secondPayDay: cur.secondPayDay } : {}),
        incomeUAH: cur.incomeUAH,
        incomeUSD: cur.incomeUSD,
        incomeUSDT: cur.incomeUSDT,
        rate: cur.rate,
        salaryParts: (cur.salaryParts || []).map(p => ({ ...p, id: newId('sal'), received: false })),
        savingsUAH: savings,
        extraIncomeUAH: 0,
        incomes: [],
        expenses,
    };
    ensurePresetIncomes(next);
    state.months[nextKey] = next;
    return nextKey;
}

/** Порожній бюджет на поточний місяць (для нових людей). */
export function createEmptyState(today = new Date(), rate = 41.5) {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const month = { year: y, month: m, name: monthName(y, m), salaryDay: 1, incomeUAH: 0, rate, savingsUAH: 0, extraIncomeUAH: 0, salaryParts: [], incomes: [], expenses: [] };
    ensurePresetIncomes(month);
    return { version: DATA_VERSION, cards: [], activeMonthKey: key, months: { [key]: month } };
}

/**
 * Чи є в бюджеті власні записи людини (не приклад і не порожній новий бюджет).
 * Потрібно, щоб попередити перед заміною даних цього браузера даними з Диска.
 */
export function hasUserData(state) {
    if (!state || state.demo) return false;
    if ((state.cards || []).length || (state.goals || []).length) return true;
    return Object.values(state.months || {}).some(m => m && (
        (m.expenses || []).length
        || (m.incomes || []).some(i => (i.amountUAH || 0) > 0)
        || (m.salaryParts || []).some(p => (p.uah || 0) > 0)
        || (m.goalMoves || []).length
    ));
}
