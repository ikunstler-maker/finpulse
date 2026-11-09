import { categorySummary, computeMonthSummary, dailyAllowance, DEFAULT_RATE, expensePaid, expensePending, isoDate, isUndated, reserveSpent, ruleOccurrences, shiftBack, filterExpenses, getNextMonthKey, isExpenseOverdue, payPeriods, salaryTotal } from '../calc.js';
import { CATEGORIES } from '../data/categories.js';
import { newId } from '../data/migrate.js';
import { applyFromHere, cutSeries, expenseDate } from '../data/series.js';
import { plural, t } from '../i18n/index.js';
import { activeMonth, state, update } from '../state.js';
import { currencyFields, readCurrency, wireCurrency } from './currency.js';
import { dateOf, dayMonth, dayMonthLong, daysFrom, esc, foreign, money, money0 } from './format.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';
import { applyCard, cardChip, cardField, cards, cardTitle, readCardField } from './cards.js';
import { goalsRow } from './goals.js';
import { demoBanner } from './welcome.js';
import { reminderBanner } from './reminders.js';
import { isEncrypted } from '../sync/controller.js';
import { pickerField, wirePickers } from './picker.js';
import { itemRow } from './row.js';
import { view } from './view-state.js';

const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES.find(c => c.id === 'other');

/* ---------- Підсумок ---------- */

