import { carryOverBalance, DEFAULT_RATE, getPrevMonthKey, setIncomeCategoryTotal, sumUAH } from '../../calc.js';
import { ensurePresetIncomes } from '../../data/presets.js';
import { saveState, state } from '../../state.js';
import { renderAll } from '../render.js';
import { formatCurrency, showToast } from '../../utils.js';

/**
 * МОДАЛКИ: ЗП ТА ДОХОДИ
 */
export function openSalarySettingsModal() {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    document.getElementById('salary-modal-month-name').textContent = `(${curMonth.name})`;
    document.getElementById('settings-salary-day').value = curMonth.salaryDay || 8;
    document.getElementById('settings-income-usdt').value = curMonth.incomeUSDT || curMonth.incomeUSD || '';
    document.getElementById('settings-rate').value = curMonth.rate || DEFAULT_RATE;
    document.getElementById('settings-income-uah').value = curMonth.incomeUAH || '';
    const categoryTotal = cat => sumUAH((curMonth.incomes || []).filter(i => i.category === cat));
    document.getElementById('settings-savings-uah').value = categoryTotal('savings') || '';
    document.getElementById('settings-extra-income-uah').value = categoryTotal('extra') || '';

    updateEffectiveRateBadge();
    document.getElementById('salary-modal').classList.remove('hidden');
}

export function closeSalarySettingsModal() {
    document.getElementById('salary-modal').classList.add('hidden');
}

export function convertSalaryFromUSDT() {
    const usdt = parseFloat(document.getElementById('settings-income-usdt').value) || 0;
    const rate = parseFloat(document.getElementById('settings-rate').value) || 0;
    if (usdt && rate) {
        document.getElementById('settings-income-uah').value = (usdt * rate).toFixed(2);
    }
    updateEffectiveRateBadge();
}

export function recalcUAHFromRate() {
    convertSalaryFromUSDT();
    showToast('Перераховано: USDT × Курс', '🔄');
}

export function onManualUahChange() {
    updateEffectiveRateBadge();
}

export function updateEffectiveRateBadge() {
    const usdt = parseFloat(document.getElementById('settings-income-usdt').value) || 0;
    const uah = parseFloat(document.getElementById('settings-income-uah').value) || 0;
    const badge = document.getElementById('effective-rate-badge');
    if (usdt > 0 && uah > 0) {
        badge.textContent = `~${(uah / usdt).toFixed(2)} ₴/USDT`;
    } else {
        badge.textContent = '—';
    }
}

export function toggleMultiPartCalc() {
    const body = document.getElementById('multi-calc-body');
    const arrow = document.getElementById('multi-calc-arrow');
    body.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}

export function addMultiCalcRow() {
    const container = document.getElementById('multi-calc-rows');
    const count = container.children.length + 1;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.placeholder = `Вивід ${count} (грн)`;
    input.className = 'multi-part-input w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200';
    container.appendChild(input);
}

export function applyMultiCalcSum() {
    const inputs = document.querySelectorAll('.multi-part-input');
    let sum = 0;
    inputs.forEach(inp => {
        sum += (parseFloat(inp.value) || 0);
    });

    if (sum > 0) {
        document.getElementById('settings-income-uah').value = sum.toFixed(2);
        updateEffectiveRateBadge();
        showToast(`Застосовано виводів на ${formatCurrency(sum)} ₴`, '💰');
    } else {
        showToast('Введіть суми виводів у поля', '⚠️');
    }
}

export function autoFillSavingsFromPrevMonth() {
    const prevKey = getPrevMonthKey(state.activeMonthKey);
    const prevMonth = state.months[prevKey];
    if (!prevMonth) {
        showToast('Попереднього місяця ще не існує в системі', 'ℹ️');
        return;
    }

    const curMonth = state.months[state.activeMonthKey];
    const freeBalance = carryOverBalance(prevMonth, curMonth?.expenses, curMonth?.salaryDay);

    document.getElementById('settings-savings-uah').value = freeBalance.toFixed(2);
    showToast(`Підтягнуто залишок з ${prevMonth.name}: ${formatCurrency(freeBalance)} ₴`, '🏦');
}

export function saveSalarySettings(e) {
    e.preventDefault();
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    curMonth.salaryDay = parseInt(document.getElementById('settings-salary-day').value) || 8;
    curMonth.incomeUSDT = parseFloat(document.getElementById('settings-income-usdt').value) || 0;
    curMonth.incomeUSD = curMonth.incomeUSDT;
    curMonth.rate = parseFloat(document.getElementById('settings-rate').value) || DEFAULT_RATE;
    curMonth.incomeUAH = parseFloat(document.getElementById('settings-income-uah').value) || 0;
    ensurePresetIncomes(curMonth);
    setIncomeCategoryTotal(curMonth, 'savings', parseFloat(document.getElementById('settings-savings-uah').value) || 0);
    setIncomeCategoryTotal(curMonth, 'extra', parseFloat(document.getElementById('settings-extra-income-uah').value) || 0);

    saveState();
    closeSalarySettingsModal();
    renderAll();
    showToast('Зарплату та доходи збережено', '✅');
}
