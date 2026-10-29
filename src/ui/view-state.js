/** Стан інтерфейсу, який не зберігається в даних (вкладка, фільтри, період звітів). */
export const view = {
    tab: 'budget',
    filter: { status: 'all', categories: [], min: null, max: null, search: '', sort: 'date' },
    reportPeriod: 'current',
    reportFrom: '',
    reportTo: '',
    reportMode: 'planned',
};
