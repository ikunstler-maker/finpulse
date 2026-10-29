import { categorySummary, computeMonthSummary, DEFAULT_RATE, filterExpenses, getNextMonthKey, isExpenseOverdue, payPeriods, salaryTotal } from '../calc.js';
import { CATEGORIES } from '../data/categories.js';
import { newId } from '../data/migrate.js';
import { plural, t } from '../i18n/index.js';
import { activeMonth, state, update } from '../state.js';
import { currencyFields, readCurrency, wireCurrency } from './currency.js';
import { dateOf, dayMonth, dayMonthLong, daysFrom, esc, foreign, money, money0, monthName } from './format.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';
import { goalsCard } from './goals.js';
import { view } from './view-state.js';

const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES.find(c => c.id === 'other');

/* ---------- Підсумок ---------- */

export function summaryCard(today = new Date()) {
    const m = activeMonth();
    const s = computeMonthSummary(state, state.activeMonthKey, today);
    const next = s.nextMonth;
    const thisMonthLeft = Math.max(0, s.remainingToPayUAH - s.bridgeTotalUAH);
    const pct = x => `${(x / Math.max(1, s.totalObligations) * 100).toFixed(1)}%`;
    const activeIncomes = (m.incomes || []).filter(i => (i.amountUAH || 0) > 0).length;
    const salaryLine = t('summary.incomeSub', { salary: money0(salaryTotal(m)), count: activeIncomes, items: plural(activeIncomes, t('summary.incomeItems').split(',')) });
    const bridgeLine = s.bridgeTotalUAH > 0 && next
        ? `<span class="sub">${t('summary.toPaySub', { amount: money(s.bridgeTotalUAH), date: dayMonthLong(next.month, next.salaryDay) })}</span>`
        : '';
    return `
        <section class="summary" aria-label="${t('summary.label')}">
            <div>
                <div class="label">${t('summary.inHand')}</div>
                <div class="big num" id="kpi-in-hand">${money0(s.inHandUAH)}</div>
                <div class="label light">${t('summary.inHandSub', { received: money0(s.totalReceivedIncomeUAH), paid: money0(s.totalPaidUAH) })}</div>
            </div>
            <div>
                <div class="bar" role="img" aria-label="${t('summary.barLabel', { pct: s.pctPaid })}">
                    <span class="paid" style="width:${pct(s.totalPaidUAH)}"></span>
                    <span class="left" style="width:${pct(thisMonthLeft)}"></span>
                    <span class="bridge" style="width:${pct(s.bridgeTotalUAH)}"></span>
                </div>
                <div class="bar-legend">
                    <span><i class="paid"></i>${t('summary.legendPaid')}</span>
                    <span><i class="left"></i>${t('summary.legendLeft')}</span>
                    ${next ? `<span><i class="bridge"></i>${t('summary.legendBridge', { date: dayMonthLong(next.month, next.salaryDay) })}</span>` : ''}
                </div>
            </div>
            <div class="rows">
                <div class="rowline"><span>${t('summary.income')}<span class="sub">${salaryLine}</span></span><span class="val num" id="kpi-income">${money(s.totalIncomeUAH)}</span></div>
                <div class="rowline"><span>${t('summary.toPay')}${bridgeLine}</span><span class="val num" id="kpi-to-pay">${money(s.remainingToPayUAH)}</span></div>
                ${s.goalsAllocatedUAH ? `<div class="rowline"><span>${t('summary.goals')}<span class="sub">${t('summary.goalsSub')}</span></span><span class="val num" id="kpi-goals">${money(s.goalsAllocatedUAH)}</span></div>` : ''}
                <div class="rowline free"><span>${t('summary.free')}<span class="sub">${t('summary.freeSub')}</span></span><span class="val num ${s.freeBalanceUAH < 0 ? 'neg' : ''}" id="kpi-free">${money(s.freeBalanceUAH)}</span></div>
            </div>
            ${periodsBlock()}
            <p class="local-note">${t('summary.localNote')}</p>
        </section>`;
}

