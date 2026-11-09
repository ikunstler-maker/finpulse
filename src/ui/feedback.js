import { FEEDBACK_FORM } from '../config.js';
import { t, tData } from '../i18n/index.js';
import { closeSheet, openSheet, toast } from './sheet.js';
import { pickerField, wirePickers } from './picker.js';

/*
 * Відгук: тип + опис (+ контакт, + технічні дані за згодою) → Google Форма власниці.
 * Фінансові дані не надсилаються; людину попереджаємо не вписувати суми й паролі.
 */

const TYPES = {
    bug: '<circle cx="12" cy="13" r="6"/><path d="M12 7V4M8.5 8.5 6 6M15.5 8.5 18 6M6 13H3M21 13h-3M7 18l-2 2M17 18l2 2M12 10v6"/>',
    change: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    remove: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    unclear: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.2v.1"/>',
    other: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
};

export const feedbackReady = () => !!(FEEDBACK_FORM.action && FEEDBACK_FORM.fields.type && FEEDBACK_FORM.fields.text);

/** Технічні дані без фінансів: версія (останнє оновлення), браузер, екран. */
function techInfo() {
    const latest = (tData('updates.entries') || [])[0]?.id || '';
    return `FinPulse ${latest}; ${navigator.userAgent}; ${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`;
}

export function openFeedbackSheet() {
    const ready = feedbackReady();
    const sheet = openSheet(`
        <h3>${t('feedback.title')}</h3>
        <p class="sheet-text">${t('feedback.intro')}</p>
        <form id="feedback-form" novalidate>
            ${pickerField({
        id: 'f-fb-type',
        label: t('feedback.type'),
        selected: '',
        options: [{ value: '', label: t('feedback.choose'), icon: '<path d="M5 12l4 4 10-10"/>' },
            ...Object.keys(TYPES).map(k => ({ value: k, label: t(`feedback.types.${k}`), icon: TYPES[k] }))],
    })}
            <div class="field"><label for="f-fb-text">${t('feedback.text')}</label>
                <textarea id="f-fb-text" rows="5" maxlength="3000" placeholder="${t('feedback.textPlaceholder')}"></textarea></div>
            <p class="sheet-text small warn-note">${t('feedback.privacy')}</p>
            <div class="field"><label for="f-fb-contact">${t('feedback.contact')}</label>
                <input id="f-fb-contact" maxlength="120" autocomplete="email" placeholder="${t('feedback.contactPlaceholder')}"></div>
            <label class="check-line"><input type="checkbox" id="f-fb-tech" checked> ${t('feedback.tech')}</label>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            ${ready ? '' : `<p class="sheet-text small">${t('feedback.notReady')}</p>`}
            <div class="actions"><button class="btn primary" type="submit" ${ready ? '' : 'disabled'}>${t('feedback.send')}</button></div>
        </form>`, { label: t('feedback.title') });
    wirePickers(sheet);
    sheet.querySelector('#feedback-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = sheet.querySelector('#form-error');
        const fail = msg => { err.textContent = msg; err.hidden = false; };
        const type = sheet.querySelector('#f-fb-type').value;
        const text = sheet.querySelector('#f-fb-text').value.trim();
        if (!type) return fail(t('feedback.errType'));
        if (text.length < 5) return fail(t('feedback.errText'));
        if (!feedbackReady()) return fail(t('feedback.notReady'));
        const f = FEEDBACK_FORM.fields;
        const body = new URLSearchParams();
        body.set(f.type, t(`feedback.types.${type}`));
        body.set(f.text, text);
        if (f.contact) body.set(f.contact, sheet.querySelector('#f-fb-contact').value.trim());
        if (f.tech && sheet.querySelector('#f-fb-tech').checked) body.set(f.tech, techInfo());
        const btn = sheet.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            // Google Форма не дозволяє читати відповідь іншим сайтам — отримуємо «непрозору» відповідь; помилка — лише без мережі.
            await fetch(FEEDBACK_FORM.action, { method: 'POST', mode: 'no-cors', body });
            closeSheet();
            toast(t('feedback.thanks'));
        } catch {
            btn.disabled = false;
            fail(t('feedback.errNetwork'));
        }
    });
}
