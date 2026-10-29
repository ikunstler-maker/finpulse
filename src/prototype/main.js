import './style.css';
import { createDrive } from '../cloud/drive.js';
import { getToken, isSignedIn, signIn, signOut } from '../cloud/google-auth.js';
import { createVault, decryptJSON, encryptJSON, unlockWithPassword, unlockWithRecoveryKey } from '../crypto/vault.js';
import { getDefaultInitialState } from '../data/demo.js';

const FILE = 'finpulse-prototype.json';
const drive = createDrive(getToken);
const $ = id => document.getElementById(id);

function log(text, ok = true) {
    const li = document.createElement('li');
    li.className = ok ? 'ok' : 'err';
    li.textContent = `${new Date().toLocaleTimeString('uk-UA')} — ${text}`;
    $('log').prepend(li);
}

/** Runs a step with the button disabled; errors go to the log, never secrets. */
function step(button, fn) {
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await fn();
        } catch (e) {
            log(e.message || 'Невідома помилка', false);
        } finally {
            button.disabled = false;
        }
    });
}

const timed = async (fn) => {
    const t = performance.now();
    const result = await fn();
    return [result, Math.round(performance.now() - t)];
};

function refreshAuth() {
    $('auth-status').textContent = isSignedIn() ? 'Увійшли. Доступ є лише до прихованої папки FinPulse на Диску.' : 'Ще не увійшли.';
}

step($('btn-signin'), async () => {
    await signIn({ prompt: 'consent' });
    refreshAuth();
    log('Вхід Google успішний');
});

step($('btn-signout'), async () => {
    signOut();
    refreshAuth();
    log('Вийшли з Google на цій сторінці');
});

step($('btn-create'), async () => {
    const password = $('new-password').value;
    if (password.length < 8) throw new Error('Пароль має бути щонайменше 8 символів');
    const [vault, ms] = await timed(() => createVault(password));
    log(`Сховище створено, пароль перетворено на ключ за ${ms} мс`);
    const blob = await encryptJSON(vault.dataKey, getDefaultInitialState());
    const file = await drive.writeJSON(FILE, { header: vault.header, blob, savedAt: new Date().toISOString() });
    log(`Записано на Диск: ${file.name}, ${file.size ?? '?'} байт`);
    $('recovery-key').textContent = vault.recoveryKey;
    $('recovery-box').hidden = false;
    $('new-password').value = '';
});

async function openWith(unlock) {
    const secret = $('open-secret').value;
    if (!secret) throw new Error('Введіть пароль або ключ відновлення');
    const found = await drive.readJSON(FILE);
    if (!found) throw new Error('На Диску ще немає тестового файлу. Спершу виконайте крок 2.');
    const [key, ms] = await timed(() => unlock(found.data.header, secret));
    const data = await decryptJSON(key, found.data.blob);
    const month = data.months[data.activeMonthKey];
    $('opened').textContent = `Розшифровано за ${ms} мс.\nМісяць: ${month.name}\nВитрат: ${month.expenses.length}\n`
        + month.expenses.slice(0, 5).map(e => `• ${e.title} — ${e.amountUAH} ₴`).join('\n');
    $('opened').hidden = false;
    $('open-secret').value = '';
    log('Дані з Диска розшифровано');
    return { found, key };
}

step($('btn-open-password'), () => openWith(unlockWithPassword));
step($('btn-open-recovery'), () => openWith(unlockWithRecoveryKey));

step($('btn-raw'), async () => {
    const found = await drive.readJSON(FILE);
    if (!found) throw new Error('Файлу на Диску немає');
    const text = JSON.stringify(found.data, null, 2);
    $('raw').textContent = text.length > 3000 ? text.slice(0, 3000) + '\n…' : text;
    $('raw').hidden = false;
    log(`Файл з Диска: ${found.file.size ?? text.length} байт, змінено ${new Date(found.file.modifiedTime).toLocaleString('uk-UA')}`);
});

step($('btn-delete'), async () => {
    const removed = await drive.remove(FILE);
    $('raw').hidden = true;
    $('opened').hidden = true;
    log(removed ? 'Тестовий файл видалено з Диска' : 'Файлу на Диску вже немає');
});

refreshAuth();
