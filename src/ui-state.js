/**
 * ЗМІННІ ІНТЕРФЕЙСУ ТА ФІЛЬТРІВ
 * Mutable UI state shared between modules (ES module bindings are read-only for importers).
 */
export const ui = {
    currentStatusFilter: 'all', // 'all', 'pending', 'overdue', 'paid'
    currentCategoryFilter: 'all',
    currentMainTab: 'budget', // 'budget', 'incomes', 'analytics'
    currentAnalyticsMode: 'custom', // 'custom' або 'presets'
    currentAnalyticsPeriod: 'custom', // 'custom', 'current', '3m', '6m', 'year', 'all'
    customDateFrom: '',
    customDateTo: '',
    categoryChartInstance: null,
    dynamicsChartInstance: null,
};
