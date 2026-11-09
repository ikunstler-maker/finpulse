import { t, tData } from '../i18n/index.js';
import { dayMonthLong, esc } from './format.js';
import { openSheet } from './sheet.js';

/* «Що нового»: список оновлень із мітками; крапка на «Ще», поки найновіше не переглянуто. */

const KEY = 'finpulse_updates_seen';
const entries = () => tData('updates.entries') || [];
const TAG_ICONS = {
    new: '<path d="M12 5v14M5 12h14"/>',
    improve: '<path d="M5 15l7-7 7 7"/>',
    fix: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    design: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1.2" class="fill"/><circle cx="14" cy="9" r="1.2" class="fill"/><circle cx="15.5" cy="13.5" r="1.2" class="fill"/>',
    security: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

export function hasUnseenUpdates() {
    const latest = entries()[0]?.id;
    try {
        return !!latest && localStorage.getItem(KEY) !== latest;
    } catch {
        return false;
    }
}

export function tagBadge(tag) {
    return `<span class="tag tag-${tag}"><svg viewBox="0 0 24 24" aria-hidden="true">${TAG_ICONS[tag] || ''}</svg>${t(`updates.tags.${tag}`)}</span>`;
}

export function openUpdatesSheet(onSeen = () => {}) {
    const list = entries();
    openSheet(`
        <h3>${t('updates.title')}</h3>
        <ol class="updates">
            ${list.map(u => {
        const [y, m, d] = u.date.split('-').map(Number);
        return `
                <li class="update" data-update="${esc(u.id)}">
                    <div class="update-head"><span class="update-date">${dayMonthLong(m, d)} ${y}</span><span class="update-tags">${u.tags.map(tagBadge).join('')}</span></div>
                    <strong>${esc(u.title)}</strong>
                    <p>${esc(u.text)}</p>
                </li>`;
    }).join('')}
        </ol>
        <div class="actions"><button class="btn ghost" data-action="close-sheet">${t('common.close')}</button></div>`, { label: t('updates.title') });
    try { if (list[0]) localStorage.setItem(KEY, list[0].id); } catch { /* крапка просто лишиться */ }
    onSeen();
}
