import { CATEGORIES } from '../data/categories.js';
import { saveState, state } from '../state.js';
import { renderAll } from './render.js';
import { showToast } from '../utils.js';

/**
 * ІНЛАЙН РЕДАГУВАННЯ ПОДВІЙНИМ КЛІКОМ
 */
export function makeTitleEditable(e, id) {
    e.stopPropagation();
    const curMonth = state.months[state.activeMonthKey];
    const item = curMonth.expenses.find(x => x.id === id);
    if (!item) return;

    const el = e.currentTarget;
    const currentTitle = item.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'w-full px-1.5 py-0.5 text-xs bg-slate-900 text-white border border-emerald-500 rounded outline-none font-medium';

    const finish = () => {
        const val = input.value.trim();
        if (val && val !== currentTitle) {
            item.title = val;
            saveState();
            renderAll();
            showToast('Назву оновлено', '✏️');
        } else {
            renderAll();
        }
    };

    input.onblur = finish;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') finish();
        if (ev.key === 'Escape') renderAll();
    };

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
}

export function makeDayEditable(e, id) {
    e.stopPropagation();
    const curMonth = state.months[state.activeMonthKey];
    const item = curMonth.expenses.find(x => x.id === id);
    if (!item) return;

    const el = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '31';
    input.value = item.payDay;
    input.className = 'w-8 px-0.5 py-0 text-[10px] bg-slate-900 text-white border border-emerald-500 rounded outline-none font-mono text-center';

    const finish = () => {
        const val = parseInt(input.value);
        if (val >= 1 && val <= 31) {
            item.payDay = val;
            saveState();
            renderAll();
            showToast('День змінено на ' + val, '📅');
        } else {
            renderAll();
        }
    };

    input.onblur = finish;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') finish();
        if (ev.key === 'Escape') renderAll();
    };

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
}

export function makeCategoryEditable(e, id) {
    e.stopPropagation();
    const curMonth = state.months[state.activeMonthKey];
    const item = curMonth.expenses.find(x => x.id === id);
    if (!item) return;

    const el = e.currentTarget;
    const select = document.createElement('select');
    select.className = 'text-xs bg-slate-900 text-white border border-emerald-500 rounded outline-none';

    CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.icon} ${cat.name}`;
        if (cat.id === item.category) opt.selected = true;
        select.appendChild(opt);
    });

    select.onchange = () => {
        item.category = select.value;
        saveState();
        renderAll();
        showToast('Категорію оновлено', '🏷️');
    };

    select.onblur = () => renderAll();

    el.innerHTML = '';
    el.appendChild(select);
    select.focus();
}

export function makeAmountEditable(e, id) {
    e.stopPropagation();
    const curMonth = state.months[state.activeMonthKey];
    const item = curMonth.expenses.find(x => x.id === id);
    if (!item) return;

    const el = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = item.amountUAH;
    input.className = 'w-20 px-1 py-0.5 text-xs bg-slate-900 text-white border border-emerald-500 rounded outline-none font-mono text-right';

    const finish = () => {
        const val = parseFloat(input.value);
        if (!isNaN(val) && val >= 0) {
            item.amountUAH = val;
            if (item.amountUSD > 0 && curMonth.rate) {
                item.amountUSD = +(val / curMonth.rate).toFixed(2);
            }
            saveState();
            renderAll();
            showToast('Суму оновлено', '💰');
        } else {
            renderAll();
        }
    };

    input.onblur = finish;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') finish();
        if (ev.key === 'Escape') renderAll();
    };

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
}
