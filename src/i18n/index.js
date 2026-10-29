import uk from './uk.js';

/**
 * Текст інтерфейсу за ключем. Параметри підставляються в {назва}.
 * Відсутній ключ видно одразу (повертається сам ключ), а тест перевіряє, що таких немає.
 */
export function t(key, params = {}) {
    const value = key.split('.').reduce((o, k) => (o == null ? o : o[k]), uk);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/** Українська множина: одна / кілька / багато. */
export function plural(n, [one, few, many]) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
}
