import { DEFAULT_RATE } from '../../calc.js';
import { CATEGORIES } from '../../data/categories.js';
import { saveState, state } from '../../state.js';
import { duplicateExpense } from '../expense-actions.js';
import { renderAll } from '../render.js';
import { showToast } from '../../utils.js';

/**
 * МОДАЛЬНЕ ВІКНО: СТВОРЕННЯ / РЕДАГУВАННЯ ВИТРАТИ
 */
export function openExpenseModal(editId = null) {
    const curMonth = state.months[state.activeMonthKey];
    const form = document.getElementById('expense-form');
    form.reset();
    document.getElementById('modal-id').value = '';

    const delBtn = document.getElementById('modal-delete-btn');
    const dupBtn = document.getElementById('modal-duplicate-btn');
    const titleEl = document.getElementById('modal-expense-title');

    if (editId) {
        const item = curMonth.expenses.find(e => e.id === editId);
        if (item) {
            titleEl.textContent = 'Редагувати витрату';
            document.getElementById('modal-id').value = item.id;
            document.getElementById('modal-title').value = item.title;
            document.getElementById('modal-category').value = item.category;

            const catObj = CATEGORIES.find(c => c.id === item.category);
            document.getElementById('modal-section').value = catObj ? catObj.section : 'regular';

            document.getElementById('modal-uah').value = item.amountUAH;
            document.getElementById('modal-usd').value = item.amountUSD || '';
            document.getElementById('modal-day').value = item.payDay;
            document.getElementById('modal-ispaid').checked = item.isPaid;

            delBtn.classList.remove('hidden');
            dupBtn.classList.remove('hidden');
        }
    } else {
        titleEl.textContent = 'Додати витрату';
        document.getElementById('modal-day').value = new Date().getDate();
        delBtn.classList.add('hidden');
        dupBtn.classList.add('hidden');
    }

    document.getElementById('expense-modal').classList.remove('hidden');
}

export function closeExpenseModal() {
    document.getElementById('expense-modal').classList.add('hidden');
}

export function toggleCurrencyMode(curr) {
    const curMonth = state.months[state.activeMonthKey];
    const rate = curMonth.rate || DEFAULT_RATE;
    if (curr === 'usd') {
        const uah = parseFloat(document.getElementById('modal-uah').value) || 0;
        if (uah > 0) {
            document.getElementById('modal-usd').value = (uah / rate).toFixed(2);
        }
    }
}

export function onUahInput() {
    const curMonth = state.months[state.activeMonthKey];
    const rate = curMonth.rate || DEFAULT_RATE;
    const uah = parseFloat(document.getElementById('modal-uah').value) || 0;
    const isUsdMode = document.querySelector('input[name="currency_type"]:checked')?.value === 'usd';
    if (isUsdMode && uah > 0) {
        document.getElementById('modal-usd').value = (uah / rate).toFixed(2);
    }
}

export function onUsdInput() {
    const curMonth = state.months[state.activeMonthKey];
    const rate = curMonth.rate || DEFAULT_RATE;
    const usd = parseFloat(document.getElementById('modal-usd').value) || 0;
    if (usd > 0) {
        document.getElementById('modal-uah').value = (usd * rate).toFixed(2);
    }
}

export function saveExpense(e) {
    e.preventDefault();
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    const editId = document.getElementById('modal-id').value;
    const title = document.getElementById('modal-title').value.trim();
    const category = document.getElementById('modal-category').value;
    const amountUAH = parseFloat(document.getElementById('modal-uah').value) || 0;
    const amountUSD = parseFloat(document.getElementById('modal-usd').value) || 0;
    const payDay = parseInt(document.getElementById('modal-day').value) || 1;
    const isPaid = document.getElementById('modal-ispaid').checked;

    if (editId) {
        const item = curMonth.expenses.find(x => x.id === editId);
        if (item) {
            item.title = title;
            item.category = category;
            item.amountUAH = amountUAH;
            item.amountUSD = amountUSD;
            item.payDay = payDay;
            item.isPaid = isPaid;
        }
    } else {
        curMonth.expenses.push({
            id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            title,
            category,
            amountUAH,
            amountUSD,
            payDay,
            isPaid
        });
    }

    saveState();
    closeExpenseModal();
    renderAll();
    showToast('Витрату збережено', '✅');
}

export function deleteCurrentExpense() {
    const editId = document.getElementById('modal-id').value;
    const curMonth = state.months[state.activeMonthKey];
    if (!editId || !curMonth) return;

    curMonth.expenses = curMonth.expenses.filter(x => x.id !== editId);
    saveState();
    closeExpenseModal();
    renderAll();
    showToast('Витрату видалено', '🗑️');
}

export function duplicateCurrentExpense() {
    const editId = document.getElementById('modal-id').value;
    closeExpenseModal();
    if (editId) duplicateExpense(editId);
}
