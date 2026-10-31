import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { colIndex, crc32, excelDate, readXLSX, writeXLSX, xmlDecode, zipEntries } from '../../src/data/xlsx.js';

/** Zip зі стисненням deflate (як зберігають Excel і Numbers). */
function zipDeflate(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const le = (n, size) => { const b = Buffer.alloc(size); b.writeUIntLE(n >>> 0, 0, size); return b; };
    for (const [name, text] of Object.entries(files)) {
        const raw = enc.encode(text);
        const comp = deflateRawSync(raw);
        const nameB = Buffer.from(name);
        const common = Buffer.concat([le(20, 2), le(0, 2), le(8, 2), le(0, 2), le(0, 2), le(crc32(raw), 4), le(comp.length, 4), le(raw.length, 4), le(nameB.length, 2), le(0, 2)]);
        const local = Buffer.concat([le(0x04034b50, 4), common, nameB, comp]);
        central.push(Buffer.concat([le(0x02014b50, 4), le(20, 2), common, le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), nameB]));
        chunks.push(local);
        offset += local.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.concat([le(0x06054b50, 4), le(0, 4), le(central.length, 2), le(central.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2)]);
    return new Uint8Array(Buffer.concat([...chunks, cd, end]));
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

describe('xlsx: читання', () => {
    const book = zipDeflate({
        'xl/workbook.xml': `<workbook ${NS}><sheets><sheet name="Жовтень 2025" sheetId="1" r:id="rId1"/><sheet name="Схований" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Листопад 2025" sheetId="3" r:id="rId3"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="/xl/worksheets/sheet3.xml"/></Relationships>',
        'xl/sharedStrings.xml': '<sst><si><t>Дата</t></si><si><t>Назва</t></si><si><t>Сума</t></si><si><r><t>Оренда </t></r><r><rPr><b/></rPr><t>квартири</t></r></si><si><t>Tom &amp; Jerry &#8364;</t></si></sst>',
        'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="165" formatCode="dd/mm/yyyy;@"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="165"/></cellXfs></styleSheet>',
        'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Сплачено</t></is></c></row>
            <row r="2"><c r="A2" s="1"><v>45940</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>12000.5</v></c><c r="D2" t="b"><v>1</v></c></row>
            <row r="4"><c r="A4" s="2"><v>45941</v></c><c r="C4"><v>0.30000000000000004</v></c><c r="B4" t="s"><v>4</v></c><c r="D4" t="b"><v>0</v></c></row>
        </sheetData></worksheet>`,
        'xl/worksheets/sheet2.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>секрет</t></is></c></row></sheetData></worksheet>`,
        'xl/worksheets/sheet3.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="C1" t="str"><v>формула</v></c></row></sheetData></worksheet>`,
    });

    it('аркуші за порядком, без прихованих; рядки й колонки на своїх місцях', async () => {
        const sheets = await readXLSX(book);
        expect(sheets.map(s => s.name)).toEqual(['Жовтень 2025', 'Листопад 2025']);
        expect(sheets[0].rows).toEqual([
            ['Дата', 'Назва', 'Сума', 'Сплачено'],
            ['10.10.2025', 'Оренда квартири', '12000.5', 'TRUE'],
            [],
            ['11.10.2025', 'Tom & Jerry €', '0.3', 'FALSE'],
        ]);
        expect(sheets[1].rows).toEqual([['', '', 'формула']]);
    });

    it('не zip чи не Excel — зрозуміла помилка', async () => {
        await expect(readXLSX(new TextEncoder().encode('Дата;Сума\n1;2'))).rejects.toThrow('not-zip');
        await expect(readXLSX(zipDeflate({ 'word/document.xml': '<w/>' }))).rejects.toThrow('not-xlsx');
    });

    it('допоміжне: колонки, дати Excel, XML-сутності', () => {
        expect([colIndex('A1'), colIndex('Z9'), colIndex('AA3'), colIndex('AB12')]).toEqual([0, 25, 26, 27]);
        expect(excelDate(45940)).toBe('10.10.2025');
        expect(excelDate(1, true)).toBe('02.01.1904');
        expect(xmlDecode('&lt;b&gt; &quot;x&quot; &#x41;&#66; &bogus;')).toBe('<b> "x" AB &bogus;');
    });
});

describe('xlsx: запис', () => {
    it('записане читається назад: текст, числа, спецсимволи, назви аркушів', async () => {
        const bytes = writeXLSX([
            { name: 'Витрати', rows: [['Дата', 'Назва', 'Сума'], ['01.10.2026', 'A & B <c> "d"', 12000], ['02.10.2026', 'Кава', 85.5]], widths: [12, 30, 12] },
            { name: 'Доходи/звіт?', rows: [['Дата', 'Сума'], ['08.10.2026', 49800]] },
        ]);
        expect(zipEntries(bytes).map(e => e.name)).toContain('xl/worksheets/sheet2.xml');
        const sheets = await readXLSX(bytes);
        expect(sheets.map(s => s.name)).toEqual(['Витрати', 'Доходи звіт']);
        expect(sheets[0].rows[1]).toEqual(['01.10.2026', 'A & B <c> "d"', '12000']);
        expect(sheets[0].rows[2][2]).toBe('85.5');
        expect(sheets[1].rows[1]).toEqual(['08.10.2026', '49800']);
    });
    it('CRC32 як у стандарті', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });
});
