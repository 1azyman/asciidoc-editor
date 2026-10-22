import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createSchema, parseAsciiDoc, serializeAsciiDoc} from '../src/index.js';
import {toHtml} from './oracle.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.adoc'));
const schema = createSchema();

describe.each(fixtures)('fixture %s', (file) => {
    const text = readFileSync(join(fixturesDir, file), 'utf8');

    it('parses into a valid document', () => {
        const doc = parseAsciiDoc(text, schema);
        expect(() => doc.check()).not.toThrow();
    });

    it('round trips structurally and idempotently', () => {
        const doc1 = parseAsciiDoc(text, schema);
        const out1 = serializeAsciiDoc(doc1);
        const doc2 = parseAsciiDoc(out1, schema);
        expect(doc2.toJSON()).toEqual(doc1.toJSON());
        expect(serializeAsciiDoc(doc2)).toBe(out1);
    });

    it('is equivalent to the original according to Asciidoctor', async () => {
        const out = serializeAsciiDoc(parseAsciiDoc(text, schema));
        expect(await toHtml(out)).toBe(await toHtml(text));
    });
});
