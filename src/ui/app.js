import { getNextMonthKey } from '../calc.js';
import { t } from '../i18n/index.js';
import { activeMonth, onStateChange, state } from '../state.js';
import { budgetView, openExpenseSheet, togglePaid } from './budget.js';
import { dayMonth } from './format.js';
import { incomesView, openIncomeSheet, openPartSheet, openSalaryDaySheet, takeSavingsFromPrevious, toggleIncome, togglePart } from './incomes.js';
import {
    applyTheme, createNextMonthFromActive, openBackupSheet, openMonthsSheet, openMoreSheet, openReconcileSheet,
    openThemeSheet, selectMonth, stepMonth,
} from './more.js';
import { reportsView } from './reports.js';
import { closeSheet, sheetOpen } from './sheet.js';
import { view } from './view-state.js';

const $ = id => document.getElementById(id);

function cycleRange(m) {
    const next = state.months[getNextMonthKey(state.activeMonthKey)];
    const endMonth = m.month === 12 ? 1 : m.month + 1;
    const endDay = Math.max(1, (next?.salaryDay || m.salaryDay) - 1);
    return `${dayMonth(m.month, m.salaryDay)} – ${dayMonth(endMonth, endDay)}`;
}

export function render() {
    const m = activeMonth();
    $('cycle-name').textContent = m.name;
    $('cycle-range').textContent = cycleRange(m);
    document.querySelectorAll('[data-tab]').forEach(b => {
        if (b.dataset.tab === view.tab) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
    const fab = $('fab');
    fab.hidden = view.tab === 'reports';
    $('fab-label').textContent = view.tab === 'incomes' ? t('fab.income') : t('fab.expense');
    const main = $('view');
    main.className = `view view-${view.tab}`;
    main.innerHTML = view.tab === 'budget' ? budgetView() : view.tab === 'incomes' ? incomesView() : reportsView();
}

function setDefaultCustomRange() {
    const m = activeMonth();
    const next = state.months[getNextMonthKey(state.activeMonthKey)];
    const pad = n => String(n).padStart(2, '0');
    const endY = m.month === 12 ? m.year + 1 : m.year;
    const endM = m.month === 12 ? 1 : m.month + 1;
    view.reportFrom = `${m.year}-${pad(m.month)}-${pad(m.salaryDay)}`;
    view.reportTo = `${endY}-${pad(endM)}-${pad(Math.max(1, (next?.salaryDay || m.salaryDay) - 1))}`;
}

const actions = {
    'close-sheet': () => closeSheet(),
    'tab': el => { view.tab = el.dataset.tab; closeSheet(); render(); window.scrollTo({ top: 0 }); },
    'more': () => openMoreSheet(),
    'fab': () => (view.tab === 'incomes' ? openIncomeSheet(null, 'extra') : openExpenseSheet()),
    'add-expense': () => openExpenseSheet(),
    'toggle-paid': el => togglePaid(el.dataset.month, el.dataset.id),
    'edit-expense': el => openExpenseSheet(el.dataset.month, el.dataset.id),
    'filter-category': el => { view.category = el.dataset.category; render(); },
    'toggle-part': el => togglePart(el.dataset.id),
    'edit-part': el => openPartSheet(el.dataset.id),
    'add-part': () => openPartSheet(),
    'salary-day': () => openSalaryDaySheet(),
    'toggle-income': el => toggleIncome(el.dataset.id),
    'edit-income': el => openIncomeSheet(el.dataset.id),
    'add-income': el => openIncomeSheet(null, el.dataset.category),
    'take-savings': () => takeSavingsFromPrevious(),
    'report-period': el => { view.reportPeriod = el.dataset.period; if (view.reportPeriod === 'custom' && !view.reportFrom) setDefaultCustomRange(); render(); },
    'report-mode': el => { view.reportMode = el.dataset.mode; render(); },
    'prev-month': () => stepMonth(-1),
    'next-month': () => stepMonth(1),
    'open-months': () => openMonthsSheet(),
    'select-month': el => selectMonth(el.dataset.month),
    'create-next-month': () => createNextMonthFromActive(),
    'open-reconcile': () => openReconcileSheet(),
    'open-theme': () => openThemeSheet(),
    'open-backup': () => openBackupSheet(),
};

function applyStaticTexts() {
    document.title = t('app.title');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

export function startApp() {
    applyTheme();
    applyStaticTexts();
    onStateChange(render);
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const fn = actions[el.dataset.action];
        if (fn) fn(el);
    });
    document.addEventListener('change', e => {
        const el = e.target.closest('[data-action-input]');
        if (!el) return;
        if (el.dataset.actionInput === 'report-from') view.reportFrom = el.value;
        if (el.dataset.actionInput === 'report-to') view.reportTo = el.value;
        render();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && sheetOpen()) closeSheet();
    });
    render();
}
