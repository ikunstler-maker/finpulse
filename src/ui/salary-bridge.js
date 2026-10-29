import { CATEGORIES } from '../data/categories.js';
import { escapeHtml, formatCurrency } from '../utils.js';

/**
 * РЕНДЕР СЕКЦІЇ ЗАРПЛАТНОГО МІСТКА
 */
export function renderBridgeSection(bridgeItems, bridgeTotalUAH, nextMonth) {
    const bridgeCard = document.getElementById('bridge-card');
    const daysRangeEl = document.getElementById('bridge-days-range');
    const totalDisplayEl = document.getElementById('bridge-total-display');
    const listEl = document.getElementById('bridge-items-list');
    if (!bridgeCard || !totalDisplayEl || !listEl) return;

    if (!nextMonth) {
        if (daysRangeEl) daysRangeEl.textContent = 'Наступний місяць';
        totalDisplayEl.textContent = '0.00 ₴';
        listEl.innerHTML = '<div class="text-[10px] text-slate-400 text-center py-1">Немає наступного циклу</div>';
        return;
    }

    const salDay = nextMonth.salaryDay || 8;
    if (daysRangeEl) {
        daysRangeEl.textContent = salDay > 1 ? `1–${salDay - 1} ${nextMonth.name.toLowerCase()}` : `ЗП 1-го числа`;
    }
    totalDisplayEl.textContent = `${formatCurrency(bridgeTotalUAH)} ₴`;

    if (bridgeItems.length === 0) {
        listEl.innerHTML = '<div class="text-[10px] text-slate-400 text-center py-1">Немає витрат до ЗП наступного місяця</div>';
    } else {
        listEl.innerHTML = bridgeItems.map(item => {
            const cat = CATEGORIES.find(c => c.id === item.category) || { icon: '⚡', name: 'Інше' };
            return `
                <div class="flex items-center justify-between text-xs py-1.5 px-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-800 dark:text-amber-200">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-5 text-center text-[10px] font-mono font-bold bg-amber-500/20 rounded py-0.5">${item.payDay}</span>
                        <span>${cat.icon}</span>
                        <span class="truncate font-medium">${escapeHtml(item.title)}</span>
                    </div>
                    <div class="font-mono font-bold text-xs flex-shrink-0">
                        ${formatCurrency(item.amountUAH)} ₴
                    </div>
                </div>
            `;
        }).join('');
    }
}
