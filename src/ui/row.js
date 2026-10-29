import { esc } from './format.js';

const dataAttrs = data => Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');

/**
 * Компактний рядок списку: ліворуч чекбокс з датою під ним, далі кружечок кольору й назва
 * (до двох рядків), під назвою — позначки; праворуч сума.
 */
export function itemRow({ cls = '', checked, check, edit, label, date, title, color = '', chips = '', amount, sub = '' }) {
    return `
        <div class="item ${cls}">
            <button class="check" role="checkbox" aria-checked="${!!checked}" ${dataAttrs(check)} aria-label="${esc(label)}">
                <span class="box" aria-hidden="true"></span>
                <span class="item-date num">${date}</span>
            </button>
            <button class="item-main" ${dataAttrs(edit)}>
                <span class="item-text">
                    <span class="item-title">${color ? `<i class="dot" style="background:${color}"></i>` : ''}${esc(title)}</span>
                    ${chips ? `<span class="item-meta">${chips}</span>` : ''}
                </span>
                <span class="amount"><strong class="num">${amount}</strong>${sub ? `<span class="num">${sub}</span>` : ''}</span>
            </button>
        </div>`;
}
