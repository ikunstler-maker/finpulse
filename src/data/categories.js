/**
 * КАТЕГОРІЇ ТА ЇХНІ КОЛЬОРИ
 */
export const CATEGORIES = [
    { id: 'subscriptions', name: 'Підписки та сервіси', icon: '💻', color: '#8B5CF6', section: 'regular' },
    { id: 'comm', name: 'Зв\'язок та Інтернет', icon: '📱', color: '#06B6D4', section: 'regular' },
    { id: 'housing', name: 'Оренда та ЖКГ', icon: '🏠', color: '#6366F1', section: 'regular' },
    { id: 'food', name: 'Продукти та їжа', icon: '🛒', color: '#F97316', section: 'regular' },
    { id: 'beauty', name: 'Догляд та краса', icon: '💅', color: '#EC4899', section: 'lifestyle' },
    { id: 'health', name: 'Здоров\'я та медицина', icon: '🩺', color: '#10B981', section: 'lifestyle' },
    { id: 'home', name: 'Побут та ремонт', icon: '🛠️', color: '#D97706', section: 'lifestyle' },
    { id: 'other', name: 'Інші витрати', icon: '⚡', color: '#94A3B8', section: 'lifestyle' },
    { id: 'debts', name: 'Борги та розстрочки', icon: '💳', color: '#EF4444', section: 'debts' },
    { id: 'gifts', name: 'Подарунки та свята', icon: '🎁', color: 'var(--cat-gifts)', section: 'gifts' },
    { id: 'charity', name: 'Благодійність', icon: '🕊️', color: '#22C55E', section: 'charity' },
];

export const INCOME_CATEGORIES = [
    { id: 'savings', name: 'Заощадження з попереднього місяця', icon: '🏦', color: '#06b6d4', desc: 'Залишок коштів з минулого циклу чи скарбнички' },
    { id: 'extra', name: 'Додатковий заробіток / Фріланс', icon: '💼', color: '#f59e0b', desc: 'Підробіток, консультації, проєкти' },
    { id: 'charity_in', name: 'Благодійні надходження / Донати', icon: '🕊️', color: '#8b5cf6', desc: 'Цільові збори, допомога, гранти' },
    { id: 'debt_return', name: 'Повернення боргів', icon: '🤝', color: '#ec4899', desc: 'Фіксація: хто, коли та скільки повернув' },
    { id: 'other_inc', name: 'Інші доходи', icon: '💵', color: '#10b981', desc: 'Кешбек, подарунки, відсотки' },
];

// Предустановлені обов'язкові статті надходжень для кожного місяця
export const PRESET_INCOMES = [
    { id: 'preset_savings', category: 'savings', title: 'Заощадження з попереднього місяця', day: 1, defaultAmount: 0 },
    { id: 'preset_extra', category: 'extra', title: 'Додатковий заробіток', day: 10, defaultAmount: 0 },
    { id: 'preset_charity', category: 'charity_in', title: 'Благодійні надходження', day: 15, defaultAmount: 0 },
    { id: 'preset_debt', category: 'debt_return', title: 'Повернення боргів', day: 20, debtor: '', defaultAmount: 0 }
];

export const SECTIONS = [
    { id: 'regular', title: 'Обов\'язкові регулярні платежі', icon: '📋' },
    { id: 'lifestyle', title: 'Краса, догляд та додаткові витрати', icon: '✨' },
    { id: 'debts', title: 'Борги та розстрочки', icon: '💳' },
    { id: 'gifts', title: 'Подарунки та свята', icon: '🎁' },
    { id: 'charity', title: 'Благодійність', icon: '🕊️' },
];
