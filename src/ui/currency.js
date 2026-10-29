import { round2 } from '../calc.js';
import { t } from '../i18n/index.js';
import { currencySymbol } from './format.js';
import { fetchRates } from './rates.js';

/**
 * Поля «сума + валюта + курс + фактично в гривнях».
 * Гривні рахуються з курсу, але їх можна виправити вручну — тоді перераховується курс
 * (банк чи біржа часто дають іншу суму, ніж «рівно за курсом»).
 */
export function currencyFields({ currency = 'UAH', amount = '', rate = '', uah = '', currencies = ['UAH', 'USD', 'USDT'], prefix = 'f' }) {
    const foreign = currency !== 'UAH';
    return `
        <div class="field">
            <label for="${prefix}-amount">${t('money.amount')}</label>
            <div class="field-row">
                <input id="${prefix}-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${amount === '' ? '' : amount}" placeholder="0">
                <div class="seg" role="group" aria-label="${t('money.currency')}">
                    ${currencies.map(c => `<button type="button" data-cur="${c}" aria-pressed="${c === currency}">${currencySymbol(c)}</button>`).join('')}
                </div>
            </div>
        </div>
        <div class="field-pair" data-foreign ${foreign ? '' : 'hidden'}>
            <div class="field">
                <label for="${prefix}-rate" data-rate-label>${t('money.rate', { cur: currencySymbol(currency) })}</label>
                <input id="${prefix}-rate" type="number" inputmode="decimal" step="0.0001" min="0" value="${rate}">
            </div>
            <div class="field">
                <label for="${prefix}-uah">${t('money.uah')}</label>
                <input id="${prefix}-uah" type="number" inputmode="decimal" step="0.01" min="0" value="${foreign && uah !== '' ? uah : ''}">
            </div>
            <div class="rate-hint" data-rate-hint>
                <button type="button" class="link-btn" data-rate-load>${t('rates.load')}</button>
            </div>
        </div>`;
}

export function wireCurrency(root, prefix = 'f') {
    const $ = id => root.querySelector(`#${prefix}-${id}`);
    const current = () => root.querySelector('[data-cur][aria-pressed="true"]').dataset.cur;
    const recalcUAH = () => {
        const a = parseFloat($('amount').value);
        const r = parseFloat($('rate').value);
        if (a > 0 && r > 0) $('uah').value = round2(a * r).toFixed(2);
    };
    root.addEventListener('click', e => {
        const b = e.target.closest('[data-cur]');
        if (!b || !root.contains(b)) return;
        root.querySelectorAll('[data-cur]').forEach(x => x.setAttribute('aria-pressed', x === b));
        const foreign = b.dataset.cur !== 'UAH';
        root.querySelector('[data-foreign]').hidden = !foreign;
        root.querySelector('[data-rate-label]').textContent = t('money.rate', { cur: currencySymbol(b.dataset.cur) });
        if (foreign) recalcUAH();
    });
    root.addEventListener('click', async e => {
        const use = e.target.closest('[data-rate-use]');
        if (use && root.contains(use)) {
            $('rate').value = use.dataset.rateUse;
            recalcUAH();
            return;
        }
        const load = e.target.closest('[data-rate-load]');
        if (!load || !root.contains(load)) return;
        const box = root.querySelector('[data-rate-hint]');
        box.textContent = t('rates.loading');
        const r = await fetchRates();
        const fmt = n => n.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
        const rows = [];
        if (r.nbu) rows.push(`<span>${t('rates.nbu', { rate: fmt(r.nbu.rate), date: r.nbu.date })}</span><button type="button" class="link-btn" data-rate-use="${r.nbu.rate}">${t('rates.use')}</button>`);
        if (r.market) rows.push(`<span>${t('rates.market', { rate: fmt(r.market.rate) })}</span><button type="button" class="link-btn" data-rate-use="${r.market.rate}">${t('rates.use')}</button>`);
        box.innerHTML = rows.length ? rows.map(x => `<div class="rate-row">${x}</div>`).join('') : `<span class="muted">${t('rates.failed')}</span>`;
    });
    $('amount').addEventListener('input', () => { if (current() !== 'UAH') recalcUAH(); });
    $('rate').addEventListener('input', recalcUAH);
    $('uah').addEventListener('input', () => {
        const a = parseFloat($('amount').value);
        const u = parseFloat($('uah').value);
        if (a > 0 && u > 0) $('rate').value = String(Math.round(u / a * 10000) / 10000);
    });
}

/** { currency, amount, rate, uah } з полів. */
export function readCurrency(root, prefix = 'f') {
    const currency = root.querySelector('[data-cur][aria-pressed="true"]').dataset.cur;
    const amount = round2(parseFloat(root.querySelector(`#${prefix}-amount`).value) || 0);
    if (currency === 'UAH') return { currency, amount, rate: 0, uah: amount };
    const rate = parseFloat(root.querySelector(`#${prefix}-rate`).value) || 0;
    const typed = parseFloat(root.querySelector(`#${prefix}-uah`).value);
    const uah = typed > 0 ? round2(typed) : round2(amount * rate);
    return { currency, amount, rate, uah };
}
