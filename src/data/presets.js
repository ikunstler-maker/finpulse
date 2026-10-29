import { PRESET_INCOMES } from './categories.js';

/**
 * Гарантує, що в місяці є статті-шаблони надходжень (заощадження, підробіток тощо).
 */
export function ensurePresetIncomes(month) {
    if (!month) return;
    if (!Array.isArray(month.incomes)) month.incomes = [];

    PRESET_INCOMES.forEach(p => {
        let existing = month.incomes.find(i => i.id === p.id || (i.category === p.category && i.isPreset));
        if (!existing) {
            existing = month.incomes.find(i => i.category === p.category);
            if (existing) {
                existing.isPreset = true;
            } else {
                let amount = 0;
                if (p.category === 'savings') {
                    amount = month.savingsUAH !== undefined ? month.savingsUAH : (month.year === 2026 && month.month === 10 ? 3000 : 0);
                } else if (p.category === 'extra') {
                    amount = month.extraIncomeUAH || 0;
                }
                month.incomes.push({
                    id: p.id,
                    title: p.title,
                    category: p.category,
                    amountUAH: amount,
                    day: p.day,
                    debtor: p.debtor || '',
                    isReceived: amount > 0,
                    isPreset: true
                });
            }
        }
    });
}