export function summaryCard(today = new Date()) {
    const m = activeMonth();
    const s = computeMonthSummary(state, state.activeMonthKey, today);
    const daily = dailyAllowance(state, state.activeMonthKey, today);
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
                ${daily ? `<div class="rowline daily"><span>${t('summary.daily')}<span class="sub">${t('summary.dailySub', { n: daily.daysLeft, days: plural(daily.daysLeft, t('summary.daysWord').split(',')), date: dayMonthLong(daily.end.month, daily.end.day), available: money0(daily.available) })}</span></span><span class="val num" id="kpi-daily">${money(daily.perDay)}</span></div>` : ''}
            </div>
            ${periodsBlock()}
            ${goalsRow()}
            <p class="local-note">${t(isEncrypted() ? 'summary.encryptedNote' : 'summary.localNote')}</p>
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

export function expenseRow(e, m, monthKey, today, { bridge = false, flat = false } = {}) {
    const c = catOf(e.category);
    const overdue = !e.isPaid && isExpenseOverdue(e, m, today);
    // У групах стан видно із заголовка; у результатах пошуку позначаємо лише «до ЗП».
    const inst = e.installment ? `<span class="chip installment" title="${t('repeat.installmentOf', e.installment)}">${t('repeat.chip', e.installment)}</span>` : '';
    const chips = (flat && bridge && !e.isPaid ? `<span class="chip bridge">${t('budget.bridgeChip')}</span>` : '') + inst + cardChip(e.cardId);
    if (e.reserve) return reserveRow(e, m, monthKey, c, inst);
    return itemRow({
        cls: `expense-row ${e.isPaid ? 'paid' : ''} ${overdue ? 'overdue' : ''}`,
        checked: e.isPaid,
        check: { action: 'toggle-paid', month: monthKey, id: e.id },
        edit: { action: 'edit-expense', month: monthKey, id: e.id },
        label: t(e.isPaid ? 'budget.markUnpaid' : 'budget.markPaid', { title: e.title }),
        date: e.noDate ? t('budget.noDateShort') : dayMonth(m.month, e.payDay),
        title: e.title,
        color: c.color,
        chips,
        amount: money(e.amountUAH),
        sub: e.amountUSD > 0 ? foreign(e.amountUSD, e.currency || 'USD') : '',
    });
}

/** Рядок резерву: прогрес «витрачено з суми», праворуч — залишок. Натискання — вікно резерву. */
function reserveRow(e, m, monthKey, c, inst) {
    const spent = reserveSpent(e);
    const limit = e.amountUAH || 0;
    const over = spent > limit;
    const pct = limit > 0 ? Math.min(100, spent / limit * 100) : 100;
    const chips = `
        <span class="reserve-bar ${over ? 'over' : ''}" aria-hidden="true"><i style="width:${pct.toFixed(1)}%;background:${over ? 'var(--danger)' : c.color}"></i></span>
        <span class="reserve-text num">${over ? t('reserve.over', { amount: money(spent - limit) }) : t('reserve.progress', { spent: money(spent), limit: money(limit) })}</span>${inst}${cardChip(e.cardId)}`;
    return itemRow({
        cls: `expense-row reserve-row ${e.isPaid ? 'paid' : ''} ${over ? 'over' : ''}`,
        checked: e.isPaid,
        check: { action: 'toggle-paid', month: monthKey, id: e.id },
        edit: { action: 'open-reserve', month: monthKey, id: e.id },
        label: t(e.isPaid ? 'reserve.reopen' : 'reserve.closeLabel', { title: e.title }),
        date: t('reserve.short'),
        title: e.title,
        color: c.color,
        chips,
        amount: e.isPaid ? money(spent) : money(Math.max(0, limit - spent)),
        sub: e.isPaid ? t('reserve.closed') : t('reserve.left'),
    });
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

const flatMode = f => f.status !== 'all' || f.sort !== 'date' || f.search.trim() !== '' || f.min != null || f.max != null || f.categories.length > 1 || f.card !== 'all';
export const activeFilterCount = f => [f.status !== 'all', f.sort !== 'date', f.min != null || f.max != null, f.categories.length > 1, f.card !== 'all'].filter(Boolean).length;

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
    const bridgeItems = next ? next.expenses.filter(e => !isUndated(e) && e.payDay < next.salaryDay) : [];

    const presentCats = [...new Set([...m.expenses, ...bridgeItems].map(e => e.category))]
        .sort((a, b) => CATEGORIES.findIndex(c => c.id === a) - CATEGORIES.findIndex(c => c.id === b));
    f.categories = f.categories.filter(c => presentCats.includes(c));
    if (f.card !== 'all' && f.card !== 'none' && !cards().some(c => c.id === f.card)) f.card = 'all';
    const inFilter = e => !f.categories.length || f.categories.includes(e.category);

    const rows = (list, month, mk, opts) => list.map(e => expenseRow(e, month, mk, today, opts));
    const sum = list => list.reduce((s, e) => s + (e.isPaid ? expensePaid(e) : expensePending(e)), 0);

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
                <div class="list">${found.map(x => expenseRow(x.e, x.month, x.monthKey, today, { bridge: x.bridge, flat: true })).join('') || `<p class="empty">${t('filters.nothing')}</p>`}</div>
                <button class="link-btn" data-action="reset-filters">${t('filters.reset')}</button>
            </section>`;
    } else {
        const sorted = [...m.expenses].filter(inFilter).sort((a, b) => a.payDay - b.payDay);
        const open = sorted.filter(e => !e.isPaid);
        const overdue = open.filter(e => isExpenseOverdue(e, m, today));
        const reserves = open.filter(e => e.reserve);
        const noDate = open.filter(e => e.noDate && !e.reserve);
        const notOverdue = open.filter(e => !overdue.includes(e) && !isUndated(e));
        const soon = notOverdue.filter(e => daysFrom(today, dateOf(m, e.payDay)) <= 7);
        const later = notOverdue.filter(e => !soon.includes(e));
        const paid = sorted.filter(e => e.isPaid);
        const bridge = bridgeItems.filter(inFilter).sort((a, b) => a.payDay - b.payDay);
        content = [
            group('overdue', t('budget.groups.overdue'), rows(overdue, m, key), sum(overdue), t('budget.groups.overdueHint')),
            group('nodate', t('budget.groups.noDate'), rows(noDate, m, key), sum(noDate), t('budget.groups.noDateHint')),
            group('reserve', t('budget.groups.reserve'), rows(reserves, m, key), sum(reserves), t('budget.groups.reserveHint')),
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
        <div class="rail">${summaryCard(today)}</div>
        <div class="main-col">
            ${demoBanner()}
            ${reminderBanner(today)}
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
            <div class="field-pair">
                <div class="field"><label for="f-status">${t('filters.show')}</label>
                    <select id="f-status">${statuses.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${esc(statusLabel(s))}</option>`).join('')}</select>
                </div>
                <div class="field"><label for="f-sort">${t('filters.sort')}</label>
                    <select id="f-sort">${SORTS.map(s => `<option value="${s}" ${f.sort === s ? 'selected' : ''}>${t(`filters.sorts.${s}`)}</option>`).join('')}</select>
                </div>
            </div>
            ${cards().length ? `<div class="field"><label for="f-filter-card">${t('cards.field')}</label>
                <select id="f-filter-card">
                    <option value="all" ${f.card === 'all' ? 'selected' : ''}>${t('cards.all')}</option>
                    ${cards().map(c => `<option value="${c.id}" ${f.card === c.id ? 'selected' : ''}>${esc(cardTitle(c))}</option>`).join('')}
                    <option value="none" ${f.card === 'none' ? 'selected' : ''}>${t('cards.noCard')}</option>
                </select></div>` : ''}
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
            status: sheet.querySelector('#f-status').value,
            sort: sheet.querySelector('#f-sort').value,
            min: numOrNull(sheet.querySelector('#f-min').value),
            max: numOrNull(sheet.querySelector('#f-max').value),
            categories: [...sheet.querySelectorAll('[data-fcat][aria-pressed="true"]')].map(b => b.dataset.fcat),
            card: sheet.querySelector('#f-filter-card')?.value || 'all',
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
    view.filter = { ...view.filter, status: 'all', categories: [], card: 'all', min: null, max: null, search: '', sort: 'date' };
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

