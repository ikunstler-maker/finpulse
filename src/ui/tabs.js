import { ui } from '../ui-state.js';
import { renderAnalyticsCharts } from './analytics.js';
import { renderIncomesTab } from './incomes-tab.js';

/**
 * ПЕРЕМИКАННЯ ГОЛОВНИХ ВКЛАДОК
 */
export function switchMainTab(tab) {
    ui.currentMainTab = tab;
    const bBtn = document.getElementById('main-tab-budget-btn');
    const incBtn = document.getElementById('main-tab-incomes-btn');
    const aBtn = document.getElementById('main-tab-analytics-btn');

    const bContent = document.getElementById('tab-budget-content');
    const incContent = document.getElementById('tab-incomes-content');
    const aContent = document.getElementById('tab-analytics-content');

    const activeClass = 'py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 bg-emerald-500 text-slate-950 shadow-sm truncate';
    const inactiveClass = 'py-1.5 px-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1 bg-slate-100 dark:bg-darkcard text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-darkborder hover:text-white truncate';

    bBtn.className = tab === 'budget' ? activeClass : inactiveClass;
    incBtn.className = tab === 'incomes' ? activeClass : inactiveClass;
    aBtn.className = tab === 'analytics' ? activeClass : inactiveClass;

    bContent.classList.add('hidden');
    incContent.classList.add('hidden');
    aContent.classList.add('hidden');

    if (tab === 'budget') {
        bContent.classList.remove('hidden');
    } else if (tab === 'incomes') {
        incContent.classList.remove('hidden');
        renderIncomesTab();
    } else if (tab === 'analytics') {
        aContent.classList.remove('hidden');
        renderAnalyticsCharts();
    }
}
