import { computeMonthSummary, goalBalance, goalProgress, round2 } from '../calc.js';
import { newId } from '../data/migrate.js';
import { t } from '../i18n/index.js';
import { activeMonth, state, update } from '../state.js';
import { esc, money, money0 } from './format.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';

/**
 * ЦІЛІ (КОНВЕРТИ): куди відкласти вільний залишок.
 */
export function goalsCard() {
    const goals = state.goals || [];
    const free = computeMonthSummary(state, state.activeMonthKey).freeBalanceUAH;
    const hint = free > 0 ? t('goals.freeHint', { amount: money0(free) }) : t('goals.noFree');
    return `
        <section class="goals" aria-label="${t('goals.title')}">
            <div class="goals-head"><h2>${t('goals.title')}</h2><button class="link-btn" data-action="new-goal">${t('goals.new')}</button></div>
            ${goals.length ? '' : `<p class="goals-empty">${t('goals.empty')}</p>`}
            ${goals.map(g => {
                const p = goalProgress(state, g);
                return `
                    <div class="goal" data-goal="${g.id}">
                        <button class="goal-main" data-action="edit-goal" data-id="${g.id}">
                            <span class="goal-top"><strong>${esc(g.name)}</strong><span class="num">${money0(p.saved)} / ${money0(g.target)}</span></span>
                            <span class="goal-track" role="img" aria-label="${t('goals.progress', { pct: p.pct })}"><i style="width:${p.pct}%"></i></span>
                        </button>
                        <button class="btn ghost small-btn" data-action="move-goal" data-id="${g.id}">${t('goals.put')}</button>
                    </div>`;
            }).join('')}
            ${goals.length ? `<p class="goals-hint">${hint}</p>` : ''}
        </section>`;
}

export function openGoalSheet(id = null) {
    const goal = id ? (state.goals || []).find(g => g.id === id) : null;
    const isNew = !goal;
    const saved = goal ? goalBalance(state, goal.id) : 0;
    const sheet = openSheet(`
        <h3>${isNew ? t('goals.newTitle') : esc(goal.name)}</h3>
        <form id="goal-form" novalidate>
            <div class="field"><label for="f-goal-name">${t('goals.name')}</label><input id="f-goal-name" value="${esc(goal?.name || '')}" placeholder="${t('goals.namePlaceholder')}" maxlength="60" autocomplete="off"></div>
            <div class="field"><label for="f-goal-target">${t('goals.target')}</label><input id="f-goal-target" type="number" inputmode="decimal" min="0" step="1" value="${goal?.target || ''}"></div>
            ${isNew ? '' : `<p class="sheet-text">${t('goals.savedSoFar', { amount: money(saved) })}</p>`}
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${isNew ? t('goals.create') : t('common.save')}</button>
                ${isNew ? '' : `<button class="btn danger" type="button" data-sheet="delete">${t('goals.delete')}</button>`}
            </div>
        </form>`, { label: t('goals.title') });
    sheet.addEventListener('click', ev => {
        if (!ev.target.closest('[data-sheet="delete"]')) return;
        confirmSheet({ title: t('goals.deleteTitle'), text: t('goals.deleteText', { name: esc(goal.name), amount: money(saved) }), confirm: t('goals.delete') })
            .then(ok => {
                if (!ok) return;
                update(s => {
                    s.goals = s.goals.filter(g => g.id !== goal.id);
                    Object.values(s.months).forEach(m => { if (m.goalMoves) m.goalMoves = m.goalMoves.filter(x => x.goalId !== goal.id); });
                });
                toast(t('toast.goalDeleted'));
            });
    });
    sheet.querySelector('#goal-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const name = sheet.querySelector('#f-goal-name').value.trim();
        const target = round2(parseFloat(sheet.querySelector('#f-goal-target').value) || 0);
        const err = sheet.querySelector('#form-error');
        if (!name || !(target > 0)) {
            err.textContent = t('goals.err');
            err.hidden = false;
            return;
        }
        update(s => {
            if (!Array.isArray(s.goals)) s.goals = [];
            if (isNew) s.goals.push({ id: newId('goal'), name, target });
            else Object.assign(goal, { name, target });
        });
        closeSheet();
        toast(t(isNew ? 'toast.goalCreated' : 'toast.saved'));
    });
}

/** Відкласти в ціль або взяти з неї (у поточному місяці). */
export function openMoveSheet(id) {
    const goal = (state.goals || []).find(g => g.id === id);
    if (!goal) return;
    const m = activeMonth();
    const p = goalProgress(state, goal);
    const free = computeMonthSummary(state, state.activeMonthKey).freeBalanceUAH;
    const suggestion = Math.max(0, Math.min(free, p.left));
    const sheet = openSheet(`
        <h3>${esc(goal.name)}</h3>
        <p class="sheet-text">${t('goals.moveHint', { saved: money(p.saved), left: money(p.left), free: money(free) })}</p>
        <form id="move-form" novalidate>
            <div class="seg wide" role="group" aria-label="${t('goals.direction')}">
                <button type="button" data-dir="in" aria-pressed="true">${t('goals.dirIn')}</button>
                <button type="button" data-dir="out" aria-pressed="false">${t('goals.dirOut')}</button>
            </div>
            <div class="field"><label for="f-move">${t('goals.amount')}</label><input id="f-move" type="number" inputmode="decimal" min="0" step="0.01" value="${suggestion ? round2(suggestion) : ''}"></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${t('common.save')}</button>
            </div>
        </form>`, { label: goal.name });
    sheet.addEventListener('click', ev => {
        const b = ev.target.closest('[data-dir]');
        if (b) sheet.querySelectorAll('[data-dir]').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
    sheet.querySelector('#move-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const out = sheet.querySelector('[data-dir="out"]').getAttribute('aria-pressed') === 'true';
        const amount = round2(parseFloat(sheet.querySelector('#f-move').value) || 0);
        const err = sheet.querySelector('#form-error');
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!(amount > 0)) return fail(t('expense.errAmount'));
        if (out && amount > p.saved + 0.001) return fail(t('goals.errTooMuch', { amount: money(p.saved) }));
        update(() => {
            if (!Array.isArray(m.goalMoves)) m.goalMoves = [];
            m.goalMoves.push({ id: newId('gm'), goalId: goal.id, amount: out ? -amount : amount, day: Math.min(new Date().getDate(), 31) });
        });
        closeSheet();
        toast(t(out ? 'toast.goalTaken' : 'toast.goalPut', { amount: money(amount), name: goal.name }));
    });
}
