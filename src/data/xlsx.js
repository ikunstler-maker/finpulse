/**
 * Excel (.xlsx) без сторонніх бібліотек.
 * .xlsx — це zip-архів з XML-файлами. Читання: центральний каталог zip → файли (стиснення
 * deflate розпаковує вбудований у браузер DecompressionStream) → аркуші як таблиці рядків.
 * Запис: zip без стиснення (CRC32), рядки — inline-текст, числа — числами.
 * Усе відбувається в браузері; файл нікуди не надсилається.
 */

const MAX_FILE = 64 * 1024 * 1024;
const MAX_CELLS = 200000;

/* ---------- zip ---------- */

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Список файлів архіву: { name, method, compSize, size, offset }. */
export function zipEntries(bytes) {
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not-zip');
    const count = u16(bytes, eocd + 10);
    let p = u32(bytes, eocd + 16);
    const out = [];
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
        if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new Error('bad-zip');
        const nameLen = u16(bytes, p + 28);
        const extraLen = u16(bytes, p + 30);
        const commentLen = u16(bytes, p + 32);
        out.push({
            name: dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
            method: u16(bytes, p + 10),
            compSize: u32(bytes, p + 20),
            size: u32(bytes, p + 24),
            offset: u32(bytes, p + 42),
        });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

async function inflateRaw(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Вміст одного файлу архіву як текст (UTF-8). */
async function readEntry(bytes, e) {
    if (u32(bytes, e.offset) !== 0x04034b50) throw new Error('bad-zip');
    if (e.size > MAX_FILE) throw new Error('too-big');
    const start = e.offset + 30 + u16(bytes, e.offset + 26) + u16(bytes, e.offset + 28);
    const raw = bytes.subarray(start, start + e.compSize);
    const data = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
    if (!data) throw new Error('unsupported');
    return new TextDecoder().decode(data);
}

/* ---------- XML (лише те, що потрібно для аркушів) ---------- */

export function xmlDecode(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
        const k = e.toLowerCase();
        if (k === 'amp') return '&';
        if (k === 'lt') return '<';
        if (k === 'gt') return '>';
        if (k === 'quot') return '"';
        if (k === 'apos') return "'";
        const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    });
}

const attr = (tag, name) => {
    const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return m ? xmlDecode(m[1]) : null;
};
/** Увесь текст з <t>…</t> всередині фрагмента (звичайний і форматований рядок). */
const texts = frag => [...frag.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t(?:\s[^>]*)?\/>/g)].map(m => xmlDecode(m[1] || '')).join('');

