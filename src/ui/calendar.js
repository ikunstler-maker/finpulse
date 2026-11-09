import { CATEGORIES, INCOME_CATEGORIES } from '../data/categories.js';
import { t } from '../i18n/index.js';
import { activeMonth, state } from '../state.js';
import { expenseRow, openExpenseSheet } from './budget.js';
import { expensePending, isUndated } from '../calc.js';
import { esc } from './format.js';
import { dayMonthLong, money, money0 } from './format.js';
import { incomeRow, openIncomeSheet, partRow } from './incomes.js';
import { closeSheet, openSheet } from './sheet.js';

/*
 * Календар місяця: у кожному дні — кольорові позначки витрат (категорія) і доходів, сума витрат дня.
 * Натискання на день — список записів дня і кнопки «+ Витрата» / «+ Дохід» з цією датою.
 */

const catColor = id => (CATEGORIES.find(c => c.id === id) || CATEGORIES.find(c => c.id === 'other')).color;
const incColor = id => (INCOME_CATEGORIES.find(c => c.id === id) || INCOME_CATEGORIES.find(c => c.id === 'other_inc')).color;
const SALARY_COLOR = '#157a5b';

/** Записи місяця, згруповані за днем. */
export function dayItems(m) {
    const last = new Date(m.year, m.month, 0).getDate();
    const clamp = d => Math.min(Math.max(1, Number(d) || 1), last);
    const days = Array.from({ length: last + 1 }, () => ({ expenses: [], incomes: [], parts: [], spends: [] }));
    for (const e of m.expenses || []) {
        if (e.reserve) {
            // витрати з резерву — у свої дні
            for (const s of e.reserve.spends) if (s.day) days[clamp(s.day)].spends.push({ ...s, title: e.title, category: e.category, amountUAH: s.amount });
        } else if (!isUndated(e)) days[clamp(e.payDay)].expenses.push(e);
    }
    for (const p of m.salaryParts || []) if ((p.uah || 0) > 0) days[clamp(p.day || m.salaryDay)].parts.push(p);
    for (const i of m.incomes || []) if ((i.amountUAH || 0) > 0) days[clamp(i.day)].incomes.push(i);
    return days;
}

/** Коротка сума для клітинки: 850, 1,3к, 12к (точна — у вікні дня). */
export function shortAmount(n) {
    const v = Math.round(n);
    if (v < 1000) return String(v);
    const k = t('calendar.thousands');
    return v < 10000 ? `${(Math.round(v / 100) / 10).toString().replace('.', ',')}${k}` : `${Math.round(v / 1000)}${k}`;
}

const sumOf = list => list.reduce((s, x) => s + (x.amountUAH ?? x.uah ?? 0), 0);

export function calendarView(today = new Date()) {
    const m = activeMonth();
    const days = dayItems(m);
    const last = days.length - 1;
    const lead = (new Date(m.year, m.month - 1, 1).getDay() + 6) % 7; // понеділок — перший
    const isToday = d => today.getFullYear() === m.year && today.getMonth() + 1 === m.month && today.getDate() === d;
    const weekdays = t('calendar.weekdays').split(',');
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell empty" aria-hidden="true"></div>');
    for (let d = 1; d <= last; d++) {
        const { expenses, incomes, parts, spends } = days[d];
        const spent = sumOf(expenses) + sumOf(spends);
        const got = sumOf(incomes) + sumOf(parts);
        const dots = [
            ...expenses.map(e => `<i class="${e.isPaid ? 'paid' : ''}" style="background:${catColor(e.category)}"></i>`),
            ...spends.map(s => `<i class="paid" style="background:${catColor(s.category)}"></i>`),
            ...parts.map(() => `<i class="inc" style="background:${SALARY_COLOR}"></i>`),
            ...incomes.map(i => `<i class="inc" style="background:${incColor(i.category)}"></i>`),
        ];
        const label = [dayMonthLong(m.month, d), spent ? t('calendar.spent', { amount: money0(spent) }) : '', got ? t('calendar.got', { amount: money0(got) }) : ''].filter(Boolean).join(', ');
        cells.push(`
            <button class="cal-cell ${isToday(d) ? 'today' : ''} ${d === m.salaryDay ? 'payday' : ''}" data-action="cal-day" data-day="${d}" aria-label="${label}">
                <span class="cal-num">${d}</span>
                <span class="cal-dots">${dots.slice(0, 6).join('')}${dots.length > 6 ? '<b>+</b>' : ''}</span>
                ${spent ? `<span class="cal-sum num">−${shortAmount(spent)}</span>` : ''}
                ${got ? `<span class="cal-sum in num">+${shortAmount(got)}</span>` : ''}
            </button>`);
    }
    const total = sumOf((m.expenses || []).filter(e => !e.reserve)) + (m.expenses || []).filter(e => e.reserve).reduce((s, e) => s + e.reserve.spends.reduce((a, x) => a + x.amount, 0), 0);
    const undated = (m.expenses || []).filter(e => isUndated(e) && !e.isPaid);
    const undatedSum = undated.reduce((s, e) => s + expensePending(e), 0);
    const income = sumOf(m.incomes || []) + sumOf(m.salaryParts || []);
    return `
        <section class="calendar" aria-label="${t('calendar.label', { month: m.name })}">
            <div class="cal-head">
                <span>${t('calendar.monthTotals', { spent: money0(total), got: money0(income) })}</span>
            </div>
            ${undated.length ? `<button class="cal-undated" data-action="cal-undated">${t('calendar.undated', { n: undated.length, amount: money0(undatedSum) })}</button>` : ''}
            <div class="cal-grid" role="grid">
                ${weekdays.map((w, i) => `<div class="cal-wd ${i > 4 ? 'weekend' : ''}" aria-hidden="true">${w}</div>`).join('')}
                ${cells.join('')}
            </div>
            <p class="local-note">${t('calendar.hint')}</p>
        </section>`;
}