function periodsBlock() {
    const periods = payPeriods(state, state.activeMonthKey);
    if (!periods) return '';
    return `
        <div class="periods" id="pay-periods">
            <div class="label">${t('periods.title')}</div>
            <div class="rows">
                ${periods.map((p, i) => `
                    <div class="rowline">
                        <span>${t(i === 0 ? 'periods.first' : 'periods.second', { from: dayMonth(p.from.month, p.from.day), to: dayMonth(p.to.month, p.to.day) })}
                            <span class="sub num">${t('periods.sub', { income: money0(p.income), planned: money0(p.planned) })}</span></span>
                        <span class="val num ${p.balance < 0 ? 'neg' : ''}">${money(p.balance)}</span>
                    </div>`).join('')}
            </div>
            <p class="local-note">${t('periods.hint')}</p>
        </div>`;
}

/* ---------- Список витрат ---------- */

function expenseRow(e, m, monthKey, today, { bridge = false } = {}) {
    const c = catOf(e.category);
    const overdue = !e.isPaid && isExpenseOverdue(e, m, today);
    const late = overdue ? -daysFrom(today, dateOf(m, e.payDay)) : 0;
    const chips = [
        overdue && late > 0 ? `<span class="chip late">${t('budget.overdueDays', { n: late })}</span>` : '',
        overdue && late <= 0 ? `<span class="chip late">${t('budget.overdue')}</span>` : '',
        bridge && !e.isPaid ? `<span class="chip bridge">${t('budget.bridgeChip')}</span>` : '',
    ].join('');
    const foreignAmount = e.amountUSD > 0 ? `<span class="num">${foreign(e.amountUSD, e.currency || 'USD')}</span>` : '';
    return `
        <div class="item expense-row ${e.isPaid ? 'paid' : ''} ${overdue ? 'overdue' : ''}">
            <button class="check" role="checkbox" aria-checked="${!!e.isPaid}" data-action="toggle-paid" data-month="${monthKey}" data-id="${e.id}"
                aria-label="${esc(t(e.isPaid ? 'budget.markUnpaid' : 'budget.markPaid', { title: e.title }))}"><span></span></button>
            <button class="item-main" data-action="edit-expense" data-month="${monthKey}" data-id="${e.id}">
                <span class="item-text">
                    <span class="item-title">${esc(e.title)}</span>
                    <span class="item-meta"><span class="num">${dayMonth(m.month, e.payDay)}</span><span><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span>${chips}</span>
                </span>
                <span class="amount"><strong class="num">${money(e.amountUAH)}</strong>${foreignAmount}</span>
            </button>
        </div>`;
}

function group(id, title, rows, sum, hint = '') {
    if (!rows.length) return '';
    return `
        <section class="section group-${id}" data-group="${id}">
            <div class="section-head"><h2>${title}</h2><span class="meta num">${rows.length} · ${money(sum)}</span></div>
            ${hint ? `<p class="group-hint">${hint}</p>` : ''}
            <div class="list">${rows.join('')}</div>
        </section>`;
}

function categoryChips(categoryIds) {
    if (categoryIds.length < 2) return '';
    const active = view.filter.categories.length === 1 ? view.filter.categories[0] : view.filter.categories.length ? 'many' : 'all';
    const chip = (id, name, color) => `
        <button data-action="filter-category" data-category="${id}" aria-pressed="${active === id}">
            ${color ? `<i class="dot" style="background:${color}"></i>` : ''}${esc(name)}</button>`;
    return `
        <div class="chips filter-chips" role="group" aria-label="${t('budget.filterLabel')}">
            ${chip('all', t('budget.allCategories'))}
            ${categoryIds.map(id => { const c = catOf(id); return chip(id, c.name, c.color); }).join('')}
        </div>`;
}

const flatMode = f => f.status !== 'all' || f.sort !== 'date' || f.search.trim() !== '' || f.min != null || f.max != null || f.categories.length > 1;
export const activeFilterCount = f => [f.status !== 'all', f.sort !== 'date', f.min != null || f.max != null, f.categories.length > 1].filter(Boolean).length;

function toolbar() {
    const n = activeFilterCount(view.filter);
    return `
        <div class="toolbar">
            <label class="search">
                <span class="visually-hidden">${t('filters.search')}</span>
                <input id="expense-search" type="search" placeholder="${t('filters.searchPlaceholder')}" value="${esc(view.filter.search)}" data-action-input="search" autocomplete="off">
            </label>
            <button class="btn ghost filter-btn" data-action="open-filters" aria-label="${t('filters.open')}">${t('filters.button')}${n ? ` <span class="badge">${n}</span>` : ''}</button>
        </div>`;
}