export function openExpenseSheet(monthKey = state.activeMonthKey, id = null, { day = null } = {}) {
    const { month, expense } = id ? findExpense(monthKey, id) : { month: state.months[monthKey] };
    if (!month) return;
    const isNew = !expense;
    const e = expense || { title: '', category: view.filter.categories.length === 1 ? view.filter.categories[0] : 'other', amountUAH: '', payDay: day || Math.min(new Date().getDate(), 28), isPaid: false };
    const currency = e.amountUSD > 0 ? e.currency || 'USD' : 'UAH';
    const rate = e.amountUSD > 0 ? Math.round(e.amountUAH / e.amountUSD * 10000) / 10000 : month.rate || DEFAULT_RATE;

    const sheet = openSheet(`
        <h3>${isNew ? t('expense.new') : esc(e.title)}</h3>
        <form id="expense-form" novalidate>
            <div class="field">
                <label for="f-title">${t('expense.title')}</label>
                <input id="f-title" name="title" value="${esc(e.title)}" placeholder="${t('expense.titlePlaceholder')}" autocomplete="off" maxlength="120">
            </div>
            <div class="seg wide kind-seg" role="group" aria-label="${t('reserve.kindLabel')}">
                <button type="button" data-kind="normal" aria-pressed="${!e.reserve}">${t('reserve.kindNormal')}</button>
                <button type="button" data-kind="reserve" aria-pressed="${!!e.reserve}">${t('reserve.kindReserve')}</button>
            </div>
            <p class="sheet-text small" id="f-kind-hint" ${e.reserve ? '' : 'hidden'}>${t('reserve.formHint')}</p>
            ${currencyFields({ currency, amount: currency === 'UAH' ? e.amountUAH : e.amountUSD, rate, uah: e.amountUAH, currencies: ['UAH', 'USD', 'USDT'] })}
            <div class="field-pair day-cat">
                <div class="field" id="f-day-field" ${e.reserve ? 'hidden' : ''}>
                    <label for="f-day">${t('expense.dayShort', { month: t('months.short').split(',')[month.month - 1] })}</label>
                    <input id="f-day" type="number" inputmode="numeric" min="1" max="31" value="${e.payDay}" ${e.noDate ? 'disabled' : ''}>
                </div>
                ${pickerField({ id: 'f-category', label: t('expense.category'), selected: e.category, options: CATEGORIES.map(c => ({ value: c.id, label: c.name, color: c.color })) })}
            </div>
            <label class="check-line" id="f-nodate-line" ${e.reserve ? 'hidden' : ''}><input type="checkbox" id="f-nodate" ${e.noDate ? 'checked' : ''}> ${t('expense.noDate')}</label>
            ${cardField(e.cardId || '')}
            ${repeatFields(isNew ? {} : e)}
            <div class="toggle" id="f-paid-row" ${e.reserve ? 'hidden' : ''}><span id="paid-label">${t('expense.paid')}</span><button type="button" class="switch" role="switch" id="f-paid" aria-checked="${!!e.isPaid}" aria-labelledby="paid-label"></button></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${isNew ? t('expense.add') : t('common.save')}</button>
                ${isNew ? '' : `<div class="two"><button class="btn ghost" type="button" data-sheet="duplicate">${t('expense.duplicate')}</button><button class="btn danger" type="button" data-sheet="delete">${t('common.delete')}</button></div>`}
            </div>
        </form>`, { label: isNew ? t('expense.new') : e.title });

    wireCurrency(sheet);
    wirePickers(sheet);
    wireRepeat(sheet, month);
    let kind = e.reserve ? 'reserve' : 'normal';
    const setKind = k => {
        kind = k;
        sheet.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', b.dataset.kind === k));
        sheet.querySelector('#f-kind-hint').hidden = k !== 'reserve';
        sheet.querySelector('#f-day-field').hidden = k === 'reserve';
        sheet.querySelector('#f-nodate-line').hidden = k === 'reserve';
        sheet.querySelector('#f-paid-row').hidden = k === 'reserve';
        // резерв зазвичай щомісячний
        const rep = sheet.querySelector('#f-repeat');
        if (k === 'reserve' && isNew && rep.value === 'once') {
            rep.value = 'month';
            rep.dispatchEvent(new Event('change'));
        }
    };
    sheet.querySelector('#f-nodate').addEventListener('change', ev => { sheet.querySelector('#f-day').disabled = ev.target.checked; });
    sheet.addEventListener('click', ev => {
        const kb = ev.target.closest('[data-kind]');
        if (kb) setKind(kb.dataset.kind);
        if (ev.target.closest('#f-paid')) {
            const sw = sheet.querySelector('#f-paid');
            sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true');
        }
        const act = ev.target.closest('[data-sheet]')?.dataset.sheet;
        if (act === 'duplicate') {
            update(() => {
                const copy = { ...expense, id: newId('exp'), isPaid: false };
                delete copy.repeat;
                delete copy.seriesId;
                delete copy.installment;
                month.expenses.push(copy);
            });
            closeSheet();
            toast(t('toast.duplicated', { title: expense.title }));
        }
        if (act === 'delete') {
            if (expense.seriesId) {
                chooseScope({ title: t('expense.deleteTitle'), text: t('repeat.deleteSeriesText', { title: esc(expense.title) }), one: t('repeat.deleteOne'), following: t('repeat.deleteFollowing') })
                    .then(scope => {
                        if (!scope) return;
                        update(s => {
                            if (scope === 'following') cutSeries(s, expense.seriesId, expenseDate(month, expense), expense.id);
                            month.expenses = month.expenses.filter(x => x.id !== expense.id);
                        });
                        toast(t('toast.expenseDeleted'));
                    });
                return;
            }
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
        const noDate = kind === 'normal' && sheet.querySelector('#f-nodate').checked;
        const dayRaw = parseInt(sheet.querySelector('#f-day').value, 10);
        // резерв і «дата пізніше» не мають дня; для правила повторення беремо 1-ше або вже відомий день
        const day = kind === 'reserve' ? (e.reserve ? e.payDay || 1 : 1) : noDate && !(dayRaw >= 1 && dayRaw <= 31) ? 1 : dayRaw;
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!title) return fail(t('expense.errTitle'));
        if (!(amt.uah > 0)) return fail(t('expense.errAmount'));
        if (!(day >= 1 && day <= 31)) return fail(t('expense.errDay'));
        const recur = readRepeat(sheet, month, day);
        if (recur.error) return fail(recur.error);
        const rec = {
            title,
            category: sheet.querySelector('#f-category').value,
            amountUAH: amt.uah,
            amountUSD: amt.currency === 'UAH' ? 0 : amt.amount,
            payDay: day,
            isPaid: kind === 'reserve' ? !!e.isPaid : sheet.querySelector('#f-paid').getAttribute('aria-checked') === 'true',
        };
        if (amt.currency !== 'UAH') rec.currency = amt.currency;
        const cardId = readCardField(sheet);
        // та сама частота, кінець і номер платежу — правило серії не змінилося (старт лишається її власний)
        const rule = expense && sameShape(expense, recur.rule, sheet) ? expense.repeat : recur.rule;
        const save = scope => {
            update(s => {
                const target = isNew ? { id: newId('exp') } : expense;
                Object.assign(target, rec);
                if (!isNew && amt.currency === 'UAH') delete target.currency;
                if (noDate) target.noDate = true;
                else delete target.noDate;
                if (kind === 'reserve') target.reserve = target.reserve || { spends: [] };
                else delete target.reserve;
                applyCard(target, cardId);
                if (isNew) month.expenses.push(target);
                if (scope === 'one') return;
                // нова серія чи зміна правила/полів «з цього платежу»: попередні платежі не змінюються
                if (rule || target.seriesId) applyFromHere(s, monthKey, target, rule);
            });
            closeSheet();
            toast(t(isNew ? 'toast.expenseAdded' : 'toast.saved'));
        };
        const ruleChanged = !sameRule(expense?.repeat, rule);
        if (isNew || !expense.seriesId) return save(rule ? 'following' : 'one');
        if (ruleChanged) return save('following');
        const before = JSON.stringify([expense.title, expense.category, expense.amountUAH, expense.amountUSD || 0, expense.currency || '', expense.cardId || '', expense.payDay, !!expense.noDate, !!expense.reserve]);
        const after = JSON.stringify([rec.title, rec.category, rec.amountUAH, rec.amountUSD || 0, rec.currency || '', cardId || '', rec.payDay, noDate, kind === 'reserve']);
        if (before === after) return save('one');
        chooseScope({ title: t('repeat.scopeTitle'), text: t('repeat.scopeText'), one: t('repeat.scopeOne'), following: t('repeat.scopeFollowing') })
            .then(scope => { if (scope) save(scope); });
    });
}

