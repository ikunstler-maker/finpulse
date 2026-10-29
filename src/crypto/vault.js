/**
 * ШИФРУВАННЯ (Zero Knowledge, етап 4 — прототип ядра, ще не підключено до застосунку)
 *
 * Дані шифрує випадковий ключ даних (AES-GCM 256). Сам ключ даних зберігається
 * лише «загорнутим» двічі:
 *   - ключем із пароля FinPulse (PBKDF2-SHA256, 600 000 ітерацій, своя сіль);
 *   - ключем відновлення (32 випадкові байти, показуються користувачу один раз).
 * Назовні (localStorage, Google Диск) потрапляють лише заголовок сховища і шифротекст.
 */

export const VAULT_FORMAT = 'finpulse-vault';
export const VAULT_VERSION = 1;
export const DEFAULT_ITERATIONS = 600000;
const AAD = new TextEncoder().encode('finpulse-v1');

export class WrongKeyError extends Error {
    constructor(message = 'Неправильний пароль або ключ відновлення') {
        super(message);
        this.name = 'WrongKeyError';
    }
}

const subtle = () => globalThis.crypto.subtle;
const randomBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

function toB64(bytes) {
    let s = '';
    new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
    return btoa(s);
}
function fromB64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// Crockford base32: без I, L, O, U — щоб ключ легко було переписати від руки.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function formatRecoveryKey(bytes) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const b of bytes) {
        value = (value << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out.match(/.{1,4}/g).join('-');
}

export function parseRecoveryKey(text) {
    const clean = String(text).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    const bytes = [];
    let bits = 0;
    let value = 0;
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx < 0) throw new WrongKeyError('Ключ відновлення містить недопустимі символи');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    if (bytes.length !== 32) throw new WrongKeyError('Ключ відновлення має неправильну довжину');
    return new Uint8Array(bytes);
}

async function passwordKey(password, salt, iterations) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey', 'unwrapKey'],
    );
}

function recoveryWrappingKey(bytes) {
    return subtle().importKey('raw', bytes, { name: 'AES-GCM' }, false, ['wrapKey', 'unwrapKey']);
}

async function wrap(dataKey, wrappingKey) {
    const iv = randomBytes(12);
    const ct = await subtle().wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv, additionalData: AAD });
    return { iv: toB64(iv), ct: toB64(ct) };
}

async function unwrap(wrapped, wrappingKey) {
    try {
        return await subtle().unwrapKey(
            'raw', fromB64(wrapped.ct), wrappingKey,
            { name: 'AES-GCM', iv: fromB64(wrapped.iv), additionalData: AAD },
            { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'],
        );
    } catch {
        throw new WrongKeyError();
    }
}

function checkHeader(header) {
    if (!header || header.format !== VAULT_FORMAT || header.v !== VAULT_VERSION) {
        throw new Error('Невідомий формат сховища');
    }
}

/**
 * Створює нове сховище. Повертає заголовок (можна зберігати де завгодно),
 * ключ даних (лише в пам'яті) і ключ відновлення (показати користувачу один раз).
 */
export async function createVault(password, { iterations = DEFAULT_ITERATIONS } = {}) {
    if (!password) throw new Error('Потрібен пароль');
    const dataKey = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const salt = randomBytes(16);
    const recovery = randomBytes(32);
    const header = {
        format: VAULT_FORMAT,
        v: VAULT_VERSION,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
        wrapped: {
            password: await wrap(dataKey, await passwordKey(password, salt, iterations)),
            recovery: await wrap(dataKey, await recoveryWrappingKey(recovery)),
        },
    };
    return { header, dataKey, recoveryKey: formatRecoveryKey(recovery) };
}

export async function unlockWithPassword(header, password) {
    checkHeader(header);
    const { salt, iterations } = header.kdf;
    return unwrap(header.wrapped.password, await passwordKey(password, fromB64(salt), iterations));
}

export async function unlockWithRecoveryKey(header, recoveryKey) {
    checkHeader(header);
    return unwrap(header.wrapped.recovery, await recoveryWrappingKey(parseRecoveryKey(recoveryKey)));
}

/** Новий пароль: перезагортається лише ключ даних, самі дані не перешифровуються. */
export async function changePassword(header, dataKey, newPassword, { iterations = header.kdf.iterations } = {}) {
    checkHeader(header);
    if (!newPassword) throw new Error('Потрібен пароль');
    const salt = randomBytes(16);
    return {
        ...header,
        kdf: { ...header.kdf, iterations, salt: toB64(salt) },
        wrapped: { ...header.wrapped, password: await wrap(dataKey, await passwordKey(newPassword, salt, iterations)) },
    };
}

export async function encryptJSON(dataKey, value) {
    const iv = randomBytes(12);
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, dataKey, plain);
    return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJSON(dataKey, blob) {
    let plain;
    try {
        plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv), additionalData: AAD }, dataKey, fromB64(blob.ct));
    } catch {
        throw new WrongKeyError('Не вдалося розшифрувати: ключ не підходить або дані пошкоджено');
    }
    return JSON.parse(new TextDecoder().decode(plain));
}
