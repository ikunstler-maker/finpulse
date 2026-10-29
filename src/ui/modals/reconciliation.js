import { getNextMonthKey, reconcile } from '../../calc.js';
import { saveState, state } from '../../state.js';
import { renderAll } from '../render.js';
import { formatCurrency, showToast } from '../../utils.js';

/**
 * МОДАЛКА: КАЛЬКУЛЯТОР ЗВІРКИ ТА ДЕТЕКТОР ЗАБУТИХ ВИТРАТ
 */
export function openReconciliationModal() {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    let totalPendingUAH = 0;
    curMonth.expenses.forEach(e => {
        if (!e.isPaid) totalPendingUAH += e.amountUAH;
    });

    const nextKey = getNextMonthKey(state.activeMonthKey);
    const nextMonth = state.months[nextKey];
    let bridgeTotalUAH = 0;
    if (nextMonth && Array.isArray(nextMonth.expenses)) {
        nextMonth.expenses.filter(e => e.payDay < nextMonth.salaryDay).forEach(b => {
            bridgeTotalUAH += b.amountUAH;
        });
    }

    const toPay = totalPendingUAH + bridgeTotalUAH;
    document.getElementById('recon-to-pay-display').textContent = `${formatCurrency(toPay)} ₴`;
    document.getElementById('recon-actual-input').value = '';
    document.getElementById('recon-safe-balance-display').textContent = '0.00 ₴';
    document.getElementById('recon-discrepancy-card').classList.add('hidden');

    document.getElementById('reconciliation-modal').classList.remove('hidden');
}

export function closeReconciliationModal() {
    document.getElementById('reconciliation-modal').classList.add('hidden');
}

export function calculateReconciliation() {
    const curMonth = state.months[state.activeMonthKey];
    const actualVal = parseFloat(document.getElementById('recon-actual-input').value) || 0;

    const nextMonth = state.months[getNextMonthKey(state.activeMonthKey)];
    const { safeBalance, diff, hasDiscrepancy } = reconcile(curMonth, nextMonth, actualVal);
    const safeEl = document.getElementById('recon-safe-balance-display');
    safeEl.textContent = `${formatCurrency(safeBalance)} ₴`;

    if (safeBalance < 0) {
        safeEl.className = 'font-black text-rose-500 font-mono';
    } else {
        safeEl.className = 'font-black text-emerald-600 dark:text-emerald-400 font-mono';
    }

    // Детектор розбіжностей
    const discCard = document.getElementById('recon-discrepancy-card');
    const diffDisplay = document.getElementById('recon-diff-display');
    const diffNote = document.getElementById('recon-diff-note');

    if (hasDiscrepancy) {
        discCard.classList.remove('hidden');
        if (diff > 0) {
            diffDisplay.textContent = `-${formatCurrency(diff)} ₴`;
            diffNote.textContent = `У вас на руках на ${formatCurrency(diff)} ₴ менше, ніж зафіксовано в таблиці. Можливо, були забуті дрібні витрати.`;
        } else {
            diffDisplay.textContent = `+${formatCurrency(Math.abs(diff))} ₴`;
            diffNote.textContent = `У вас на руках на ${formatCurrency(Math.abs(diff))} ₴ більше, ніж очікувалося. Можливо, не відмічено додатковий дохід.`;
        }
    } else {
        discCard.classList.add('hidden');
    }
}

export function createExpenseFromDiscrepancy() {
    const curMonth = state.months[state.activeMonthKey];
    const actualVal = parseFloat(document.getElementById('recon-actual-input').value) || 0;
    const nextMonth = state.months[getNextMonthKey(state.activeMonthKey)];
    const { diff } = reconcile(curMonth, nextMonth, actualVal);

    if (diff > 0) {
        curMonth.expenses.push({
            id: 'exp_' + Date.now().toString(36),
            title: 'Необліковані витрати (вирівняно)',
            category: 'other',
            amountUAH: +diff.toFixed(2),
            amountUSD: 0,
            payDay: new Date().getDate(),
            isPaid: true
        });
        saveState();
        closeReconciliationModal();
        renderAll();
        showToast(`Занесено ${formatCurrency(diff)} ₴ у витрати`, '⚖️');
    }
}
