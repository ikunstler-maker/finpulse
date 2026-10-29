import { WrongKeyError } from '../crypto/vault.js';
import { t } from '../i18n/index.js';
import { prepareState } from '../state.js';
import {
    changeVaultPassword, commitNewVault, connectGoogle, forgetThisDevice, getMode, hasPendingChanges, joinExistingVault,
    listConflicts, lockNow, prepareNewVault, readConflict, signedIn, syncNow, syncStatus,
} from '../sync/controller.js';
import { REMEMBER_DAYS } from '../sync/local-vault.js';
import { esc } from './format.js';
import { exportBackup } from './more.js';
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

/** Текст і стан кнопки синхронізації в шапці. */
export function syncChip() {
    if (getMode() !== 'vault') return null;
    if (syncStatus.phase === 'syncing') return { text: t('sync.chipSyncing'), state: 'busy' };
    if (syncStatus.phase === 'error') return { text: t('sync.chipError'), state: 'error' };
    if (!signedIn()) return { text: t('sync.chipSignIn'), state: 'action' };
    if (hasPendingChanges()) return { text: t('sync.chipPending'), state: 'action' };
    return { text: syncStatus.lastSyncAt ? t('sync.chipOk', { time: time(syncStatus.lastSyncAt) }) : t('sync.chipLocked'), state: 'ok' };
}

export async function chipAction() {
    try {
        const r = await syncNow({ interactive: true });
        toast(r?.status === 'conflict' ? t('sync.conflictToast') : t('sync.done'));
    } catch (e) {
        toast(e.message);
    }
}

/* ---------- Увімкнення: майстер ---------- */

export function openSetup() {
    let backupDone = false;
    const sheet = openSheet(`
        <h3>${t('setup.title')}</h3>
        <ol class="steps">
            <li>${t('setup.step1')}</li>
            <li>${t('setup.step2')}</li>
            <li>${t('setup.step3')}</li>
        </ol>
        <p class="sheet-text">${t('setup.warning')}</p>
        <div class="actions">
            <button class="btn ghost" type="button" id="setup-backup">${t('setup.backup')}</button>
            <button class="btn primary" type="button" id="setup-next" disabled>${t('setup.google')}</button>
        </div>
        <p class="sheet-text small">${t('setup.backupHint')}</p>`, { label: t('setup.title') });
    sheet.querySelector('#setup-backup').addEventListener('click', () => {
        exportBackup();
        backupDone = true;
        sheet.querySelector('#setup-next').disabled = false;
    });
    sheet.querySelector('#setup-next').addEventListener('click', async () => {
        if (!backupDone) return;
        const btn = sheet.querySelector('#setup-next');
        btn.disabled = true;
        try {
            const remote = await connectGoogle();
            if (remote) openJoin(remote);
            else openCreatePassword();
        } catch (e) {
            btn.disabled = false;
            toast(e.message);
        }
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
    const last = syncStatus.lastSyncAt ? t('sync.lastAt', { time: time(syncStatus.lastSyncAt) }) : t('sync.never');
    const sheet = openSheet(`
        <h3>${t('sync.title')}</h3>
        <p class="sheet-text">${t('sync.about')}</p>
        <div class="result" id="sync-state">${signedIn() ? last : t('sync.notSignedIn')}${hasPendingChanges() ? ` · ${t('sync.pending')}` : ''}${syncStatus.error ? `<br>${esc(syncStatus.error)}` : ''}</div>
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

/** Пункт меню «Ще»: увімкнути або керувати. */
export function openEncryption() {
    if (getMode() === 'vault') openSyncSheet();
    else openSetup();
}
