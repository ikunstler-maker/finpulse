import { applyImport, FIELDS, guessMapping, parseCSV, planImport, rowsFromCSV, rowsFromJSON } from '../data/import.js';
import { t } from '../i18n/index.js';
import { replaceState, state, update } from '../state.js';
import { esc, money } from './format.js';
import { exportBackup } from './more.js';
import { closeSheet, openSheet, toast } from './sheet.js';

const MAX_BYTES = 5 * 1024 * 1024;
let undoSnapshot = null;

export function openImportSheet() {
    const sheet = openSheet(`
        <h3>${t('import.title')}</h3>
        <p class="sheet-text">${t('import.hint')}</p>
        <ul class="steps">
            <li>${t('import.csvHint')}</li>
            <li>${t('import.jsonHint')}</li>
        </ul>
        <div class="actions">
            <label class="btn primary file-btn">${t('import.choose')}<input id="import-file" type="file" accept=".csv,.json,.txt,text/csv,application/json" hidden></label>
            ${undoSnapshot ? `<button class="btn ghost" type="button" data-sheet="undo">${t('import.undo')}</button>` : ''}
        </div>
        <p class="form-error" id="form-error" role="alert" hidden></p>`, { label: t('import.title') });
    const fail = msg => {
        const err = sheet.querySelector('#form-error');
        err.textContent = msg;
        err.hidden = false;
    };
    sheet.querySelector('[data-sheet="undo"]')?.addEventListener('click', undoImport);
    sheet.querySelector('#import-file').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) return fail(t('import.errSize'));
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result);
            const isJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(text);
            if (isJson) {
                let data;
                try {
                    data = JSON.parse(text);
                } catch {
                    return fail(t('import.errJson'));
                }
                const parsed = rowsFromJSON(data);
                if (!parsed) return fail(t('import.errJsonShape'));
                return openPreview({ parsed, fileName: file.name });
            }
            const table = parseCSV(text);
            if (table.length < 2) return fail(t('import.errEmpty'));
            openMapping(table, file.name);
        };
        reader.onerror = () => fail(t('import.errRead'));
        reader.readAsText(file);
    });
}

function openMapping(table, fileName) {
    const header = table[0];
    const guess = guessMapping(header);
    const options = sel => `<option value="">${t('import.skip')}</option>${header.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || t('import.column', { n: i + 1 }))}</option>`).join('')}`;
    const sample = table.slice(1, 4);
    const sheet = openSheet(`
        <h3>${t('import.mapTitle')}</h3>
        <p class="sheet-text">${t('import.mapHint', { file: esc(fileName), n: table.length - 1 })}</p>
        <div class="map-grid">
            ${FIELDS.map(f => `
                <div class="field"><label for="map-${f}">${t(`import.fields.${f}`)}${['date', 'amount'].includes(f) ? ' *' : ''}</label>
                <select id="map-${f}" data-field="${f}">${options(guess[f])}</select></div>`).join('')}
        </div>
        <p class="sheet-text small">${t('import.signHint')}</p>
        <div class="table-wrap"><table class="sample">
            <tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
            ${sample.map(r => `<tr>${header.map((_, i) => `<td>${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}
        </table></div>
        <p class="form-error" id="form-error" role="alert" hidden></p>
        <div class="actions"><button class="btn primary" type="button" id="map-next">${t('import.next')}</button></div>`, { label: t('import.mapTitle') });
    sheet.querySelector('#map-next').addEventListener('click', () => {
        const mapping = {};
        sheet.querySelectorAll('[data-field]').forEach(s => { if (s.value !== '') mapping[s.dataset.field] = Number(s.value); });
        if (mapping.date == null || mapping.amount == null) {
            const err = sheet.querySelector('#form-error');
            err.textContent = t('import.errMapping');
            err.hidden = false;
            return;
        }
        openPreview({ parsed: rowsFromCSV(table, mapping), fileName, hasPaidColumn: mapping.paid != null });
    });
}

function openPreview({ parsed, fileName, hasPaidColumn = false }) {
    let opts = { markPaid: true, createCards: true };
    const sheet = openSheet(`
        <h3>${t('import.previewTitle')}</h3>
        <p class="sheet-text">${esc(fileName)}</p>
        <div id="preview"></div>
        ${hasPaidColumn ? '' : `<label class="check-line"><input type="checkbox" id="opt-paid" checked> ${t('import.markPaid')}</label>`}
        <label class="check-line"><input type="checkbox" id="opt-cards" checked> ${t('import.createCards')}</label>
        <label class="check-line"><input type="checkbox" id="opt-backup" checked> ${t('import.backupFirst')}</label>
        <div class="actions"><button class="btn primary" type="button" id="import-apply">${t('import.apply')}</button></div>`, { label: t('import.previewTitle') });
    const render = () => {
        const plan = planImport(state, parsed.rows, opts);
        const box = sheet.querySelector('#preview');
        const errLines = parsed.errors.slice(0, 5).map(e => e.line).join(', ');
        box.innerHTML = `
            <div class="result" id="import-summary">
                ${t('import.summary', { expenses: plan.expenses, incomes: plan.incomes })}<br>
                ${plan.duplicates ? `${t('import.duplicates', { n: plan.duplicates })}<br>` : ''}
                ${parsed.errors.length ? `${t('import.errors', { n: parsed.errors.length, lines: errLines })}<br>` : ''}
                ${plan.months.length ? `${t('import.months', { list: plan.months.map(k => k.split('-').reverse().join('.')).join(', ') })}<br>` : ''}
                ${plan.newCards.length ? t('import.newCards', { list: esc(plan.newCards.map(c => c.name).join(', ')) }) : ''}
            </div>
            ${plan.items.length ? `<div class="table-wrap"><table class="sample">
                ${plan.items.slice(0, 6).map(i => `<tr><td class="num">${String(i.date.d).padStart(2, '0')}.${String(i.date.m).padStart(2, '0')}</td><td>${esc(i.title)}</td><td class="num">${i.type === 'expense' ? '−' : '+'}${money(i.amount)}</td></tr>`).join('')}
            </table></div>` : ''}`;
        sheet.querySelector('#import-apply').disabled = plan.items.length === 0;
        return plan;
    };
    render();
    sheet.addEventListener('change', e => {
        if (e.target.id === 'opt-paid') opts = { ...opts, markPaid: e.target.checked };
        if (e.target.id === 'opt-cards') opts = { ...opts, createCards: e.target.checked };
        render();
    });
    sheet.querySelector('#import-apply').addEventListener('click', () => {
        const plan = render();
        if (!plan.items.length) return;
        if (sheet.querySelector('#opt-backup').checked) exportBackup();
        undoSnapshot = JSON.stringify(state);
        update(s => applyImport(s, plan));
        closeSheet();
        toast(t('import.done', { n: plan.items.length }));
    });
}

export function undoImport() {
    if (!undoSnapshot) return;
    replaceState(JSON.parse(undoSnapshot));
    undoSnapshot = null;
    update(() => {});
    closeSheet();
    toast(t('import.undone'));
}
