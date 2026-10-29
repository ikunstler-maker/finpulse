/**
 * СИНХРОНІЗАЦІЯ ЗАШИФРОВАНИХ ДАНИХ
 *
 * На Диску — один файл з тим самим, що й на пристрої: заголовок сховища + шифротекст.
 * rev — номер версії файлу на Диску; headerRev — номер версії заголовка (зміна пароля).
 * Якщо дані змінили і тут, і на іншому пристрої: перемагає новіша зміна, а інша версія
 * зберігається на Диску окремою зашифрованою копією (її можна відновити).
 */
import { changePassword, createVault, decryptJSON, encryptJSON, unlockWithPassword, unlockWithRecoveryKey } from '../crypto/vault.js';
import { readLocalVault, removeLocalVault, writeLocalVault } from './local-vault.js';

export const DRIVE_FILE = 'finpulse-vault.json';
export const CONFLICT_PREFIX = 'finpulse-conflict-';

export class NeedsPasswordError extends Error {
    constructor() {
        super('Сховище на Диску змінено на іншому пристрої. Введіть пароль ще раз.');
        this.name = 'NeedsPasswordError';
    }
}

export function createSyncEngine({ drive, storage = globalThis.localStorage, now = () => Date.now() }) {
    let vault = readLocalVault(storage);
    let dataKey = null;
    let localVersion = 0;

    const persist = () => writeLocalVault(vault, storage);
    const fileOf = rev => ({ format: 'finpulse-sync', v: 1, header: vault.header, headerRev: vault.headerRev, blob: vault.blob, rev, updatedAt: vault.updatedAt });

    async function upload(rev) {
        const version = localVersion;
        const file = fileOf(rev);
        await drive.writeJSON(DRIVE_FILE, file);
        vault.rev = rev;
        vault.syncedAt = now();
        if (version === localVersion) vault.dirty = false;
        persist();
    }

    const conflictName = () => `${CONFLICT_PREFIX}${new Date(now()).toISOString().replace(/[:.]/g, '-')}.json`;

    return {
        get vault() { return vault; },
        get hasVault() { return !!vault; },
        get unlocked() { return !!dataKey; },
        get dataKey() { return dataKey; },

        /**
         * Нове сховище з поточних даних. Повертає ключ відновлення (показати один раз).
         * З persist: false сховище живе лише в пам'яті, доки не викликано commit()
         * (наприклад, поки людина не підтвердила, що записала ключ відновлення).
         */
        async create(password, state, { persist: save = true } = {}) {
            const created = await createVault(password);
            dataKey = created.dataKey;
            vault = { header: created.header, headerRev: 1, blob: await encryptJSON(dataKey, state), rev: 0, updatedAt: now(), dirty: true };
            if (save) persist();
            return created.recoveryKey;
        },

        commit() {
            persist();
        },

        /** Підключити цей пристрій до сховища, яке вже є на Диску. Повертає дані з Диска. */
        async join(remote, secret, { recovery = false } = {}) {
            const key = recovery ? await unlockWithRecoveryKey(remote.header, secret) : await unlockWithPassword(remote.header, secret);
            const state = await decryptJSON(key, remote.blob);
            dataKey = key;
            vault = { header: remote.header, headerRev: remote.headerRev || 1, blob: remote.blob, rev: remote.rev || 0, updatedAt: remote.updatedAt || now(), dirty: false, syncedAt: now() };
            persist();
            return state;
        },

        async unlock(secret, { recovery = false } = {}) {
            const key = recovery ? await unlockWithRecoveryKey(vault.header, secret) : await unlockWithPassword(vault.header, secret);
            const state = await decryptJSON(key, vault.blob);
            dataKey = key;
            return state;
        },

        /** Відкрити збереженим ключем пристрою (без пароля). */
        async unlockWithKey(key) {
            const state = await decryptJSON(key, vault.blob);
            dataKey = key;
            return state;
        },

        async save(state) {
            if (!dataKey) throw new Error('Сховище заблоковано');
            localVersion += 1;
            vault.blob = await encryptJSON(dataKey, state);
            vault.updatedAt = now();
            vault.dirty = true;
            persist();
        },

        async changePassword(newPassword) {
            vault.header = await changePassword(vault.header, dataKey, newPassword);
            vault.headerRev = (vault.headerRev || 1) + 1;
            vault.dirty = true;
            localVersion += 1;
            persist();
        },

        /** Звірити з Диском. Повертає { status, state? } — state, якщо дані треба замінити. */
        async sync() {
            const found = await drive.readJSON(DRIVE_FILE);
            const remote = found?.data;
            if (!remote) {
                await upload(1);
                return { status: 'uploaded' };
            }
            if ((remote.headerRev || 1) > (vault.headerRev || 1)) {
                vault.header = remote.header;
                vault.headerRev = remote.headerRev;
                persist();
            }
            const remoteChanged = remote.rev !== vault.rev;
            if (!remoteChanged) {
                if (!vault.dirty) return { status: 'unchanged' };
                await upload(remote.rev + 1);
                return { status: 'uploaded' };
            }
            let remoteState;
            try {
                remoteState = await decryptJSON(dataKey, remote.blob);
            } catch {
                throw new NeedsPasswordError();
            }
            if (!vault.dirty) {
                Object.assign(vault, { blob: remote.blob, rev: remote.rev, updatedAt: remote.updatedAt, syncedAt: now() });
                persist();
                return { status: 'downloaded', state: remoteState };
            }
            if (remote.updatedAt > vault.updatedAt) {
                await drive.writeJSON(conflictName(), fileOf(vault.rev));
                Object.assign(vault, { blob: remote.blob, rev: remote.rev, updatedAt: remote.updatedAt, dirty: false, syncedAt: now() });
                persist();
                return { status: 'conflict', winner: 'remote', state: remoteState };
            }
            await drive.writeJSON(conflictName(), remote);
            await upload(remote.rev + 1);
            return { status: 'conflict', winner: 'local' };
        },

        async listConflicts() {
            return (await drive.list(CONFLICT_PREFIX)).sort((a, b) => b.name.localeCompare(a.name));
        },

        async readConflict(name) {
            const found = await drive.readJSON(name);
            if (!found) return null;
            return decryptJSON(dataKey, found.data.blob);
        },

        lock() {
            dataKey = null;
        },

        /** Прибрати дані з цього пристрою (на Диску вони лишаються). */
        forget() {
            removeLocalVault(storage);
            vault = null;
            dataKey = null;
        },
    };
}
