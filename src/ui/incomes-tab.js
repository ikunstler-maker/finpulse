import { DEFAULT_RATE, monthIncomeTotal, monthReceivedIncome } from '../calc.js';
import { INCOME_CATEGORIES } from '../data/categories.js';
import { ensurePresetIncomes } from '../data/presets.js';
import { state } from '../state.js';
import { escapeHtml, formatCurrency } from '../utils.js';

/**
 * РЕНДЕР ОКРЕМОЇ ВКЛАДКИ ДОХОДІВ (ТАБ 2)
 */
export function renderIncomesTab() {
    const curMonth = state.months[state.activeMonthKey];
    if (!curMonth) return;

    ensurePresetIncomes(curMonth);

    const totalAllUAH = monthIncomeTotal(curMonth);
    const totalReceivedUAH = monthReceivedIncome(curMonth);
    const pendingToReceiveUAH = Math.max(0, totalAllUAH - totalReceivedUAH);

    // Оновлення KPI карток на вкладці доходів
    document.getElementById('incomes-tab-month-name').textContent = curMonth.name;
    document.getElementById('incomes-tab-total-all').textContent = `${formatCurrency(totalAllUAH)} ₴`;
    document.getElementById('incomes-tab-total-all-usdt').textContent = curMonth.rate ? `~$${(totalAllUAH / curMonth.rate).toFixed(0)}` : '';
    document.getElementById('incomes-tab-received-sum').textContent = `${formatCurrency(totalReceivedUAH)} ₴`;
    document.getElementById('incomes-tab-pending-sum').textContent = `${formatCurrency(pendingToReceiveUAH)} ₴`;

    // ЗП рядок
    document.getElementById('incomes-tab-sal-day-badge').textContent = `${curMonth.salaryDay || 8}-е число`;
    document.getElementById('incomes-tab-sal-usdt').textContent = `${(curMonth.incomeUSDT || 0).toLocaleString('uk-UA')} USDT`;
    document.getElementById('incomes-tab-sal-rate').textContent = `${(curMonth.rate || DEFAULT_RATE)} ₴/₮`;
    document.getElementById('incomes-tab-sal-uah').textContent = `${formatCurrency(curMonth.incomeUAH)} ₴`;

    // Рендер груп надходжень
    const container = document.getElementById('incomes-groups-container');
    if (!container) return;

    let html = '';

    INCOME_CATEGORIES.forEach(cat => {
        const items = curMonth.incomes.filter(i => i.category === cat.id);
        const groupSum = items.reduce((s, i) => s + (i.amountUAH || 0), 0);
        const receivedCount = items.filter(i => i.isReceived !== false && (i.amountUAH || 0) > 0).length;

        // Особлива дія для заощаджень (кнопка підтягування залишку)
        const isSavings = cat.id === 'savings';
        const isDebt = cat.id === 'debt_return';

        html += `
            <div class="rounded-2xl p-3.5 bg-white dark:bg-darkcard border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
                <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-base">${cat.icon}</span>
                        <div class="min-w-0">
                            <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                <span>${cat.name}</span>
                                <span class="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300">
                                    ${items.length} ${items.length === 1 ? 'пункт' : 'пунктів'}
                                </span>
                            </div>
                            <div class="text-[9px] text-slate-500 dark:text-slate-400 truncate">${cat.desc}</div>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <div class="font-mono font-bold text-xs ${groupSum > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}">
                            +${formatCurrency(groupSum)} ₴
                        </div>
                        <div class="text-[8px] text-slate-400">${receivedCount}/${items.length} отримано</div>
                    </div>
                </div>

                <!-- СПИСОК ПУНКТІВ У ЦІЙ КАТЕГОРІЇ -->
                <div class="space-y-1.5">
                    ${items.length === 0 ? `
                        <div class="text-[10px] text-slate-400 text-center py-2 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                            Немає записів. Натисніть «＋ Додати пункт» нижче.
                        </div>
                    ` : items.map(item => renderIncomeRow(item)).join('')}
                </div>

                <!-- КНОПКИ ДІЙ ДЛЯ ЦІЄЇ ГРУПИ -->
                <div class="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <button onclick="openIncomeItemModal(null, '${cat.id}')" class="flex-1 py-1 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
                        <span>＋ Додати ${isDebt ? 'повернення боргу' : 'пункт'}</span>
                    </button>
                    ${isSavings ? `
                        <button onclick="autofillSavingsDirectly()" class="py-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-medium flex items-center gap-1 transition" title="Взяти чистий залишок попереднього циклу">
                            <span>🔄 Взяти залишок</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

export function renderIncomeRow(item) {
    const isReceived = item.isReceived !== false;
    const hasAmount = (item.amountUAH || 0) > 0;
    const isDebt = item.category === 'debt_return';

    return `
        <div class="group flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-100 transition hover:border-emerald-500/40 ${hasAmount ? '' : 'opacity-70'}">
            <!-- Чекбокс отримання -->
            <button onclick="toggleIncomeReceived('${item.id}')" class="w-5 h-5 flex-shrink-0 rounded-md flex items-center justify-center border transition ${isReceived && hasAmount ? 'bg-emerald-500 border-emerald-500 text-slate-950 font-bold' : 'border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-950 text-transparent'}" title="${isReceived ? 'Отримано на руки' : 'Очікується'}">
                ${isReceived && hasAmount ? '✓' : ''}
            </button>

            <!-- Число надходження -->
            <span ondblclick="makeIncomeDayEditable(event, '${item.id}')" class="w-6 text-center text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 rounded py-0.5 font-bold cursor-pointer hover:ring-1 hover:ring-emerald-400 flex-shrink-0" title="Число надходження (Подвійний клік)">${item.day || 1}</span>

            <!-- Назва та деталі боржника -->
            <div class="flex-1 min-w-0 pr-1" onclick="openIncomeItemModal('${item.id}')" role="button">
                <div class="text-xs font-semibold truncate ${hasAmount ? (isReceived ? 'text-slate-900 dark:text-white' : 'text-slate-500') : 'text-slate-400'}">
                    ${escapeHtml(item.title)}
                </div>
                ${isDebt && item.debtor ? `
                    <div class="text-[9px] text-rose-500 dark:text-rose-400 font-medium truncate flex items-center gap-1">
                        <span>👤 Боржник:</span>
                        <span class="font-bold">${escapeHtml(item.debtor)}</span>
                    </div>
                ` : ''}
            </div>

            <!-- Сума надходження -->
            <div ondblclick="makeIncomeAmountEditable(event, '${item.id}')" class="text-right flex-shrink-0 cursor-pointer font-mono font-bold text-xs ${hasAmount ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} hover:text-emerald-500 transition" title="Подвійний клік: змінити суму">
                +${formatCurrency(item.amountUAH || 0)} ₴
            </div>

            <!-- Дії -->
            <div class="flex items-center gap-1 pl-1">
                <button onclick="openIncomeItemModal('${item.id}')" class="p-1 rounded text-slate-400 hover:text-white transition text-xs" title="Редагувати">✏️</button>
            </div>
        </div>
    `;
}
