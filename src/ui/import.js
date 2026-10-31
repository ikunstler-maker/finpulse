import { analyzeCSV, applyImport, FIELDS, planImport, rowsFromCSV, rowsFromJSON } from '../data/import.js';
import { t } from '../i18n/index.js';
import { activeMonth, replaceState, state, update } from '../state.js';
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
            <label class="btn primary file-btn">${t('import.choose')}<input id="import-file" type="file" accept=".csv,.json,.txt,text/csv,application/json" multiple hidden></label>
            ${undoSnapshot ? `<button class="btn ghost" type="button" data-sheet="undo">${t('import.undo')}</button>` : ''}
        </div>
        <p class="form-error" id="form-error" role="alert" hidden></p>`, { label: t('import.title') });
    const fail = msg => {
        const err = sheet.querySelector('#form-error');
        err.textContent = msg;
        err.hidden = false;
    };
    sheet.querySelector('[data-sheet="undo"]')?.addEventListener('click', undoImport);
    sheet.querySelector('#import-file').addEventListener('change', async e => {
        const files = [...e.target.files];
        if (!files.length) return;
        if (files.some(f => f.size > MAX_BYTES)) return fail(t('import.errSize'));
        let texts;
        try {
            texts = await Promise.all(files.map(f => f.text()));
        } catch {
            return fail(t('import.errRead'));
        }
        const defaultDay = activeMonth().salaryDay || 1;
        const sources = [];
        for (const [i, file] of files.entries()) {
            const text = texts[i];
            if (/\.json$/i.test(file.name) || /^\s*[[{]/.test(text)) {
                let data;
                try {
                    data = JSON.parse(text);
                } catch {
                    return fail(t('import.errJsonIn', { file: file.name }));
                }
                const parsed = rowsFromJSON(data);
                if (!parsed) return fail(files.length > 1 ? t('import.errJsonShapeIn', { file: file.name }) : t('import.errJsonShape'));
                sources.push({ name: file.name, parsed });
            } else {
                const a = analyzeCSV(text, file.name, { defaultDay });
                if (a.table.length < 2) return fail(t('import.errEmptyIn', { file: file.name }));
                sources.push({ name: file.name, csv: a });
            }
        }
        if (sources.length === 1 && sources[0].csv) return openMapping(sources[0].csv, sources[0].name);
        const failed = sources.find(src => src.csv && (src.csv.mapping.date == null && !src.csv.ctx || src.csv.mapping.amount == null));
        if (failed) return fail(t('import.errMappingIn', { file: failed.name }));
        openPreview({
            sources: sources.map(src => ({ name: src.name, parsed: src.parsed || rowsFromCSV(src.csv.table, src.csv.mapping, { ctx: src.csv.ctx }) })),
            hasPaidColumn: sources.every(src => src.csv && src.csv.mapping.paid != null),
        });
    });
}

function openMapping({ table, mapping: guess, ctx }, fileName) {
    const header = table[0];
    const options = sel => `<option value="">${t('import.skip')}</option>${header.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || t('import.column', { n: i + 1 }))}</option>`).join('')}`;
    const sample = table.slice(1, 4);
    const m = activeMonth();
    const year = ctx?.year || m.year;
    const month = ctx?.month || m.month;
    const sheet = openSheet(`
        <h3>${t('import.mapTitle')}</h3>
        <p class="sheet-text">${t('import.mapHint', { file: esc(fileName), n: table.length - 1 })}</p>
        <div class="map-grid">
            ${FIELDS.map(f => `
                <div class="field"><label for="map-${f}">${t(`import.fields.${f}`)}${['date', 'amount'].includes(f) ? ' *' : ''}</label>
                <select id="map-${f}" data-field="${f}">${options(guess[f])}</select></div>`).join('')}
        </div>
        <div class="field-pair">
            <div class="field"><label for="ctx-month">${t('import.ctxMonth')}</label>
                <select id="ctx-month"><option value="">${t('import.ctxNone')}</option>${t('months.name').split(',').map((n, i) => `<option value="${i + 1}" ${ctx && month === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="field"><label for="ctx-year">${t('import.ctxYear')}</label><input id="ctx-year" type="number" inputmode="numeric" min="2000" max="2100" value="${year}"></div>
        </div>
        <p class="sheet-text small">${t(ctx ? 'import.ctxFound' : 'import.ctxHint')}</p>
        <div class="field"><label for="ctx-day">${t('import.defaultDay')}</label><input id="ctx-day" type="number" inputmode="numeric" min="1" max="31" value="${ctx?.defaultDay || m.salaryDay || 1}"></div>
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
        const monthSel = Number(sheet.querySelector('#ctx-month').value);
        const yearSel = Number(sheet.querySelector('#ctx-year').value);
        const daySel = Number(sheet.querySelector('#ctx-day').value);
        const chosenCtx = monthSel && yearSel ? { year: yearSel, month: monthSel, defaultDay: daySel >= 1 && daySel <= 31 ? daySel : 1, lockMonth: true } : null;
        if ((mapping.date == null && !chosenCtx) || mapping.amount == null) {
            const err = sheet.querySelector('#form-error');
            err.textContent = t('import.errMapping');
            err.hidden = false;
            return;
        }
        openPreview({ sources: [{ name: fileName, parsed: rowsFromCSV(table, mapping, { ctx: chosenCtx }) }], hasPaidColumn: mapping.paid != null });
    });
}

