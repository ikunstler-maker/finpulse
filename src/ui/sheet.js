import { t } from '../i18n/index.js';

/**
 * Нижня панель (на комп'ютері — вікно по центру) і короткі повідомлення.
 */
let returnFocus = null;

export function openSheet(html, { label } = {}) {
    returnFocus = document.activeElement;
    const layer = document.getElementById('layer');
    layer.innerHTML = `
        <div class="scrim" data-action="close-sheet"></div>
        <div class="sheet" role="dialog" aria-modal="true" aria-label="${label || ''}" tabindex="-1">
            <button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('common.closeWindow')}">✕</button>
            ${html}
        </div>`;
    document.documentElement.classList.add('modal-open');
    const sheet = layer.querySelector('.sheet');
    // Фокус на саме вікно, а не на поле: на телефоні клавіатура не вискакує одразу.
    sheet.focus({ preventScroll: true });
    sheet.scrollTop = 0;
    return sheet;
}

export function closeSheet() {
    document.getElementById('layer').innerHTML = '';
    document.documentElement.classList.remove('modal-open');
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
}

export const sheetOpen = () => !!document.querySelector('#layer .sheet');

let toastTimer;
export function toast(message) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
}

/** Підтвердження всередині панелі (браузерні confirm() у застосунку не використовуємо). */
export function confirmSheet({ title, text, confirm, danger = true }) {
    return new Promise(resolve => {
        const sheet = openSheet(`
            <h3>${title}</h3>
            <p class="sheet-text">${text}</p>
            <div class="actions">
                <button class="btn ${danger ? 'danger' : 'primary'}" data-confirm="yes">${confirm}</button>
                <button class="btn ghost" data-confirm="no">${t('common.cancel')}</button>
            </div>`, { label: title });
        sheet.addEventListener('click', e => {
            const b = e.target.closest('[data-confirm]');
            if (!b) return;
            closeSheet();
            resolve(b.dataset.confirm === 'yes');
        });
    });
}
