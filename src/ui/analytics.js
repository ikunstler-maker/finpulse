import Chart from 'chart.js/auto';
import { categoryTotals, collectAnalytics, DEFAULT_RATE, monthIncomeTotal } from '../calc.js';
import { CATEGORIES } from '../data/categories.js';
import { state } from '../state.js';
import { ui } from '../ui-state.js';
import { formatCurrency } from '../utils.js';

export function initDateRangeInputs() {
    const curMonth = state.months[state.activeMonthKey] || { year: 2026, month: 10 };
    const y = curMonth.year;
    const m = String(curMonth.month).padStart(2, '0');
    const lastDay = new Date(y, curMonth.month, 0).getDate();

    ui.customDateFrom = `${y}-${m}-01`;
    ui.customDateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    document.getElementById('custom-date-from').value = ui.customDateFrom;
    document.getElementById('custom-date-to').value = ui.customDateTo;
}

/**
 * АНАЛІТИКА ТА ДІАГРАМИ
 */
export function setAnalyticsMode(mode) {
    ui.currentAnalyticsMode = mode;
    const btnCustom = document.getElementById('btn-period-type-custom');
    const btnPresets = document.getElementById('btn-period-type-presets');
    const customPanel = document.getElementById('custom-date-range-panel');
    const presetsPanel = document.getElementById('quick-presets-panel');

    if (mode === 'custom') {
        btnCustom.className = 'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 bg-emerald-500 text-slate-950 shadow-sm';
        btnPresets.className = 'flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 hover:text-white';
        customPanel.classList.remove('hidden');
        presetsPanel.classList.add('hidden');
        ui.currentAnalyticsPeriod = 'custom';
    } else {
        btnPresets.className = 'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 bg-emerald-500 text-slate-950 shadow-sm';
        btnCustom.className = 'flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 hover:text-white';
        customPanel.classList.add('hidden');
        presetsPanel.classList.remove('hidden');
        ui.currentAnalyticsPeriod = 'current';
    }
    renderAnalyticsCharts();
}

export function setAnalyticsPeriod(period) {
    ui.currentAnalyticsPeriod = period;
    document.querySelectorAll('.period-btn').forEach(b => {
        if (b.dataset.period === period) {
            b.className = 'period-btn px-2.5 py-1 rounded-xl font-bold bg-emerald-500 text-slate-950 transition';
        } else {
            b.className = 'period-btn px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-darkcard text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-darkborder transition';
        }
    });
    renderAnalyticsCharts();
}

export function applyCustomDateRange() {
    ui.customDateFrom = document.getElementById('custom-date-from').value;
    ui.customDateTo = document.getElementById('custom-date-to').value;
    ui.currentAnalyticsPeriod = 'custom';
    renderAnalyticsCharts();
}

export function setCustomPreset(type) {
    const curMonth = state.months[state.activeMonthKey] || { year: 2026, month: 10, salaryDay: 8 };
    const y = curMonth.year;
    const m = curMonth.month;
    const salDay = curMonth.salaryDay || 8;

    if (type === 'cycle') {
        const prevM = m === 1 ? 12 : m - 1;
        const prevY = m === 1 ? y - 1 : y;
        ui.customDateFrom = `${prevY}-${String(prevM).padStart(2, '0')}-${String(salDay).padStart(2, '0')}`;
        ui.customDateTo = `${y}-${String(m).padStart(2, '0')}-${String(salDay - 1).padStart(2, '0')}`;
    } else if (type === 'month') {
        const lastD = new Date(y, m, 0).getDate();
        ui.customDateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
        ui.customDateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
    } else if (type === 'today') {
        const today = new Date();
        const curY = today.getFullYear();
        const curM = today.getMonth() + 1;
        const curD = today.getDate();
        ui.customDateFrom = `${curY}-${String(curM).padStart(2, '0')}-01`;
        ui.customDateTo = `${curY}-${String(curM).padStart(2, '0')}-${String(curD).padStart(2, '0')}`;
    }

    document.getElementById('custom-date-from').value = ui.customDateFrom;
    document.getElementById('custom-date-to').value = ui.customDateTo;
    applyCustomDateRange();
}

