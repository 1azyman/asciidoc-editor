import {describe, expect, it} from 'vitest';
import {createSchema, parseAsciiDoc, serializeAsciiDoc, serializeInline} from '../src/index.js';

const schema = createSchema();

function firstParagraph(text: string) {
    const doc = parseAsciiDoc(text, schema);
    const p = doc.firstChild;
    if (p?.type.name !== 'paragraph') throw new Error(`expected paragraph, got ${p?.type.name}`);
    return p;
}

function roundTrip(text: string): string {
    return serializeAsciiDoc(parseAsciiDoc(text, schema)).trimEnd();
}

describe('inline parsing', () => {
    it('parses constrained quotes', () => {
        const p = firstParagraph('a *b* _c_ `d` #e#');
        const marks = p.content.content.map((n) => n.marks.map((m) => m.type.name).join(','));
        expect(marks).toEqual(['', 'strong', '', 'em', '', 'code', '', 'highlight']);
    });

    it('does not treat inner-word asterisks as quotes', () => {
        const p = firstParagraph('a*b*c');
        expect(p.childCount).toBe(1);
        expect(p.textContent).toBe('a*b*c');
    });

    it('parses unconstrained quotes inside words', () => {
        const p = firstParagraph('a**b**c');
        expect(p.childCount).toBe(3);
        expect(p.child(1).marks[0]?.type.name).toBe('strong');
    });

    it('parses links and attribute references', () => {
        const p = firstParagraph('see https://x.org[X] and {name}.');
        const link = p.child(1);
        expect(link.marks[0]?.attrs.href).toBe('https://x.org');
        expect(link.text).toBe('X');
        expect(p.child(3).type.name).toBe('attributeRef');
    });

    it('keeps backslash escapes literal', () => {
        expect(roundTrip('\\*not bold*')).toBe('\\*not bold*');
    });

    it('serializes marks with word-boundary awareness', () => {
        const p = firstParagraph('a**b**c and *d*');
        expect(serializeInline(p)).toBe('a**b**c and *d*');
    });

    it('round trips nested marks', () => {
        expect(roundTrip('*bold _and italic_ text*')).toBe('*bold _and italic_ text*');
    });

    it('round trips hard breaks', () => {
        expect(roundTrip('line one +\nline two')).toBe('line one +\nline two');
    });
});

describe('block parsing', () => {
    it('keeps unknown blocks verbatim including metadata lines', () => {
        const src = '.Title\n[cols="1,1"]\n|===\n| a | b\n|===';
        const doc = parseAsciiDoc(src, schema);
        expect(doc.firstChild?.type.name).toBe('rawBlock');
        expect(doc.firstChild?.attrs.source).toBe(src);
        expect(roundTrip(src)).toBe(src);
    });

    it('serializes single-paragraph admonitions in short form', () => {
        expect(roundTrip('[NOTE]\n====\nText\n====')).toBe('NOTE: Text');
    });

    it('nests example delimiters for admonitions inside admonitions', () => {
        const src = '[NOTE]\n====\nOuter\n\n[TIP]\n=====\nInner one\n\nInner two\n=====\n====';
        expect(roundTrip(src)).toBe(src);
    });

    it('normalizes list markers', () => {
        expect(roundTrip('- a\n- b')).toBe('* a\n* b');
        expect(roundTrip('1. a\n2. b')).toBe('. a\n. b');
    });

    it('returns to the parent list when a marker matches an ancestor', () => {
        const doc = parseAsciiDoc('* a\n. b\n* c', schema);
        expect(doc.childCount).toBe(1);
        const list = doc.firstChild!;
        expect(list.childCount).toBe(2);
        expect(list.child(0).childCount).toBe(2);
        expect(list.child(0).child(1).type.name).toBe('orderedList');
    });

    it('discards an attribute line dangling after list item text, like Asciidoctor', () => {
        expect(roundTrip('* item\n[source]\n----\nx\n----')).toBe('* item\n\n----\nx\n----');
    });

    it('keeps document header lines', () => {
        const src = '= Title\nAuthor Name\n:toc:\n\nBody.';
        expect(roundTrip(src)).toBe(src);
    });
});
