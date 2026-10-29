/**
 * Режим зберігання застосунку:
 *  - 'local'   — як раніше, відкрито в цьому браузері;
 *  - 'locked'  — є зашифроване сховище, чекаємо пароль;
 *  - 'vault'   — сховище відкрито: кожна зміна шифрується, а за наявності входу Google — синхронізується.
 */
import { createDrive } from '../cloud/drive.js';
import { getToken, isSignedIn, signIn } from '../cloud/google-auth.js';
import { prepareState, removePlainCopy, replaceState, setPersister, state } from '../state.js';
import { createSyncEngine, DRIVE_FILE } from './engine.js';
import { forgetDevice, hasLocalVault, recallDevice, rememberDevice } from './local-vault.js';

const drive = createDrive(getToken);
let engine = createSyncEngine({ drive });
let mode = hasLocalVault() ? 'locked' : 'local';

/** Стан синхронізації для інтерфейсу. */
export const syncStatus = { phase: 'idle', lastSyncAt: null, error: '', conflict: null };
let statusListener = () => {};
export const onSyncStatus = fn => { statusListener = fn; };
const setStatus = patch => { Object.assign(syncStatus, patch); statusListener(); };

export const getMode = () => mode;
export const isEncrypted = () => mode === 'vault';
export const signedIn = () => isSignedIn();
export const hasPendingChanges = () => !!engine.vault?.dirty;

let saving = Promise.resolve();
let syncTimer = null;

function activateVault() {
    mode = 'vault';
    removePlainCopy();
    setPersister(s => {
        const snapshot = JSON.parse(JSON.stringify(s));
        saving = saving.then(() => engine.save(snapshot)).catch(e => setStatus({ phase: 'error', error: e.message }));
        scheduleSync();
    });
}

function scheduleSync(delay = 2000) {
    if (mode !== 'vault' || !isSignedIn() || !navigator.onLine) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow().catch(() => {}), delay);
}

/** Спробувати відкрити без пароля (пристрій запам'ятовано). Повертає true, якщо вдалося. */
export async function tryRememberedUnlock() {
    if (mode !== 'locked') return false;
    const key = await recallDevice();
    if (!key) return false;
    try {
        const data = await engine.unlockWithKey(key);
        finishUnlock(data);
        return true;
    } catch {
        await forgetDevice();
        return false;
    }
}

function finishUnlock(data) {
    const prepared = prepareState(data);
    activateVault();
    replaceState(prepared);
}

export async function unlock(secret, { recovery = false, remember = false } = {}) {
    const data = await engine.unlock(secret, { recovery });
    if (remember) await rememberDevice(engine.dataKey);
    finishUnlock(data);
}

/** Синхронізувати зараз. interactive — можна відкрити вікно входу Google (після натискання). */
export async function syncNow({ interactive = false } = {}) {
    if (mode !== 'vault') return null;
    if (!isSignedIn()) {
        if (!interactive) return null;
        await signIn();
    }
    await saving;
    setStatus({ phase: 'syncing', error: '' });
    try {
        const r = await engine.sync();
        if (r.state) replaceState(prepareState(r.state));
        setStatus({ phase: 'idle', lastSyncAt: Date.now(), conflict: r.status === 'conflict' ? r.winner : null });
        return r;
    } catch (e) {
        setStatus({ phase: 'error', error: e.message });
        throw e;
    }
}

/* ---------- Увімкнення ---------- */

export async function connectGoogle() {
    await signIn({ prompt: 'select_account' });
    const found = await drive.readJSON(DRIVE_FILE);
    return found ? found.data : null;
}

/** Крок 1 нового сховища: створити в пам'яті, повернути ключ відновлення. */
export async function prepareNewVault(password) {
    engine = createSyncEngine({ drive });
    return engine.create(password, JSON.parse(JSON.stringify(state)), { persist: false });
}

/** Крок 2: людина записала ключ — зберігаємо, вмикаємо шифрування, відправляємо на Диск. */
export async function commitNewVault({ remember }) {
    engine.commit();
    if (remember) await rememberDevice(engine.dataKey);
    activateVault();
    replaceState(state); // перемалювати: тексти про шифрування змінилися
    return syncNow().catch(() => null);
}

/** Підключити цей пристрій до сховища на Диску (дані браузера замінюються даними з Диска). */
export async function joinExistingVault(remote, secret, { recovery = false, remember = false } = {}) {
    engine = createSyncEngine({ drive });
    const data = await engine.join(remote, secret, { recovery });
    if (remember) await rememberDevice(engine.dataKey);
    finishUnlock(data);
    setStatus({ phase: 'idle', lastSyncAt: Date.now() });
}

/* ---------- Керування ---------- */

export async function changeVaultPassword(newPassword) {
    await saving;
    await engine.changePassword(newPassword);
    if (await recallDevice()) await rememberDevice(engine.dataKey);
    return syncNow().catch(() => null);
}

export const listConflicts = () => engine.listConflicts();
export const readConflict = name => engine.readConflict(name);

export async function lockNow() {
    await saving;
    await forgetDevice();
    engine.lock();
    location.reload();
}

/** Прибрати зашифровану копію з цього пристрою; на Диску дані лишаються. */
export async function forgetThisDevice() {
    await saving;
    await forgetDevice();
    engine.forget();
    location.reload();
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => scheduleSync(500));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleSync(300);
    });
}
