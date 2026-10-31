import { carryOverBalance, getNextMonthKey } from '../calc.js';
import { monthName } from '../ui/format.js';
import { newId } from './migrate.js';
import { ensurePresetIncomes } from './presets.js';

/**
 * Створює наступний місяць з поточного: ті самі витрати (не сплачені), ті самі частини ЗП
 * (ще не отримані), а заощадженнями стає вільний залишок поточного місяця.
 */
export function createNextMonth(state, key) {
    const cur = state.months[key];
    const nextKey = getNextMonthKey(key);
    if (!cur || state.months[nextKey]) return nextKey;
    const [y, m] = nextKey.split('-').map(Number);
    const expenses = cur.expenses.map(e => ({ ...e, id: newId('exp'), isPaid: false }));
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
    const month = { year: y, month: m, name: monthName(y, m), salaryDay: 1, incomeUAH: 0, rate, salaryParts: [], incomes: [], expenses: [] };
    ensurePresetIncomes(month);
    return { version: 5, cards: [], activeMonthKey: key, months: { [key]: month } };
}