export function budgetView(today = new Date()) {
    const key = state.activeMonthKey;
    const m = activeMonth();
    const nextKey = getNextMonthKey(key);
    const next = state.months[nextKey];
    const f = view.filter;
    const bridgeItems = next ? next.expenses.filter(e => e.payDay < next.salaryDay) : [];

    const presentCats = [...new Set([...m.expenses, ...bridgeItems].map(e => e.category))]
        .sort((a, b) => CATEGORIES.findIndex(c => c.id === a) - CATEGORIES.findIndex(c => c.id === b));
    f.categories = f.categories.filter(c => presentCats.includes(c));
    const inFilter = e => !f.categories.length || f.categories.includes(e.category);

    const rows = (list, month, mk, opts) => list.map(e => expenseRow(e, month, mk, today, opts));
    const sum = list => list.reduce((s, e) => s + e.amountUAH, 0);

    let filterNote = '';
    if (f.categories.length === 1) {
        const cs = categorySummary(m.expenses, f.categories[0]);
        filterNote = `<p class="filter-note num">${t('budget.filterNote', { total: money(cs.total), spent: money(cs.spent), remaining: money(cs.remaining) })}</p>`;
    }

    let content;
    if (flatMode(f)) {
        const all = [
            ...m.expenses.map(e => ({ e, month: m, monthKey: key, bridge: false })),
            ...bridgeItems.map(e => ({ e, month: next, monthKey: nextKey, bridge: true })),
        ];
        const found = filterExpenses(all, f, today);
        content = `
            <section class="section" data-group="results">
                <div class="section-head"><h2>${t('filters.results')}</h2><span class="meta num">${found.length} · ${money(found.reduce((s, x) => s + x.e.amountUAH, 0))}</span></div>
                <div class="list">${found.map(x => expenseRow(x.e, x.month, x.monthKey, today, { bridge: x.bridge })).join('') || `<p class="empty">${t('filters.nothing')}</p>`}</div>
                <button class="link-btn" data-action="reset-filters">${t('filters.reset')}</button>
            </section>`;
    } else {
        const sorted = [...m.expenses].filter(inFilter).sort((a, b) => a.payDay - b.payDay);
        const open = sorted.filter(e => !e.isPaid);
        const overdue = open.filter(e => isExpenseOverdue(e, m, today));
        const notOverdue = open.filter(e => !overdue.includes(e));
        const soon = notOverdue.filter(e => daysFrom(today, dateOf(m, e.payDay)) <= 7);
        const later = notOverdue.filter(e => !soon.includes(e));
        const paid = sorted.filter(e => e.isPaid);
        const bridge = bridgeItems.filter(inFilter).sort((a, b) => a.payDay - b.payDay);
        content = [
            group('overdue', t('budget.groups.overdue'), rows(overdue, m, key), sum(overdue), t('budget.groups.overdueHint')),
            group('soon', t('budget.groups.soon'), rows(soon, m, key), sum(soon)),
            group('later', t('budget.groups.later'), rows(later, m, key), sum(later)),
            next ? group('bridge', t('budget.groups.bridge', { date: dayMonthLong(next.month, next.salaryDay) }), rows(bridge, next, nextKey, { bridge: true }), sum(bridge.filter(e => !e.isPaid)), t('budget.groups.bridgeHint')) : '',
            group('paid', t('budget.groups.paid'), rows(paid, m, key), sum(paid)),
        ].join('');
    }

    const empty = m.expenses.length === 0
        ? `<div class="list empty-state"><p>${t('budget.empty')}</p><button class="btn primary" data-action="add-expense">${t('budget.addFirst')}</button></div>`
        : '';

    return `
        <div class="rail">${summaryCard(today)}${goalsCard()}</div>
        <div class="main-col">
            ${m.expenses.length ? toolbar() : ''}
            ${categoryChips(presentCats)}
            ${filterNote}
            ${empty}
            ${content}
        </div>`;
}

/* ---------- Фільтри ---------- */

const STATUSES = ['all', 'unpaid', 'overdue', 'soon', 'bridge', 'paid'];
const SORTS = ['date', 'amountDesc', 'amountAsc', 'alpha'];

