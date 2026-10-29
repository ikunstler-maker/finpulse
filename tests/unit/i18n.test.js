import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plural, t } from '../../src/i18n/index.js';

const SRC = path.resolve(import.meta.dirname, '../../src');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const appFiles = files(SRC).filter(f => f.endsWith('.js') && !f.includes(`${path.sep}i18n${path.sep}`) && !f.includes(`${path.sep}prototype${path.sep}`) && !f.includes(`${path.sep}cloud${path.sep}`) && !f.includes(`${path.sep}crypto${path.sep}`) && !f.endsWith('state.js'));

describe('словник текстів', () => {
    it('кожен ключ, який використовує код, є у словнику', () => {
        const missing = [];
        for (const f of appFiles) {
            const code = fs.readFileSync(f, 'utf8');
            for (const [, key] of code.matchAll(/\bt\('([\w.]+)'/g)) if (t(key) === key) missing.push(`${path.basename(f)}: ${key}`);
        }
        const html = fs.readFileSync(path.resolve(SRC, '../index.html'), 'utf8');
        for (const [, key] of html.matchAll(/data-i18n(?:-aria)?="([\w.]+)"/g)) if (t(key) === key) missing.push(`index.html: ${key}`);
        expect(missing).toEqual([]);
    });

    it('у коді інтерфейсу немає українських текстів поза словником', () => {
        const offenders = [];
        for (const f of appFiles.filter(x => x.includes(`${path.sep}ui${path.sep}`))) {
            fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
                const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*\*.*$/, '');
                if (/[А-Яа-яІіЇїЄєҐґ]/.test(code)) offenders.push(`${path.basename(f)}:${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('параметри й множина', () => {
        expect(t('toast.paid', { title: 'Оренда' })).toBe('Сплачено: Оренда');
        expect(['1', '2', '5', '11', '21', '22'].map(n => plural(+n, ['день', 'дні', 'днів']))).toEqual(['день', 'дні', 'днів', 'днів', 'день', 'дні']);
    });
});
