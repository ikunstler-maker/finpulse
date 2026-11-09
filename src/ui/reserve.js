import { reserveSpent } from '../calc.js';
import { CATEGORIES } from '../data/categories.js';
import { newId } from '../data/migrate.js';
import { t } from '../i18n/index.js';
import { state, update } from '../state.js';
import { dayMonth, esc, money } from './format.js';
import { closeSheet, openSheet, toast } from './sheet.js';
import { openExpenseSheet } from './budget.js';

/*
 * «Резерв»: сума на місяць (наприклад, «Продукти — 8 000 ₴»), яку витрачають частинами.
 * Кожна витрата з резерву — { id, amount, day?, note? }; «закрити» — невитрачене звільняється.
 */

const find = (monthKey, id) => state.months[monthKey]?.expenses.find(e => e.id === id);

export function openReserveSheet(monthKey, id, today = new Date()) {
    const month = state.months[monthKey];
    const e = find(monthKey, id);
    if (!e || !e.reserve) return;
    const color = (CATEGORIES.find(c => c.id === e.category) || CATEGORIES.find(c => c.id === 'other')).color;
    const thisMonth = today.getFullYear() === month.year && today.getMonth() + 1 === month.month;
    const sheet = openSheet(`
        <h3>${esc(e.title)}</h3>
        <div id="reserve-body"></div>
        <form id="spend-form" class="spend-form" novalidate>
            <div class="field-pair">
                <div class="field"><label for="f-spend">${t('reserve.spendAmount')}</label><input id="f-spend" type="text" inputmode="decimal" autocomplete="off"></div>
                <div class="field"><label for="f-spend-day">${t('expense.dayShort', { month: t('months.short').split(',')[month.month - 1] })}</label><input id="f-spend-day" type="number" inputmode="numeric" min="1" max="31" value="${thisMonth ? today.getDate() : ''}"></div>
            </div>
            <div class="field"><label for="f-spend-note">${t('reserve.note')}</label><input id="f-spend-note" maxlength="120" autocomplete="off" placeholder="${t('reserve.notePlaceholder')}"></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions"><button class="btn primary" type="submit">${t('reserve.addSpend')}</button></div>
        </form>
        <div class="actions two">
            <button class="btn ghost" type="button" data-reserve="edit">${t('reserve.edit')}</button>
            <button class="btn ghost" type="button" data-reserve="close"></button>
        </div>`, { label: e.title });

    const render = () => {
        const cur = find(monthKey, id);
        if (!cur) return;
        const spent = reserveSpent(cur);
        const limit = cur.amountUAH || 0;
        const over = spent > limit;
        const spends = [...cur.reserve.spends].sort((a, b) => (a.day || 0) - (b.day || 0));
        sheet.querySelector('#reserve-body').innerHTML = `
            <div class="reserve-summary">
                <span class="reserve-bar big ${over ? 'over' : ''}" aria-hidden="true"><i style="width:${(limit > 0 ? Math.min(100, spent / limit * 100) : 100).toFixed(1)}%;background:${over ? 'var(--danger)' : color}"></i></span>
                <p class="num" id="reserve-status">${over ? t('reserve.overFull', { spent: money(spent), limit: money(limit), amount: money(spent - limit) })
        : t('reserve.status', { spent: money(spent), limit: money(limit), left: money(limit - spent) })}</p>
                ${cur.isPaid ? `<p class="sheet-text small">${t('reserve.closedHint')}</p>` : ''}
            </div>
            <div class="list spends">
                ${spends.map(s => `
                    <div class="spend">
                        <span class="spend-day num">${s.day ? dayMonth(month.month, s.day) : '—'}</span>
                        <span class="spend-note">${esc(s.note || t('reserve.noNote'))}</span>
                        <span class="num">${money(s.amount)}</span>
                        <button type="button" class="icon-btn" data-spend-del="${esc(s.id)}" aria-label="${t('reserve.deleteSpend', { amount: money(s.amount) })}">✕</button>
                    </div>`).join('') || `<p class="empty">${t('reserve.noSpends')}</p>`}
            </div>`;
        sheet.querySelector('[data-reserve="close"]').textContent = t(cur.isPaid ? 'reserve.reopenBtn' : 'reserve.closeBtn');
    };
    render();

    sheet.querySelector('#spend-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const err = sheet.querySelector('#form-error');
        const amount = Number(String(sheet.querySelector('#f-spend').value).replace(/\s/g, '').replace(',', '.'));
        const dayRaw = sheet.querySelector('#f-spend-day').value;
        const day = dayRaw === '' ? null : parseInt(dayRaw, 10);
        if (!(amount > 0)) { err.textContent = t('expense.errAmount'); err.hidden = false; return; }
        if (day != null && !(day >= 1 && day <= 31)) { err.textContent = t('expense.errDay'); err.hidden = false; return; }
        err.hidden = true;
        const note = sheet.querySelector('#f-spend-note').value.trim();
        update(() => {
            const cur = find(monthKey, id);
            cur.reserve.spends.push({ id: newId('sp'), amount: Math.round(amount * 100) / 100, ...(day ? { day } : {}), ...(note ? { note } : {}) });
        });
        sheet.querySelector('#f-spend').value = '';
        sheet.querySelector('#f-spend-note').value = '';
        render();
        toast(t('reserve.spendAdded', { amount: money(amount) }));
    });
    sheet.addEventListener('click', ev => {
        const del = ev.target.closest('[data-spend-del]');
        if (del) {
            update(() => {
                const cur = find(monthKey, id);
                cur.reserve.spends = cur.reserve.spends.filter(s => s.id !== del.dataset.spendDel);
            });
            render();
            return;
        }
        const act = ev.target.closest('[data-reserve]')?.dataset.reserve;
        if (act === 'close') {
            update(() => { const cur = find(monthKey, id); cur.isPaid = !cur.isPaid; });
            render();
        }
        if (act === 'edit') {
            closeSheet();
            openExpenseSheet(monthKey, id);
        }
    });
}
