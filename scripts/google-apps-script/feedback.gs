/**
 * FinPulse: відгуки → ця Google Таблиця.
 *
 * 1. Відкрийте таблицю → Розширення → Apps Script, замініть код цим файлом, збережіть.
 * 2. Розгорнути → Нове розгортання → Тип «Вебзастосунок»:
 *    «Виконувати від імені: Я», «Хто має доступ: Усі». Скопіюйте URL вебзастосунку.
 *
 * У FinPulse немає власного сервера, тому секретного пароля тут немає (у браузері він не був би секретом).
 * Захист: скрипт лише дописує рядки (нічого не читає й не віддає), перевіряє тип і довжину,
 * екранує формули і пропускає не більше 30 відгуків на годину.
 */
const HEADERS = ['Дата', 'Тип', 'Відгук', 'Контакт', 'Технічні дані'];
const TYPES = {
  bug: 'Баг',
  change: 'Змінити',
  add: 'Додати',
  remove: 'Прибрати',
  unclear: 'Незрозуміло',
  other: 'Інше',
};
const PER_HOUR = 30;

function doPost(e) {
  const out = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ ok: false, error: 'invalid' });
  }
  if (data.app !== 'finpulse' || !TYPES[data.type] || typeof data.text !== 'string' || data.text.trim().length < 5) {
    return out({ ok: false, error: 'invalid' });
  }
  const cache = CacheService.getScriptCache();
  const hour = 'fb-' + new Date().toISOString().slice(0, 13);
  const count = Number(cache.get(hour) || 0);
  if (count >= PER_HOUR) return out({ ok: false, error: 'too_many' });
  cache.put(hour, String(count + 1), 3600);

  // Апостроф на початку не дає таблиці сприйняти текст як формулу.
  const safe = (value, max) => {
    const text = String(value || '').slice(0, max);
    return /^[=+\-@]/.test(text) ? "'" + text : text;
  };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  sheet.appendRow([new Date(), TYPES[data.type], safe(data.text, 3000), safe(data.contact, 120), safe(data.tech, 400)]);
  return out({ ok: true });
}
