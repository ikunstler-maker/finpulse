import { upcomingPayments } from '../calc.js';
import { buildICS } from '../data/calendar.js';
import { plural, t } from '../i18n/index.js';
import { state } from '../state.js';
import { dayMonthLong, esc, money, money0 } from './format.js';
import { openSheet, toast } from './sheet.js';

/*
 * Нагадування про платежі без сервера:
 * 1) смуга вгорі «Бюджету» з платежами на найближчі дні;
 * 2) сповіщення браузера, коли застосунок відкрито (раз на день);
 * 3) файл календаря (.ics) з нагадуваннями — спрацьовують, навіть коли FinPulse закрито.
 * Налаштування — лише на цьому пристрої (localStorage), без фінансових даних.
 */
const KEY = 'finpulse_reminders';
const DEFAULTS = { days: 1, time: '09:00', notify: false, banner: true };

export function getReminderSettings() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        const days = [0, 1, 2, 3, 7].includes(raw.days) ? raw.days : DEFAULTS.days;
        const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : DEFAULTS.time;
        return { days, time, notify: raw.notify === true, banner: raw.banner !== false, last: typeof raw.last === 'string' ? raw.last : '' };
    } catch {
        return { ...DEFAULTS, last: '' };
    }
}

function saveSettings(patch) {
    const next = { ...getReminderSettings(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* налаштування просто не запам'ятаються */ }
    return next;
}

const whenLabel = p => (p.inDays === 0 ? t('reminders.today') : p.inDays === 1 ? t('reminders.tomorrow') : dayMonthLong(p.date.m, p.date.d));
const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;

/** Смуга вгорі «Бюджету»: що сплатити найближчими днями. */
export function reminderBanner(today = new Date()) {
    const s = getReminderSettings();
    if (!s.banner) return '';
    const list = upcomingPayments(state, today, s.days);
    if (!list.length) return '';
    const total = list.reduce((sum, p) => sum + (p.expense.amountUAH || 0), 0);
    const shown = list.slice(0, 3).map(p => `<li><span>${esc(p.expense.title)}</span><span class="num">${whenLabel(p)} · ${money0(p.expense.amountUAH)}</span></li>`).join('');
    return `
        <div class="reminder-banner" role="status" id="reminder-banner">
            <div class="reminder-head">
                <strong>${t(s.days === 0 ? 'reminders.bannerToday' : 'reminders.bannerSoon', { n: list.length, payments: plural(list.length, t('reminders.paymentsWord').split(',')), amount: money(total) })}</strong>
                <button class="link-btn" data-action="open-reminders">${t('reminders.settings')}</button>
            </div>
            <ul>${shown}</ul>
            ${list.length > 3 ? `<p class="small">${t('reminders.more', { n: list.length - 3 })}</p>` : ''}
        </div>`;
}

/** Сповіщення раз на день, коли застосунок відкрито і є платежі найближчими днями. */
export async function notifyOnOpen(today = new Date()) {
    const s = getReminderSettings();
    const dayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    if (!s.notify || s.last === dayKey || !notifySupported() || Notification.permission !== 'granted') return false;
    const list = upcomingPayments(state, today, s.days);
    if (!list.length) return false;
    const total = list.reduce((sum, p) => sum + (p.expense.amountUAH || 0), 0);
    const title = t('reminders.notifyTitle', { n: list.length, payments: plural(list.length, t('reminders.paymentsWord').split(',')), amount: money0(total) });
    const body = list.slice(0, 4).map(p => `${whenLabel(p)}: ${p.expense.title} — ${money0(p.expense.amountUAH)}`).join('\n');
    const options = { body, tag: 'finpulse-payments', icon: './icon-192.png' };
    try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        if (reg?.showNotification) await reg.showNotification(title, options);
        else new Notification(title, options);
    } catch {
        return false;
    }
    saveSettings({ last: dayKey });
    return true;
}

export function downloadCalendar(today = new Date()) {
    const s = getReminderSettings();
    const items = upcomingPayments(state, today, 366);
    if (!items.length) {
        toast(t('reminders.icsEmpty'));
        return 0;
    }
    const ics = buildICS(items, {
        daysBefore: s.days,
        time: s.time,
        now: today,
        texts: {
            summary: e => t('reminders.icsSummary', { title: e.title, amount: money0(e.amountUAH) }),
            description: e => t('reminders.icsDescription', { title: e.title, amount: money(e.amountUAH) }),
            alarm: e => t('reminders.icsAlarm', { title: e.title }),
        },
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FinPulse_Payments_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('reminders.icsSaved', { n: items.length }));
    return items.length;
}

export function openRemindersSheet(onChange = () => {}) {
    const s = getReminderSettings();
    const supported = notifySupported();
    const perm = supported ? Notification.permission : 'unsupported';
    const sheet = openSheet(`
        <h3>${t('reminders.title')}</h3>
        <p class="sheet-text">${t('reminders.hint')}</p>
        <div class="field">
            <label for="rem-days">${t('reminders.daysLabel')}</label>
            <select id="rem-days">${[0, 1, 2, 3, 7].map(d => `<option value="${d}" ${d === s.days ? 'selected' : ''}>${t(`reminders.days${d}`)}</option>`).join('')}</select>
        </div>
        <div class="toggle"><span id="rem-banner-label">${t('reminders.banner')}</span><button type="button" class="switch" role="switch" id="rem-banner" aria-checked="${s.banner}" aria-labelledby="rem-banner-label"></button></div>
        <div class="toggle"><span id="rem-notify-label">${t('reminders.notify')}</span><button type="button" class="switch" role="switch" id="rem-notify" aria-checked="${s.notify && perm === 'granted'}" aria-labelledby="rem-notify-label" ${supported ? '' : 'disabled'}></button></div>
        <p class="sheet-text small" id="rem-notify-note">${t(perm === 'unsupported' ? 'reminders.notifyUnsupported' : perm === 'denied' ? 'reminders.notifyDenied' : 'reminders.notifyHint')}</p>
        <h4 class="sheet-sub">${t('reminders.calendarTitle')}</h4>
        <p class="sheet-text small">${t('reminders.calendarHint')}</p>
        <div class="field">
            <label for="rem-time">${t('reminders.time')}</label>
            <input id="rem-time" type="time" value="${s.time}">
        </div>
        <div class="actions">
            <button class="btn primary" type="button" id="rem-ics">${t('reminders.icsButton')}</button>
            <button class="btn ghost" data-action="close-sheet">${t('common.done')}</button>
        </div>`, { label: t('reminders.title') });

    sheet.querySelector('#rem-days').addEventListener('change', e => { saveSettings({ days: Number(e.target.value) }); onChange(); });
    sheet.querySelector('#rem-time').addEventListener('change', e => {
        if (/^\d{2}:\d{2}$/.test(e.target.value)) saveSettings({ time: e.target.value });
    });
    sheet.querySelector('#rem-banner').addEventListener('click', e => {
        const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
        e.currentTarget.setAttribute('aria-checked', on);
        saveSettings({ banner: on });
        onChange();
    });
    sheet.querySelector('#rem-notify').addEventListener('click', async e => {
        const sw = e.currentTarget;
        const note = sheet.querySelector('#rem-notify-note');
        if (sw.getAttribute('aria-checked') === 'true') {
            sw.setAttribute('aria-checked', 'false');
            saveSettings({ notify: false });
            return;
        }
        let permission = Notification.permission;
        if (permission === 'default') {
            try { permission = await Notification.requestPermission(); } catch { permission = 'denied'; }
        }
        if (permission !== 'granted') {
            note.textContent = t('reminders.notifyDenied');
            return;
        }
        sw.setAttribute('aria-checked', 'true');
        saveSettings({ notify: true, last: '' });
        note.textContent = t('reminders.notifyOn');
        notifyOnOpen();
    });
    sheet.querySelector('#rem-ics').addEventListener('click', () => downloadCalendar());
}
