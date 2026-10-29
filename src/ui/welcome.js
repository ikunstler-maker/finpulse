import { createEmptyState } from '../data/months.js';
import { t } from '../i18n/index.js';
import { markOnboarded, prepareState, replaceState, saveState, state, update } from '../state.js';
import { closeSheet, confirmSheet, openSheet } from './sheet.js';

/** Перший візит: почати з порожнього бюджету або подивитися на прикладі. */
export function openWelcome() {
    const sheet = openSheet(`
        <h3>${t('welcome.title')}</h3>
        <p class="sheet-text">${t('welcome.text')}</p>
        <ul class="steps">
            <li>${t('welcome.point1')}</li>
            <li>${t('welcome.point2')}</li>
            <li>${t('welcome.point3')}</li>
        </ul>
        <div class="actions">
            <button class="btn primary" type="button" data-welcome="empty">${t('welcome.empty')}</button>
            <button class="btn ghost" type="button" data-welcome="demo">${t('welcome.demo')}</button>
        </div>
        <p class="sheet-text small">${t('welcome.privacy')} <a href="./privacy.html">${t('links.privacy')}</a></p>`, { label: t('welcome.title') });
    sheet.addEventListener('click', e => {
        const choice = e.target.closest('[data-welcome]')?.dataset.welcome;
        if (!choice) return;
        markOnboarded();
        closeSheet();
        if (choice === 'empty') startEmpty();
        else saveState();
    });
}

export function startEmpty() {
    replaceState(prepareState(createEmptyState(new Date())));
    update(() => {});
}

/** Банер над списком, поки відкрито приклад. */
export function demoBanner() {
    if (!state.demo) return '';
    return `
        <div class="demo-banner" role="note">
            <span>${t('welcome.demoBanner')}</span>
            <span class="demo-actions">
                <button class="link-btn" data-action="demo-start">${t('welcome.demoStart')}</button>
                <button class="link-btn muted-link" data-action="demo-keep">${t('welcome.demoKeep')}</button>
            </span>
        </div>`;
}

export async function demoStartFresh() {
    const ok = await confirmSheet({ title: t('welcome.freshTitle'), text: t('welcome.freshText'), confirm: t('welcome.freshConfirm') });
    if (ok) startEmpty();
}

export function demoKeep() {
    update(s => { delete s.demo; });
}