export function openFiltersSheet() {
    const m = activeMonth();
    const f = view.filter;
    const next = state.months[getNextMonthKey(state.activeMonthKey)];
    const statuses = [...STATUSES, ...(m.secondPayDay > m.salaryDay ? ['period1', 'period2'] : [])];
    const statusLabel = s => {
        if (s === 'bridge') return t('filters.status.bridge', { date: next ? dayMonthLong(next.month, next.salaryDay) : '' });
        if (s === 'period1') return t('filters.status.period1', { day: m.secondPayDay });
        if (s === 'period2') return t('filters.status.period2', { day: m.secondPayDay });
        return t(`filters.status.${s}`);
    };
    const sheet = openSheet(`
        <h3>${t('filters.title')}</h3>
        <form id="filters-form" novalidate>
            <div class="field"><span class="lbl">${t('filters.show')}</span>
                <div class="cats" role="group" aria-label="${t('filters.show')}">
                    ${statuses.map(s => `<button type="button" data-status="${s}" aria-pressed="${f.status === s}">${statusLabel(s)}</button>`).join('')}
                </div>
            </div>
            <div class="field"><span class="lbl">${t('filters.sort')}</span>
                <div class="cats" role="group" aria-label="${t('filters.sort')}">
                    ${SORTS.map(s => `<button type="button" data-sort="${s}" aria-pressed="${f.sort === s}">${t(`filters.sorts.${s}`)}</button>`).join('')}
                </div>
            </div>
            <div class="field-pair">
                <div class="field"><label for="f-min">${t('filters.min')}</label><input id="f-min" type="number" inputmode="decimal" min="0" value="${f.min ?? ''}"></div>
                <div class="field"><label for="f-max">${t('filters.max')}</label><input id="f-max" type="number" inputmode="decimal" min="0" value="${f.max ?? ''}"></div>
            </div>
            <div class="field"><span class="lbl">${t('filters.categories')}</span>
                <div class="cats" role="group" aria-label="${t('filters.categories')}">
                    ${CATEGORIES.map(c => `<button type="button" data-fcat="${c.id}" aria-pressed="${f.categories.includes(c.id)}"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</button>`).join('')}
                </div>
            </div>
            <div class="actions">
                <button class="btn primary" type="submit">${t('filters.apply')}</button>
                <button class="btn ghost" type="button" data-sheet="reset">${t('filters.reset')}</button>
            </div>
        </form>`, { label: t('filters.title') });
    sheet.addEventListener('click', ev => {
        const st = ev.target.closest('[data-status]');
        if (st) sheet.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-pressed', b === st));
        const so = ev.target.closest('[data-sort]');
        if (so) sheet.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', b === so));
        const fc = ev.target.closest('[data-fcat]');
        if (fc) fc.setAttribute('aria-pressed', fc.getAttribute('aria-pressed') !== 'true');
        if (ev.target.closest('[data-sheet="reset"]')) {
            resetFilters();
            closeSheet();
        }
    });
    sheet.querySelector('#filters-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const numOrNull = v => (v === '' ? null : Math.max(0, parseFloat(v)));
        view.filter = {
            ...view.filter,
            status: sheet.querySelector('[data-status][aria-pressed="true"]').dataset.status,
            sort: sheet.querySelector('[data-sort][aria-pressed="true"]').dataset.sort,
            min: numOrNull(sheet.querySelector('#f-min').value),
            max: numOrNull(sheet.querySelector('#f-max').value),
            categories: [...sheet.querySelectorAll('[data-fcat][aria-pressed="true"]')].map(b => b.dataset.fcat),
        };
        closeSheet();
        rerender();
    });
}

let rerender = () => {};
export function setBudgetRerender(fn) {
    rerender = fn;
}

export function resetFilters() {
    view.filter = { ...view.filter, status: 'all', categories: [], min: null, max: null, search: '', sort: 'date' };
    rerender();
}

/* ---------- Панель витрати ---------- */

function findExpense(monthKey, id) {
    const month = state.months[monthKey];
    return { month, expense: month?.expenses.find(e => e.id === id) };
}

export function togglePaid(monthKey, id) {
    let title = '';
    let paid = false;
    update(() => {
        const { expense } = findExpense(monthKey, id);
        if (!expense) return;
        expense.isPaid = !expense.isPaid;
        title = expense.title;
        paid = expense.isPaid;
    });
    if (title) toast(t(paid ? 'toast.paid' : 'toast.unpaid', { title }));
}

