/**
 * Зашифрована копія даних на цьому пристрої (для роботи без інтернету).
 * У localStorage лежать лише заголовок сховища і шифротекст — без сум, назв і пароля.
 */
export const VAULT_KEY = 'finpulse_vault_v1';
const REMEMBER_KEY = 'finpulse_remember_v1';
const DB_NAME = 'finpulse';
const DB_STORE = 'keys';
export const REMEMBER_DAYS = 30;

export function readLocalVault(storage = globalThis.localStorage) {
    try {
        const raw = storage.getItem(VAULT_KEY);
        const v = raw ? JSON.parse(raw) : null;
        return v && v.header && v.blob ? v : null;
    } catch {
        return null;
    }
}

export function writeLocalVault(vault, storage = globalThis.localStorage) {
    storage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function removeLocalVault(storage = globalThis.localStorage) {
    storage.removeItem(VAULT_KEY);
    storage.removeItem(REMEMBER_KEY);
}

export const hasLocalVault = (storage = globalThis.localStorage) => !!readLocalVault(storage);

/* ---------- «Запам'ятати пристрій» ----------
 * Ключ пристрою — неекспортований AES-ключ в IndexedDB: його не можна прочитати з коду,
 * лише використати на цьому пристрої. Ним загорнуто ключ даних, з терміном дії.
 */

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idb(mode, fn) {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, mode);
            const req = fn(tx.objectStore(DB_STORE));
            tx.oncomplete = () => resolve(req?.result);
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function deviceKey(create) {
    let key = await idb('readonly', s => s.get('device'));
    if (!key && create) {
        key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
        await idb('readwrite', s => s.put(key, 'device'));
    }
    return key || null;
}

const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function rememberDevice(dataKey, now = Date.now()) {
    const key = await deviceKey(true);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.wrapKey('raw', dataKey, key, { name: 'AES-GCM', iv });
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ iv: toB64(iv), ct: toB64(ct), expires: now + REMEMBER_DAYS * 86400000 }));
}

/** Ключ даних, якщо пристрій запам'ятовано і термін не минув; інакше null. */
export async function recallDevice(now = Date.now()) {
    try {
        const rec = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
        if (!rec || rec.expires < now) {
            localStorage.removeItem(REMEMBER_KEY);
            return null;
        }
        const key = await deviceKey(false);
        if (!key) return null;
        return await crypto.subtle.unwrapKey('raw', fromB64(rec.ct), key, { name: 'AES-GCM', iv: fromB64(rec.iv) }, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    } catch {
        localStorage.removeItem(REMEMBER_KEY);
        return null;
    }
}

export async function forgetDevice() {
    localStorage.removeItem(REMEMBER_KEY);
    try {
        await idb('readwrite', s => s.delete('device'));
    } catch { /* IndexedDB недоступна — запис про пристрій уже видалено */ }
}

export const isRemembered = () => !!localStorage.getItem(REMEMBER_KEY);
