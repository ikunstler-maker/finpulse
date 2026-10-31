import { averageSalaryRate, carryOverBalance, DEFAULT_RATE, getPrevMonthKey, monthIncomeTotal, monthReceivedIncome, partRate, salaryTotal } from '../calc.js';
import { INCOME_CATEGORIES } from '../data/categories.js';
import { newId } from '../data/migrate.js';
import { plural, t } from '../i18n/index.js';
import { activeMonth, state, update } from '../state.js';
import { currencyFields, readCurrency, wireCurrency } from './currency.js';
import { dayMonth, esc, foreign, money, monthName, number } from './format.js';
import { applyCard, cardChip, cardField, readCardField } from './cards.js';
import { pickerField, wirePickers } from './picker.js';
import { itemRow } from './row.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';

/** Шаблон без суми — порожнє місце, а не надходження; у списку його не показуємо. */
const visibleIncome = i => !(i.isPreset && !(i.amountUAH > 0));

/* ---------- Зарплата частинами ---------- */

function partRow(p, m) {
    const rate = partRate(p);
    const chips = [
        rate ? `<span class="num">${t('salary.rateShort', { rate: number(rate, 4) })}</span>` : '',
        p.received ? '' : `<span class="chip bridge">${t('incomes.expected')}</span>`,
        cardChip(p.cardId),
    ].join('');
    return itemRow({
        cls: 'salary-part',
        checked: p.received,
        check: { action: 'toggle-part', id: p.id },
        edit: { action: 'edit-part', id: p.id },
        label: t(p.received ? 'salary.markExpected' : 'salary.markReceived', { amount: foreign(p.amount, p.currency) }),
        date: dayMonth(m.month, p.day),
        title: foreign(p.amount, p.currency),
        chips,
        amount: `+${money(p.uah)}`,
    });
}

function salaryCard(m) {
    const parts = [...(m.salaryParts || [])].sort((a, b) => a.day - b.day);
    const total = salaryTotal(m);
    const avg = averageSalaryRate(m);
    const meta = parts.length
        ? [t('salary.partsCount', { n: parts.length, parts: plural(parts.length, t('salary.partsWord').split(',')) }), avg ? t('salary.avgRate', { rate: number(avg, 4) }) : ''].filter(Boolean).join(' · ')
        : t('salary.noParts');
    return `
        <section class="section salary-section" aria-label="${t('salary.title')}">
            <div class="section-head"><h2>${t('salary.title')}</h2><span class="meta num">${money(total)}</span></div>
            <p class="group-hint">${meta} · ${m.secondPayDay > m.salaryDay ? t('salary.paydays', { day: m.salaryDay, second: m.secondPayDay }) : t('salary.payday', { day: m.salaryDay })}</p>
            <div class="list">
                ${parts.map(p => partRow(p, m)).join('') || `<div class="empty">${t('salary.empty')}</div>`}
                <button class="add-row" data-action="add-part">${t('salary.addPart')}</button>
                <button class="add-row secondary" data-action="salary-day">${t('salary.changeDay')}</button>
            </div>
        </section>`;
}

function findPart(id) {
    return (activeMonth().salaryParts || []).find(p => p.id === id);
}

export function togglePart(id) {
    update(() => {
        const p = findPart(id);
        if (p) p.received = !p.received;
    });
}

