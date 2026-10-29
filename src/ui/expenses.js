import { isExpenseOverdue } from '../calc.js';
import { CATEGORIES, SECTIONS } from '../data/categories.js';
import { state } from '../state.js';
import { ui } from '../ui-state.js';
import { escapeHtml, formatCurrency } from '../utils.js';

/**
 * РЕНДЕР СПИСКУ ВИТРАТ
 */
export function renderExpenses() {
    const curMonth = state.months[state.activeMonthKey];
    const container = document.getElementById('expenses-container');
    if (!curMonth || !container) return;

    let filtered = curMonth.expenses.slice();

    // Фільтр за категорією
    if (ui.currentCategoryFilter !== 'all') {
        filtered = filtered.filter(e => e.category === ui.currentCategoryFilter);
    }

    // Фільтр за статусом
    if (ui.currentStatusFilter === 'pending') {
        filtered = filtered.filter(e => !e.isPaid);
    } else if (ui.currentStatusFilter === 'paid') {
        filtered = filtered.filter(e => e.isPaid);
    } else if (ui.currentStatusFilter === 'overdue') {
        filtered = filtered.filter(e => !e.isPaid && isExpenseOverdue(e, curMonth));
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                <span class="text-3xl block mb-2">📭</span>
                <div class="text-xs font-bold text-slate-700 dark:text-slate-300">Немає витрат за цим фільтром</div>
                <p class="text-[10px] text-slate-500 mt-1">Змініть параметри фільтрації або додайте нову статтю витрат.</p>
            </div>
        `;
        return;
    }

    // Групування за розділами
    let html = '';
    SECTIONS.forEach(sec => {
        const secItems = filtered.filter(e => {
            const catObj = CATEGORIES.find(c => c.id === e.category);
            return catObj && catObj.section === sec.id;
        });

        if (secItems.length === 0) return;

        secItems.sort((a, b) => a.payDay - b.payDay);

        const secTotal = secItems.reduce((s, e) => s + e.amountUAH, 0);
        const secPaidCount = secItems.filter(e => e.isPaid).length;

        html += `
            <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs font-bold pt-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                    <span class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <span>${sec.icon}</span>
                        <span>${sec.title.toUpperCase()}</span>
                    </span>
                    <span class="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                        ${formatCurrency(secTotal)} ₴ <span class="text-slate-400 text-[10px] font-normal">(${secPaidCount}/${secItems.length})</span>
                    </span>
                </div>
                <div class="space-y-1">
                    ${secItems.map(item => renderExpenseRow(item, curMonth)).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

export function renderExpenseRow(item, curMonth) {
    const cat = CATEGORIES.find(c => c.id === item.category) || { icon: '⚡', name: 'Інше', color: '#10b981' };
    const isOverdue = !item.isPaid && isExpenseOverdue(item, curMonth);
    const isEdit = state.appMode === 'edit';

    const checkboxBorder = isOverdue 
        ? 'border-amber-400 ring-2 ring-amber-400/50 pulse-overdue' 
        : (item.isPaid ? 'border-emerald-500 bg-emerald-500 text-slate-950 font-bold' : 'border-slate-400 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 text-transparent');

    const rowOpacity = item.isPaid ? 'opacity-65' : 'opacity-100';

    return `
        <div class="expense-row group flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-darkcard text-slate-800 dark:text-slate-100 transition shadow-sm ${rowOpacity}">
            <!-- Чекбокс оплати -->
            <button onclick="toggleExpensePaid('${item.id}')" class="w-5 h-5 flex-shrink-0 rounded-md flex items-center justify-center border transition ${checkboxBorder}" title="${item.isPaid ? 'Сплачено' : (isOverdue ? 'Минула дата! Сплатити?' : 'Очікує оплати')}">
                ${item.isPaid ? '✓' : (isOverdue ? '!' : '')}
            </button>

            <!-- Число місяця -->
            <span ondblclick="makeDayEditable(event, '${item.id}')" class="w-6 text-center text-[10px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded py-0.5 font-bold cursor-pointer hover:ring-1 hover:ring-emerald-400" title="Подвійний клік: змінити число">${item.payDay}</span>

            <!-- Іконка категорії -->
            <span ondblclick="makeCategoryEditable(event, '${item.id}')" class="text-xs cursor-pointer hover:scale-125 transition-transform" title="${cat.name} (Подвійний клік: змінити)">${cat.icon}</span>

            <!-- Назва витрати -->
            <div class="flex-1 min-w-0 pr-1">
                <div ondblclick="makeTitleEditable(event, '${item.id}')" class="text-xs font-medium truncate cursor-pointer hover:text-emerald-500 transition select-text ${item.isPaid ? 'line-through text-slate-400' : ''}" title="Подвійний клік для швидкого редагування">
                    ${escapeHtml(item.title)}
                </div>
            </div>

            <!-- Сума у ₴ та $ -->
            <div ondblclick="makeAmountEditable(event, '${item.id}')" class="text-right flex-shrink-0 cursor-pointer hover:text-emerald-400" title="Подвійний клік: змінити суму">
                <div class="text-xs font-bold font-mono text-slate-900 dark:text-white">${formatCurrency(item.amountUAH)} ₴</div>
                ${item.amountUSD > 0 ? `<div class="text-[9px] text-slate-400 font-mono">$${item.amountUSD.toFixed(2)}</div>` : ''}
            </div>

            <!-- Кнопки швидких дій у режимі редагування -->
            ${isEdit ? `
                <div class="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-800">
                    <button onclick="duplicateExpense('${item.id}')" class="p-1 rounded text-slate-400 hover:text-white transition text-[11px]" title="Дублювати статтю">📋</button>
                    <button onclick="openExpenseModal('${item.id}')" class="p-1 rounded text-slate-400 hover:text-white transition text-[11px]" title="Редагувати">✏️</button>
                </div>
            ` : ''}
        </div>
    `;
}
