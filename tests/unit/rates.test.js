import { describe, expect, it } from 'vitest';
import { fetchRates, parseMarket, parseNbu } from '../../src/ui/rates.js';

describe('підказка курсу', () => {
    it('розбирає відповіді НБУ і біржі', () => {
        expect(parseNbu([{ r030: 840, txt: 'Долар США', rate: 41.3254, cc: 'USD', exchangedate: '29.10.2026' }])).toEqual({ rate: 41.3254, date: '29.10.2026' });
        expect(parseMarket({ success: true, result: { last: '41.82' } })).toEqual({ rate: 41.82 });
        expect(parseNbu([])).toBeNull();
        expect(parseMarket({ success: false })).toBeNull();
    });
    it('одне джерело не відповіло — друге все одно показується; без даних користувача в запиті', async () => {
        const urls = [];
        const fake = async url => {
            urls.push(url);
            if (url.includes('bank.gov.ua')) throw new Error('offline');
            return { ok: true, json: async () => ({ result: { last: '42.1' } }) };
        };
        const r = await fetchRates(fake);
        expect(r).toEqual({ nbu: null, market: { rate: 42.1 } });
        expect(urls.every(u => !/amount|uah=|salary/i.test(u))).toBe(true);
    });
});