export function openPartSheet(id = null) {
    const m = activeMonth();
    const part = id ? findPart(id) : null;
    const isNew = !part;
    const last = [...(m.salaryParts || [])].reverse().find(p => p.currency !== 'UAH');
    const p = part || { amount: '', currency: last?.currency || 'USDT', uah: '', day: m.salaryDay, received: true };
    const rate = part ? partRate(part) || '' : (last ? Math.round(partRate(last) * 10000) / 10000 : m.rate || DEFAULT_RATE);

    const sheet = openSheet(`
        <h3>${isNew ? t('salary.newPart') : t('salary.editPart')}</h3>
        <p class="sheet-text">${t('salary.partHint')}</p>
        <form id="part-form" novalidate>
            ${currencyFields({ currency: p.currency, amount: p.amount, rate, uah: p.uah, currencies: ['USDT', 'USD', 'UAH'] })}
            <div class="field">
                <label for="f-day">${t('salary.partDay', { month: monthName(m.year, m.month) })}</label>
                <input id="f-day" type="number" inputmode="numeric" min="1" max="31" value="${p.day}">
            </div>
            ${cardField(p.cardId || '')}
            <div class="toggle"><span id="recv-label">${t('incomes.received')}</span><button type="button" class="switch" role="switch" id="f-received" aria-checked="${!!p.received}" aria-labelledby="recv-label"></button></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${isNew ? t('salary.addPartBtn') : t('common.save')}</button>
                ${isNew ? '' : `<button class="btn danger" type="button" data-sheet="delete">${t('common.delete')}</button>`}
            </div>
        </form>`, { label: t('salary.title') });

    wireCurrency(sheet);
    sheet.addEventListener('click', ev => {
        if (ev.target.closest('#f-received')) {
            const sw = sheet.querySelector('#f-received');
            sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true');
        }
        if (ev.target.closest('[data-sheet="delete"]')) {
            confirmSheet({ title: t('salary.deleteTitle'), text: t('salary.deleteText', { amount: foreign(part.amount, part.currency) }), confirm: t('common.delete') })
                .then(ok => {
                    if (!ok) return;
                    update(() => { m.salaryParts = m.salaryParts.filter(x => x.id !== part.id); });
                    toast(t('toast.partDeleted'));
                });
        }
    });
    sheet.querySelector('#part-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const amt = readCurrency(sheet);
        const day = parseInt(sheet.querySelector('#f-day').value, 10);
        const err = sheet.querySelector('#form-error');
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!(amt.amount > 0) || !(amt.uah > 0)) return fail(t('salary.errAmount'));
        if (!(day >= 1 && day <= 31)) return fail(t('expense.errDay'));
        const rec = { amount: amt.amount, currency: amt.currency, uah: amt.uah, day, received: sheet.querySelector('#f-received').getAttribute('aria-checked') === 'true' };
        const cardId = readCardField(sheet);
        update(() => {
            if (!Array.isArray(m.salaryParts)) m.salaryParts = [];
            const target = isNew ? { id: newId('sal') } : part;
            Object.assign(target, rec);
            applyCard(target, cardId);
            if (isNew) m.salaryParts.push(target);
        });
        closeSheet();
        toast(t(isNew ? 'toast.partAdded' : 'toast.saved'));
    });
}

export function openSalaryDaySheet() {
    const m = activeMonth();
    const sheet = openSheet(`
        <h3>${t('salary.dayTitle')}</h3>
        <p class="sheet-text">${t('salary.dayHint')}</p>
        <form id="day-form" novalidate>
            <div class="field">
                <label for="f-salary-day">${t('salary.dayLabel', { month: monthName(m.year, m.month) })}</label>
                <input id="f-salary-day" type="number" inputmode="numeric" min="1" max="28" value="${m.salaryDay}">
            </div>
            <div class="field">
                <label for="f-second-day">${t('salary.secondDayLabel')}</label>
                <input id="f-second-day" type="number" inputmode="numeric" min="2" max="31" value="${m.secondPayDay || ''}" placeholder="${t('salary.secondDayPlaceholder')}">
            </div>
            <p class="sheet-text small">${t('salary.secondDayHint')}</p>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${t('common.save')}</button>
            </div>
        </form>`, { label: t('salary.dayTitle') });
    sheet.querySelector('#day-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const day = parseInt(sheet.querySelector('#f-salary-day').value, 10);
        const secondRaw = sheet.querySelector('#f-second-day').value.trim();
        const second = secondRaw === '' ? null : parseInt(secondRaw, 10);
        const err = sheet.querySelector('#form-error');
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!(day >= 1 && day <= 28)) return fail(t('salary.errDay'));
        if (second !== null && !(second > day && second <= 31)) return fail(t('salary.errSecondDay', { day }));
        update(() => {
            m.salaryDay = day;
            if (second) m.secondPayDay = second;
            else delete m.secondPayDay;
        });
        closeSheet();
        toast(t('toast.saved'));
    });
}

/* ---------- Надходження ---------- */

