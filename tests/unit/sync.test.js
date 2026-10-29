import { describe, expect, it } from 'vitest';
import { WrongKeyError } from '../../src/crypto/vault.js';
import { CONFLICT_PREFIX, createSyncEngine, DRIVE_FILE, NeedsPasswordError } from '../../src/sync/engine.js';

const memStorage = () => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => [...m.values()].join('') };
};
const fakeDrive = () => {
    const files = new Map();
    return {
        files,
        readJSON: async name => (files.has(name) ? { file: { name }, data: JSON.parse(files.get(name)) } : null),
        writeJSON: async (name, value) => { files.set(name, JSON.stringify(value)); return { name }; },
        list: async prefix => [...files.keys()].filter(n => n.startsWith(prefix)).map(name => ({ name })),
    };
};

let clock = 1000;
const now = () => ++clock;
const STATE = n => ({ version: 4, activeMonthKey: '2026-10', months: { '2026-10': { name: 'Жовтень 2026', expenses: [{ id: 'e', title: `Оренда ${n}`, amountUAH: 12000 }] } } });

async function setup() {
    const drive = fakeDrive();
    const aStore = memStorage();
    const a = createSyncEngine({ drive, storage: aStore, now });
    const recovery = await a.create('пароль-для-тесту', STATE(1));
    await a.sync();
    const bStore = memStorage();
    const b = createSyncEngine({ drive, storage: bStore, now });
    const remote = (await drive.readJSON(DRIVE_FILE)).data;
    const bState = await b.join(remote, 'пароль-для-тесту');
    return { drive, a, b, aStore, bStore, recovery, bState };
}

describe('синхронізація між пристроями', () => {
    it('створення: на Диску й у браузері лише шифротекст', async () => {
        const { drive, aStore, bState } = await setup();
        expect(bState).toEqual(STATE(1));
        const everything = drive.files.get(DRIVE_FILE) + aStore.dump();
        for (const s of ['Оренда', '12000', 'пароль-для-тесту']) expect(everything).not.toContain(s);
    }, 30000);

    it('зміна на одному пристрої приходить на інший', async () => {
        const { a, b } = await setup();
        await a.save(STATE(2));
        expect(await a.sync()).toEqual({ status: 'uploaded' });
        const r = await b.sync();
        expect(r.status).toBe('downloaded');
        expect(r.state).toEqual(STATE(2));
        expect(await b.sync()).toEqual({ status: 'unchanged' });
    }, 30000);

    it('конфлікт: новіша зміна перемагає, інша зберігається копією', async () => {
        const { drive, a, b } = await setup();
        await b.save(STATE('B'));
        await a.save(STATE('A')); // A — пізніше
        await a.sync();
        const r = await b.sync();
        expect(r).toMatchObject({ status: 'conflict', winner: 'remote' });
        expect(r.state).toEqual(STATE('A'));
        const copies = await b.listConflicts();
        expect(copies).toHaveLength(1);
        expect(copies[0].name.startsWith(CONFLICT_PREFIX)).toBe(true);
        expect(await b.readConflict(copies[0].name)).toEqual(STATE('B'));
        expect(drive.files.get(copies[0].name)).not.toContain('Оренда');
    }, 30000);

    it('конфлікт: якщо новіша зміна тут — вона йде на Диск, стара з Диска стає копією', async () => {
        const { a, b } = await setup();
        await a.save(STATE('A'));
        await a.sync();
        await b.save(STATE('B')); // B — пізніше
        expect(await b.sync()).toMatchObject({ status: 'conflict', winner: 'local' });
        const r = await a.sync();
        expect(r.state).toEqual(STATE('B'));
        expect(await a.readConflict((await a.listConflicts())[0].name)).toEqual(STATE('A'));
    }, 30000);

    it('зміна пароля доходить до іншого пристрою; ключ відновлення працює', async () => {
        const { drive, a, recovery } = await setup();
        await a.changePassword('новий-пароль-2026');
        await a.sync();
        const c = createSyncEngine({ drive, storage: memStorage(), now });
        const remote = (await drive.readJSON(DRIVE_FILE)).data;
        await expect(c.join(remote, 'пароль-для-тесту')).rejects.toBeInstanceOf(WrongKeyError);
        expect(await c.join(remote, 'новий-пароль-2026')).toEqual(STATE(1));
        const d = createSyncEngine({ drive, storage: memStorage(), now });
        expect(await d.join(remote, recovery, { recovery: true })).toEqual(STATE(1));
    }, 60000);

    it('після перезапуску: пароль відкриває локальну копію без інтернету', async () => {
        const { aStore } = await setup();
        const offlineDrive = { readJSON: async () => { throw new Error('offline'); } };
        const again = createSyncEngine({ drive: offlineDrive, storage: aStore, now });
        expect(again.hasVault).toBe(true);
        expect(again.unlocked).toBe(false);
        await expect(again.unlock('не той')).rejects.toBeInstanceOf(WrongKeyError);
        expect(await again.unlock('пароль-для-тесту')).toEqual(STATE(1));
        await expect(again.sync()).rejects.toThrow('offline');
    }, 30000);

    it('сховище на Диску створено заново іншим ключем — просить пароль', async () => {
        const { drive, a } = await setup();
        // Нове сховище, створене окремо, своїм ключем даних — і його файл опинився на Диску
        const separate = fakeDrive();
        const other = createSyncEngine({ drive: separate, storage: memStorage(), now });
        await other.create('зовсім-інший-пароль', STATE('X'));
        await other.sync();
        drive.files.set(DRIVE_FILE, separate.files.get(DRIVE_FILE).replace('"rev":1', '"rev":7'));
        await expect(a.sync()).rejects.toBeInstanceOf(NeedsPasswordError);
        // а новий пристрій не може створити друге сховище поверх наявного: синхронізація зупиняється
        const c = createSyncEngine({ drive, storage: memStorage(), now });
        await c.create('ще-один-пароль', STATE('Y'));
        await expect(c.sync()).rejects.toBeInstanceOf(NeedsPasswordError);
    }, 30000);

    it('«забути пристрій» прибирає локальну копію', async () => {
        const { a, aStore } = await setup();
        a.forget();
        expect(a.hasVault).toBe(false);
        expect(aStore.dump()).toBe('');
    }, 30000);
});
