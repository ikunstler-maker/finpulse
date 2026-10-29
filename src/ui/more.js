import { getNextMonthKey, reconcile } from '../calc.js';
import { getDefaultInitialState } from '../data/demo.js';
import { newId } from '../data/migrate.js';
import { createNextMonth } from '../data/months.js';
import { t } from '../i18n/index.js';
import { activeMonth, prepareState, saveState, setState, state, update } from '../state.js';
import { esc, money } from './format.js';
import { closeSheet, confirmSheet, openSheet, toast } from './sheet.js';

const THEME_KEY = 'finpulse_theme';

export function getTheme() {
    try {
        const v = localStorage.getItem(THEME_KEY);
        return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
        return 'system';
    }
}

export function applyTheme(theme = getTheme()) {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme) {
    try {
        if (theme === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, theme);
    } catch { /* тема просто не запам'ятається */ }
    applyTheme(theme);
}

export function openMoreSheet() {
    const m = activeMonth();
    openSheet(`
        <h3>${t('more.title')}</h3>
        <div class="menu">
            <button data-action="open-reconcile"><strong>${t('more.reconcile')}</strong><span>${t('more.reconcileSub')}</span></button>
            <button data-action="open-months"><strong>${t('more.months')}</strong><span>${t('more.monthsSub', { month: esc(m.name) })}</span></button>
            <button data-action="open-theme"><strong>${t('more.theme')}</strong><span>${t(`theme.${getTheme()}`)}</span></button>
            <button data-action="open-backup"><strong>${t('more.backup')}</strong><span>${t('more.backupSub')}</span></button>
        </div>
        <p class="local-note">${t('summary.localNote')}</p>
        <div class="actions"><button class="btn ghost" data-action="close-sheet">${t('common.close')}</button></div>`, { label: t('more.title') });
}

