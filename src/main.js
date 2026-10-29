import './styles.css';
import { getNextMonthKey, getPrevMonthKey, isExpenseOverdue } from './calc.js';
import { getDefaultInitialState } from './data/demo.js';
import { ensurePresetIncomes } from './data/presets.js';
import { loadState, saveState } from './state.js';
import { applyCustomDateRange, initDateRangeInputs, renderAnalyticsCharts, setAnalyticsMode, setAnalyticsPeriod, setCustomPreset } from './ui/analytics.js';
import { closeBackupModal, exportDataBackup, importDataBackup, openBackupModal, resetToDemoData } from './ui/backup.js';
import { duplicateExpense, filterByOverdueOnly, onCategoryFilterChange, renderCategorySummary, setAppMode, setStatusFilter, toggleExpensePaid, updateAppModeUI } from './ui/expense-actions.js';
import { renderExpenseRow, renderExpenses } from './ui/expenses.js';
import { initTheme, populateCategoryDropdowns, toggleTheme, updateLiveClock } from './ui/header.js';
import { renderIncomeRow, renderIncomesTab } from './ui/incomes-tab.js';
import { renderIncomesSection, toggleBridgeDetails, toggleIncomesDetails } from './ui/incomes.js';
import { makeAmountEditable, makeCategoryEditable, makeDayEditable, makeTitleEditable } from './ui/inline-edit.js';
import { closeExpenseModal, deleteCurrentExpense, duplicateCurrentExpense, onUahInput, onUsdInput, openExpenseModal, saveExpense, toggleCurrencyMode } from './ui/modals/expense.js';
import { autofillSavingsDirectly, autofillSavingsIntoModal, closeIncomeItemModal, deleteCurrentIncomeItem, makeIncomeAmountEditable, makeIncomeDayEditable, onIncomeModalCategoryChange, openIncomeItemModal, saveIncomeItem, toggleIncomeReceived } from './ui/modals/income-item.js';
import { calculateReconciliation, closeReconciliationModal, createExpenseFromDiscrepancy, openReconciliationModal } from './ui/modals/reconciliation.js';
import { addMultiCalcRow, applyMultiCalcSum, autoFillSavingsFromPrevMonth, closeSalarySettingsModal, convertSalaryFromUSDT, onManualUahChange, openSalarySettingsModal, recalcUAHFromRate, saveSalarySettings, toggleMultiPartCalc, updateEffectiveRateBadge } from './ui/modals/salary.js';
import { cloneMonthToNext, nextMonth, prevMonth, selectMonthKey, toggleMonthDropdown } from './ui/months.js';
import { renderAll } from './ui/render.js';
import { renderBridgeSection } from './ui/salary-bridge.js';
import { switchMainTab } from './ui/tabs.js';
import { formatCurrency, showToast } from './utils.js';

// The markup calls these from inline on*="" attributes, so they must stay global.
Object.assign(window, {
    ensurePresetIncomes,
    getDefaultInitialState,
    loadState,
    saveState,
    updateLiveClock,
    initTheme,
    toggleTheme,
    populateCategoryDropdowns,
    initDateRangeInputs,
    switchMainTab,
    renderAll,
    renderIncomesTab,
    renderIncomeRow,
    isExpenseOverdue,
    renderBridgeSection,
    toggleIncomesDetails,
    renderIncomesSection,
    toggleBridgeDetails,
    renderExpenses,
    renderExpenseRow,
    makeTitleEditable,
    makeDayEditable,
    makeCategoryEditable,
    makeAmountEditable,
    toggleExpensePaid,
    duplicateExpense,
    setStatusFilter,
    filterByOverdueOnly,
    onCategoryFilterChange,
    renderCategorySummary,
    setAppMode,
    updateAppModeUI,
    prevMonth,
    nextMonth,
    toggleMonthDropdown,
    selectMonthKey,
    getNextMonthKey,
    getPrevMonthKey,
    cloneMonthToNext,
    setAnalyticsMode,
    setAnalyticsPeriod,
    applyCustomDateRange,
    setCustomPreset,
    renderAnalyticsCharts,
    openSalarySettingsModal,
    closeSalarySettingsModal,
    convertSalaryFromUSDT,
    recalcUAHFromRate,
    onManualUahChange,
    updateEffectiveRateBadge,
    toggleMultiPartCalc,
    addMultiCalcRow,
    applyMultiCalcSum,
    autoFillSavingsFromPrevMonth,
    saveSalarySettings,
    openIncomeItemModal,
    onIncomeModalCategoryChange,
    autofillSavingsDirectly,
    autofillSavingsIntoModal,
    closeIncomeItemModal,
    saveIncomeItem,
    deleteCurrentIncomeItem,
    makeIncomeAmountEditable,
    makeIncomeDayEditable,
    toggleIncomeReceived,
    openExpenseModal,
    closeExpenseModal,
    toggleCurrencyMode,
    onUahInput,
    onUsdInput,
    saveExpense,
    deleteCurrentExpense,
    duplicateCurrentExpense,
    openReconciliationModal,
    closeReconciliationModal,
    calculateReconciliation,
    createExpenseFromDiscrepancy,
    openBackupModal,
    closeBackupModal,
    exportDataBackup,
    importDataBackup,
    resetToDemoData,
    formatCurrency,
    showToast,
});

/**
 * ІНІЦІАЛІЗАЦІЯ
 */
window.onload = function() {
    initTheme();
    updateLiveClock();
    setInterval(updateLiveClock, 60000);

    populateCategoryDropdowns();
    initDateRangeInputs();
    renderAll();
};
