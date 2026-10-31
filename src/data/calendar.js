/**
 * Календар (.ics) з платежами: кожна несплачена витрата — подія на весь день із нагадуванням.
 * Файл створюється в браузері й зберігається на пристрої; нікуди не надсилається.
 * UID стабільний (id витрати + дата), тож повторний імпорт оновлює подію в календарях,
 * які це підтримують.
 */

const pad = n => String(n).padStart(2, '0');
const ymd = ({ y, m, d }) => `${y}${pad(m)}${pad(d)}`;

/** Екранування тексту за RFC 5545. */
export function icsText(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Перенесення довгих рядків: не більше 75 байтів UTF-8, продовження з пробілу. */
export function foldLine(line) {
    const enc = new TextEncoder();
    const parts = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
        const b = enc.encode(ch).length;
        if (bytes + b > (parts.length ? 74 : 75)) {
            parts.push(cur);
            cur = '';
            bytes = 0;
        }
        cur += ch;
        bytes += b;
    }
    parts.push(cur);
    return parts.join('\r\n ');
}

/** Зсув нагадування від початку дня події: за `daysBefore` днів о `time` (ГГ:ХХ). */
export function alarmTrigger(daysBefore, time) {
    const [h, mi] = String(time || '09:00').split(':').map(Number);
    const minutes = -Math.max(0, daysBefore | 0) * 1440 + (h || 0) * 60 + (mi || 0);
    return minutes < 0 ? `-PT${-minutes}M` : `PT${minutes}M`;
}

/**
 * items — [{ expense, date: { y, m, d } }]; texts — { summary(expense), description(expense), alarm }.
 */
export function buildICS(items, { daysBefore = 1, time = '09:00', now = new Date(), texts }) {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinPulse//Payments//UK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const { expense: e, date } of items) {
        const end = new Date(date.y, date.m - 1, date.d + 1);
        lines.push(
            'BEGIN:VEVENT',
            `UID:${String(e.id).replace(/[^A-Za-z0-9_-]/g, '')}-${ymd(date)}@finpulse`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${ymd(date)}`,
            `DTEND;VALUE=DATE:${ymd({ y: end.getFullYear(), m: end.getMonth() + 1, d: end.getDate() })}`,
            `SUMMARY:${icsText(texts.summary(e))}`,
            `DESCRIPTION:${icsText(texts.description(e))}`,
            'TRANSP:TRANSPARENT',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${icsText(texts.alarm(e))}`,
            `TRIGGER:${alarmTrigger(daysBefore, time)}`,
            'END:VALARM',
            'END:VEVENT',
        );
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
}
