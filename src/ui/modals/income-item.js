import { carryOverBalance, getPrevMonthKey } from '../../calc.js';
import { saveState, state } from '../../state.js';
import { renderAll } from '../render.js';
import { formatCurrency, showToast } from '../../utils.js';

/**
 * МОДАЛКА: СТАТТЯ НАДХОДЖЕННЯ
 */
export function openIncomeItemModal(editId = null, prefillCategory = null) {
    const curMonth = state.months[state.activeMonthKey];
    const modal = document.getElementById('income-item-modal');
    const titleEl = document.getElementById('income-item-modal-title');
    const deleteBtn = document.getElementById('modal-income-delete-btn');
    const autofillBtn = document.getElementById('income-modal-autofill-btn');
    const debtorGroup = document.getElementById('income-modal-debtor-group');
    const debtorInput = document.getElementById('modal-income-debtor');
    const titleInput = document.getElementById('modal-income-title');
    const titleLabel = document.getElementById('modal-income-title-label');

    document.getElementById('income-item-form').reset();
    document.getElementById('modal-income-id').value = '';
    debtorInput.value = '';

    if (editId) {
        const item = (curMonth.incomes || []).find(i => i.id === editId);
        if (item) {
            titleEl.textContent = item.isPreset ? `Редагувати: ${item.title}` : 'Редагувати надходження';
            document.getElementById('modal-income-id').value = item.id;
            document.getElementById('modal-income-title').value = item.title;
            document.getElementById('modal-income-category').value = item.category;
            debtorInput.value = item.debtor || '';
            document.getElementById('modal-income-uah').value = item.amountUAH || '';
            document.getElementById('modal-income-day').value = item.day || 1;
            document.getElementById('modal-income-isreceived').checked = item.isReceived !== false;
            
            deleteBtn.textContent = item.isPreset ? 'Скинути на 0' : 'Видалити';
            deleteBtn.classList.remove('hidden');

            if (item.category === 'savings') {
                autofillBtn.classList.remove('hidden');
            } else {
                autofillBtn.classList.add('hidden');
            }

            if (item.category === 'debt_return') {
                debtorGroup.classList.remove('hidden');
                titleLabel.textContent = 'Призначення / За що борг';
            } else {
                debtorGroup.classList.add('hidden');
                titleLabel.textContent = 'Призначення / Опис надходження';
            }
        }
    } else {
        titleEl.textContent = 'Додати нове надходження';
        deleteBtn.classList.add('hidden');
        document.getElementById('modal-income-day').value = new Date().getDate();
        document.getElementById('modal-income-isreceived').checked = true;

        if (prefillCategory) {
            document.getElementById('modal-income-category').value = prefillCategory;
            if (prefillCategory === 'debt_return') {
                debtorGroup.classList.remove('hidden');
                titleLabel.textContent = 'Призначення / За що борг';
                titleInput.value = 'Повернення боргу';
            } else if (prefillCategory === 'extra') {
                debtorGroup.classList.add('hidden');
                titleLabel.textContent = 'Проєкт / Виконана робота';
                titleInput.value = 'Фріланс проєкт';
            } else if (prefillCategory === 'charity_in') {
                debtorGroup.classList.add('hidden');
                titleLabel.textContent = 'Цільовий збір / Донат';
                titleInput.value = 'Благодійний внесок';
            } else if (prefillCategory === 'savings') {
                debtorGroup.classList.add('hidden');
                titleLabel.textContent = 'Джерело заощаджень';
                titleInput.value = 'Заощадження з попереднього місяця';
                autofillBtn.classList.remove('hidden');
            }
        } else {
            debtorGroup.classList.add('hidden');
            titleLabel.textContent = 'Призначення / Опис надходження';
        }
    }

    modal.classList.remove('hidden');
}

export function onIncomeModalCategoryChange() {
    const cat = document.getElementById('modal-income-category').value;
    const autofillBtn = document.getElementById('income-modal-autofill-btn');
    const debtorGroup = document.getElementById('income-modal-debtor-group');
    const titleLabel = document.getElementById('modal-income-title-label');

    if (cat === 'savings') {
        autofillBtn.classList.remove('hidden');
    } else {
        autofillBtn.classList.add('hidden');
    }

    if (cat === 'debt_return') {
        debtorGroup.classList.remove('hidden');
        titleLabel.textContent = 'Призначення / За що борг';
    } else {
        debtorGroup.classList.add('hidden');
        titleLabel.textContent = 'Призначення / Опис надходження';
    }
}

export function autofillSavingsDirectly() {
    const prevKey = getPrevMonthKey(state.activeMonthKey);
    const prevMonth = state.months[prevKey];
    if (!prevMonth) {
        showToast('Попереднього місяця ще немає в базі', 'ℹ️');
        return;
    }

    const curMonth = state.months[state.activeMonthKey];
    const freeBalance = carryOverBalance(prevMonth, curMonth?.expenses, curMonth?.salaryDay);

    const curSavings = curMonth.incomes.find(i => i.category === 'savings');
    if (curSavings) {
        curSavings.amountUAH = freeBalance;
        curSavings.isReceived = freeBalance > 0;
    } else {
        curMonth.incomes.push({
            id: 'inc_' + Date.now().toString(36),
            title: `Заощаджено з ${prevMonth.name}`,
            category: 'savings',
            amountUAH: freeBalance,
            day: 1,
            isReceived: freeBalance > 0,
            isPreset: false
        });
    }

    saveState();
    renderAll();
    showToast(`Підставлено залишок з ${prevMonth.name}: +${formatCurrency(freeBalance)} ₴`, '🏦');
}