let openDay = null;

/** Вікно дня: записи і швидке додавання з цією датою. */
export function openDaySheet(day, today = new Date()) {
    openDay = day;
    const m = activeMonth();
    const { expenses, incomes, parts, spends } = dayItems(m)[day] || { expenses: [], incomes: [], parts: [], spends: [] };
    const sheet = openSheet(`
        <h3>${dayMonthLong(m.month, day)}</h3>
        <div id="day-sheet" data-day="${day}">${dayBody(m, day, expenses, incomes, parts, today, spends)}</div>
        <div class="actions"><div class="two">
            <button class="btn primary" type="button" data-cal-add="expense">${t('calendar.addExpense')}</button>
            <button class="btn ghost" type="button" data-cal-add="income">${t('calendar.addIncome')}</button>
        </div></div>`, { label: dayMonthLong(m.month, day) });
    sheet.addEventListener('click', e => {
        const b = e.target.closest('[data-cal-add]');
        if (!b) return;
        closeSheet();
        if (b.dataset.calAdd === 'expense') openExpenseSheet(state.activeMonthKey, null, { day });
        else openIncomeSheet(null, 'extra', { day });
    });
}

function dayBody(m, day, expenses, incomes, parts, today, spends = []) {
    if (!expenses.length && !incomes.length && !parts.length && !spends.length) return `<p class="empty">${t('calendar.emptyDay')}</p>`;
    return `
        ${expenses.length || spends.length ? `<p class="cal-day-sum">${t('calendar.dayExpenses', { amount: money(sumOf(expenses) + sumOf(spends)) })}</p>
            <div class="list">${expenses.map(e => expenseRow(e, m, state.activeMonthKey, today)).join('')}
            ${spends.map(s => `<div class="spend"><span class="spend-day"><i class="dot" style="background:${catColor(s.category)}"></i></span><span class="spend-note">${esc(t('calendar.fromReserve', { title: s.title }))}${s.note ? ` · ${esc(s.note)}` : ''}</span><span class="num">${money(s.amount)}</span></div>`).join('')}</div>` : ''}
        ${parts.length || incomes.length ? `<p class="cal-day-sum">${t('calendar.dayIncomes', { amount: money(sumOf(incomes) + sumOf(parts)) })}</p>
            <div class="list">${parts.map(p => partRow(p, m)).join('')}${incomes.map(i => incomeRow(i, m, incColor(i.category))).join('')}</div>` : ''}`;
}

/** Після зміни даних (позначка «сплачено» у вікні дня) — оновити вміст вікна. */
export function refreshDaySheet(today = new Date()) {
    const box = document.getElementById('day-sheet');
    if (!box || openDay == null) return;
    const m = activeMonth();
    if (openDay === 'undated') {
        box.innerHTML = undatedBody(m, today);
        return;
    }
    const { expenses, incomes, parts, spends } = dayItems(m)[openDay] || { expenses: [], incomes: [], parts: [], spends: [] };
    box.innerHTML = dayBody(m, openDay, expenses, incomes, parts, today, spends);
}

function undatedBody(m, today) {
    const list = (m.expenses || []).filter(e => isUndated(e) && !e.isPaid);
    return list.length ? `<div class="list">${list.map(e => expenseRow(e, m, state.activeMonthKey, today)).join('')}</div>` : `<p class="empty">${t('calendar.noUndated')}</p>`;
}

/** Вікно «Без дати»: резерви й платежі, день яких ще не визначено. */
export function openUndatedSheet(today = new Date()) {
    openDay = 'undated';
    const m = activeMonth();
    openSheet(`
        <h3>${t('calendar.undatedTitle')}</h3>
        <p class="sheet-text small">${t('calendar.undatedHint')}</p>
        <div id="day-sheet">${undatedBody(m, today)}</div>`, { label: t('calendar.undatedTitle') });
}
