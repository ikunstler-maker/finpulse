/**
 * Вхід Google (Google Identity Services, token client). Токен живе лише в пам'яті сторінки.
 */
import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from '../config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading;
let token = null;
let expiresAt = 0;

function loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    loading ||= new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS_SRC;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Не вдалося завантажити вхід Google. Перевірте інтернет.'));
        document.head.appendChild(s);
    });
    return loading;
}

/** Відкриває вікно Google і повертає токен доступу лише до прихованої папки Диска. */
export async function signIn({ prompt = '' } = {}) {
    await loadGis();
    return new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: DRIVE_SCOPE,
            prompt,
            callback: resp => {
                if (resp.error) return reject(new Error(`Вхід Google не вдався: ${resp.error}`));
                if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
                    return reject(new Error('Потрібен дозвіл на приховану папку FinPulse на Диску'));
                }
                token = resp.access_token;
                expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
                resolve(token);
            },
            error_callback: err => reject(new Error(err?.type === 'popup_closed' ? 'Вікно входу закрито' : 'Вхід Google не вдався')),
        });
        client.requestAccessToken();
    });
}

export async function getToken() {
    if (token && Date.now() < expiresAt) return token;
    return signIn();
}

export function signOut() {
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
    token = null;
    expiresAt = 0;
}

export const isSignedIn = () => !!token && Date.now() < expiresAt;
