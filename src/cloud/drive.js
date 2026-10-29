/**
 * Google Drive: прихована папка застосунку (appDataFolder).
 * Сюди потрапляє лише зашифрований вміст — модуль сам нічого не шифрує.
 */
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export class DriveError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'DriveError';
        this.status = status;
    }
}

async function request(fetchFn, url, token, init = {}) {
    const res = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const msg = res.status === 401 ? 'Сеанс Google завершився, увійдіть ще раз'
            : res.status === 403 ? 'Google не дав доступу до Диска'
            : `Помилка Google Диска (${res.status})`;
        throw new DriveError(msg, res.status);
    }
    return res;
}

export function createDrive(getToken, fetchFn = (...a) => globalThis.fetch(...a)) {
    const call = async (url, init) => request(fetchFn, url, await getToken(), init);

    async function findFile(name) {
        const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and trashed = false`);
        const res = await call(`${API}?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)`);
        const { files } = await res.json();
        return files[0] || null;
    }

    async function readJSON(name) {
        const file = await findFile(name);
        if (!file) return null;
        const res = await call(`${API}/${file.id}?alt=media`);
        return { file, data: await res.json() };
    }

    async function writeJSON(name, value) {
        const body = JSON.stringify(value);
        const existing = await findFile(name);
        if (existing) {
            const res = await call(`${UPLOAD}/${existing.id}?uploadType=media&fields=id,name,modifiedTime,size`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
            });
            return res.json();
        }
        const boundary = 'finpulse' + Math.random().toString(36).slice(2);
        const meta = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
            + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const res = await call(`${UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime,size`, {
            method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
        });
        return res.json();
    }

    /** Файли прихованої папки, назва яких починається з prefix. */
    async function list(prefix) {
        const q = encodeURIComponent(`name contains '${prefix.replace(/'/g, "\\'")}' and trashed = false`);
        const res = await call(`${API}?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)&pageSize=100`);
        const { files } = await res.json();
        return files.filter(f => f.name.startsWith(prefix));
    }

    async function remove(name) {
        const file = await findFile(name);
        if (!file) return false;
        await call(`${API}/${file.id}`, { method: 'DELETE' });
        return true;
    }

    return { findFile, readJSON, writeJSON, list, remove };
}
