import { categoryTotals, collectAnalytics, incomeTotals, monthIncomeTotal } from '../calc.js';
import { CATEGORIES, INCOME_CATEGORIES } from '../data/categories.js';
import { t } from '../i18n/index.js';
import { state } from '../state.js';
import { esc, money0 } from './format.js';
import { view } from './view-state.js';

const PERIODS = ['current', '3m', '6m', 'year', 'all', 'custom'];

function periodLabel(selectedMonths) {
    const p = view.reportPeriod;
    if (p === 'custom') {
        const f = s => (s ? s.split('-').reverse().join('.') : '…');
        return t('reports.customLabel', { from: f(view.reportFrom), to: f(view.reportTo) });
    }
    if (p === 'current') return state.months[state.activeMonthKey]?.name || '';
    if (p === 'year') return t('reports.yearLabel', { year: state.months[state.activeMonthKey]?.year });
    const months = selectedMonths.filter(Boolean);
    if (!months.length) return '';
    return months.length === 1 ? months[0].name : `${months[0].name} — ${months[months.length - 1].name}`;
}

/** Горизонтальні смуги «категорія — частка — сума». */
function bars(list) {
    const max = list[0]?.amountUAH || 1;
    const sum = list.reduce((s, x) => s + x.amountUAH, 0);
    return list.map(({ category: c, amountUAH: v }) => `
        <div class="hbar">
            <div class="hbar-top"><span><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span><span class="num"><span class="muted">${Math.round(v / sum * 100)}%</span> <strong>${money0(v)}</strong></span></div>
            <div class="hbar-track"><i style="width:${(v / max * 100).toFixed(1)}%;background:${c.color}"></i></div>
        </div>`).join('');
}

export function reportsView() {
    const data = collectAnalytics(state, { period: view.reportPeriod, from: view.reportFrom, to: view.reportTo });
    const paid = data.expenses.filter(e => e.isPaid);
    const planned = data.expenses.reduce((s, e) => s + e.amountUAH, 0);
    const paidSum = paid.reduce((s, e) => s + e.amountUAH, 0);
    const chartExpenses = view.reportMode === 'paid' ? paid : data.expenses;
    const totals = categoryTotals(chartExpenses, CATEGORIES);
    const incomeCats = [{ id: 'salary', name: t('reports.salary'), color: '#157a5b' }, ...INCOME_CATEGORIES];
    const incomes = incomeTotals(data.incomeByCategory, incomeCats);

    const keys = Object.keys(state.months).sort();
    const activeIdx = Math.max(0, keys.indexOf(state.activeMonthKey));
    const series = keys.slice(Math.max(0, activeIdx - 5), activeIdx + 1).map(k => {
        const m = state.months[k];
        return { name: m.name.split(' ')[0].slice(0, 4), full: m.name, income: monthIncomeTotal(m), paid: m.expenses.filter(e => e.isPaid).reduce((s, e) => s + e.amountUAH, 0) };
    });
    const top = Math.max(1, ...series.map(s => Math.max(s.income, s.paid)));

    const custom = view.reportPeriod === 'custom' ? `
        <div class="date-range">
            <div class="field"><label for="r-from">${t('reports.from')}</label><input id="r-from" type="date" value="${view.reportFrom}" data-action-input="report-from"></div>
            <div class="field"><label for="r-to">${t('reports.to')}</label><input id="r-to" type="date" value="${view.reportTo}" data-action-input="report-to"></div>
        </div>` : '';

    return `
        <div class="reports">
            <div class="chips" role="group" aria-label="${t('reports.period')}">
                ${PERIODS.map(p => `<button data-action="report-period" data-period="${p}" aria-pressed="${view.reportPeriod === p}">${t(`reports.periods.${p}`)}</button>`).join('')}
            </div>
            ${custom}
            <p class="period-label" id="report-period-label">${esc(periodLabel(data.selectedMonths))}</p>
            <div class="kpis">
                <div class="kpi"><div class="label">${t('reports.income')}</div><div class="v num" id="report-income">${money0(data.totalIncome)}</div></div>
                <div class="kpi"><div class="label">${t('reports.paid')}</div><div class="v num" id="report-paid">${money0(paidSum)}</div></div>
                <div class="kpi"><div class="label">${t('reports.left')}</div><div class="v num ${data.totalIncome - planned < 0 ? 'neg' : ''}" id="report-left">${money0(data.totalIncome - planned)}</div></div>
            </div>
            <section class="section">
                <div class="section-head">
                    <h2>${t('reports.whereTitle')}</h2>
                    <div class="seg small" role="group" aria-label="${t('reports.modeLabel')}">
                        <button data-action="report-mode" data-mode="planned" aria-pressed="${view.reportMode === 'planned'}">${t('reports.modePlanned')}</button>
                        <button data-action="report-mode" data-mode="paid" aria-pressed="${view.reportMode === 'paid'}">${t('reports.modePaid')}</button>
                    </div>
                </div>
                <div class="list bars" id="category-bars">${bars(totals) || `<p class="empty">${t('reports.noExpenses')}</p>`}</div>
            </section>
            <section class="section">
                <div class="section-head"><h2>${t('reports.incomeTitle')}</h2><span class="meta">${t('reports.incomeMeta')}</span></div>
                <div class="list bars" id="income-bars">${bars(incomes) || `<p class="empty">${t('reports.noIncome')}</p>`}</div>
            </section>
            <section class="section">
                <div class="section-head"><h2>${t('reports.monthsTitle')}</h2><span class="meta">${t('reports.monthsMeta')}</span></div>
                <div class="list">
                    <div class="months" style="grid-template-columns: repeat(${series.length}, minmax(0, 1fr))">
                        ${series.map(s => `
                            <div class="mcol">
                                <div class="pair" role="img" aria-label="${esc(t('reports.monthBarLabel', { month: s.full, income: money0(s.income), paid: money0(s.paid) }))}">
                                    <i class="bar-income" style="height:${(s.income / top * 100).toFixed(0)}%"></i>
                                    <i class="bar-paid" style="height:${(s.paid / top * 100).toFixed(0)}%"></i>
                                </div>${esc(s.name)}
                            </div>`).join('')}
                    </div>
                    <div class="legend-inline"><span><i class="dot bar-income"></i>${t('reports.legendIncome')}</span><span><i class="dot bar-paid"></i>${t('reports.legendPaid')}</span></div>
                </div>
            </section>
        </div>`;
}