/** «Лише цей платіж» чи «цей і всі наступні»; null — скасовано. */
function chooseScope({ title, text, one, following }) {
    return new Promise(resolve => {
        const sheet = openSheet(`
            <h3>${title}</h3>
            <p class="sheet-text">${text}</p>
            <div class="actions">
                <button class="btn primary" data-scope="following">${following}</button>
                <button class="btn ghost" data-scope="one">${one}</button>
                <button class="btn ghost" data-scope="cancel">${t('common.cancel')}</button>
            </div>`, { label: title });
        sheet.addEventListener('click', e => {
            const b = e.target.closest('[data-scope]');
            if (!b) return;
            closeSheet();
            resolve(b.dataset.scope === 'cancel' ? null : b.dataset.scope);
        });
    });
}

/** Чи форма лишила правило серії як було (частота, кінець, номер платежу). */
function sameShape(expense, rule, sheet) {
    const r = expense.repeat;
    if (!r || typeof r !== 'object' || !rule) return false;
    if (r.unit !== rule.unit || r.every !== rule.every || (r.count || 0) !== (rule.count || 0) || (r.until || '') !== (rule.until || '')) return false;
    return !rule.count || Number(sheet.querySelector('#f-inst-current').value) === (expense.installment?.current || 1);
}

const sameRule = (a, b) => {
    const norm = r => (r && typeof r === 'object' ? JSON.stringify([r.unit, r.every, r.start, r.count || 0, r.until || '']) : '');
    return norm(a) === norm(b);
};

