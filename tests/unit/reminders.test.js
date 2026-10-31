import { describe, expect, it } from 'vitest';
import { upcomingPayments } from '../../src/calc.js';
import { alarmTrigger, buildICS, foldLine, icsText } from '../../src/data/calendar.js';

const st = () => ({
    months: {
        '2026-10': { year: 2026, month: 10, expenses: [
            { id: 'a', title: 'Оренда', amountUAH: 12000, payDay: 29, isPaid: false },
            { id: 'b', title: 'Зв’язок', amountUAH: 250, payDay: 30, isPaid: false },
            { id: 'c', title: 'Сплачене', amountUAH: 100, payDay: 29, isPaid: true },
            { id: 'd', title: 'Прострочене', amountUAH: 100, payDay: 3, isPaid: false },
            { id: 'e', title: 'Кінець місяця', amountUAH: 50, payDay: 31, isPaid: false },
        ] },
        '2026-11': { year: 2026, month: 11, expenses: [
            { id: 'f', title: 'Підписка', amountUAH: 300, payDay: 1, isPaid: false },
            { id: 'g', title: '31-ше в листопаді', amountUAH: 10, payDay: 31, isPaid: false },
        ] },
    },
});
const today = new Date(2026, 9, 29, 15, 30);

describe('найближчі платежі', () => {
    it('лише несплачені, від сьогодні на N днів, через межу місяців', () => {
        expect(upcomingPayments(st(), today, 0).map(p => p.expense.id)).toEqual(['a']);
        expect(upcomingPayments(st(), today, 1).map(p => p.expense.id)).toEqual(['a', 'b']);
        expect(upcomingPayments(st(), today, 3).map(p => [p.expense.id, p.inDays])).toEqual([['a', 0], ['b', 1], ['e', 2], ['f', 3]]);
    });
    it('31-ше число в коротшому місяці — останній день', () => {
        const p = upcomingPayments(st(), today, 40).find(x => x.expense.id === 'g');
        expect(p.date).toEqual({ y: 2026, m: 11, d: 30 });
    });
});

describe('календар .ics', () => {
    const texts = { summary: e => `💳 ${e.title}`, description: e => `Платіж ${e.title}, ${e.amountUAH}`, alarm: e => e.title };
    it('нагадування: за день о 09:00, у день о 10:30', () => {
        expect(alarmTrigger(1, '09:00')).toBe('-PT900M');
        expect(alarmTrigger(0, '10:30')).toBe('PT630M');
        expect(alarmTrigger(3, '00:00')).toBe('-PT4320M');
    });
    it('екранування і перенесення довгих рядків (не більше 75 байтів)', () => {
        expect(icsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
        const long = `SUMMARY:${'Дуже довга назва платежу '.repeat(6)}`;
        const folded = foldLine(long);
        const enc = new TextEncoder();
        expect(folded.split('\r\n').every(l => enc.encode(l).length <= 75)).toBe(true);
        expect(folded.split('\r\n ').join('')).toBe(long);
    });
    it('подія на весь день з нагадуванням і стабільним UID', () => {
        const items = upcomingPayments(st(), today, 1);
        const ics = buildICS(items, { daysBefore: 1, time: '09:00', now: new Date(Date.UTC(2026, 9, 29, 12, 0, 0)), texts });
        expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(ics).toContain('UID:a-20261029@finpulse');
        expect(ics).toContain('DTSTART;VALUE=DATE:20261029\r\nDTEND;VALUE=DATE:20261030');
        expect(ics).toContain('DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261031');
        expect(ics).toContain('DTSTAMP:20261029T120000Z');
        expect(ics).toContain('TRIGGER:-PT900M');
        expect(ics).toContain('DESCRIPTION:Платіж Оренда\\, 12000');
    });
    it('небезпечний id не ламає UID', () => {
        const ics = buildICS([{ expense: { id: 'x\r\nEVIL:1', title: 't', amountUAH: 1 }, date: { y: 2026, m: 12, d: 31 } }], { texts });
        expect(ics).toContain('UID:xEVIL1-20261231@finpulse');
        expect(ics).toContain('DTEND;VALUE=DATE:20270101');
        expect(ics).not.toMatch(/^EVIL/m);
    });
});
