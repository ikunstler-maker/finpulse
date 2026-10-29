import { describe, expect, it } from 'vitest';
import {
    changePassword,
    createVault,
    decryptJSON,
    DEFAULT_ITERATIONS,
    encryptJSON,
    formatRecoveryKey,
    parseRecoveryKey,
    unlockWithPassword,
    unlockWithRecoveryKey,
    WrongKeyError,
} from '../../src/crypto/vault.js';

// Швидкі тести: менше ітерацій; окремий тест перевіряє значення за замовчуванням.
const FAST = { iterations: 1000 };
const DATA = { months: { '2026-10': { expenses: [{ title: 'Оренда квартири', amountUAH: 12000 }] } } };

describe('сховище з паролем і ключем відновлення', () => {
    it('правильний пароль відкриває дані', async () => {
        const { header, dataKey } = await createVault('сонях-2026', FAST);
        const blob = await encryptJSON(dataKey, DATA);
        const key = await unlockWithPassword(header, 'сонях-2026');
        expect(await decryptJSON(key, blob)).toEqual(DATA);
    });

    it('неправильний пароль не відкриває', async () => {
        const { header } = await createVault('сонях-2026', FAST);
        await expect(unlockWithPassword(header, 'соняx-2026')).rejects.toBeInstanceOf(WrongKeyError);
    });

    it('ключ відновлення відкриває дані, навіть якщо його записали з пробілами й малими літерами', async () => {
        const { header, dataKey, recoveryKey } = await createVault('пароль', FAST);
        const blob = await encryptJSON(dataKey, DATA);
        const typed = recoveryKey.toLowerCase().replace(/-/g, ' ');
        const key = await unlockWithRecoveryKey(header, typed);
        expect(await decryptJSON(key, blob)).toEqual(DATA);
    });

    it('чужий ключ відновлення не відкриває', async () => {
        const a = await createVault('a', FAST);
        const b = await createVault('b', FAST);
        await expect(unlockWithRecoveryKey(a.header, b.recoveryKey)).rejects.toBeInstanceOf(WrongKeyError);
    });

    it('у заголовку й шифротексті немає ні пароля, ні даних, ні ключа відновлення', async () => {
        const { header, dataKey, recoveryKey } = await createVault('секретний-пароль', FAST);
        const blob = await encryptJSON(dataKey, DATA);
        const stored = JSON.stringify({ header, blob });
        for (const s of ['секретний-пароль', 'Оренда', '12000', recoveryKey, recoveryKey.replace(/-/g, '')]) {
            expect(stored).not.toContain(s);
        }
    });

    it('зміна пароля: старий більше не підходить, новий і ключ відновлення — підходять', async () => {
        const v = await createVault('старий', FAST);
        const blob = await encryptJSON(v.dataKey, DATA);
        const header2 = await changePassword(v.header, v.dataKey, 'новий');
        await expect(unlockWithPassword(header2, 'старий')).rejects.toBeInstanceOf(WrongKeyError);
        expect(await decryptJSON(await unlockWithPassword(header2, 'новий'), blob)).toEqual(DATA);
        expect(await decryptJSON(await unlockWithRecoveryKey(header2, v.recoveryKey), blob)).toEqual(DATA);
    });

    it('пошкоджений шифротекст не розшифровується', async () => {
        const { dataKey } = await createVault('p', FAST);
        const blob = await encryptJSON(dataKey, DATA);
        const ct = blob.ct.slice(0, -4) + (blob.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
        await expect(decryptJSON(dataKey, { ...blob, ct })).rejects.toBeInstanceOf(WrongKeyError);
    });

    it('однакові дані щоразу дають різний шифротекст', async () => {
        const { dataKey } = await createVault('p', FAST);
        const a = await encryptJSON(dataKey, DATA);
        const b = await encryptJSON(dataKey, DATA);
        expect(a.ct).not.toBe(b.ct);
        expect(a.iv).not.toBe(b.iv);
    });

    it('за замовчуванням — 600 000 ітерацій PBKDF2', async () => {
        const { header } = await createVault('p');
        expect(header.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: DEFAULT_ITERATIONS });
        expect(DEFAULT_ITERATIONS).toBe(600000);
    });
});

describe('ключ відновлення', () => {
    it('формат: 13 груп по 4 символи без I, L, O, U', () => {
        const key = formatRecoveryKey(new Uint8Array(32).fill(255));
        expect(key.split('-')).toHaveLength(13);
        expect(key).not.toMatch(/[ILOU]/);
    });
    it('перетворення туди й назад без втрат', () => {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        expect(parseRecoveryKey(formatRecoveryKey(bytes))).toEqual(bytes);
    });
    it('неправильна довжина — зрозуміла помилка', () => {
        expect(() => parseRecoveryKey('ABCD-EFGH')).toThrow('неправильну довжину');
    });
});
