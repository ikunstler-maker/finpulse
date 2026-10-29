import { computeMonthSummary } from '../calc.js';
import { ensurePresetIncomes } from '../data/presets.js';
import { state } from '../state.js';
import { ui } from '../ui-state.js';
import { renderAnalyticsCharts } from './analytics.js';
import { renderCategorySummary, updateAppModeUI } from './expense-actions.js';
import { renderExpenses } from './expenses.js';
import { renderIncomesTab } from './incomes-tab.js';
import { renderBridgeSection } from './salary-bridge.js';
import { formatCurrency } from '../utils.js';

/**
 * ГОЛОВНИЙ РЕНДЕР
 */
export function renderAll() {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    ensurePresetIncomes(curMonth);

    if (curMonth.incomeUSDT === undefined) curMonth.incomeUSDT = curMonth.incomeUSD || 0;

    const sum = computeMonthSummary(state, state.activeMonthKey);
    const { itemsIncomeTotalUAH, totalIncomeUAH } = sum;

    document.getElementById('current-month-label').textContent = curMonth.name;
    document.getElementById('kpi-salary-day').textContent = curMonth.salaryDay;
    document.getElementById('kpi-income-display').textContent = `${formatCurrency(totalIncomeUAH)} ₴`;
    document.getElementById('kpi-income-usdt-display').textContent = itemsIncomeTotalUAH > 0 
        ? `ЗП: ${(curMonth.incomeUSDT || 0).toLocaleString('uk-UA')} ₮ + дод. ${formatCurrency(itemsIncomeTotalUAH)} ₴` 
        : `${(curMonth.incomeUSDT || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

    // Оновлення компактного банера доходів на вкладці бюджету
    const briefTotal = document.getElementById('incomes-brief-total');
    const briefBadge = document.getElementById('incomes-brief-badge');
    if (briefTotal) briefTotal.textContent = `${formatCurrency(totalIncomeUAH)} ₴`;
    if (briefBadge) {
        const activeCount = curMonth.incomes.filter(i => (i.amountUAH || 0) > 0).length;
        briefBadge.textContent = activeCount > 0 ? `ЗП + ${activeCount} надходжень` : `ЗП (${(curMonth.incomeUSDT||0)} ₮)`;
    }

    renderBridgeSection(sum.bridgeItems, sum.bridgeTotalUAH, sum.nextMonth);

    // Баланси в реальному часі
    const { inHandUAH, inHandUSD, remainingToPayUAH, freeBalanceUAH, freeBalanceUSD, totalObligations, pctPaid, pctPending, pendingCount, paidCount, overdueCount } = sum;

    document.getElementById('kpi-in-hand-uah').textContent = `${formatCurrency(inHandUAH)} ₴`;
    document.getElementById('kpi-in-hand-usd').textContent = `₮${inHandUSD.toFixed(2)}`;
    document.getElementById('kpi-remaining-to-pay-uah').textContent = `${formatCurrency(remainingToPayUAH)} ₴`;
    document.getElementById('kpi-free-balance-uah').textContent = `${formatCurrency(freeBalanceUAH)} ₴`;
    document.getElementById('kpi-free-balance-usd').textContent = `₮${freeBalanceUSD.toFixed(2)} у кінці циклу`;

    // Прогрес бар
    document.getElementById('progress-bar-paid').style.width = `${pctPaid}%`;
    document.getElementById('progress-bar-pending').style.width = `${pctPending}%`;
    document.getElementById('progress-spent-text').textContent = `${pctPaid}%`;
    document.getElementById('progress-total-text').textContent = `${formatCurrency(totalObligations)} ₴`;

    // Лічильники фільтрів
    document.getElementById('count-all').textContent = curMonth.expenses.length;
    document.getElementById('count-pending').textContent = pendingCount;
    document.getElementById('count-paid').textContent = paidCount;
    document.getElementById('count-overdue').textContent = overdueCount;

    // Банер прострочених чекбоксів
    const overdueBanner = document.getElementById('overdue-alert-banner');
    if (overdueCount > 0) {
        const nowDay = new Date().getDate();
        document.getElementById('overdue-count-badge').textContent = `${overdueCount} очікують`;
        document.getElementById('overdue-subtext').textContent = `Витрати мали відбутися до ${nowDay}-го числа`;
        overdueBanner.classList.remove('hidden');
    } else {
        overdueBanner.classList.add('hidden');
    }

    renderExpenses();
    updateAppModeUI();
    renderCategorySummary();

    if (ui.currentMainTab === 'incomes') {
        renderIncomesTab();
    } else if (ui.currentMainTab === 'analytics') {
        renderAnalyticsCharts();
    }
}
