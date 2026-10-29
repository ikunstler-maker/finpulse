import { getDefaultInitialState } from './data/demo.js';
import { ensurePresetIncomes } from './data/presets.js';
import { sanitizeState } from './data/sanitize.js';

/**
 * СТАН ЗАСТОСУНКУ ТА ЗБЕРЕЖЕННЯ
 */
export const STORAGE_KEY = 'finpulse_app_state_v3';


export let state = loadState();

export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = sanitizeState(JSON.parse(raw));
            if (parsed) {
                Object.keys(parsed.months).forEach(k => ensurePresetIncomes(parsed.months[k]));
                return parsed;
            }
        }
    } catch (e) {
        console.error('Помилка завантаження стану:', e);
    }
    return getDefaultInitialState();
}

export function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Помилка збереження стану:', e);
    }
}

export function setState(next) {
    state = next;
}
