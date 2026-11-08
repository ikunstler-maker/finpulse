import { expect, test } from '@playwright/test';
import { fakeGoogle, openApp, openMore, STORAGE_KEY, text, TODAY } from './helpers.js';

const PASSWORD = 'сонях-ліс-2026';
const VAULT_KEY = 'finpulse_vault_v1';

async function enableEncryption(page) {
    await openMore(page);
    await page.locator('.account-block [data-action="account"]').click();
    await page.locator('#signin-google').click();
}

/** Відкрити «Ваш вхід і синхронізація» через значок Google у шапці. */
async function openAccount(page) {
    await page.locator('#account-btn').click();
    await expect(page.locator('.sheet h3')).toHaveText('Ваш вхід і синхронізація');
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
    await expect(page.locator('#toast')).toContainText('Ви увійшли');
    return key;
}

async function openLocked(page) {
    await page.clock.setFixedTime(TODAY);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto('./');
}

test('вхід: Google, пароль і ключ без примусової копії; значок стає кольоровим; ніде немає відкритих даних', async ({ page, context }) => {
    const drive = await fakeGoogle(context);
    await openApp(page);
    // не увійшли: сірий значок Google у шапці і пояснення в «Ще»
    await expect(page.locator('#account-btn')).toHaveAttribute('data-state', 'guest');
    expect(await page.locator('#account-btn .g-logo').evaluate(el => getComputedStyle(el).filter)).toContain('grayscale');
    await expect(page.locator('#account-btn')).toHaveAttribute('aria-label', /Ви не увійшли/);
    await openMore(page);
    await expect(page.locator('.account-block')).toContainText('Ви не увійшли');
    await expect(page.locator('.account-block')).toContainText('Дані лише в цьому браузері');
    await page.keyboard.press('Escape');
    let downloads = 0;
    page.on('download', () => downloads++);
    await enableEncryption(page);
    // приклад даних — не власні записи: одразу пароль, без резервної копії
    await expect(page.locator('.sheet h3')).toHaveText('Пароль FinPulse');
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
    expect(downloads).toBe(0);
    await expect(page.locator('#account-btn')).toHaveAttribute('data-state', 'ok');
    await expect(page.locator('#account-btn')).toHaveAttribute('aria-label', /Ви увійшли через Google\. Синхронізовано о/);
    expect(await page.locator('#account-btn .g-logo').evaluate(el => getComputedStyle(el).filter)).toBe('none');
    expect(await page.locator('#account-btn').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    await openMore(page);
    await expect(page.locator('.account-block')).toContainText('Ви увійшли через Google');
    await page.keyboard.press('Escape');
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
    await openAccount(page);
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

    // пристрій B: приклад даних замінюється даними з Диска — без резервної копії, одразу пароль
    await openApp(b);
    await enableEncryption(b);
    await expect(b.locator('.sheet h3')).toHaveText('На Диску вже є дані FinPulse');
    await b.locator('#f-secret').fill('не той пароль');
    await b.locator('#join-form button[type=submit]').click();
    await expect(b.locator('#form-error')).toHaveText('Неправильний пароль');
    await b.locator('#f-secret').fill(PASSWORD);
    await b.locator('#join-form button[type=submit]').click();
    await expect(b.locator('#toast')).toContainText('Ви увійшли');

    // зміна на B доходить до A
    await b.locator('.expense-row', { hasText: 'Оренда квартири' }).locator('[data-action="toggle-paid"]').click();
    await openAccount(b);
    await b.locator('[data-sync="now"]').click();
    await expect(b.locator('#toast')).toHaveText('Синхронізовано');
    await openAccount(a);
    await a.locator('[data-sync="now"]').click();
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

    await openAccount(page);
    await page.locator('[data-sync="password"]').click();
    await page.locator('#f-pw').fill('новий-пароль-2027');
    await page.locator('#f-pw2').fill('новий-пароль-2027');
    await page.locator('#pw-form button[type=submit]').click();
    await expect(page.locator('#toast')).toHaveText('Пароль змінено');
    expect(drive.files.get('finpulse-vault.json').body).toContain('"headerRev":2');

    await openAccount(page);
    await page.locator('[data-sync="forget"]').click();
    await Promise.all([page.waitForEvent('load'), page.locator('[data-confirm="yes"]').click()]);
    await expect(page.locator('#kpi-in-hand')).toBeVisible();
    await expect(page.locator('#lock')).toHaveCount(0);
    expect(await page.evaluate(k => localStorage.getItem(k), VAULT_KEY)).toBeNull();
    // на Диску дані лишилися
    expect(drive.files.has('finpulse-vault.json')).toBe(true);
});

test('вхід на пристрої з власними записами, коли на Диску вже є дані: спершу копія цих записів', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const drive = await fakeGoogle(ctxA);
    await fakeGoogle(ctxB, drive);
    const a = await ctxA.newPage();
    await openApp(a);
    await enableEncryption(a);
    await createVault(a);

    const b = await ctxB.newPage();
    await openApp(b, { firstRun: true });
    await b.locator('[data-welcome="empty"]').click();
    // порожній новий бюджет — не власні записи; додаємо один запис
    await b.locator('#fab').click();
    await b.locator('#f-title').fill('Моя кава');
    await b.locator('#f-amount').fill('60');
    await b.locator('#expense-form button[type=submit]').click();
    await enableEncryption(b);
    await expect(b.locator('.sheet h3')).toHaveText('На Диску вже є ваші дані FinPulse');
    const [copy] = await Promise.all([b.waitForEvent('download'), b.locator('#replace-backup').click()]);
    expect(copy.suggestedFilename()).toMatch(/^FinPulse_Backup_/);
    await expect(b.locator('.sheet h3')).toHaveText('На Диску вже є дані FinPulse');
    await b.locator('#f-secret').fill(PASSWORD);
    await b.locator('#join-form button[type=submit]').click();
    await expect(b.locator('#toast')).toContainText('Ви увійшли');
    await expect(b.locator('#account-btn')).toHaveAttribute('data-state', 'ok');
    await ctxA.close();
    await ctxB.close();
});

test('новий порожній бюджет: вхід без резервної копії', async ({ page, context }) => {
    await fakeGoogle(context);
    await openApp(page, { firstRun: true });
    await page.locator('[data-welcome="empty"]').click();
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.locator('#account-btn').click();
    await expect(page.locator('.sheet h3')).toHaveText('Увійти, щоб зберігати в хмарі');
    await page.locator('#signin-google').click();
    await expect(page.locator('.sheet h3')).toHaveText('Пароль FinPulse');
    await createVault(page);
    expect(downloads).toBe(0);
});
