import { ensurePresetIncomes } from './presets.js';

/**
 * ДЕМО-ДАНІ
 */
export function getDefaultInitialState() {
    // Fictional demo data: no real people, amounts or services of the owner.
    const state = {
        version: 5,
        cards: [
            { id: 'card_demo_main', name: 'Основна', color: '#1f6feb' },
            { id: 'card_demo_salary', name: 'Зарплатна', color: '#d9822b', last4: '4821' },
        ],
        demo: true,
        activeMonthKey: '2026-10',
        appMode: 'view', // 'view' або 'edit'
        months: {
            '2026-10': {
                year: 2026,
                month: 10,
                name: 'Жовтень 2026',
                salaryDay: 8,
                incomeUAH: 49800.00,
                incomeUSD: 1200.00,
                incomeUSDT: 1200.00,
                salaryParts: [
                    { id: 'sal_demo_1', amount: 700, currency: 'USDT', uah: 28980.00, day: 8, received: true, cardId: 'card_demo_salary' },
                    { id: 'sal_demo_2', amount: 500, currency: 'USDT', uah: 20820.00, day: 15, received: true },
                ],
                savingsUAH: 3000.00,
                extraIncomeUAH: 0,
                incomes: [
                    { id: 'preset_savings', title: 'Заощадження з попереднього місяця', category: 'savings', amountUAH: 3000.00, day: 1, isReceived: true, isPreset: true },
                    { id: 'preset_extra', title: 'Додатковий заробіток', category: 'extra', amountUAH: 0.00, day: 10, isReceived: false, isPreset: true },
                    { id: 'preset_charity', title: 'Благодійні надходження', category: 'charity_in', amountUAH: 0.00, day: 15, isReceived: false, isPreset: true },
                    { id: 'preset_debt', title: 'Повернення боргів', category: 'debt_return', debtor: '', amountUAH: 0.00, day: 20, isReceived: false, isPreset: true }
                ],
                rate: 41.50,
                expenses: [
                    { id: 'exp_1', title: 'Домашній інтернет', category: 'comm', amountUAH: 300.00, amountUSD: 0, payDay: 28, isPaid: false },
                    { id: 'exp_2', title: 'Мобільний зв\'язок', category: 'comm', amountUAH: 250.00, amountUSD: 0, payDay: 12, isPaid: true },
                    { id: 'exp_3', title: 'Стрімінговий сервіс', category: 'subscriptions', amountUAH: 331.59, amountUSD: 7.99, payDay: 15, isPaid: false, cardId: 'card_demo_main' },
                    { id: 'exp_4', title: 'Музичний сервіс', category: 'subscriptions', amountUAH: 248.59, amountUSD: 5.99, payDay: 3, isPaid: false },
                    { id: 'exp_5', title: 'Хмарне сховище', category: 'subscriptions', amountUAH: 82.59, amountUSD: 1.99, payDay: 6, isPaid: false },
                    { id: 'exp_6', title: 'Оренда квартири', category: 'housing', amountUAH: 12000.00, amountUSD: 0, payDay: 10, isPaid: false, cardId: 'card_demo_salary' },
                    { id: 'exp_7', title: 'Комунальні послуги', category: 'housing', amountUAH: 2500.00, amountUSD: 0, payDay: 20, isPaid: false },
                    { id: 'exp_8', title: 'Продукти', category: 'food', amountUAH: 8000.00, amountUSD: 0, payDay: 9, isPaid: true, cardId: 'card_demo_main' },
                    { id: 'exp_9', title: 'Стрижка', category: 'beauty', amountUAH: 900.00, amountUSD: 0, payDay: 18, isPaid: false },
                    { id: 'exp_10', title: 'Спортзал', category: 'health', amountUAH: 1100.00, amountUSD: 0, payDay: 14, isPaid: false },
                    { id: 'exp_11', title: 'Дрібний ремонт', category: 'home', amountUAH: 1500.00, amountUSD: 0, payDay: 22, isPaid: false },
                    { id: 'exp_12', title: 'Розстрочка за телефон', category: 'debts', amountUAH: 1250.00, amountUSD: 0, payDay: 11, isPaid: false },
                    { id: 'exp_13', title: 'Подарунок на день народження', category: 'gifts', amountUAH: 800.00, amountUSD: 0, payDay: 25, isPaid: false },
                    { id: 'exp_14', title: 'Інші дрібні витрати', category: 'other', amountUAH: 1000.00, amountUSD: 0, payDay: 30, isPaid: false }
                ]
            },
            '2026-11': {
                year: 2026,
                month: 11,
                name: 'Листопад 2026',
                salaryDay: 8,
                incomeUAH: 49800.00,
                incomeUSD: 1200.00,
                incomeUSDT: 1200.00,
                salaryParts: [
                    { id: 'sal_demo_3', amount: 1200, currency: 'USDT', uah: 49800.00, day: 8, received: false },
                ],
                savingsUAH: 0,
                extraIncomeUAH: 0,
                incomes: [],
                rate: 41.50,
                expenses: [
                    { id: 'exp_nov_1', title: 'Музичний сервіс', category: 'subscriptions', amountUAH: 248.59, amountUSD: 5.99, payDay: 3, isPaid: false },
                    { id: 'exp_nov_2', title: 'Хмарне сховище', category: 'subscriptions', amountUAH: 82.59, amountUSD: 1.99, payDay: 6, isPaid: false },
                    { id: 'exp_nov_3', title: 'Оренда квартири', category: 'housing', amountUAH: 12000.00, amountUSD: 0, payDay: 10, isPaid: false, cardId: 'card_demo_salary' },
                    { id: 'exp_nov_4', title: 'Продукти', category: 'food', amountUAH: 8000.00, amountUSD: 0, payDay: 9, isPaid: false, cardId: 'card_demo_main' }
                ]
            }
        }
    };
    ensurePresetIncomes(state.months['2026-10']);
    ensurePresetIncomes(state.months['2026-11']);
    return state;
}
