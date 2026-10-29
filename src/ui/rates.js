/**
 * Підказка курсу: офіційний курс НБУ для долара і ринковий курс USDT/UAH (біржа WhiteBIT).
 * Запит іде лише після натискання кнопки; у запиті немає жодних даних користувача.
 */
const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
const MARKET_URL = 'https://whitebit.com/api/v1/public/ticker?market=USDT_UAH';

let cache = null;

async function getJSON(url, fetchFn) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetchFn(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error(String(res.status));
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

export function parseNbu(data) {
    const row = Array.isArray(data) ? data[0] : null;
    const rate = Number(row?.rate);
    return rate > 0 ? { rate, date: String(row.exchangedate || '') } : null;
}

export function parseMarket(data) {
    const last = Number(data?.result?.last ?? data?.last_price ?? data?.USDT_UAH?.last_price);
    return last > 0 ? { rate: last } : null;
}

/** { nbu: {rate, date} | null, market: {rate} | null } — кожне джерело може не відповісти. */
export async function fetchRates(fetchFn = (...a) => globalThis.fetch(...a)) {
    if (cache) return cache;
    const [nbu, market] = await Promise.allSettled([getJSON(NBU_URL, fetchFn), getJSON(MARKET_URL, fetchFn)]);
    const result = {
        nbu: nbu.status === 'fulfilled' ? parseNbu(nbu.value) : null,
        market: market.status === 'fulfilled' ? parseMarket(market.value) : null,
    };
    if (result.nbu || result.market) cache = result;
    return result;
}
