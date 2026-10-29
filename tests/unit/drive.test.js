import { describe, expect, it } from 'vitest';
import { createDrive, DriveError } from '../../src/cloud/drive.js';

/** In-memory fake of the Drive endpoints FinPulse uses. */
function fakeDrive() {
    const files = new Map();
    const calls = [];
    let seq = 0;
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    const fetchFn = async (url, init = {}) => {
        calls.push({ url, method: init.method || 'GET', auth: init.headers?.Authorization });
        const u = new URL(url);
        const id = u.pathname.split('/files/')[1];
        if (u.pathname.endsWith('/files') && !u.pathname.includes('upload') && (init.method || 'GET') === 'GET') {
            const name = /name = '(.+)' and/.exec(u.searchParams.get('q'))[1];
            return json({ files: [...files.values()].filter(f => f.name === name).map(f => ({ id: f.id, name: f.name, size: f.size })) });
        }
        if (u.pathname.includes('/upload/') && init.method === 'POST') {
            const meta = JSON.parse(init.body.split('\r\n\r\n')[1].split('\r\n')[0]);
            const body = init.body.split('\r\n\r\n')[2].split('\r\n--')[0];
            const f = { id: `f${++seq}`, name: meta.name, parents: meta.parents, body, size: String(body.length) };
            files.set(f.id, f);
            return json({ id: f.id, name: f.name, size: f.size });
        }
        if (u.pathname.includes('/upload/') && init.method === 'PATCH') {
            const f = files.get(id);
            f.body = init.body;
            return json({ id: f.id, name: f.name });
        }
        if (init.method === 'DELETE') { files.delete(id); return json({}); }
        if (u.searchParams.get('alt') === 'media') return json(JSON.parse(files.get(id).body));
        return json({}, 404);
    };
    return { files, calls, fetchFn };
}

describe('Google Диск (прихована папка)', () => {
    it('створює файл у appDataFolder, оновлює його й читає', async () => {
        const fake = fakeDrive();
        const drive = createDrive(async () => 'tok', fake.fetchFn);
        await drive.writeJSON('vault.json', { v: 1 });
        await drive.writeJSON('vault.json', { v: 2 });
        expect(fake.files.size).toBe(1);
        expect([...fake.files.values()][0].parents).toEqual(['appDataFolder']);
        expect((await drive.readJSON('vault.json')).data).toEqual({ v: 2 });
        expect(fake.calls.every(c => c.auth === 'Bearer tok')).toBe(true);
        expect(fake.calls.every(c => c.url.includes('spaces=appDataFolder') || !c.url.includes('q='))).toBe(true);
    });

    it('немає файлу — null; видалення', async () => {
        const fake = fakeDrive();
        const drive = createDrive(async () => 'tok', fake.fetchFn);
        expect(await drive.readJSON('none.json')).toBeNull();
        await drive.writeJSON('a.json', {});
        expect(await drive.remove('a.json')).toBe(true);
        expect(await drive.remove('a.json')).toBe(false);
    });

    it('помилка 401 — зрозуміле повідомлення', async () => {
        const drive = createDrive(async () => 'tok', async () => ({ ok: false, status: 401 }));
        await expect(drive.findFile('x')).rejects.toThrow(DriveError);
        await expect(drive.findFile('x')).rejects.toThrow('Сеанс Google завершився');
    });
});
