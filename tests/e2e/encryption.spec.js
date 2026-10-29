import { expect, test } from '@playwright/test';
import { fakeGoogle, openApp, openMore, STORAGE_KEY, text, TODAY } from './helpers.js';

const PASSWORD = 'сонях-ліс-2026';
const VAULT_KEY = 'finpulse_vault_v1';

async function enableEncryption(page) {
    await openMore(page);
    await page.locator('[data-action="open-encryption"]').click();
    await expect(page.locator('#setup-next')).toBeDisabled();
    const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('#setup-backup').click()]);
    expect(backup.suggestedFilename()).toMatch(/^FinPulse_Backup_/);
    await page.locator('#setup-next').click();
}

async function createVault(page, { remember = true } = {}) {
    await page.locator('#f-pw').fill('короткий');
    await page.locator('#f-pw2').fill('короткий');
    await page.locator('#pw-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toContainText('щонайменше 10');
    await page.locator('#f-pw').fill(PASSWORD);
    await page.locator('#f-pw2').fill(PASSWORD + 'x');
    await page.locator('#pw-form button[type=submit]').click();
    await expect(page.locator('#form-error')).toHaveText('Паролі не збігаються');
    await page.locator('#f-pw2').fill(PASSWORD);
    await page.locator('#pw-form button[type=submit]').click();
    const key = (await page.locator('#recovery-key').textContent()).trim();
    expect(key.split('-')).toHaveLength(13);
    await expect(page.locator('#enable')).toBeDisabled();
    await page.locator('#saved-key').check();
    if (!remember) await page.locator('#remember').uncheck();
    await page.locator('#enable').click();
    await expect(page.locator('#toast')).toContainText('Шифрування увімкнено');
    return key;
}

async function openLocked(page) {
    await page.clock.setFixedTime(TODAY);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto('./');
}

test('увімкнення: спершу резервна копія, потім Google, пароль і ключ; ніде немає відкритих даних', async ({ page, context }) => {
    const drive = await fakeGoogle(context);
    await openApp(page);
    await enableEncryption(page);
    await createVault(page);

    const local = await page.evaluate(([a, b]) => [localStorage.getItem(a), localStorage.getItem(b)], [STORAGE_KEY, VAULT_KEY]);
    expect(local[0]).toBeNull(); // відкриту копію прибрано
    expect(local[1]).toContain('"header"');
    const remote = drive.files.get('finpulse-vault.json');
    expect(remote.parents).toEqual(['appDataFolder']);
    for (const s of ['Оренда', '12000', PASSWORD]) {
        expect(local[1]).not.toContain(s);
        expect(remote.body).not.toContain(s);
    }
    await expect(page.locator('#sync-chip')).toContainText('Синхр.');
    await expect(page.locator('.local-note').first()).toContainText('зашифровано');

    // пристрій запам'ятовано — після перезавантаження відкривається без пароля
    await page.reload();
    await expect(page.locator('#kpi-in-hand')).toHaveText(/44\s550/);
    await expect(page.locator('#lock')).toHaveCount(0);
});

test('без «запам’ятати» — екран блокування; неправильний пароль, ключ відновлення, блокування', async ({ page, context }) => {
    await fakeGoogle(context);
    await openApp(page);
    await enableEncryption(page);
    const recovery = await createVault(page, { remember: false });

    await openLocked(page);
    await page.reload();
    await expect(page.locator('#lock')).toBeVisible();
    await expect(page.locator('.app')).toBeHidden();
    await page.locator('#lock-remember').uncheck();
    await page.locator('#lock-secret').fill('неправильний пароль');
    await page.locator('#lock-submit').click();
    await expect(page.locator('#lock-error')).toHaveText('Неправильний пароль');
    await page.locator('#lock-mode').click();
    await page.locator('#lock-secret').fill(recovery.toLowerCase());
    await page.locator('#lock-submit').click();
    await expect(page.locator('#lock')).toHaveCount(0);
    expect(await text(page, '#kpi-in-hand')).toBe('44 550 ₴');

    // заблокувати вручну
    await openMore(page);
    await page.locator('[data-action="open-encryption"]').click();
    await page.locator('[data-sync="lock"]').click();
    await expect(page.locator('#lock')).toBeVisible();
    await page.locator('#lock-secret').fill(PASSWORD);
    await page.locator('#lock-submit').click();
    await expect(page.locator('#kpi-in-hand')).toBeVisible();
});

test('два пристрої: підключення до сховища на Диску і синхронізація змін', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const drive = await fakeGoogle(ctxA);
    await fakeGoogle(ctxB, drive);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await openApp(a);
    await enableEncryption(a);
    await createVault(a);

    // пристрій B: свої (демо) дані замінюються даними з Диска
    await openApp(b);
    await enableEncryption(b);
    await expect(b.locator('.sheet h3')).toHaveText('На Диску вже є дані FinPulse');
    await b.locator('#f-secret').fill('не той пароль');
    await b.locator('#join-form button[type=submit]').click();
    await expect(b.locator('#form-error')).toHaveText('Неправильний пароль');
    await b.locator('#f-secret').fill(PASSWORD);
    await b.locator('#join-form button[type=submit]').click();
    await expect(b.locator('#toast')).toContainText('Пристрій підключено');

    // зміна на B доходить до A
    await b.locator('.expense-row', { hasText: 'Оренда квартири' }).locator('[data-action="toggle-paid"]').click();
    await b.locator('#sync-chip').click();
    await expect(b.locator('#toast')).toHaveText('Синхронізовано');
    await a.locator('#sync-chip').click();
    await expect(a.locator('[data-group="paid"]')).toContainText('Оренда квартири');
    expect(await text(a, '#kpi-in-hand')).toBe('32 550 ₴');
    await ctxA.close();
    await ctxB.close();
});

test('зміна пароля і «прибрати дані з пристрою»', async ({ page, context }) => {
    const drive = await fakeGoogle(context);
    await openApp(page);
    await enableEncryption(page);
    await createVault(page, { remember: false });

    await openMore(page);
    await page.locator('[data-action="open-encryption"]').click();
    await page.locator('[data-sync="password"]').click();
    await page.locator('#f-pw').fill('новий-пароль-2027');
    await page.locator('#f-pw2').fill('новий-пароль-2027');
    await page.locator('#pw-form button[type=submit]').click();
    await expect(page.locator('#toast')).toHaveText('Пароль змінено');
    expect(drive.files.get('finpulse-vault.json').body).toContain('"headerRev":2');

    await openMore(page);
    await page.locator('[data-action="open-encryption"]').click();
    await page.locator('[data-sync="forget"]').click();
    await Promise.all([page.waitForEvent('load'), page.locator('[data-confirm="yes"]').click()]);
    await expect(page.locator('#kpi-in-hand')).toBeVisible();
    await expect(page.locator('#lock')).toHaveCount(0);
    expect(await page.evaluate(k => localStorage.getItem(k), VAULT_KEY)).toBeNull();
    // на Диску дані лишилися
    expect(drive.files.has('finpulse-vault.json')).toBe(true);
});