/** «AB12» → номер колонки з нуля (27). */
export function colIndex(ref) {
    const letters = /^[A-Z]+/i.exec(ref || '')?.[0].toUpperCase() || '';
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Які стилі клітинок — дати (за форматом числа). */
function dateStyles(stylesXml) {
    if (!stylesXml) return new Set();
    const custom = new Map([...stylesXml.matchAll(/<(?:\w+:)?numFmt\s[^>]*>/g)].map(m => [Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode') || '']));
    const isDateFmt = id => BUILTIN_DATE.has(id) || (custom.has(id) && /[dmy]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,\s%]+$/.test(custom.get(id)));
    const xfs = /<(?:\w+:)?cellXfs[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(stylesXml)?.[1] || '';
    const out = new Set();
    [...xfs.matchAll(/<(?:\w+:)?xf\s[^>]*?\/?>/g)].forEach((m, i) => { if (isDateFmt(Number(attr(m[0], 'numFmtId')))) out.add(i); });
    return out;
}

/** Серійне число дати Excel → «ДД.ММ.РРРР» (система 1900; 1904 — для старих Mac-файлів). */
export function excelDate(serial, date1904 = false) {
    const days = Math.floor(Number(serial)) + (date1904 ? 1462 : 0);
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Число з XML → рядок без «хвостів» з плаваючою комою (0.1+0.2). */
const numText = v => {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : v;
};

function parseSheet(xml, shared, dates, date1904) {
    const rows = [];
    let cells = 0;
    for (const rm of xml.matchAll(/<(?:\w+:)?row(\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
        const rIdx = Number(attr(rm[1] || '', 'r')) - 1;
        const row = [];
        let auto = 0;
        for (const cm of rm[2].matchAll(/<(?:\w+:)?c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
            if (++cells > MAX_CELLS) throw new Error('too-big');
            const tag = cm[1] || '';
            const body = cm[2] || '';
            const ref = attr(tag, 'r');
            const col = ref ? colIndex(ref) : auto;
            auto = col + 1;
            const type = attr(tag, 't');
            const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
            let val = '';
            if (type === 's') val = shared[Number(v)] ?? '';
            else if (type === 'inlineStr') val = texts(body);
            else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
            else if (type === 'str' || type === 'e') val = xmlDecode(v ?? '');
            else if (v != null) val = dates.has(Number(attr(tag, 's'))) ? excelDate(v, date1904) : numText(xmlDecode(v));
            if (col >= 0 && col < 1000) row[col] = val;
        }
        const at = Number.isFinite(rIdx) && rIdx >= 0 && rIdx < 100000 ? rIdx : rows.length;
        rows[at] = Array.from(row, x => x ?? '');
    }
    return Array.from(rows, r => r || []);
}

/** Усі аркуші книги: [{ name, rows }] у порядку вкладок. Приховані аркуші пропускаються. */
export async function readXLSX(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const entries = zipEntries(bytes);
    const byName = new Map(entries.map(e => [e.name.replace(/^\/+/, ''), e]));
    const get = async name => (byName.has(name) ? readEntry(bytes, byName.get(name)) : null);
    const workbook = await get('xl/workbook.xml');
    if (!workbook) throw new Error('not-xlsx');
    const rels = (await get('xl/_rels/workbook.xml.rels')) || '';
    const target = new Map([...rels.matchAll(/<Relationship\s[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target') || '']));
    const sharedXml = await get('xl/sharedStrings.xml');
    const shared = sharedXml ? [...sharedXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => texts(m[1].replace(/<(?:\w+:)?rPh[\s\S]*?<\/(?:\w+:)?rPh>/g, ''))) : [];
    const dates = dateStyles(await get('xl/styles.xml'));
    const date1904 = /date1904="(1|true)"/.test(workbook);
    const sheets = [];
    for (const m of workbook.matchAll(/<(?:\w+:)?sheet\s[^>]*>/g)) {
        if (/state="(hidden|veryHidden)"/.test(m[0])) continue;
        const rid = attr(m[0], 'r:id') || attr(m[0], 'id');
        let path = target.get(rid) || '';
        path = path.startsWith('/') ? path.slice(1) : `xl/${path.replace(/^\.\//, '')}`;
        const xml = await get(path);
        if (xml == null) continue;
        sheets.push({ name: attr(m[0], 'name') || `Sheet${sheets.length + 1}`, rows: parseSheet(xml, shared, dates, date1904) });
    }
    return sheets;
}

/* ---------- Запис ---------- */

let crcTable = null;
export function crc32(data) {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** Zip без стиснення. files — [{ name, data: Uint8Array }]. */
export function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const le = (n, size) => { const b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = (n >>> (8 * i)) & 0xff; return b; };
    for (const f of files) {
        const name = enc.encode(f.name);
        const crc = crc32(f.data);
        const common = [le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(f.data.length, 4), le(f.data.length, 4), le(name.length, 2), le(0, 2)];
        const local = [le(0x04034b50, 4), ...common, name, f.data];
        central.push([le(0x02014b50, 4), le(20, 2), ...common, le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name]);
        parts.push(...local);
        offset += local.reduce((s, b) => s + b.length, 0);
    }
    const cd = central.flat();
    const cdSize = cd.reduce((s, b) => s + b.length, 0);
    const end = [le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cdSize, 4), le(offset, 4), le(0, 2)];
    const all = [...parts, ...cd, ...end];
    const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
    let p = 0;
    for (const b of all) { out.set(b, p); p += b.length; }
    return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // недопустимі в XML керівні символи
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const colName = i => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
};

/** Назва аркуша: до 31 символу, без []:*?/\ . */
const sheetName = (name, i) => (String(name || '').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`);

/**
 * Книга Excel. sheets — [{ name, rows: [[текст | число | null]], widths?: [число] }].
 * Перший рядок кожного аркуша — жирний заголовок.
 */
export function writeXLSX(sheets) {
    const enc = new TextEncoder();
    const x = s => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
    const names = sheets.map((s, i) => sheetName(s.name, i));
    const files = [
        { name: '[Content_Types].xml', data: x(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
        { name: '_rels/.rels', data: x('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
        { name: 'xl/workbook.xml', data: x(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
        { name: 'xl/_rels/workbook.xml.rels', data: x(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
        { name: 'xl/styles.xml', data: x('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>') },
    ];
    sheets.forEach((s, i) => {
        const cols = s.widths?.length ? `<cols>${s.widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
        const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
            if (v == null || v === '') return '';
            const ref = `${colName(ci)}${ri + 1}`;
            if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : Number.isInteger(v) ? '' : ' s="2"'}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        }).join('')}</row>`).join('');
        files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`) });
    });
    return zipStore(files);
}