function incomeRow(i, m, color) {
    const received = i.isReceived !== false;
    const chips = [
        i.debtor ? `<span>${esc(t('incomes.from', { name: i.debtor }))}</span>` : '',
        received ? '' : `<span class="chip bridge">${t('incomes.expected')}</span>`,
        cardChip(i.cardId),
    ].join('');
    return itemRow({
        cls: 'income-row',
        checked: received,
        check: { action: 'toggle-income', id: i.id },
        edit: { action: 'edit-income', id: i.id },
        label: t(received ? 'incomes.markExpected' : 'incomes.markReceived', { title: i.title }),
        date: dayMonth(m.month, i.day || 1),
        title: i.title,
        color,
        chips,
        amount: `+${money(i.amountUAH)}`,
        sub: i.amountUSD > 0 ? foreign(i.amountUSD, i.currency || 'USD') : '',
    });
}

export function incomesView() {
    const m = activeMonth();
    const total = monthIncomeTotal(m);
    const received = monthReceivedIncome(m);
    const prev = state.months[getPrevMonthKey(state.activeMonthKey)];
    const cats = INCOME_CATEGORIES.map(c => {
        const items = (m.incomes || []).filter(i => i.category === c.id && visibleIncome(i)).sort((a, b) => (a.day || 1) - (b.day || 1));
        const sum = items.reduce((s, i) => s + (i.amountUAH || 0), 0);
        const carry = c.id === 'savings' && prev
            ? `<button class="add-row secondary" data-action="take-savings">${t('incomes.takeSavings', { month: esc(prev.name) })}</button>`
            : '';
        return `
            <section class="section income-cat" data-income-cat="${c.id}">
                <div class="section-head"><h2>${esc(c.name)}</h2><span class="meta num">${money(sum)}</span></div>
                <div class="list">
                    ${items.map(i => incomeRow(i, m, c.color)).join('') || `<div class="empty">${t('incomes.emptyCat')}</div>`}
                    <button class="add-row" data-action="add-income" data-category="${c.id}">${t('incomes.add')}</button>
                    ${carry}
                </div>
            </section>`;
    }).join('');
    return `
        <div class="rail">
            <section class="summary" aria-label="${t('incomes.summary')}">
                <div>
                    <div class="label">${t('incomes.total')}</div>
                    <div class="big num" id="incomes-total">${money0Safe(total)}</div>
                </div>
                <div class="rows">
                    <div class="rowline"><span>${t('incomes.receivedTotal')}</span><span class="val num" id="incomes-received">${money(received)}</span></div>
                    <div class="rowline"><span>${t('incomes.expectedTotal')}</span><span class="val num" id="incomes-expected">${money(Math.max(0, total - received))}</span></div>
                </div>
            </section>
        </div>
        <div class="main-col">
            ${salaryCard(m)}
            ${cats}
        </div>`;
}

const money0Safe = n => money(n).replace(/,00 ₴$/, ' ₴');

function findIncome(id) {
    return (activeMonth().incomes || []).find(i => i.id === id);
}

export function toggleIncome(id) {
    update(() => {
        const i = findIncome(id);
        if (i) i.isReceived = i.isReceived === false;
    });
}

