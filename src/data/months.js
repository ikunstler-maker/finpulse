import { carryOverBalance, getNextMonthKey, nextRecurrence } from '../calc.js';
import { monthName } from '../ui/format.js';
import { DATA_VERSION, newId } from './migrate.js';
import { ensurePresetIncomes } from './presets.js';

/**
 * Створює наступний місяць з поточного: повторювані витрати (щомісячні й розстрочки з наступним
 * номером платежу; не сплачені; одноразові не переносяться), ті самі частини ЗП
 * (ще не отримані), а заощадженнями стає вільний залишок поточного місяця.
 */
export function createNextMonth(state, key) {
    const cur = state.months[key];
    const nextKey = getNextMonthKey(key);
    if (!cur || state.months[nextKey]) return nextKey;
    const [y, m] = nextKey.split('-').map(Number);
    const expenses = cur.expenses.flatMap(e => {
        const rec = nextRecurrence(e);
        if (!rec) return [];
        const copy = { ...e, id: newId('exp'), isPaid: false };
        delete copy.repeat;
        delete copy.installment;
        return [{ ...copy, ...rec }];
    });
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
