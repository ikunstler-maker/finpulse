import { INCOME_CATEGORIES } from '../data/categories.js';
import { escapeHtml, formatCurrency } from '../utils.js';

/**
 * РЕНДЕР СЕКЦІЇ НАДХОДЖЕНЬ
 */
export function toggleIncomesDetails() {
    const body = document.getElementById('incomes-body');
    const arrow = document.getElementById('incomes-toggle-arrow');
    body.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}

export function renderIncomesSection(curMonth, totalIncomeUAH, itemsIncomeTotalUAH) {
    const countBadge = document.getElementById('incomes-count-badge');
    const totalSummary = document.getElementById('incomes-total-summary');
    const extraSummary = document.getElementById('incomes-extra-summary');
    const chipsContainer = document.getElementById('incomes-chips-container');
    const itemsList = document.getElementById('incomes-items-list');
    const isLight = document.documentElement.classList.contains('light');

    const activeItemsCount = (curMonth.incomes || []).filter(i => (i.amountUAH || 0) > 0).length;
    countBadge.textContent = activeItemsCount > 0 ? `ЗП + ${activeItemsCount} активних` : 'ЗП + 4 статті (0 ₴)';
    totalSummary.textContent = `${formatCurrency(totalIncomeUAH)} ₴`;
    extraSummary.textContent = itemsIncomeTotalUAH > 0 ? `(додатково +${formatCurrency(itemsIncomeTotalUAH)} ₴)` : '';

    // Чіпси структури доходу (ЗП + 4 обов'язкові статті)
    const catSums = {};
    (curMonth.incomes || []).forEach(inc => {
        catSums[inc.category] = (catSums[inc.category] || 0) + (inc.amountUAH || 0);
    });

    let chipsHtml = `
        <div class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">
            <span class="block text-[8px] text-slate-500 dark:text-slate-400">💼 ЗП (Binance)</span>
            <span class="font-bold">${formatCurrency(curMonth.incomeUAH)} ₴</span>
        </div>
        <div class="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-mono">
            <span class="block text-[8px] text-slate-500 dark:text-slate-400">🏦 Заощадження</span>
            <span class="font-bold">${formatCurrency(catSums['savings'] || 0)} ₴</span>
        </div>
        <div class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-mono">
            <span class="block text-[8px] text-slate-500 dark:text-slate-400">⚡ Дод. заробіток</span>
            <span class="font-bold">${formatCurrency(catSums['extra'] || 0)} ₴</span>
        </div>
        <div class="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-mono">
            <span class="block text-[8px] text-slate-500 dark:text-slate-400">🕊️ Благодійність</span>
            <span class="font-bold">${formatCurrency(catSums['charity_in'] || 0)} ₴</span>
        </div>
        <div class="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-mono">
            <span class="block text-[8px] text-slate-500 dark:text-slate-400">🤝 Повернення боргів</span>
            <span class="font-bold">${formatCurrency(catSums['debt_return'] || 0)} ₴</span>
        </div>
    `;

    // Якщо є інші довільні категорії надходжень
    Object.keys(catSums).forEach(catId => {
        if (!['savings', 'extra', 'charity_in', 'debt_return'].includes(catId)) {
            const catObj = INCOME_CATEGORIES.find(c => c.id === catId) || { icon: '💵', name: 'Надходження' };
            chipsHtml += `
                <div class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono">
                    <span class="block text-[8px] text-slate-500 dark:text-slate-400 truncate">${catObj.icon} ${catObj.name}</span>
                    <span class="font-bold text-slate-800 dark:text-slate-200">${formatCurrency(catSums[catId])} ₴</span>
                </div>
            `;
        }
    });

    chipsContainer.innerHTML = chipsHtml;

    // Рендер рядків надходжень
    itemsList.innerHTML = (curMonth.incomes || []).map(inc => {
        const cat = INCOME_CATEGORIES.find(c => c.id === inc.category) || { icon: '💵', name: 'Дохід' };
        const isReceived = inc.isReceived !== false;
        const hasAmount = (inc.amountUAH || 0) > 0;
        const itemClass = isLight 
            ? 'bg-white border-emerald-200 text-slate-800' 
            : 'bg-darkcard border-emerald-500/30 text-slate-100';

        return `
            <div class="flex items-center gap-2 text-xs py-1.5 px-2 rounded-xl border ${itemClass} transition ${hasAmount ? '' : 'opacity-70'}">
                <button onclick="toggleIncomeReceived('${inc.id}')" class="w-5 h-5 flex-shrink-0 rounded-md flex items-center justify-center border transition ${isReceived && hasAmount ? 'bg-emerald-500 border-emerald-500 text-slate-950 font-bold' : 'border-slate-400 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 text-transparent'}" title="${isReceived ? 'Отримано' : 'Очікується'}">
                    ${isReceived && hasAmount ? '✓' : ''}
                </button>
                <span class="w-6 text-center text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 rounded py-0.5 font-bold cursor-pointer" onclick="openIncomeItemModal('${inc.id}')" title="Число надходження">${inc.day || 1}</span>
                <span class="text-xs" title="${cat.name}">${cat.icon}</span>
                <div class="flex-1 min-w-0" onclick="openIncomeItemModal('${inc.id}')" role="button">
                    <div class="truncate font-medium text-xs ${hasAmount ? (isReceived ? '' : 'text-slate-400 italic') : 'text-slate-400'}">${escapeHtml(inc.title)}</div>
                    <div class="text-[9px] text-slate-400">${cat.name}</div>
                </div>
                <div ondblclick="makeIncomeAmountEditable(event, '${inc.id}')" class="text-right flex-shrink-0 font-mono font-bold text-xs ${hasAmount ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'} cursor-pointer hover:text-emerald-500 transition" title="Подвійний клік: змінити суму">
                    +${formatCurrency(inc.amountUAH || 0)} ₴
                </div>
                <button onclick="openIncomeItemModal('${inc.id}')" class="p-1 rounded-md text-slate-400 hover:text-white transition text-xs" title="Редагувати або вказати суму">
                    ✏️
                </button>
            </div>
        `;
    }).join('');
}

export function toggleBridgeDetails() {
    const list = document.getElementById('bridge-items-list');
    const arrow = document.getElementById('bridge-toggle-arrow');
    list.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}