export function openExpenseSheet(monthKey = state.activeMonthKey, id = null) {
    const { month, expense } = id ? findExpense(monthKey, id) : { month: state.months[monthKey] };
    if (!month) return;
    const isNew = !expense;
    const e = expense || { title: '', category: view.filter.categories.length === 1 ? view.filter.categories[0] : 'other', amountUAH: '', payDay: Math.min(new Date().getDate(), 28), isPaid: false };
    const currency = e.amountUSD > 0 ? e.currency || 'USD' : 'UAH';
    const rate = e.amountUSD > 0 ? Math.round(e.amountUAH / e.amountUSD * 10000) / 10000 : month.rate || DEFAULT_RATE;

    const sheet = openSheet(`
        <h3>${isNew ? t('expense.new') : esc(e.title)}</h3>
        <form id="expense-form" novalidate>
            <div class="field">
                <label for="f-title">${t('expense.title')}</label>
                <input id="f-title" name="title" value="${esc(e.title)}" placeholder="${t('expense.titlePlaceholder')}" autocomplete="off" maxlength="120">
            </div>
            ${currencyFields({ currency, amount: currency === 'UAH' ? e.amountUAH : e.amountUSD, rate, uah: e.amountUAH, currencies: ['UAH', 'USD', 'USDT'] })}
            <div class="field">
                <label for="f-day">${t('expense.day', { month: monthName(month.year, month.month) })}</label>
                <input id="f-day" type="number" inputmode="numeric" min="1" max="31" value="${e.payDay}">
            </div>
            <div class="field">
                <span class="lbl">${t('expense.category')}</span>
                <div class="cats" role="group" aria-label="${t('expense.category')}">
                    ${CATEGORIES.map(c => `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === e.category}"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</button>`).join('')}
                </div>
            </div>
            <div class="toggle"><span id="paid-label">${t('expense.paid')}</span><button type="button" class="switch" role="switch" id="f-paid" aria-checked="${!!e.isPaid}" aria-labelledby="paid-label"></button></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${isNew ? t('expense.add') : t('common.save')}</button>
                ${isNew ? '' : `<div class="two"><button class="btn ghost" type="button" data-sheet="duplicate">${t('expense.duplicate')}</button><button class="btn danger" type="button" data-sheet="delete">${t('common.delete')}</button></div>`}
                <button class="btn ghost" type="button" data-action="close-sheet">${t('common.cancel')}</button>
            </div>
        </form>`, { label: isNew ? t('expense.new') : e.title });

    wireCurrency(sheet);
    sheet.addEventListener('click', ev => {
        const cat = ev.target.closest('[data-cat]');
        if (cat) sheet.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b === cat));
        if (ev.target.closest('#f-paid')) {
            const sw = sheet.querySelector('#f-paid');
            sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true');
        }
        const act = ev.target.closest('[data-sheet]')?.dataset.sheet;
        if (act === 'duplicate') {
            update(() => { month.expenses.push({ ...expense, id: newId('exp'), isPaid: false }); });
            closeSheet();
            toast(t('toast.duplicated', { title: expense.title }));
        }
        if (act === 'delete') {
            confirmSheet({ title: t('expense.deleteTitle'), text: t('expense.deleteText', { title: esc(expense.title) }), confirm: t('common.delete') })
                .then(ok => {
                    if (!ok) return;
                    update(() => { month.expenses = month.expenses.filter(x => x.id !== expense.id); });
                    toast(t('toast.expenseDeleted'));
                });
        }
    });

    sheet.querySelector('#expense-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const err = sheet.querySelector('#form-error');
        const title = sheet.querySelector('#f-title').value.trim();
        const amt = readCurrency(sheet);
        const day = parseInt(sheet.querySelector('#f-day').value, 10);
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!title) return fail(t('expense.errTitle'));
        if (!(amt.uah > 0)) return fail(t('expense.errAmount'));
        if (!(day >= 1 && day <= 31)) return fail(t('expense.errDay'));
        const rec = {
            title,
            category: sheet.querySelector('[data-cat][aria-pressed="true"]').dataset.cat,
            amountUAH: amt.uah,
            amountUSD: amt.currency === 'UAH' ? 0 : amt.amount,
            payDay: day,
            isPaid: sheet.querySelector('#f-paid').getAttribute('aria-checked') === 'true',
        };
        if (amt.currency !== 'UAH') rec.currency = amt.currency;
        update(() => {
            if (isNew) month.expenses.push({ id: newId('exp'), ...rec });
            else {
                Object.assign(expense, rec);
                if (amt.currency === 'UAH') delete expense.currency;
            }
        });
        closeSheet();
        toast(t(isNew ? 'toast.expenseAdded' : 'toast.saved'));
    });
}
