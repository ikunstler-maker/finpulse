import { t } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';

export const esc = escapeHtml;

const MONTHS_SHORT = () => t('months.short').split(',');
const MONTHS_GENITIVE = () => t('months.genitive').split(',');
const MONTHS_NAME = () => t('months.name').split(',');

export function money(n) {
    return `${(Number(n) || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
}

export function money0(n) {
    return `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} ₴`;
}

export function number(n, digits = 2) {
    return (Number(n) || 0).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** «$7.99», «500 USDT», «1 200 ₴». */
export function foreign(amount, currency) {
    if (currency === 'USD') return `$${(Number(amount) || 0).toFixed(2)}`;
    if (currency === 'USDT') return `${number(amount)} USDT`;
    return money(amount);
}

export const currencySymbol = c => (c === 'USD' ? '$' : c === 'USDT' ? 'USDT' : '₴');

/** «10 жовт». month — 1..12. */
export function dayMonth(month, day) {
    return `${day} ${MONTHS_SHORT()[month - 1]}`;
}

/** «8 жовтня». */
export function dayMonthLong(month, day) {
    return `${day} ${MONTHS_GENITIVE()[month - 1]}`;
}

export const monthName = (year, month) => `${MONTHS_NAME()[month - 1]} ${year}`;

export function monthKeyOf(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

/** Дата витрати чи надходження в межах місяця. */
export const dateOf = (m, day) => new Date(m.year, m.month - 1, day || 1);

/** Ціле число днів від today до date (від'ємне — минуло). */
export function daysFrom(today, date) {
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((date - a) / 86400000);
}