/* ---------- Повторення: правило серії ---------- */

const UNITS = ['once', 'week', 'day', 'month', 'year'];
const DEFAULT_EVERY = { week: 1, day: 30, month: 1, year: 1 };

function repeatFields(e) {
    const r = e.repeat && typeof e.repeat === 'object' ? e.repeat : null;
    const unit = r ? r.unit : 'once';
    const end = r?.count ? 'count' : r?.until ? 'until' : 'never';
    const current = e.installment?.current || 1;
    return `
        <div class="field">
            <label for="f-repeat">${t('repeat.label')}</label>
            <select id="f-repeat">${UNITS.map(k => `<option value="${k}" ${k === unit ? 'selected' : ''}>${t(`repeat.unit.${k}`)}</option>`).join('')}</select>
        </div>
        <div id="f-repeat-more" ${r ? '' : 'hidden'}>
            <div class="field-pair">
                <div class="field"><label for="f-every" id="f-every-label">${t(`repeat.every.${r ? unit : 'week'}`)}</label><input id="f-every" type="number" inputmode="numeric" min="1" max="400" value="${r?.every || 1}"></div>
                <div class="field"><label for="f-end">${t('repeat.end')}</label>
                    <select id="f-end">${['never', 'count', 'until'].map(k => `<option value="${k}" ${k === end ? 'selected' : ''}>${t(`repeat.ends.${k}`)}</option>`).join('')}</select></div>
            </div>
            <div class="field-pair" id="f-count-row" ${end === 'count' ? '' : 'hidden'}>
                <div class="field"><label for="f-inst-current">${t('repeat.current')}</label><input id="f-inst-current" type="number" inputmode="numeric" min="1" max="1000" value="${current}"></div>
                <div class="field"><label for="f-count">${t('repeat.total')}</label><input id="f-count" type="number" inputmode="numeric" min="1" max="1000" value="${r?.count || 6}"></div>
            </div>
            <div class="field" id="f-until-row" ${end === 'until' ? '' : 'hidden'}><label for="f-until">${t('repeat.untilLabel')}</label><input id="f-until" type="date" value="${r?.until || ''}"></div>
        </div>
        <p class="sheet-text small" id="f-repeat-hint" aria-live="polite"></p>`;
}

