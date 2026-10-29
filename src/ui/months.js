import { carryOverBalance, getNextMonthKey } from '../calc.js';
import { ensurePresetIncomes } from '../data/presets.js';
import { saveState, state } from '../state.js';
import { renderAll } from './render.js';
import { escapeHtml, showToast } from '../utils.js';

/**
 * КЕРУВАННЯ МІСЯЦЯМИ
 */
export function prevMonth() {
    const keys = Object.keys(state.months).sort();
    const idx = keys.indexOf(state.activeMonthKey);
    if (idx > 0) {
        state.activeMonthKey = keys[idx - 1];
        saveState();
        renderAll();
    } else {
        showToast('Це найперший збережений місяць', 'ℹ️');
    }
}

export function nextMonth() {
    const keys = Object.keys(state.months).sort();
    const idx = keys.indexOf(state.activeMonthKey);
    if (idx < keys.length - 1) {
        state.activeMonthKey = keys[idx + 1];
        saveState();
        renderAll();
    } else {
        const nextKey = getNextMonthKey(state.activeMonthKey);
        if (!state.months[nextKey]) {
            cloneMonthToNext();
        } else {
            state.activeMonthKey = nextKey;
            saveState();
            renderAll();
        }
    }
}

export function toggleMonthDropdown() {
    const dd = document.getElementById('months-dropdown');
    if (!dd.classList.contains('hidden')) {
        dd.classList.add('hidden');
        return;
    }

    const keys = Object.keys(state.months).sort();
    dd.innerHTML = keys.map(k => {
        const m = state.months[k];
        const isAct = k === state.activeMonthKey;
        return `
            <div onclick="selectMonthKey('${k}')" class="p-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${isAct ? 'bg-emerald-500 text-slate-950 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}">
                <span>${escapeHtml(m.name)}</span>
                <span class="font-mono text-[10px] opacity-80">${m.expenses.length} витрат</span>
            </div>
        `;
    }).join('');

    dd.classList.remove('hidden');
}

export function selectMonthKey(key) {
    state.activeMonthKey = key;
    saveState();
    document.getElementById('months-dropdown').classList.add('hidden');
    renderAll();
}

export function cloneMonthToNext() {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    const nextKey = getNextMonthKey(state.activeMonthKey);
    const [nextY, nextM] = nextKey.split('-').map(Number);
    const monthNamesUa = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    const nextName = `${monthNamesUa[nextM - 1]} ${nextY}`;

    // Копіювання статей зі скиданням чеків
    const clonedExpenses = curMonth.expenses.map(e => ({
        ...e,
        id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        isPaid: false
    }));

    // Розрахунок залишку поточного місяця для автоматичного встановлення в заощадження наступного
    const autoSavings = carryOverBalance(curMonth, clonedExpenses, curMonth.salaryDay);

    state.months[nextKey] = {
        year: nextY,
        month: nextM,
        name: nextName,
        salaryDay: curMonth.salaryDay,
        incomeUAH: curMonth.incomeUAH,
        incomeUSD: curMonth.incomeUSD,
        incomeUSDT: curMonth.incomeUSDT,
        savingsUAH: autoSavings,
        extraIncomeUAH: 0,
        incomes: [],
        rate: curMonth.rate,
        expenses: clonedExpenses
    };

    ensurePresetIncomes(state.months[nextKey]);
    state.activeMonthKey = nextKey;
    saveState();
    renderAll();
    showToast(`Створено та перенесено на ${nextName}`, '🚀');
}
