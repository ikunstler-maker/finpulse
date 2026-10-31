import { esc } from './format.js';

/**
 * Випадаючий список з кольоровими кружечками (рідний <select> кольорів не показує).
 * Значення лежить у прихованому <input id=…>, тож форми читають його як звичайне поле.
 */
export function pickerField({ id, label, options, selected }) {
    const cur = options.find(o => o.value === selected) || options[0];
    const item = o => `<span class="pick-item"><i class="dot" style="background:${o.color || 'transparent'}"></i>${esc(o.label)}</span>`;
    return `
        <div class="field picker" data-picker="${id}">
            <span class="lbl" id="${id}-label">${label}</span>
            <input type="hidden" id="${id}" value="${esc(cur.value)}">
            <button type="button" class="picker-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id}-label ${id}-current">
                <span id="${id}-current">${item(cur)}</span><span class="picker-caret" aria-hidden="true">▾</span>
            </button>
            <ul class="picker-list" role="listbox" aria-labelledby="${id}-label" hidden>
                ${options.map(o => `<li role="option" tabindex="-1" data-value="${esc(o.value)}" aria-selected="${o.value === cur.value}">${item(o)}</li>`).join('')}
            </ul>
        </div>`;
}

/** Поведінка всіх списків у вікні: відкрити, обрати мишкою чи клавіатурою, закрити. */
export function wirePickers(root) {
    root.querySelectorAll('[data-picker]').forEach(box => {
        const input = box.querySelector('input[type=hidden]');
        const btn = box.querySelector('.picker-btn');
        const list = box.querySelector('.picker-list');
        const current = box.querySelector(`#${input.id}-current`);
        const items = () => [...list.querySelectorAll('[role=option]')];
        const close = (focusBtn = true) => {
            list.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            if (focusBtn) btn.focus();
        };
        const open = () => {
            list.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            (items().find(li => li.getAttribute('aria-selected') === 'true') || items()[0]).focus();
        };
        const choose = li => {
            input.value = li.dataset.value;
            items().forEach(x => x.setAttribute('aria-selected', x === li));
            current.innerHTML = li.innerHTML;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            close();
        };
        btn.addEventListener('click', () => (list.hidden ? open() : close()));
        list.addEventListener('click', e => {
            const li = e.target.closest('[role=option]');
            if (li) choose(li);
        });
        list.addEventListener('keydown', e => {
            const all = items();
            const i = all.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(all.length - 1, i + 1)].focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); all[Math.max(0, i - 1)].focus(); }
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (all[i]) choose(all[i]); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        });
        box.addEventListener('focusout', e => {
            if (!box.contains(e.relatedTarget)) close(false);
        });
    });
}