export function autofillSavingsIntoModal() {
    const prevKey = getPrevMonthKey(state.activeMonthKey);
    const prevMonth = state.months[prevKey];
    if (!prevMonth) {
        showToast('Попереднього місяця ще немає в базі', 'ℹ️');
        return;
    }

    const curMonth = state.months[state.activeMonthKey];
    const freeBalance = carryOverBalance(prevMonth, curMonth?.expenses, curMonth?.salaryDay);

    document.getElementById('modal-income-uah').value = freeBalance.toFixed(2);
    showToast(`Підставлено залишок з ${prevMonth.name}: ${formatCurrency(freeBalance)} ₴`, '🏦');
}

export function closeIncomeItemModal() {
    document.getElementById('income-item-modal').classList.add('hidden');
}

export function saveIncomeItem(e) {
    e.preventDefault();
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    curMonth.incomes = curMonth.incomes || [];
    const editId = document.getElementById('modal-income-id').value;
    const title = document.getElementById('modal-income-title').value.trim();
    const category = document.getElementById('modal-income-category').value;
    const debtor = document.getElementById('modal-income-debtor').value.trim();
    const amountUAH = parseFloat(document.getElementById('modal-income-uah').value) || 0;
    const day = parseInt(document.getElementById('modal-income-day').value) || 1;
    const isReceived = document.getElementById('modal-income-isreceived').checked;

    if (editId) {
        const item = curMonth.incomes.find(i => i.id === editId);
        if (item) {
            item.title = title;
            item.category = category;
            item.debtor = debtor;
            item.amountUAH = amountUAH;
            item.day = day;
            item.isReceived = isReceived;
        }
    } else {
        curMonth.incomes.push({
            id: 'inc_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            title,
            category,
            debtor,
            amountUAH,
            day,
            isReceived,
            isPreset: false
        });
    }

    // Синхронізація з полями savingsUAH та extraIncomeUAH
    if (category === 'savings') {
        curMonth.savingsUAH = curMonth.incomes.filter(i => i.category === 'savings').reduce((s, i) => s + (i.amountUAH || 0), 0);
    } else if (category === 'extra') {
        curMonth.extraIncomeUAH = curMonth.incomes.filter(i => i.category === 'extra').reduce((s, i) => s + (i.amountUAH || 0), 0);
    }

    saveState();
    closeIncomeItemModal();
    renderAll();
    showToast('Надходження збережено', '💰');
}

export function deleteCurrentIncomeItem() {
    const editId = document.getElementById('modal-income-id').value;
    const curMonth = state.months[state.activeMonthKey];
    if (!editId || !curMonth || !curMonth.incomes) return;

    const item = curMonth.incomes.find(i => i.id === editId);
    if (item && item.isPreset) {
        // Для предустановлених статей не видаляємо сам пункт, а скидаємо суму в 0
        item.amountUAH = 0;
        item.debtor = '';
        item.isReceived = false;
        if (item.category === 'savings') curMonth.savingsUAH = 0;
        if (item.category === 'extra') curMonth.extraIncomeUAH = 0;
        showToast('Суму статті скинуто до 0 ₴', '🔄');
    } else {
        curMonth.incomes = curMonth.incomes.filter(i => i.id !== editId);
        showToast('Надходження видалено', '🗑️');
    }

    saveState();
    closeIncomeItemModal();
    renderAll();
}

export function makeIncomeAmountEditable(e, id) {
    e.stopPropagation();
    const curMonth = state.months[state.activeMonthKey];
    const item = curMonth.incomes.find(x => x.id === id);
    if (!item) return;

    const el = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = item.amountUAH || '';
    input.placeholder = '0.00';
    input.className = 'w-24 px-1 py-0.5 text-xs bg-slate-900 text-white border border-emerald-500 rounded outline-none font-mono text-right';

    const finish = () => {
        const val = parseFloat(input.value) || 0;
        item.amountUAH = val;
        item.isReceived = val > 0;
        saveState();
        renderAll();
        showToast(`Суму оновлено: +${formatCurrency(val)} ₴`, '💰');
    };

    input.onblur = finish;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') finish();
        if (ev.key === 'Escape') renderAll();
    };

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
}

export function makeIncomeDayEditable(e, id) {
    e.stopPropagation();
    const curMonth = state.months[state.activeMonthKey];
    const item = curMonth.incomes.find(x => x.id === id);
    if (!item) return;

    const el = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '31';
    input.value = item.day || 1;
    input.className = 'w-8 px-0.5 py-0 text-[10px] bg-slate-900 text-white border border-emerald-500 rounded outline-none font-mono text-center';

    const finish = () => {
        const val = parseInt(input.value);
        if (val >= 1 && val <= 31) {
            item.day = val;
            saveState();
            renderAll();
            showToast('Число змінено на ' + val, '📅');
        } else {
            renderAll();
        }
    };

    input.onblur = finish;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') finish();
        if (ev.key === 'Escape') renderAll();
    };

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
}

export function toggleIncomeReceived(id) {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth || !curMonth.incomes) return;

    const item = curMonth.incomes.find(i => i.id === id);
    if (item) {
        item.isReceived = !item.isReceived;
        saveState();
        renderAll();
        showToast(item.isReceived ? `Отримано: ${item.title}` : `Очікується: ${item.title}`, item.isReceived ? '✅' : '⏳');
    }
}