export function openThemeSheet() {
    const cur = getTheme();
    const sheet = openSheet(`
        <h3>${t('more.theme')}</h3>
        <div class="seg wide" role="group" aria-label="${t('more.theme')}">
            ${['system', 'light', 'dark'].map(k => `<button type="button" data-theme-set="${k}" aria-pressed="${k === cur}">${t(`theme.${k}`)}</button>`).join('')}
        </div>
        <div class="actions"><button class="btn ghost" data-action="close-sheet">${t('common.done')}</button></div>`, { label: t('more.theme') });
    sheet.addEventListener('click', e => {
        const b = e.target.closest('[data-theme-set]');
        if (!b) return;
        setTheme(b.dataset.themeSet);
        sheet.querySelectorAll('[data-theme-set]').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
}

export function openMonthsSheet() {
    const keys = Object.keys(state.months).sort().reverse();
    const nextKey = getNextMonthKey(state.activeMonthKey);
    const canCreate = !state.months[nextKey];
    openSheet(`
        <h3>${t('more.months')}</h3>
        <div class="menu months-menu">
            ${keys.map(k => `<button data-action="select-month" data-month="${k}" aria-current="${k === state.activeMonthKey ? 'true' : 'false'}"><strong>${esc(state.months[k].name)}</strong><span>${t('months.expensesCount', { n: state.months[k].expenses.length })}</span></button>`).join('')}
        </div>
        ${canCreate ? `<button class="btn primary" data-action="create-next-month">${t('months.createNext', { from: esc(activeMonth().name) })}</button>
        <p class="sheet-text small">${t('months.createHint')}</p>` : ''}
        <div class="actions"><button class="btn ghost" data-action="close-sheet">${t('common.close')}</button></div>`, { label: t('more.months') });
}

export function selectMonth(key) {
    if (!state.months[key]) return;
    update(s => { s.activeMonthKey = key; });
    closeSheet();
}

export function createNextMonthFromActive() {
    let created = '';
    update(s => {
        const key = createNextMonth(s, s.activeMonthKey);
        s.activeMonthKey = key;
        created = s.months[key].name;
    });
    closeSheet();
    toast(t('toast.monthCreated', { month: created }));
}

export function stepMonth(dir) {
    const keys = Object.keys(state.months).sort();
    const idx = keys.indexOf(state.activeMonthKey);
    const target = keys[idx + dir];
    if (target) return update(s => { s.activeMonthKey = target; });
    if (dir < 0) return toast(t('toast.firstMonth'));
    openMonthsSheet();
}

export function openReconcileSheet() {
    const m = activeMonth();
    const next = state.months[getNextMonthKey(state.activeMonthKey)];
    const expected = reconcile(m, next, 0).expectedInHand;
    const sheet = openSheet(`
        <h3>${t('reconcile.title')}</h3>
        <div class="field">
            <label for="f-bank">${t('reconcile.label')}</label>
            <input id="f-bank" type="number" inputmode="decimal" step="0.01" min="0" placeholder="${Math.round(expected)}">
        </div>
        <div class="result" id="reconcile-result" role="status">${t('reconcile.expected', { amount: `<b class="num">${money(expected)}</b>` })}</div>
        <div class="actions">
            <button class="btn primary" type="button" id="reconcile-fix" hidden></button>
            <button class="btn ghost" data-action="close-sheet">${t('common.done')}</button>
        </div>`, { label: t('reconcile.title') });
    const out = sheet.querySelector('#reconcile-result');
    const fix = sheet.querySelector('#reconcile-fix');
    let diff = 0;
    sheet.querySelector('#f-bank').addEventListener('input', e => {
        const actual = parseFloat(e.target.value) || 0;
        const r = reconcile(m, next, actual);
        diff = r.diff;
        fix.hidden = true;
        if (!actual) {
            out.className = 'result';
            out.innerHTML = t('reconcile.expected', { amount: `<b class="num">${money(expected)}</b>` });
        } else if (!r.hasDiscrepancy) {
            out.className = 'result';
            out.innerHTML = t('reconcile.match', { amount: `<b class="num">${money(r.safeBalance)}</b>` });
        } else if (r.diff > 0) {
            out.className = 'result bad';
            out.innerHTML = t('reconcile.less', { amount: `<b class="num">${money(r.diff)}</b>` });
            fix.textContent = t('reconcile.fix', { amount: money(r.diff) });
            fix.hidden = false;
        } else {
            out.className = 'result bad';
            out.innerHTML = t('reconcile.more', { amount: `<b class="num">${money(-r.diff)}</b>` });
        }
    });
    fix.addEventListener('click', () => {
        if (!(diff > 0)) return;
        update(() => {
            m.expenses.push({
                id: newId('exp'), title: t('reconcile.expenseTitle'), category: 'other',
                amountUAH: Math.round(diff * 100) / 100, amountUSD: 0, payDay: Math.min(new Date().getDate(), 31), isPaid: true,
            });
        });
        closeSheet();
        toast(t('toast.reconciled', { amount: money(diff) }));
    });
}

export function openBackupSheet() {
    const sheet = openSheet(`
        <h3>${t('backup.title')}</h3>
        <p class="sheet-text">${t('backup.hint')}</p>
        <div class="actions">
            <button class="btn primary" type="button" data-sheet="export">${t('backup.export')}</button>
            <label class="btn ghost file-btn">${t('backup.import')}<input id="backup-file" type="file" accept=".json,application/json" hidden></label>
            <button class="btn danger" type="button" data-sheet="reset">${t('backup.reset')}</button>
            <button class="btn ghost" data-action="close-sheet">${t('common.close')}</button>
        </div>`, { label: t('backup.title') });
    sheet.addEventListener('click', async e => {
        const act = e.target.closest('[data-sheet]')?.dataset.sheet;
        if (act === 'export') exportBackup();
        if (act === 'reset') {
            const ok = await confirmSheet({ title: t('backup.resetTitle'), text: t('backup.resetText'), confirm: t('backup.resetConfirm') });
            if (!ok) return;
            setState(prepareState(getDefaultInitialState()));
            update(() => {});
            toast(t('toast.reset'));
        }
    });
    sheet.querySelector('#backup-file').addEventListener('change', e => importBackup(e.target.files[0]));
}

export function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FinPulse_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('toast.backupSaved'));
}

export function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        let next;
        try {
            next = prepareState(JSON.parse(reader.result));
        } catch {
            toast(t('toast.backupBadJson'));
            return;
        }
        if (!next) {
            toast(t('toast.backupBadFormat'));
            return;
        }
        setState(next);
        saveState();
        closeSheet();
        update(() => {});
        toast(t('toast.backupRestored'));
    };
    reader.readAsText(file);
}
