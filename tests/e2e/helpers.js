import { expect } from '@playwright/test';

export const TODAY = new Date('2026-10-29T12:00:00+02:00');
export const STORAGE_KEY = 'finpulse_app_state_v3';

/** Opens the app on a fixed date; collects page errors; optionally seeds saved data. */
export async function openApp(page, { seed } = {}) {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
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
    await expect(page.locator('#kpi-in-hand-uah')).not.toHaveText('');
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
