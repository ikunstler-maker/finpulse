import { categorySummary } from '../calc.js';
import { CATEGORIES } from '../data/categories.js';
import { saveState, state } from '../state.js';
import { ui } from '../ui-state.js';
import { renderExpenses } from './expenses.js';
import { renderAll } from './render.js';
import { formatCurrency, showToast } from '../utils.js';

/**
 * ЧЕКБОКСИ ТА ДІЇ З ВИТРАТАМИ
 */
export function toggleExpensePaid(id) {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    const item = curMonth.expenses.find(e => e.id === id);
    if (item) {
        item.isPaid = !item.isPaid;
        saveState();
        renderAll();
        showToast(item.isPaid ? `Сплачено: ${item.title}` : `Скасовано оплату: ${item.title}`, item.isPaid ? '✅' : '⏳');
    }
}

export function duplicateExpense(id) {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    const item = curMonth.expenses.find(e => e.id === id);
    if (item) {
        const newItem = {
            ...JSON.parse(JSON.stringify(item)),
            id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            isPaid: false
        };
        curMonth.expenses.push(newItem);
        saveState();
        renderAll();
        showToast(`Здубльовано: ${item.title}`, '📋');
    }
}

export function setStatusFilter(status) {
    ui.currentStatusFilter = status;
    document.querySelectorAll('.filter-status-btn').forEach(btn => {
        btn.className = 'filter-status-btn px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-darkcard text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-darkborder transition';
    });
    const activeBtn = document.getElementById(`filter-btn-${status}`);
    if (activeBtn) {
        activeBtn.className = 'filter-status-btn px-2.5 py-1 rounded-xl font-bold bg-emerald-500 text-slate-950 transition';
    }
    renderExpenses();
}

export function filterByOverdueOnly() {
    setStatusFilter('overdue');
}

export function onCategoryFilterChange() {
    ui.currentCategoryFilter = document.getElementById('category-filter').value;
    renderCategorySummary();
    renderExpenses();
}

export function renderCategorySummary() {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    const titleEl = document.getElementById('cat-summary-title');
    const iconEl = document.getElementById('cat-summary-icon');
    const totalEl = document.getElementById('cat-summary-total');
    const spentEl = document.getElementById('cat-summary-spent');
    const remEl = document.getElementById('cat-summary-remaining');
    const pctEl = document.getElementById('cat-summary-pct');
    const barEl = document.getElementById('cat-summary-progress');

    let items = curMonth.expenses;
    if (ui.currentCategoryFilter !== 'all') {
        const catObj = CATEGORIES.find(c => c.id === ui.currentCategoryFilter);
        titleEl.textContent = catObj ? catObj.name : 'Категорія';
        iconEl.textContent = catObj ? catObj.icon : '🏷️';
        items = items.filter(e => e.category === ui.currentCategoryFilter);
    } else {
        titleEl.textContent = 'Усі категорії місяця';
        iconEl.textContent = '📊';
    }

    const { total, spent, remaining: rem, pct } = categorySummary(items);

    totalEl.textContent = `${formatCurrency(total)} ₴`;
    spentEl.textContent = `${formatCurrency(spent)} ₴`;
    remEl.textContent = `${formatCurrency(rem)} ₴`;
    pctEl.textContent = `${pct}% сплачено`;
    barEl.style.width = `${pct}%`;
}

export function setAppMode(mode) {
    state.appMode = mode;
    saveState();
    updateAppModeUI();
    renderExpenses();
}

export function updateAppModeUI() {
    const viewBtn = document.getElementById('mode-view-btn');
    const editBtn = document.getElementById('mode-edit-btn');
    const actionsPanel = document.getElementById('edit-actions-panel');

    if (state.appMode === 'edit') {
        editBtn.className = 'px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold transition flex items-center gap-1 text-[11px] shadow-sm';
        viewBtn.className = 'px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 transition flex items-center gap-1 text-[11px]';
        actionsPanel.classList.remove('hidden');
    } else {
        viewBtn.className = 'px-2.5 py-1.5 rounded-lg bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white font-bold transition flex items-center gap-1 text-[11px] shadow-sm';
        editBtn.className = 'px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 transition flex items-center gap-1 text-[11px]';
        actionsPanel.classList.add('hidden');
    }
}