export function openIncomeSheet(id = null, category = 'extra') {
    const m = activeMonth();
    const income = id ? findIncome(id) : null;
    const isNew = !income;
    const i = income || { category, title: '', debtor: '', amountUAH: '', day: Math.min(new Date().getDate(), 28), isReceived: true };
    const currency = i.amountUSD > 0 ? i.currency || 'USD' : 'UAH';
    const rate = i.amountUSD > 0 ? Math.round(i.amountUAH / i.amountUSD * 10000) / 10000 : m.rate || DEFAULT_RATE;

    const sheet = openSheet(`
        <h3>${isNew ? t('incomes.new') : esc(i.title)}</h3>
        <form id="income-form" novalidate>
            ${pickerField({ id: 'f-category', label: t('incomes.category'), selected: i.category, options: INCOME_CATEGORIES.map(c => ({ value: c.id, label: c.name, color: c.color })) })}
            <div class="field">
                <label for="f-title">${t('incomes.titleLabel')}</label>
                <input id="f-title" value="${esc(i.title)}" placeholder="${t('incomes.titlePlaceholder')}" autocomplete="off" maxlength="120">
            </div>
            <div class="field">
                <label for="f-from">${t('incomes.fromLabel')}</label>
                <input id="f-from" value="${esc(i.debtor || '')}" placeholder="${t('incomes.fromPlaceholder')}" autocomplete="off" maxlength="80">
            </div>
            ${currencyFields({ currency, amount: currency === 'UAH' ? i.amountUAH : i.amountUSD, rate, uah: i.amountUAH })}
            <div class="field">
                <label for="f-day">${t('incomes.day', { month: monthName(m.year, m.month) })}</label>
                <input id="f-day" type="number" inputmode="numeric" min="1" max="31" value="${i.day || 1}">
            </div>
            ${cardField(i.cardId || '')}
            <div class="toggle"><span id="recv-label">${t('incomes.received')}</span><button type="button" class="switch" role="switch" id="f-received" aria-checked="${i.isReceived !== false}" aria-labelledby="recv-label"></button></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions">
                <button class="btn primary" type="submit">${isNew ? t('incomes.addBtn') : t('common.save')}</button>
                ${isNew ? '' : `<button class="btn danger" type="button" data-sheet="delete">${t('common.delete')}</button>`}
            </div>
        </form>`, { label: isNew ? t('incomes.new') : i.title });

    wireCurrency(sheet);
    wirePickers(sheet);
    sheet.addEventListener('click', ev => {
        if (ev.target.closest('#f-received')) {
            const sw = sheet.querySelector('#f-received');
            sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true');
        }
        if (ev.target.closest('[data-sheet="delete"]')) {
            confirmSheet({ title: t('incomes.deleteTitle'), text: t('incomes.deleteText', { title: esc(income.title) }), confirm: t('common.delete') })
                .then(ok => {
                    if (!ok) return;
                    update(() => {
                        if (income.isPreset) {
                            income.amountUAH = 0;
                            income.isReceived = false;
                            delete income.amountUSD;
                            delete income.currency;
                        } else {
                            m.incomes = m.incomes.filter(x => x.id !== income.id);
                        }
                    });
                    toast(t('toast.incomeDeleted'));
                });
        }
    });
    sheet.querySelector('#income-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const amt = readCurrency(sheet);
        const day = parseInt(sheet.querySelector('#f-day').value, 10);
        const cat = sheet.querySelector('#f-category').value;
        const err = sheet.querySelector('#form-error');
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        if (!(amt.uah > 0)) return fail(t('expense.errAmount'));
        if (!(day >= 1 && day <= 31)) return fail(t('expense.errDay'));
        const title = sheet.querySelector('#f-title').value.trim() || INCOME_CATEGORIES.find(c => c.id === cat).name;
        const rec = {
            category: cat,
            title,
            debtor: sheet.querySelector('#f-from').value.trim(),
            amountUAH: amt.uah,
            day,
            isReceived: sheet.querySelector('#f-received').getAttribute('aria-checked') === 'true',
        };
        const cardId = readCardField(sheet);
        update(() => {
            const target = isNew ? { id: newId('inc'), isPreset: false } : income;
            Object.assign(target, rec);
            applyCard(target, cardId);
            if (amt.currency === 'UAH') {
                delete target.amountUSD;
                delete target.currency;
            } else {
                target.amountUSD = amt.amount;
                target.currency = amt.currency;
            }
            if (isNew) m.incomes.push(target);
            syncLegacyIncomeFields(m);
        });
        closeSheet();
        toast(t(isNew ? 'toast.incomeAdded' : 'toast.saved'));
    });
}

/** Дзеркальні поля для старих бекапів (у сумах не використовуються). */
function syncLegacyIncomeFields(m) {
    const sumOf = cat => m.incomes.filter(x => x.category === cat).reduce((s, x) => s + (x.amountUAH || 0), 0);
    m.savingsUAH = sumOf('savings');
    m.extraIncomeUAH = sumOf('extra');
}

export function takeSavingsFromPrevious() {
    const m = activeMonth();
    const prev = state.months[getPrevMonthKey(state.activeMonthKey)];
    if (!prev) return;
    const amount = carryOverBalance(prev, m.expenses, m.salaryDay);
    update(() => {
        let target = m.incomes.find(i => i.category === 'savings' && i.isPreset) || m.incomes.find(i => i.category === 'savings');
        if (!target) {
            target = { id: newId('inc'), category: 'savings', title: '', day: 1, isPreset: false };
            m.incomes.push(target);
        }
        target.title = t('incomes.savingsFrom', { month: prev.name });
        target.amountUAH = amount;
        target.isReceived = amount > 0;
        syncLegacyIncomeFields(m);
    });
    toast(t('toast.savingsTaken', { amount: money(amount), month: prev.name }));
}
