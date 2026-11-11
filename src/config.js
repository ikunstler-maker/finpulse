/** Публічні налаштування. Client ID не є секретом: він видимий будь-кому в браузері. */
export const GOOGLE_CLIENT_ID = '941554571524-nk0fj2isaanujs66f5vfplij0l19ud43.apps.googleusercontent.com';

/** Лише прихована папка застосунку на Диску; інші файли користувача недоступні. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/**
 * Відгуки: вебзастосунок Google Apps Script власниці, який дописує рядок у її Google Таблицю
 * (код — scripts/google-apps-script/feedback.gs). Адреса не секретна. Порожньо — ще не підключено.
 */
export const FEEDBACK_URL = 'https://script.google.com/macros/s/AKfycbxOK1w3EaiWIDsQdHxajlFvav2cM3XBm7i_mqE-ekvesbLDjgJRaHlbcKSDFBE6IFIHLA/exec';
