import { getDefaultInitialState } from '../data/demo.js';
import { sanitizeState } from '../data/sanitize.js';
import { saveState, setState, state } from '../state.js';
import { renderAll } from './render.js';
import { showToast } from '../utils.js';

/**
 * РЕЗЕРВНЕ КОПІЮВАННЯ / BACKUP
 */
export function openBackupModal() {
    document.getElementById('backup-modal').classList.remove('hidden');
}

export function closeBackupModal() {
    document.getElementById('backup-modal').classList.add('hidden');
}

export function exportDataBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `FinPulse_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('Резервну копію збережено', '💾');
}

export function importDataBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const imported = sanitizeState(JSON.parse(event.target.result));
            if (imported) {
                setState(imported);
                saveState();
                closeBackupModal();
                renderAll();
                showToast('Дані успішно відновлено', '✅');
            } else {
                showToast('Невірний формат файлу', '⚠️');
            }
        } catch {
            showToast('Помилка читання JSON', '❌');
        }
    };
    reader.readAsText(file);
}

export function resetToDemoData() {
    setState(getDefaultInitialState());
    saveState();
    closeBackupModal();
    renderAll();
    showToast('Скинуто до демо-даних', '🔄');
}
