import { WrongKeyError } from '../crypto/vault.js';
import { t } from '../i18n/index.js';
import { prepareState, state } from '../state.js';
import {
    changeVaultPassword, commitNewVault, connectGoogle, forgetThisDevice, getMode, hasPendingChanges, joinExistingVault,
    listConflicts, lockNow, prepareNewVault, readConflict, signedIn, syncNow, syncStatus,
} from '../sync/controller.js';
import { REMEMBER_DAYS } from '../sync/local-vault.js';
import { esc } from './format.js';
import { exportBackup } from './more.js';
import { hasUserData } from '../data/months.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';
import { replaceState, update } from '../state.js';

export const MIN_PASSWORD = 10;

/** Простий показник надійності пароля: довжина і різні типи символів. */
export function passwordProblem(pw, confirm) {
    if (pw.length < MIN_PASSWORD) return t('setup.errShort', { n: MIN_PASSWORD });
    const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter(r => r.test(pw)).length;
    if (kinds < 2 && pw.length < 16) return t('setup.errSimple');
    if (pw !== confirm) return t('setup.errMatch');
    return '';
}

const time = ts => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

/* ---------- Стан входу ---------- */

/** Логотип Google: кольоровий; у стані «не увійшли» CSS робить його сірим. */
export const GOOGLE_ICON = `<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

/**
 * Де зараз дані і що з синхронізацією:
 * guest — не увійшли (дані лише в цьому браузері); інакше — увійшли, і phase: ok | busy | pending | error.
 */
export function accountState() {
    if (getMode() !== 'vault') return { signedIn: false, phase: 'guest', title: t('account.guest'), sub: t('account.guestSub') };
    const base = { signedIn: true, title: t('account.signedIn') };
    if (syncStatus.phase === 'syncing') return { ...base, phase: 'busy', sub: t('account.syncing') };
    if (syncStatus.phase === 'error') return { ...base, phase: 'error', sub: t('account.error') };
    if (hasPendingChanges() || !signedIn()) return { ...base, phase: 'pending', sub: t(hasPendingChanges() ? 'account.pending' : 'account.notThisSession') };
    return { ...base, phase: 'ok', sub: syncStatus.lastSyncAt ? t('account.syncedAt', { time: time(syncStatus.lastSyncAt) }) : t('account.encrypted') };
}

/** Кнопка в шапці: лише значок Google (сірий — не увійшли; кольоровий з обводкою — увійшли). */
export function renderAccountButton(btn) {
    if (!btn) return;
    const a = accountState();
    btn.dataset.state = a.phase;
    btn.innerHTML = `${GOOGLE_ICON}<i class="account-dot" aria-hidden="true"></i>`;
    const label = `${a.title}. ${a.sub}`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
}

/** Блок угорі «Ще»: хто ви, де дані, що натиснути. */
export function accountBlock() {
    const a = accountState();
    return `
        <div class="account-block" data-state="${a.phase}">
            <span class="account-icon">${GOOGLE_ICON}</span>
            <span class="account-text"><strong id="account-title">${a.title}</strong><span id="account-sub">${a.sub}</span></span>
            <button class="btn ${a.signedIn ? 'ghost' : 'primary'} small-btn" data-action="account">${t(a.signedIn ? 'account.manage' : 'account.signIn')}</button>
        </div>`;
}

/** Натискання на значок або кнопку входу. */
export function openAccount() {
    if (getMode() === 'vault') openSyncSheet();
    else openSignIn();
}

/* ---------- Увімкнення: майстер ---------- */

/**
 * Вхід: один шлях. Спершу Google; далі застосунок сам дивиться, чи є дані FinPulse на Диску:
 * є — просить пароль FinPulse (вхід на новому пристрої); немає — створює пароль і ключ (перший вхід).
 * Резервну копію просимо лише тоді, коли дані цього браузера буде замінено даними з Диска.
 */
export function openSignIn() {
    const sheet = openSheet(`
        <h3>${t('signin.title')}</h3>
        <p class="sheet-text">${t('signin.intro')}</p>
        <ol class="steps">
            <li>${t('signin.step1')}</li>
            <li>${t('signin.step2')}</li>
        </ol>
        <p class="sheet-text small">${t('setup.warning')} <a href="./security.html">${t('links.security')}</a></p>
        <div class="actions">
            <button class="btn google-btn" type="button" id="signin-google">${GOOGLE_ICON}<span>${t('signin.google')}</span></button>
        </div>`, { label: t('signin.title') });
    sheet.querySelector('#signin-google').addEventListener('click', async () => {
        const btn = sheet.querySelector('#signin-google');
        btn.disabled = true;
        try {
            const remote = await connectGoogle();
            if (!remote) openCreatePassword();
            else if (hasUserData(state)) openReplaceWarning(remote);
            else openJoin(remote);
        } catch (e) {
            btn.disabled = false;
            toast(e.message);
        }
    });
}

/** На Диску вже є дані, а в браузері — власні записи: вони будуть замінені. Спершу копія. */
function openReplaceWarning(remote) {
    const sheet = openSheet(`
        <h3>${t('signin.replaceTitle')}</h3>
        <p class="sheet-text">${t('signin.replaceText')}</p>
        <div class="actions">
            <button class="btn primary" type="button" id="replace-backup">${t('signin.replaceBackup')}</button>
            <button class="btn ghost" type="button" data-action="close-sheet">${t('common.cancel')}</button>
        </div>`, { label: t('signin.replaceTitle') });
    sheet.querySelector('#replace-backup').addEventListener('click', () => {
        exportBackup();
        openJoin(remote);
    });
}

function openCreatePassword() {
    const sheet = openSheet(`
        <h3>${t('setup.passwordTitle')}</h3>
        <p class="sheet-text">${t('setup.passwordHint', { n: MIN_PASSWORD })}</p>
        <form id="pw-form" novalidate>
            <div class="field"><label for="f-pw">${t('setup.password')}</label><input id="f-pw" type="password" autocomplete="new-password" autocapitalize="off"></div>
            <div class="field"><label for="f-pw2">${t('setup.passwordRepeat')}</label><input id="f-pw2" type="password" autocomplete="new-password" autocapitalize="off"></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions"><button class="btn primary" type="submit">${t('setup.createVault')}</button></div>
        </form>`, { label: t('setup.passwordTitle') });
    sheet.querySelector('#pw-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const pw = sheet.querySelector('#f-pw').value;
        const problem = passwordProblem(pw, sheet.querySelector('#f-pw2').value);
        const err = sheet.querySelector('#form-error');
        if (problem) {
            err.textContent = problem;
            err.hidden = false;
            return;
        }
        const recoveryKey = await prepareNewVault(pw);
        openRecovery(recoveryKey);
    });
}

function openRecovery(recoveryKey) {
    const sheet = openSheet(`
        <h3>${t('setup.recoveryTitle')}</h3>
        <p class="sheet-text">${t('setup.recoveryHint')}</p>
        <p class="recovery-key num" id="recovery-key">${esc(recoveryKey)}</p>
        <div class="actions">
            <button class="btn ghost" type="button" id="copy-key">${t('setup.copy')}</button>
        </div>
        <label class="check-line"><input type="checkbox" id="saved-key"> ${t('setup.saved')}</label>
        <label class="check-line"><input type="checkbox" id="remember" checked> ${t('lock.remember', { days: REMEMBER_DAYS })}</label>
        <div class="actions"><button class="btn primary" type="button" id="enable" disabled>${t('setup.enable')}</button></div>`, { label: t('setup.recoveryTitle') });
    sheet.querySelector('#copy-key').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(recoveryKey);
            toast(t('setup.copied'));
        } catch {
            const range = document.createRange();
            range.selectNodeContents(sheet.querySelector('#recovery-key'));
            getSelection().removeAllRanges();
            getSelection().addRange(range);
        }
    });
    sheet.querySelector('#saved-key').addEventListener('change', e => { sheet.querySelector('#enable').disabled = !e.target.checked; });
    sheet.querySelector('#enable').addEventListener('click', async () => {
        await commitNewVault({ remember: sheet.querySelector('#remember').checked });
        closeSheet();
        toast(t('setup.enabled'));
    });
}

function openJoin(remote) {
    let recovery = false;
    const sheet = openSheet(`
        <h3>${t('setup.joinTitle')}</h3>
        <p class="sheet-text">${t('setup.joinHint')}</p>
        <form id="join-form" novalidate>
            <div class="field"><label for="f-secret" id="join-label">${t('lock.password')}</label><input id="f-secret" type="password" autocomplete="current-password" autocapitalize="off"></div>
            <button class="link-btn" type="button" id="join-mode">${t('lock.useRecovery')}</button>
            <label class="check-line"><input type="checkbox" id="remember" checked> ${t('lock.remember', { days: REMEMBER_DAYS })}</label>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions"><button class="btn primary" type="submit">${t('setup.join')}</button></div>
        </form>`, { label: t('setup.joinTitle') });
    sheet.querySelector('#join-mode').addEventListener('click', () => {
        recovery = !recovery;
        sheet.querySelector('#join-label').textContent = recovery ? t('lock.recovery') : t('lock.password');
        sheet.querySelector('#join-mode').textContent = recovery ? t('lock.usePassword') : t('lock.useRecovery');
        sheet.querySelector('#f-secret').type = recovery ? 'text' : 'password';
    });
    sheet.querySelector('#join-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = sheet.querySelector('#form-error');
        try {
            await joinExistingVault(remote, sheet.querySelector('#f-secret').value, { recovery, remember: sheet.querySelector('#remember').checked });
            closeSheet();
            toast(t('setup.joined'));
        } catch (e) {
            err.textContent = e instanceof WrongKeyError ? t(recovery ? 'lock.wrongRecovery' : 'lock.wrongPassword') : e.message;
            err.hidden = false;
        }
    });
}

/* ---------- Керування синхронізацією ---------- */

export function openSyncSheet() {
    const a = accountState();
    const sheet = openSheet(`
        <h3>${t('sync.title')}</h3>
        <div class="account-block" data-state="${a.phase}">
            <span class="account-icon">${GOOGLE_ICON}</span>
            <span class="account-text"><strong>${a.title}</strong><span id="sync-state">${a.sub}${syncStatus.error ? ` · ${esc(syncStatus.error)}` : ''}</span></span>
        </div>
        <p class="sheet-text">${t('sync.about')}</p>
        <div class="menu">
            <button data-sync="now"><strong>${t('sync.now')}</strong><span>${t('sync.nowSub')}</span></button>
            <button data-sync="conflicts"><strong>${t('sync.conflicts')}</strong><span>${t('sync.conflictsSub')}</span></button>
            <button data-sync="password"><strong>${t('sync.changePassword')}</strong><span>${t('sync.changePasswordSub')}</span></button>
            <button data-sync="lock"><strong>${t('sync.lock')}</strong><span>${t('sync.lockSub')}</span></button>
            <button data-sync="forget"><strong>${t('sync.forget')}</strong><span>${t('sync.forgetSub')}</span></button>
        </div>`, { label: t('sync.title') });
    sheet.addEventListener('click', async e => {
        const act = e.target.closest('[data-sync]')?.dataset.sync;
        if (act === 'now') {
            try {
                const r = await syncNow({ interactive: true });
                closeSheet();
                toast(r?.status === 'conflict' ? t('sync.conflictToast') : t('sync.done'));
            } catch (err) {
                toast(err.message);
            }
        }
        if (act === 'conflicts') openConflicts();
        if (act === 'password') openChangePassword();
        if (act === 'lock') await lockNow();
        if (act === 'forget') {
            const ok = await confirmSheet({
                title: t('lock.forgetTitle'),
                text: hasPendingChanges() ? t('sync.forgetPendingText') : t('lock.forgetText'),
                confirm: t('lock.forgetConfirm'),
            });
            if (ok) await forgetThisDevice();
        }
    });
}

async function openConflicts() {
    let files;
    try {
        if (!signedIn()) await syncNow({ interactive: true });
        files = await listConflicts();
    } catch (e) {
        toast(e.message);
        return;
    }
    const sheet = openSheet(`
        <h3>${t('sync.conflicts')}</h3>
        <p class="sheet-text">${t('sync.conflictsHint')}</p>
        <div class="menu">
            ${files.map(f => `<button data-file="${esc(f.name)}"><strong>${esc(f.name.replace(/^finpulse-conflict-|\.json$/g, '').replace(/T(\d\d)-(\d\d)-.*/, ' $1:$2'))}</strong><span>${t('sync.restoreSub')}</span></button>`).join('') || `<p class="empty">${t('sync.noConflicts')}</p>`}
        </div>`, { label: t('sync.conflicts') });
    sheet.addEventListener('click', async e => {
        const name = e.target.closest('[data-file]')?.dataset.file;
        if (!name) return;
        const ok = await confirmSheet({ title: t('sync.restoreTitle'), text: t('sync.restoreText'), confirm: t('sync.restoreConfirm') });
        if (!ok) return;
        const data = await readConflict(name);
        replaceState(prepareState(data));
        update(() => {});
        toast(t('sync.restored'));
    });
}

function openChangePassword() {
    const sheet = openSheet(`
        <h3>${t('sync.changePassword')}</h3>
        <p class="sheet-text">${t('sync.changePasswordHint')}</p>
        <form id="pw-form" novalidate>
            <div class="field"><label for="f-pw">${t('setup.password')}</label><input id="f-pw" type="password" autocomplete="new-password"></div>
            <div class="field"><label for="f-pw2">${t('setup.passwordRepeat')}</label><input id="f-pw2" type="password" autocomplete="new-password"></div>
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <div class="actions"><button class="btn primary" type="submit">${t('common.save')}</button></div>
        </form>`, { label: t('sync.changePassword') });
    sheet.querySelector('#pw-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const pw = sheet.querySelector('#f-pw').value;
        const problem = passwordProblem(pw, sheet.querySelector('#f-pw2').value);
        if (problem) {
            const err = sheet.querySelector('#form-error');
            err.textContent = problem;
            err.hidden = false;
            return;
        }
        await changeVaultPassword(pw);
        closeSheet();
        toast(t('sync.passwordChanged'));
    });
}