/** Підказка з найближчими датами платежів за правилом. */
function nextDates(rule, month, day) {
    const from = isoDate(month.year, month.month, day);
    const out = [];
    for (let i = 0, y = month.year, m = month.month; i < 14 && out.length < 4; i++) {
        for (const o of ruleOccurrences(rule, y, m)) {
            if (isoDate(y, m, o.day) >= from && out.length < 4) out.push(dayMonth(m, o.day));
        }
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

function wireRepeat(sheet, month) {
    const $ = s => sheet.querySelector(s);
    const refresh = () => {
        const unit = $('#f-repeat').value;
        $('#f-repeat-more').hidden = unit === 'once';
        if (unit !== 'once') $('#f-every-label').textContent = t(`repeat.every.${unit}`);
        $('#f-count-row').hidden = $('#f-end').value !== 'count';
        $('#f-until-row').hidden = $('#f-end').value !== 'until';
        const day = parseInt($('#f-day').value, 10);
        const r = unit === 'once' || !(day >= 1 && day <= 31) ? null : readRepeat(sheet, month, day);
        $('#f-repeat-hint').textContent = unit === 'once' ? t('repeat.hint_once')
            : r?.error ? r.error
                : r?.rule ? (nextDates(r.rule, month, day).length ? t('repeat.nextDates', { list: nextDates(r.rule, month, day).join(', ') }) : t('repeat.noDates')) : '';
    };
    $('#f-repeat').addEventListener('change', () => {
        const unit = $('#f-repeat').value;
        if (unit !== 'once') $('#f-every').value = DEFAULT_EVERY[unit];
        refresh();
    });
    sheet.addEventListener('input', e => { if (['f-every', 'f-inst-current', 'f-count', 'f-until', 'f-day', 'f-end'].includes(e.target.id)) refresh(); });
    $('#f-end').addEventListener('change', refresh);
    refresh();
}

/** Правило з форми; старт — дата цього платежу (для «платіж №k» — на k−1 кроків раніше). */
function readRepeat(sheet, month, day) {
    const $ = s => sheet.querySelector(s);
    const unit = $('#f-repeat').value;
    if (unit === 'once') return { rule: null };
    const every = parseInt($('#f-every').value, 10);
    if (!(every >= 1 && every <= 400)) return { error: t('repeat.errEvery') };
    const date = isoDate(month.year, month.month, Math.min(day, new Date(month.year, month.month, 0).getDate()));
    const rule = { unit, every, start: date };
    const end = $('#f-end').value;
    if (end === 'count') {
        const current = parseInt($('#f-inst-current').value, 10);
        const count = parseInt($('#f-count').value, 10);
        if (!(count >= 1 && count <= 1000 && current >= 1 && current <= count)) return { error: t('repeat.errInstallment') };
        rule.count = count;
        rule.start = shiftBack(date, unit, every, current - 1);
    }
    if (end === 'until') {
        const until = $('#f-until').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < date) return { error: t('repeat.errUntil') };
        rule.until = until;
    }
    return { rule };
}
