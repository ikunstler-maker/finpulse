import { cardMonthTotals, cardUsage } from '../calc.js';
import { newId } from '../data/migrate.js';
import { t } from '../i18n/index.js';
import { activeMonth, state, update } from '../state.js';
import { esc, money } from './format.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';

export const CARD_COLORS = ['#1f6feb', '#157a5b', '#d9822b', '#b3372d', '#8b6fd6', '#2aa198', '#16202c', '#c2185b'];

export const cards = () => state.cards || [];
export const cardById = id => cards().find(c => c.id === id) || null;

/** Список «Картка» для форм. Якщо карток немає — підказка, де їх додати. */
export function cardField(selected = '', prefix = 'f') {
    if (!cards().length) return `<p class="sheet-text small">${t('cards.formHint')}</p>`;
    return `
        <div class="field">
            <label for="${prefix}-card">${t('cards.field')}</label>
            <select id="${prefix}-card">
                <option value="">${t('cards.none')}</option>
                ${cards().map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(cardTitle(c))}</option>`).join('')}
            </select>
        </div>`;
}

/** Обрана картка з форми; undefined — поля немає (карток не заведено). */
export function readCardField(root, prefix = 'f') {
    const sel = root.querySelector(`#${prefix}-card`);
    return sel ? sel.value || null : undefined;
}

/** Записати cardId у запис: null — прибрати, undefined — не чіпати. */
export function applyCard(target, cardId) {
    if (cardId === undefined) return;
    if (cardId) target.cardId = cardId;
    else delete target.cardId;
}

export const cardTitle = c => (c.last4 ? `${c.name} ·${c.last4}` : c.name);

/** Мітка картки для рядка списку. */
export function cardChip(cardId) {
    const c = cardById(cardId);
    return c ? `<span class="card-chip"><i style="background:${c.color}"></i>${esc(c.name)}</span>` : '';
}

export function openCardsSheet() {
    const m = activeMonth();
    const row = (c, totals) => `
        <button class="card-item" data-action="edit-card" data-id="${c ? c.id : ''}" ${c ? '' : 'disabled'}>
            <span class="card-name"><i style="background:${c ? c.color : 'var(--line)'}"></i><strong>${esc(c ? cardTitle(c) : t('cards.noCard'))}</strong></span>
            <span class="card-totals num">
                <span>${t('cards.spent')} ${money(totals.spent)}</span>
                ${totals.planned ? `<span>${t('cards.planned')} ${money(totals.planned)}</span>` : ''}
                <span>${t('cards.received')} ${money(totals.received)}</span>
                ${totals.expected ? `<span>${t('cards.expected')} ${money(totals.expected)}</span>` : ''}
            </span>
        </button>`;
    const none = cardMonthTotals(m, null);
    openSheet(`
        <h3>${t('cards.title')}</h3>
        <p class="sheet-text">${cards().length ? t('cards.monthHint', { month: esc(m.name) }) : t('cards.empty')}</p>
        <div class="card-list" id="card-list">
            ${cards().map(c => row(c, cardMonthTotals(m, c.id))).join('')}
            ${cards().length && none.count ? row(null, none) : ''}
        </div>
        <div class="actions"><button class="btn ${cards().length ? 'ghost' : 'primary'}" data-action="new-card">${t('cards.add')}</button></div>`, { label: t('cards.title') });
}

export function openCardSheet(id = null) {
    const card = id ? cardById(id) : null;
    const isNew = !card;
    const color = card?.color || CARD_COLORS[cards().length % CARD_COLORS.length];
    const sheet = openSheet(`
        <h3>${isNew ? t('cards.newTitle') : esc(card.name)}</h3>
        <form id="card-form" novalidate>
            <div class="field"><label for="f-card-name">${t('cards.name')}</label><input id="f-card-name" value="${esc(card?.name || '')}" placeholder="${t('cards.namePlaceholder')}" maxlength="40" autocomplete="off"></div>
            <div class="field"><label for="f-card-last4">${t('cards.last4')}</label><input id="f-card-last4" value="${esc(card?.last4 || '')}" inputmode="numeric" maxlength="4" placeholder="1234" autocomplete="off"></div>
            <p class="sheet-text small">${t('cards.last4Hint')}</p>
            <div class="field"><span class="lbl">${t('cards.color')}</span>
                <div class="swatches" role="group" aria-label="${t('cards.color')}">
                    ${CARD_COLORS.map(c => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-pressed="${c === color}" aria-label="${c}"></button>`).join('')}
                </div>
            </div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${isNew ? t('cards.create') : t('common.save')}</button>
                ${isNew ? '' : `<button class="btn danger" type="button" data-sheet="delete">${t('cards.delete')}</button>`}
            </div>
        </form>`, { label: t('cards.title') });
    sheet.addEventListener('click', async ev => {
        const sw = ev.target.closest('[data-color]');
        if (sw) sheet.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', b === sw));
        if (ev.target.closest('[data-sheet="delete"]')) {
            const used = cardUsage(state, card.id);
            const ok = await confirmSheet({
                title: t('cards.deleteTitle'),
                text: used ? t('cards.deleteUsed', { name: esc(card.name), n: used }) : t('cards.deleteText', { name: esc(card.name) }),
                confirm: t('cards.delete'),
            });
            if (!ok) return;
            update(s => {
                s.cards = s.cards.filter(c => c.id !== card.id);
                for (const m of Object.values(s.months)) {
                    for (const list of [m.expenses, m.incomes, m.salaryParts]) (list || []).forEach(r => { if (r.cardId === card.id) delete r.cardId; });
                }
            });
            toast(t('toast.cardDeleted'));
        }
    });
    sheet.querySelector('#card-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const name = sheet.querySelector('#f-card-name').value.trim();
        const last4raw = sheet.querySelector('#f-card-last4').value.replace(/\D/g, '');
        const err = sheet.querySelector('#form-error');
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!name) return fail(t('cards.errName'));
        if (last4raw && last4raw.length !== 4) return fail(t('cards.errLast4'));
        if (cards().some(c => c.id !== card?.id && c.name.toLowerCase() === name.toLowerCase())) return fail(t('cards.errDuplicate'));
        const rec = { name, color: sheet.querySelector('[data-color][aria-pressed="true"]').dataset.color };
        update(s => {
            if (!Array.isArray(s.cards)) s.cards = [];
            const target = isNew ? { id: newId('card') } : card;
            Object.assign(target, rec);
            if (last4raw) target.last4 = last4raw;
            else delete target.last4;
            if (isNew) s.cards.push(target);
        });
        closeSheet();
        toast(t(isNew ? 'toast.cardCreated' : 'toast.saved'));
    });
}
