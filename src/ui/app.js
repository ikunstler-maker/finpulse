import { getNextMonthKey } from '../calc.js';
import { t } from '../i18n/index.js';
import { activeMonth, onStateChange, state } from '../state.js';
import { budgetView, openExpenseSheet, openFiltersSheet, resetFilters, setBudgetRerender, togglePaid } from './budget.js';
import { openCardSheet, openCardsSheet } from './cards.js';
import { openGoalSheet, openGoalsSheet, openMoveSheet } from './goals.js';
import { openImportSheet } from './import.js';
import { dayMonth } from './format.js';
import { incomesView, openIncomeSheet, openPartSheet, openSalaryDaySheet, takeSavingsFromPrevious, toggleIncome, togglePart } from './incomes.js';
import {
    createNextMonthFromActive, openBackupSheet, openMonthsSheet, openMoreSheet, openReconcileSheet,
    openDensitySheet, openThemeSheet, selectMonth, stepMonth,
} from './more.js';
import { reportsView } from './reports.js';
import { notifyOnOpen, openRemindersSheet } from './reminders.js';
import { closeSheet, sheetOpen } from './sheet.js';
import { onSyncStatus } from '../sync/controller.js';
import { chipAction, openEncryption, syncChip } from './sync-ui.js';
import { demoKeep, demoStartFresh, openWelcome } from './welcome.js';
import { isFirstRun } from '../state.js';
import { view } from './view-state.js';

const $ = id => document.getElementById(id);

function cycleRange(m) {
    const next = state.months[getNextMonthKey(state.activeMonthKey)];
    const endMonth = m.month === 12 ? 1 : m.month + 1;
    const endDay = Math.max(1, (next?.salaryDay || m.salaryDay) - 1);
    return `${dayMonth(m.month, m.salaryDay)} – ${dayMonth(endMonth, endDay)}`;
}

function renderChip() {
    const chip = $('sync-chip');
    const c = syncChip();
    chip.hidden = !c;
    if (!c) return;
    chip.textContent = c.text;
    chip.dataset.state = c.state;
}

export function render() {
    renderChip();
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
    const searching = document.activeElement?.id === 'expense-search';
    main.className = `view view-${view.tab}`;
    main.innerHTML = view.tab === 'budget' ? budgetView() : view.tab === 'incomes' ? incomesView() : reportsView();
    if (searching) {
        const input = $('expense-search');
        input?.focus({ preventScroll: true });
        input?.setSelectionRange(input.value.length, input.value.length);
    }
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
    'filter-category': el => { view.filter.categories = el.dataset.category === 'all' ? [] : [el.dataset.category]; render(); },
    'open-filters': () => openFiltersSheet(),
    'reset-filters': () => resetFilters(),
    'open-goals': () => openGoalsSheet(),
    'new-goal': () => openGoalSheet(),
    'edit-goal': el => openGoalSheet(el.dataset.id),
    'move-goal': el => openMoveSheet(el.dataset.id),
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
    'open-density': () => openDensitySheet(),
    'open-cards': () => openCardsSheet(),
    'new-card': () => openCardSheet(),
    'edit-card': el => openCardSheet(el.dataset.id),
    'open-import': () => openImportSheet(),
    'open-reminders': () => openRemindersSheet(render),
    'open-backup': () => openBackupSheet(),
    'open-encryption': () => openEncryption(),
    'sync-chip': () => chipAction(),
    'demo-start': () => demoStartFresh(),
    'demo-keep': () => demoKeep(),
};

function applyStaticTexts() {
    document.title = t('app.title');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

export function startApp() {
    applyStaticTexts();
    onStateChange(render);
    onSyncStatus(renderChip);
    setBudgetRerender(render);
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const fn = actions[el.dataset.action];
        if (fn) fn(el);
    });
    document.addEventListener('change', e => {
        const el = e.target.closest('[data-action-input]');
        if (!el || el.dataset.actionInput === 'search') return;
        if (el.dataset.actionInput === 'report-from') view.reportFrom = el.value;
        if (el.dataset.actionInput === 'report-to') view.reportTo = el.value;
        render();
    });
    document.addEventListener('input', e => {
        if (e.target.dataset?.actionInput !== 'search') return;
        view.filter.search = e.target.value;
        render();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && sheetOpen()) closeSheet();
    });
    render();
    if (isFirstRun) openWelcome();
    else notifyOnOpen();
}
