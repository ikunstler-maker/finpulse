import { expect, test } from '@playwright/test';

const GIS_FAKE = `
window.google = { accounts: { oauth2: {
    initTokenClient: cfg => ({ requestAccessToken: () => cfg.callback({ access_token: 'fake-token', expires_in: 3600 }) }),
    hasGrantedAllScopes: () => true,
    revoke: (t, cb) => cb && cb(),
} } };`;

/** Fake Google Drive that stores files in memory for the whole test. */
async function fakeGoogle(page, store) {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'application/javascript', body: GIS_FAKE }));
    await page.route(/https:\/\/www\.googleapis\.com\/.*/, async r => {
        const req = r.request();
        const url = new URL(req.url());
        const method = req.method();
        if (req.headers().authorization !== 'Bearer fake-token') return r.fulfill({ status: 401, body: '{}' });
        if (method === 'GET' && url.pathname.endsWith('/files')) {
            return r.fulfill({ json: { files: store.file ? [{ id: 'f1', name: store.file.name, size: String(store.file.body.length), modifiedTime: new Date().toISOString() }] : [] } });
        }
        if (method === 'GET' && url.searchParams.get('alt') === 'media') return r.fulfill({ contentType: 'application/json', body: store.file.body });
        if (method === 'POST') {
            const body = req.postData();
            const parts = body.split('\r\n\r\n');
            store.file = { name: JSON.parse(parts[1].split('\r\n')[0]).name, parents: JSON.parse(parts[1].split('\r\n')[0]).parents, body: parts[2].split('\r\n--')[0] };
            return r.fulfill({ json: { id: 'f1', name: store.file.name, size: String(store.file.body.length) } });
        }
        if (method === 'PATCH') { store.file.body = req.postData(); return r.fulfill({ json: { id: 'f1', name: store.file.name } }); }
        if (method === 'DELETE') { store.file = null; return r.fulfill({ status: 204, body: '' }); }
        return r.fulfill({ status: 404, body: '{}' });
    });
}

test('прототип: шифрування, запис у приховану папку, відкриття паролем і ключем відновлення', async ({ page, browser }) => {
    test.setTimeout(60000);
    const store = {};
    await fakeGoogle(page, store);
    await page.goto('./prototype.html');
    await page.locator('#btn-signin').click();
    await expect(page.locator('#auth-status')).toContainText('Увійшли');

    await page.locator('#new-password').fill('сонях-тест-2026');
    await page.locator('#btn-create').click();
    await expect(page.locator('#recovery-box')).toBeVisible({ timeout: 20000 });
    const recoveryKey = (await page.locator('#recovery-key').textContent()).trim();
    expect(recoveryKey.split('-')).toHaveLength(13);

    // На Диску лише шифротекст: у прихованій папці, без пароля, назв і сум
    expect(store.file.parents).toEqual(['appDataFolder']);
    for (const s of ['сонях-тест-2026', 'Оренда', '12000', recoveryKey]) expect(store.file.body).not.toContain(s);

    // Інший браузер (новий контекст) — той самий Диск
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await fakeGoogle(p2, store);
    await p2.goto('./prototype.html');
    await p2.locator('#btn-signin').click();

    await p2.locator('#open-secret').fill('неправильний');
    await p2.locator('#btn-open-password').click();
    await expect(p2.locator('#log li').first()).toHaveText(/Неправильний пароль/, { timeout: 20000 });
    await expect(p2.locator('#opened')).toBeHidden();

    await p2.locator('#open-secret').fill('сонях-тест-2026');
    await p2.locator('#btn-open-password').click();
    await expect(p2.locator('#opened')).toContainText('Витрат: 14', { timeout: 20000 });

    const logCount = async () => p2.locator('#log li').count();
    let before = await logCount();
    await p2.locator('#open-secret').fill(recoveryKey.toLowerCase());
    await p2.locator('#btn-open-recovery').click();
    await expect(p2.locator('#log li')).toHaveCount(before + 1, { timeout: 20000 });
    await expect(p2.locator('#log li').first()).toContainText('розшифровано');

    before = await logCount();
    await p2.locator('#btn-delete').click();
    await expect(p2.locator('#log li')).toHaveCount(before + 1);
    await expect(p2.locator('#log li').first()).toContainText('видалено');
    expect(store.file).toBeNull();
    await other.close();
});
