import { getDefaultInitialState } from './data/demo.js';
import { migrateState, syncSalaryFields } from './data/migrate.js';
import { ensurePresetIncomes } from './data/presets.js';
import { sanitizeState } from './data/sanitize.js';

/**
 * СТАН ЗАСТОСУНКУ ТА ЗБЕРЕЖЕННЯ
 */
export const STORAGE_KEY = 'finpulse_app_state_v3';

/** Перевірка → перенесення формату → шаблони надходжень. Для localStorage і бекапів. */
export function prepareState(raw) {
    const clean = sanitizeState(raw);
    if (!clean) return null;
    migrateState(clean);
    Object.values(clean.months).forEach(ensurePresetIncomes);
    return clean;
}

const ONBOARDED_KEY = 'finpulse_onboarded';

/** Перший візит: немає ні збережених даних, ні сховища, і людина ще не обрала, з чого почати. */
export const isFirstRun = (() => {
    try {
        return !localStorage.getItem(STORAGE_KEY) && !localStorage.getItem('finpulse_vault_v1') && !localStorage.getItem(ONBOARDED_KEY);
    } catch {
        return false;
    }
})();

export function markOnboarded() {
    try {
        localStorage.setItem(ONBOARDED_KEY, '1');
    } catch { /* приватний режим — запитаємо ще раз наступного разу */ }
}

export let state = loadState();

export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = prepareState(JSON.parse(raw));
            if (parsed) return parsed;
        }
    } catch (e) {
        console.error('Помилка завантаження стану:', e);
    }
    return prepareState(getDefaultInitialState());
}

function savePlain(s) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
        console.error('Помилка збереження стану:', e);
    }
}

/** Як зберігати дані: відкрито в браузері (за замовчуванням) або зашифровано (див. src/sync). */
let persister = savePlain;
export function setPersister(fn) {
    persister = fn || savePlain;
}

export function saveState() {
    persister(state);
}

export function removePlainCopy() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { /* немає доступу до сховища — нічого видаляти */ }
}

export function setState(next) {
    state = next;
}

let listener = () => {};
export function onStateChange(fn) {
    listener = fn;
}

/** Змінює дані, синхронізує поля зарплати, зберігає й перемальовує сторінку. */
export function update(fn) {
    fn(state);
    Object.values(state.months).forEach(syncSalaryFields);
    saveState();
    listener();
}

/** Замінити дані без повторного збереження (дані вже збережено, наприклад отримано з Диска). */
export function replaceState(next) {
    state = next;
    listener();
}

export const activeMonth = () => state.months[state.activeMonthKey];
