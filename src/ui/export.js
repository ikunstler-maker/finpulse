import { reportData, toCSV, toJSON, toMarkdown, toXLSX, fmtDate } from '../data/export.js';
import { t } from '../i18n/index.js';
import { state } from '../state.js';
import { esc, money } from './format.js';
import { closeSheet, openSheet, toast } from './sheet.js';
import { view } from './view-state.js';

const FORMATS = ['pdf', 'xlsx', 'csv', 'json', 'md'];

function labels(periodLine) {
    return {
        headers: {
            date: t('export.h.date'), title: t('export.h.title'), amount: t('export.h.amount'), foreign: t('export.h.foreign'), currency: t('export.h.currency'),
            type: t('export.h.type'), category: t('export.h.category'), card: t('export.h.card'), paid: t('export.h.paid'), from: t('export.h.from'),
        },
        typeExpense: t('export.expense'), typeIncome: t('export.income'), yes: t('export.yes'), no: t('export.no'),
        title: t('export.title'), periodLine, summary: t('export.summary'), metric: t('export.metric'), income: t('export.incomeTotal'),
        expensesAll: t('export.expensesAll'), paidLine: t('export.paid'), balance: t('export.balance'),
        byCategory: t('export.byCategory'), incomesBy: t('export.incomesBy'),
        sheetExpenses: t('export.sheetExpenses'), sheetIncomes: t('export.sheetIncomes'), empty: t('export.empty'),
    };
}

function collect(periodLine) {
    const opts = { period: view.reportPeriod, from: view.reportFrom, to: view.reportTo };
    const data = reportData(state, opts, { salary: t('reports.salary') });
    const L = labels(periodLine);
    return { opts, data, L };
}

function fileBase(data) {
    const k = data.monthKeys;
    if (view.reportPeriod === 'custom') return `FinPulse_Report_${view.reportFrom || 'start'}_${view.reportTo || 'end'}`;
    if (!k.length) return 'FinPulse_Report';
    return k.length === 1 ? `FinPulse_Report_${k[0]}` : `FinPulse_Report_${k[0]}_${k[k.length - 1]}`;
}

function download(content, name, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Сторінка для друку / збереження в PDF: підсумок, категорії, усі записи. */
function printReport(data, L) {
    const table = (head, rows, num = []) => `<table><thead><tr>${head.map((h, i) => `<th class="${num.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${num.includes(i) ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const h = L.headers;
    const tt = data.totals;
    const records = list => (list.length ? table([h.date, h.title, h.category, h.amount, h.paid], list.map(x => [fmtDate(x.date), x.title, x.category, money(x.amount), x.paid ? L.yes : L.no]), [3]) : `<p>${esc(L.empty)}</p>`);
    let root = document.getElementById('print-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'print-root';
        document.body.appendChild(root);
    }
    root.innerHTML = `
        <h1>${esc(L.title)}</h1>
        <p class="print-period">${esc(L.periodLine)}</p>
        <h2>${esc(L.summary)}</h2>
        ${table([L.metric, h.amount], [[L.income, money(tt.income)], [L.expensesAll, money(tt.expenses)], [L.paidLine, money(tt.paid)], [L.balance, money(tt.balance)]], [1])}
        <h2>${esc(L.byCategory)}</h2>
        ${data.byCategory.expenses.length ? table([h.category, h.amount], data.byCategory.expenses.map(c => [c.category, money(c.amount)]), [1]) : `<p>${esc(L.empty)}</p>`}
        <h2>${esc(L.incomesBy)}</h2>
        ${data.byCategory.incomes.length ? table([h.category, h.amount], data.byCategory.incomes.map(c => [c.category, money(c.amount)]), [1]) : `<p>${esc(L.empty)}</p>`}
        <h2>${esc(L.sheetExpenses)}</h2>
        ${records(data.expenses)}
        <h2>${esc(L.sheetIncomes)}</h2>
        ${records(data.incomes)}`;
    document.body.classList.add('printing');
    const done = () => {
        document.body.classList.remove('printing');
        window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
}

export function exportReport(format, periodLine) {
    const { opts, data, L } = collect(periodLine);
    const base = fileBase(data);
    if (format === 'pdf') return printReport(data, L);
    if (format === 'csv') download(toCSV(data, L), `${base}.csv`, 'text/csv;charset=utf-8');
    if (format === 'json') download(toJSON(state, data, opts), `${base}.json`, 'application/json');
    if (format === 'md') download(toMarkdown(data, L, money), `${base}.md`, 'text/markdown;charset=utf-8');
    if (format === 'xlsx') download(new Blob([toXLSX(data, L)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`);
    toast(t('export.saved', { file: `${base}.${format}` }));
}

export function openExportSheet(periodLine) {
    const sheet = openSheet(`
        <h3>${t('export.sheetTitle')}</h3>
        <p class="sheet-text">${t('export.hint', { period: esc(periodLine) })}</p>
        <div class="menu">
            ${FORMATS.map(f => `<button type="button" data-export="${f}"><strong>${t(`export.formats.${f}`)}</strong><span>${t(`export.formatsSub.${f}`)}</span></button>`).join('')}
        </div>
        <p class="sheet-text small">${t('export.privacy')}</p>
        <div class="actions"><button class="btn ghost" data-action="close-sheet">${t('common.close')}</button></div>`, { label: t('export.sheetTitle') });
    sheet.addEventListener('click', e => {
        const b = e.target.closest('[data-export]');
        if (!b) return;
        closeSheet();
        exportReport(b.dataset.export, periodLine);
    });
}