export function renderAnalyticsCharts() {
    const badgeEl = document.getElementById('analytics-period-badge');
    const curMonth = state.months[state.activeMonthKey] || { rate: DEFAULT_RATE };
    const { expenses: filteredExpenses, totalIncome, totalIncomeUSD, selectedMonths } = collectAnalytics(state, {
        period: ui.currentAnalyticsPeriod,
        from: ui.customDateFrom,
        to: ui.customDateTo,
    });

    let labelPeriod;
    if (ui.currentAnalyticsPeriod === 'custom') {
        const formatD = (dStr) => {
            if (!dStr) return '...';
            const [y, m, d] = dStr.split('-');
            return `${d}.${m}.${y}`;
        };
        labelPeriod = `${formatD(ui.customDateFrom)} — ${formatD(ui.customDateTo)}`;
    } else if (ui.currentAnalyticsPeriod === 'current') {
        labelPeriod = state.months[state.activeMonthKey]?.name || '';
    } else if (ui.currentAnalyticsPeriod === '3m' || ui.currentAnalyticsPeriod === '6m') {
        labelPeriod = `${selectedMonths[0]?.name} — ${selectedMonths[selectedMonths.length - 1]?.name}`;
    } else if (ui.currentAnalyticsPeriod === 'year') {
        labelPeriod = `Рік ${state.months[state.activeMonthKey]?.year || 2026}`;
    } else {
        labelPeriod = `Уся історія (${selectedMonths.length} міс.)`;
    }

    badgeEl.textContent = labelPeriod;

    // Фільтрація за режимом (Усі / Лише сплачені)
    const chartMode = document.getElementById('an-chart-mode')?.value || 'planned';
    const chartExpenses = chartMode === 'paid' ? filteredExpenses.filter(e => e.isPaid) : filteredExpenses;

    // Підрахунок сум
    const totalSpentUAH = filteredExpenses.filter(e => e.isPaid).reduce((s, e) => s + e.amountUAH, 0);
    const totalSpentUSD = filteredExpenses.filter(e => e.isPaid).reduce((s, e) => s + (e.amountUSD > 0 ? e.amountUSD : (e.monthRate ? e.amountUAH / e.monthRate : 0)), 0);

    const totalObligationUAH = filteredExpenses.reduce((s, e) => s + e.amountUAH, 0);
    const totalFreeUAH = totalIncome - totalObligationUAH;
    const avgRate = curMonth.rate || DEFAULT_RATE;
    const totalFreeUSD = avgRate ? (totalFreeUAH / avgRate) : 0;

    document.getElementById('an-total-income').textContent = `${formatCurrency(totalIncome)} ₴`;
    document.getElementById('an-total-income-usd').textContent = `$${totalIncomeUSD.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('an-total-spent').textContent = `${formatCurrency(totalSpentUAH)} ₴`;
    document.getElementById('an-total-spent-usd').textContent = `$${totalSpentUSD.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('an-total-free').textContent = `${formatCurrency(totalFreeUAH)} ₴`;
    document.getElementById('an-total-free-usd').textContent = `$${totalFreeUSD.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // 1. КРУГОВА ДІАГРАМА
    const totals = categoryTotals(chartExpenses, CATEGORIES);
    const activeCategories = totals.map(t => t.category);
    const catMap = Object.fromEntries(totals.map(t => [t.category.id, t.amountUAH]));

    const chartLabels = activeCategories.map(c => `${c.icon} ${c.name}`);
    const chartData = totals.map(t => t.amountUAH);
    const chartColors = activeCategories.map(c => c.color);

    const ctxPie = document.getElementById('categoryChart')?.getContext('2d');
    if (ctxPie) {
        if (ui.categoryChartInstance) ui.categoryChartInstance.destroy();

        ui.categoryChartInstance = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    backgroundColor: chartColors,
                    borderColor: document.documentElement.classList.contains('light') ? '#ffffff' : '#131d31',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.raw || 0;
                                const sum = chartData.reduce((a, b) => a + b, 0);
                                const pct = sum > 0 ? ((val / sum) * 100).toFixed(1) : 0;
                                return ` ${formatCurrency(val)} ₴ (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '68%'
            }
        });
    }

    // Легенда з фіксованими кольорами
    const legendContainer = document.getElementById('chart-legend-list');
    if (legendContainer) {
        const totalChartSum = chartData.reduce((a, b) => a + b, 0);
        if (activeCategories.length === 0) {
            legendContainer.innerHTML = '<div class="text-[10px] text-slate-400 text-center py-2">Немає витрат у цьому періоді</div>';
        } else {
            legendContainer.innerHTML = activeCategories.map(c => {
                const val = catMap[c.id] || 0;
                const pct = totalChartSum > 0 ? Math.round((val / totalChartSum) * 100) : 0;
                const valUSD = avgRate ? (val / avgRate).toFixed(2) : '0.00';
                return `
                    <div class="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${c.color}"></span>
                            <span class="text-xs">${c.icon}</span>
                            <span class="truncate text-slate-700 dark:text-slate-300">${c.name}</span>
                        </div>
                        <div class="text-right flex-shrink-0 font-mono">
                            <span class="text-[10px] text-slate-400 mr-1.5">${pct}%</span>
                            <span class="font-bold text-slate-900 dark:text-white">${formatCurrency(val)} ₴</span>
                            <span class="block text-[8px] text-slate-400">~$${valUSD}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. ДІАГРАМА ДИНАМІКИ ПОМІСЯЧНО
    const ctxDyn = document.getElementById('dynamicsChart')?.getContext('2d');
    if (ctxDyn) {
        if (ui.dynamicsChartInstance) ui.dynamicsChartInstance.destroy();

        const isLight = document.documentElement.classList.contains('light');
        const allKeys = Object.keys(state.months).sort();
        const dynLabels = allKeys.map(k => state.months[k].name.replace(' 2026', '').replace(' 2027', ''));
        const incomeData = allKeys.map(k => {
            return monthIncomeTotal(state.months[k]);
        });
        const spentData = allKeys.map(k => {
            return (state.months[k].expenses || []).filter(e => e.isPaid).reduce((s, e) => s + e.amountUAH, 0);
        });
        const plannedData = allKeys.map(k => {
            return (state.months[k].expenses || []).reduce((s, e) => s + e.amountUAH, 0);
        });

        ui.dynamicsChartInstance = new Chart(ctxDyn, {
            type: 'bar',
            data: {
                labels: dynLabels,
                datasets: [
                    {
                        label: 'Дохід (₴)',
                        data: incomeData,
                        backgroundColor: '#10b981',
                        borderRadius: 4,
                        maxBarThickness: 16
                    },
                    {
                        label: 'Факт витрат (₴)',
                        data: spentData,
                        backgroundColor: '#0ea5e9',
                        borderRadius: 4,
                        maxBarThickness: 16
                    },
                    {
                        label: 'План витрат (₴)',
                        data: plannedData,
                        backgroundColor: isLight ? '#cbd5e1' : '#334155',
                        borderRadius: 4,
                        maxBarThickness: 16
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 8,
                            font: { size: 9 },
                            color: isLight ? '#475569' : '#94a3b8'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 9 }, color: isLight ? '#475569' : '#94a3b8' }
                    },
                    y: {
                        grid: { color: isLight ? '#f1f5f9' : '#1e293b' },
                        ticks: {
                            font: { size: 8 },
                            color: isLight ? '#475569' : '#94a3b8',
                            callback: (val) => `${val / 1000}k ₴`
                        }
                    }
                }
            }
        });
    }
}
