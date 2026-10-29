import { expect } from '@playwright/test';

export const TODAY = new Date('2026-10-29T12:00:00+02:00');
export const STORAGE_KEY = 'finpulse_app_state_v3';

/** Opens the app on a fixed date; collects page errors; optionally seeds saved data. */
export async function openApp(page, { seed, firstRun = false } = {}) {
    const errors = [];
    if (!firstRun) await page.addInitScript(() => { try { localStorage.setItem('finpulse_onboarded', '1'); } catch { /* ignore */ } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text()); });
    await page.clock.setFixedTime(TODAY);
    // Google Fonts are not needed for the checks and may be unreachable.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (seed) {
        await page.addInitScript(([key, value]) => {
            if (!sessionStorage.getItem('seeded')) {
                localStorage.setItem(key, value);
                sessionStorage.setItem('seeded', '1');
            }
        }, [STORAGE_KEY, JSON.stringify(seed)]);
    }
    await page.goto('./');
    await expect(page.locator('#kpi-in-hand')).not.toHaveText('');
    return errors;
}

/** Text of an element with every kind of space collapsed to a plain space. */
export async function text(page, selector) {
    const t = await page.locator(selector).first().textContent();
    return t.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
}

export async function savedState(page) {
    return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

/** Opens a tab with whichever navigation is visible (bottom bar on phones, header on desktop). */
export async function openTab(page, tab) {
    await page.locator(`[data-action="tab"][data-tab="${tab}"]:visible`).click();
}

export async function openMore(page) {
    await page.locator('[data-action="more"]:visible').click();
}

const GIS_FAKE = `
window.google = { accounts: { oauth2: {
    initTokenClient: cfg => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'fake-token', expires_in: 3600 }), 0) }),
    hasGrantedAllScopes: () => true,
    revoke: (t, cb) => cb && cb(),
} } };`;

/**
 * Fake Google sign-in and Drive appDataFolder shared between pages of one test.
 * drive.files: Map name -> { id, body }.
 */
export async function fakeGoogle(context, drive = { files: new Map(), seq: 0 }) {
    await context.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'application/javascript', body: GIS_FAKE }));
    await context.route(/https:\/\/www\.googleapis\.com\/.*/, async r => {
        const req = r.request();
        const url = new URL(req.url());
        const method = req.method();
        if (req.headers().authorization !== 'Bearer fake-token') return r.fulfill({ status: 401, body: '{}' });
        const byId = id => [...drive.files.entries()].find(([, f]) => f.id === id);
        const meta = ([name, f]) => ({ id: f.id, name, size: String(f.body.length), modifiedTime: new Date().toISOString() });
        if (method === 'GET' && url.pathname.endsWith('/files')) {
            const q = url.searchParams.get('q') || '';
            const exact = /name = '([^']+)'/.exec(q);
            const contains = /name contains '([^']+)'/.exec(q);
            const files = [...drive.files.entries()].filter(([name]) => (exact ? name === exact[1] : contains ? name.includes(contains[1]) : true));
            return r.fulfill({ json: { files: files.map(meta) } });
        }
        const id = url.pathname.split('/files/')[1];
        if (method === 'GET' && url.searchParams.get('alt') === 'media') return r.fulfill({ contentType: 'application/json', body: byId(id)[1].body });
        if (method === 'POST') {
            const parts = req.postData().split('\r\n\r\n');
            const m = JSON.parse(parts[1].split('\r\n')[0]);
            const f = { id: `f${++drive.seq}`, parents: m.parents, body: parts[2].split('\r\n--')[0] };
            drive.files.set(m.name, f);
            return r.fulfill({ json: { id: f.id, name: m.name } });
        }
        if (method === 'PATCH') {
            const [name, f] = byId(id);
            f.body = req.postData();
            return r.fulfill({ json: { id, name } });
        }
        if (method === 'DELETE') {
            const [name] = byId(id);
            drive.files.delete(name);
            return r.fulfill({ status: 204, body: '' });
        }
        return r.fulfill({ status: 404, body: '{}' });
    });
    return drive;
}
