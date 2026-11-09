/** Публічні налаштування. Client ID не є секретом: він видимий будь-кому в браузері. */
export const GOOGLE_CLIENT_ID = '941554571524-nk0fj2isaanujs66f5vfplij0l19ud43.apps.googleusercontent.com';

/** Лише прихована папка застосунку на Диску; інші файли користувача недоступні. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/**
 * Відгуки: Google Форма власниці, прив'язана до її Google Таблиці. Не секрет — адреса публічної форми.
 * action — адреса formResponse; fields — назви полів форми (entry.…). Порожньо — форма ще не підключена.
 */
export const FEEDBACK_FORM = {
    action: '',
    fields: { type: '', text: '', contact: '', tech: '' },
};