function openPreview({ sources, hasPaidColumn = false }) {
    let opts = { markPaid: true, createCards: true };
    const parsed = {
        rows: sources.flatMap(src => src.parsed.rows),
        errors: sources.flatMap(src => src.parsed.errors.map(e => ({ ...e, file: src.name }))),
        moved: sources.reduce((n, src) => n + (src.parsed.moved || 0), 0),
    };
    const names = sources.map(src => src.name);
    const sheet = openSheet(`
        <h3>${t('import.previewTitle')}</h3>
        <p class="sheet-text">${names.length > 1 ? t('import.filesCount', { n: names.length }) : esc(names[0])}</p>
        <div id="preview"></div>
        ${hasPaidColumn ? '' : `<label class="check-line"><input type="checkbox" id="opt-paid" checked> ${t('import.markPaid')}</label>`}
        <label class="check-line"><input type="checkbox" id="opt-cards" checked> ${t('import.createCards')}</label>
        <label class="check-line"><input type="checkbox" id="opt-backup" checked> ${t('import.backupFirst')}</label>
        <div class="actions"><button class="btn primary" type="button" id="import-apply">${t('import.apply')}</button></div>`, { label: t('import.previewTitle') });
    const render = () => {
        const plan = planImport(state, parsed.rows, opts);
        const box = sheet.querySelector('#preview');
        const errLines = parsed.errors.slice(0, 5).map(e => (names.length > 1 ? `${esc(e.file)}:${e.line}` : e.line)).join(', ');
        box.innerHTML = `
            <div class="result" id="import-summary">
                ${t('import.summary', { expenses: plan.expenses, incomes: plan.incomes - plan.salaryParts })}${plan.salaryParts ? ` ${t('import.salaryParts', { n: plan.salaryParts })}` : ''}<br>
                ${t('import.totals', { expenses: money(plan.expenseTotal), incomes: money(plan.incomeTotal) })}<br>
                ${parsed.moved ? `${t('import.moved', { n: parsed.moved })}<br>` : ''}
                ${plan.duplicates ? `${t('import.duplicates', { n: plan.duplicates })}<br>` : ''}
                ${parsed.errors.length ? `${t('import.errors', { n: parsed.errors.length, lines: errLines })}<br>` : ''}
                ${plan.months.length ? `${t('import.months', { list: plan.months.map(k => k.split('-').reverse().join('.')).join(', ') })}<br>` : ''}
                ${plan.newCards.length ? t('import.newCards', { list: esc(plan.newCards.map(c => c.name).join(', ')) }) : ''}
            </div>
            ${plan.items.length ? `<div class="table-wrap"><table class="sample">
                ${plan.items.slice(0, 6).map(i => `<tr><td class="num">${String(i.date.d).padStart(2, '0')}.${String(i.date.m).padStart(2, '0')}</td><td>${esc(i.salary ? t('import.salaryRow') : i.title)}</td><td class="num">${i.type === 'expense' ? '−' : '+'}${money(i.amount)}</td></tr>`).join('')}
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
