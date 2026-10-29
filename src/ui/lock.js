import { WrongKeyError } from '../crypto/vault.js';
import { t } from '../i18n/index.js';
import { forgetThisDevice, unlock } from '../sync/controller.js';
import { REMEMBER_DAYS } from '../sync/local-vault.js';
import { confirmSheet } from './sheet.js';

/**
 * Екран блокування: дані зашифровано, потрібен пароль FinPulse або ключ відновлення.
 * onUnlocked викликається після успішного відкриття.
 */
export function showLockScreen(onUnlocked) {
    let recovery = false;
    const el = document.createElement('div');
    el.id = 'lock';
    el.className = 'lock';
    el.innerHTML = `
        <form class="lock-card" id="lock-form" novalidate>
            <div class="brand"><i aria-hidden="true"></i>FinPulse</div>
            <h1>${t('lock.title')}</h1>
            <p class="lock-text">${t('lock.text')}</p>
            <div class="field">
                <label for="lock-secret" id="lock-label">${t('lock.password')}</label>
                <input id="lock-secret" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false">
            </div>
            <label class="check-line"><input type="checkbox" id="lock-remember" checked> ${t('lock.remember', { days: REMEMBER_DAYS })}</label>
            <p class="form-error" id="lock-error" role="alert" hidden></p>
            <button class="btn primary" type="submit" id="lock-submit">${t('lock.open')}</button>
            <button class="link-btn" type="button" id="lock-mode">${t('lock.useRecovery')}</button>
            <button class="link-btn muted-link" type="button" id="lock-forget">${t('lock.forget')}</button>
            <p class="links"><a href="./security.html">${t('links.security')}</a> · <a href="./privacy.html">${t('links.privacy')}</a></p>
        </form>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('locked');
    const $ = id => el.querySelector(`#${id}`);
    $('lock-secret').focus();

    $('lock-mode').addEventListener('click', () => {
        recovery = !recovery;
        $('lock-label').textContent = recovery ? t('lock.recovery') : t('lock.password');
        $('lock-mode').textContent = recovery ? t('lock.usePassword') : t('lock.useRecovery');
        $('lock-secret').type = recovery ? 'text' : 'password';
        $('lock-secret').value = '';
        $('lock-secret').focus();
    });

    $('lock-forget').addEventListener('click', async () => {
        const ok = await confirmSheet({ title: t('lock.forgetTitle'), text: t('lock.forgetText'), confirm: t('lock.forgetConfirm') });
        if (ok) await forgetThisDevice();
    });

    $('lock-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const secret = $('lock-secret').value;
        const err = $('lock-error');
        if (!secret) return;
        $('lock-submit').disabled = true;
        $('lock-submit').textContent = t('lock.opening');
        try {
            await unlock(secret, { recovery, remember: $('lock-remember').checked });
            el.remove();
            document.documentElement.classList.remove('locked');
            onUnlocked();
        } catch (e) {
            err.textContent = e instanceof WrongKeyError ? t(recovery ? 'lock.wrongRecovery' : 'lock.wrongPassword') : e.message;
            err.hidden = false;
            $('lock-secret').select();
        } finally {
            $('lock-submit').disabled = false;
            $('lock-submit').textContent = t('lock.open');
        }
    });
}
