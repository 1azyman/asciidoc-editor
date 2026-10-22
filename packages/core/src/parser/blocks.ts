import type {Node as PMNode, Schema} from 'prosemirror-model';
import {
    type AdmonitionType,
    type BlockMetaAttrs,
    type CodeBlockKind,
    isAdmonitionType,
    type RawBlockKind,
} from '../schema.js';
import {type AttrList, firstPositional, leftoverParts, parseAttrList} from './attrlist.js';
import {parseInlineLines} from './inline.js';

/**
 * Line-based block parser for the supported AsciiDoc subset. Blocks the parser does not model
 * become rawBlock nodes that keep their source lines, including preceding metadata lines,
 * verbatim.
 */

const DOC_TITLE_RX = /^=\s+(\S.*?)(?:\s+=)?\s*$/;
const SECTION_RX = /^(=+)\s+(\S.*?)(?:\s+=+)?\s*$/;
const BLOCK_TITLE_RX = /^\.(?![.\s])(.*)$/;
const ANCHOR_RX = /^\[\[([^\],]+)(?:,\s*(.*))?\]\]$/;
const ATTRLIST_RX = /^\[(.*)\]$/;
const LINE_COMMENT_RX = /^\/\/(?!\/\/)/;
const COMMENT_DELIM_RX = /^\/{4,}$/;
const ADMONITION_PARA_RX = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s+(.*)$/;
const LIST_ITEM_RX = /^\s*(\*+|-|\.+|\d+\.)\s+(\S.*)$/;
const DLIST_RX = /^\S.*?::(?:\s+|$)/;
const CALLOUT_RX = /^<\d+>\s/;
const ATTR_ENTRY_RX = /^:!?[A-Za-z0-9_][\w-]*!?:(?:\s|$)/;
const BLOCK_MACRO_RX = /^([a-z]+)::(\S*)\[(.*)\]$/;
const DELIM_RX = /^(-{4,}|\.{4,}|={4,}|\*{4,}|_{4,}|\+{4,}|\/{4,}|--|[|,:!]={3,})$/;
const FENCE_RX = /^```(\w*)$/;
const CHECKBOX_RX = /^\[([ x*])\]\s+/;

interface Pending {
    id: string | null;
    title: string | null;
    attr: AttrList | null;
    rawLines: string[];
    /** Set when a metadata line was seen that the parser cannot model; the next block becomes raw. */
    unsupported: boolean;
}

function emptyPending(): Pending {
    return {id: null, title: null, attr: null, rawLines: [], unsupported: false};
}

interface ListMarker {
    raw: string;
    /** Normalized marker used for list identity: `*`, `**`, `-`, `.`, `..`. Numeric markers become `.`. */
    key: string;
    ordered: boolean;
}

function parseMarker(raw: string): ListMarker {
    if (/^\d+\.$/.test(raw)) return {raw, key: '.', ordered: true};
    return {raw, key: raw, ordered: raw.startsWith('.')};
}

function isBlank(line: string | undefined): boolean {
    return line === undefined || line.trim() === '';
}

function isLineComment(line: string): boolean {
    return LINE_COMMENT_RX.test(line) && !COMMENT_DELIM_RX.test(line);
}

function delimiterKind(delim: string): string {
    if (delim === '--') return 'open';
    switch (delim[0]) {
        case '-':
            return 'listing';
        case '.':
            return 'literal';
        case '=':
            return 'example';
        case '*':
            return 'sidebar';
        case '_':
            return 'quote';
        case '+':
            return 'pass';
        case '/':
            return 'comment';
        default:
            return 'table';
    }
}

export class BlockParser {
    private pos = 0;
    private pending: Pending = emptyPending();
    private readonly listStack: string[] = [];

    constructor(
        private readonly lines: string[],
        private readonly schema: Schema,
    ) {
    }

    parseDocument(): PMNode {
        const children: PMNode[] = [];
        const docTitle = this.parseHeader();
        if (docTitle) children.push(docTitle);
        const blocks = this.parseBlocks();
        if (blocks.length === 0) blocks.push(this.schema.nodes.paragraph!.create());
        children.push(...blocks);
        return this.schema.nodes.doc!.create(null, children);
    }

    /** Parses all remaining lines as blocks. Used for the document body and for nested block content. */
    parseBlocks(): PMNode[] {
        const out: PMNode[] = [];
        while (this.pos < this.lines.length) {
            const node = this.parseNext();
            if (node) out.push(node);
        }
        const trailing = this.flushPending();
        if (trailing) out.push(trailing);
        return out;
    }

    private parseHeader(): PMNode | null {
        const start = this.pos;
        const preLines: string[] = [];
        while (this.pos < this.lines.length) {
            const line = this.lines[this.pos] as string;
            if (
                isBlank(line) ||
                isLineComment(line) ||
                ATTR_ENTRY_RX.test(line) ||
                ANCHOR_RX.test(line) ||
                ATTRLIST_RX.test(line)
            ) {
                preLines.push(line);
                this.pos += 1;
                continue;
            }
            break;
        }
        const titleLine = this.lines[this.pos];
        const m = titleLine === undefined ? null : DOC_TITLE_RX.exec(titleLine);
        if (!m) {
            this.pos = start;
            return null;
        }
        this.pos += 1;
        const headerLines: string[] = [];
        while (this.pos < this.lines.length && !isBlank(this.lines[this.pos])) {
            headerLines.push(this.lines[this.pos] as string);
            this.pos += 1;
        }
        while (preLines.length > 0 && isBlank(preLines[0])) preLines.shift();
        return this.schema.nodes.docTitle!.create(
            {preLines, headerLines},
            parseInlineLines([m[1] as string], this.schema),
        );
    }

    private line(offset = 0): string | undefined {
        return this.lines[this.pos + offset];
    }

    private hasPending(): boolean {
        return this.pending.rawLines.length > 0;
    }

    private takePending(): Pending {
        const p = this.pending;
        this.pending = emptyPending();
        return p;
    }

    private flushPending(): PMNode | null {
        if (!this.hasPending()) return null;
        const p = this.takePending();
        return this.raw(p.rawLines, 'unknown');
    }

    private raw(lines: string[], kind: RawBlockKind): PMNode {
        return this.schema.nodes.rawBlock!.create({source: lines.join('\n'), kind});
    }

    private rawWithMeta(meta: Pending, lines: string[], kind: RawBlockKind): PMNode {
        return this.raw([...meta.rawLines, ...lines], kind);
    }

    private meta(pending: Pending, extraAttrs: string[]): BlockMetaAttrs {
        return {
            id: pending.id ?? pending.attr?.id ?? null,
            title: pending.title,
            roles: pending.attr?.roles ?? [],
            options: pending.attr?.options ?? [],
            extraAttrs,
        };
    }

    /**
     * Parses one block starting at the current line, or consumes a metadata or blank line and
     * returns null.
     */
    private parseNext(): PMNode | null {
        const line = this.line();
        if (line === undefined) return null;

        if (isBlank(line)) {
            this.pos += 1;
            return this.flushPending();
        }

        const delim = DELIM_RX.exec(line);
        if (delim) return this.parseDelimited(delim[1] as string);

        const fence = FENCE_RX.exec(line);
        if (fence) return this.parseFence(fence[1] || null);

        if (isLineComment(line)) return this.parseLineComments();

        const anchor = ANCHOR_RX.exec(line);
        if (anchor) {
            if (anchor[2] !== undefined) this.pending.unsupported = true;
            else this.pending.id = anchor[1] as string;
            this.pending.rawLines.push(line);
            this.pos += 1;
            return null;
        }

        const attrlist = ATTRLIST_RX.exec(line);
        if (attrlist) {
            const parsed = parseAttrList(attrlist[1] as string);
            this.pending.attr = this.pending.attr ? mergeAttrLists(this.pending.attr, parsed) : parsed;
            this.pending.rawLines.push(line);
            this.pos += 1;
            return null;
        }

        const blockTitle = BLOCK_TITLE_RX.exec(line);
        if (blockTitle) {
            this.pending.title = blockTitle[1] as string;
            this.pending.rawLines.push(line);
            this.pos += 1;
            return null;
        }

        const section = SECTION_RX.exec(line);
        if (section) return this.parseSection(section[1] as string, section[2] as string);

        if (ATTR_ENTRY_RX.test(line)) return this.parseSingleRaw('attribute');

        const macro = BLOCK_MACRO_RX.exec(line);
        if (macro)
            return this.parseBlockMacro(macro[1] as string, macro[2] as string, macro[3] as string);

        const admonition = ADMONITION_PARA_RX.exec(line);
        if (admonition) return this.parseAdmonitionParagraph(admonition[1] as AdmonitionType);

        if (LIST_ITEM_RX.test(line)) return this.parseList();

        if (DLIST_RX.test(line)) return this.parseRawParagraph('dlist');
        if (CALLOUT_RX.test(line)) return this.parseRawParagraph('callout');
        if (line === '+') return this.parseSingleRaw('continuation');

        if (/^\s/.test(line)) return this.parseLiteralParagraph();

        return this.parseParagraph();
    }

    private parseSingleRaw(kind: RawBlockKind): PMNode {
        const meta = this.takePending();
        const line = this.line() as string;
        this.pos += 1;
        return this.rawWithMeta(meta, [line], kind);
    }

    private parseLineComments(): PMNode {
        const lines: string[] = [];
        while (this.pos < this.lines.length && isLineComment(this.line() as string)) {
            lines.push(this.line() as string);
            this.pos += 1;
        }
        return this.raw(lines, 'comment');
    }

    private parseSection(marker: string, title: string): PMNode {
        const meta = this.takePending();
        this.pos += 1;
        if (meta.unsupported) return this.rawWithMeta(meta, [`${marker} ${title}`], 'block');
        const attrs = {...this.meta(meta, leftoverParts(meta.attr, 0)), level: marker.length - 1};
        return this.schema.nodes.heading!.create(attrs, parseInlineLines([title], this.schema));
    }

    private parseBlockMacro(name: string, target: string, attrlist: string): PMNode {
        const meta = this.takePending();
        const line = this.line() as string;
        this.pos += 1;
        if (meta.unsupported) return this.rawWithMeta(meta, [line], 'macro');
        if (name === 'include') {
            if (meta.rawLines.length > 0) return this.rawWithMeta(meta, [line], 'macro');
            return this.schema.nodes.include!.create({target, attrlist});
        }
        if (name === 'image') {
            const parts = parseAttrList(attrlist);
            const alt = parts.positional[0] ?? '';
            const extra = leftoverParts(parts, 1);
            if (parts.id || parts.roles.length || parts.options.length) {
                return this.rawWithMeta(meta, [line], 'macro');
            }
            const attrs = {...this.meta(meta, leftoverParts(meta.attr, 0)), src: target, alt, extra};
            return this.schema.nodes.image!.create(attrs);
        }
        return this.rawWithMeta(meta, [line], 'macro');
    }

    /** Reads paragraph lines: until a blank line, a block delimiter, an attribute line or a `+`. */
    private readParagraphLines(): { lines: string[]; hasComment: boolean } {
        const lines: string[] = [];
        let hasComment = false;
        while (this.pos < this.lines.length) {
            const line = this.line() as string;
            if (isBlank(line) || DELIM_RX.test(line) || ATTRLIST_RX.test(line) || line === '+') break;
            if (this.listStack.length > 0 && LIST_ITEM_RX.test(line)) break;
            if (isLineComment(line)) hasComment = true;
            lines.push(line);
            this.pos += 1;
        }
        return {lines, hasComment};
    }

    private parseParagraph(): PMNode {
        const meta = this.takePending();
        const {lines, hasComment} = this.readParagraphLines();
        const first = firstPositional(meta.attr);
        if (meta.unsupported || hasComment || meta.attr?.options.includes('hardbreaks')) {
            return this.rawWithMeta(meta, lines, 'block');
        }
        if (isAdmonitionType(first)) {
            return this.admonition(first, meta, [this.paragraph(lines, null)]);
        }
        if (first !== '') return this.rawWithMeta(meta, lines, 'block');
        return this.paragraph(lines, meta);
    }

    private paragraph(lines: string[], meta: Pending | null): PMNode {
        const attrs = meta ? this.meta(meta, leftoverParts(meta.attr, 1)) : undefined;
        return this.schema.nodes.paragraph!.create(attrs, parseInlineLines(lines, this.schema));
    }

    private parseRawParagraph(kind: RawBlockKind): PMNode {
        const meta = this.takePending();
        const lines: string[] = [];
        while (this.pos < this.lines.length && !isBlank(this.line())) {
            lines.push(this.line() as string);
            this.pos += 1;
        }
        return this.rawWithMeta(meta, lines, kind);
    }

    private parseLiteralParagraph(): PMNode {
        const meta = this.takePending();
        const lines: string[] = [];
        while (this.pos < this.lines.length && !isBlank(this.line())) {
            lines.push(this.line() as string);
            this.pos += 1;
        }
        if (meta.unsupported || meta.attr) return this.rawWithMeta(meta, lines, 'block');
        const indent = Math.min(...lines.map((l) => /^\s*/.exec(l)![0].length));
        const text = lines.map((l) => l.slice(indent)).join('\n');
        return this.codeBlock(meta, 'literal', null, [], text);
    }

    private parseAdmonitionParagraph(type: AdmonitionType): PMNode {
        const meta = this.takePending();
        const {lines, hasComment} = this.readParagraphLines();
        if (meta.unsupported || hasComment || firstPositional(meta.attr) !== '') {
            return this.rawWithMeta(meta, lines, 'block');
        }
        const first = lines[0] as string;
        lines[0] = first.slice(first.indexOf(':') + 1).trimStart();
        return this.admonition(type, meta, [this.paragraph(lines, null)]);
    }

    private admonition(type: AdmonitionType, meta: Pending, content: PMNode[]): PMNode {
        const consumed = firstPositional(meta.attr) === type ? 1 : 0;
        const attrs = {...this.meta(meta, leftoverParts(meta.attr, consumed)), type};
        return this.schema.nodes.admonition!.create(attrs, content);
    }

    private codeBlock(
        meta: Pending,
        kind: CodeBlockKind,
        language: string | null,
        extraAttrs: string[],
        text: string,
    ): PMNode {
        const attrs = {...this.meta(meta, extraAttrs), kind, language};
        const content = text.length > 0 ? [this.schema.text(text)] : [];
        return this.schema.nodes.codeBlock!.create(attrs, content);
    }

    private parseDelimited(delim: string): PMNode {
        const kind = delimiterKind(delim);
        const start = this.pos;
        let end = this.pos + 1;
        while (end < this.lines.length && this.lines[end] !== delim) end += 1;
        const content = this.lines.slice(start + 1, end);
        const allLines = this.lines.slice(start, Math.min(end + 1, this.lines.length));
        this.pos = Math.min(end + 1, this.lines.length);

        if (kind === 'comment') return this.raw(allLines, 'comment');

        const meta = this.takePending();
        if (meta.unsupported) return this.rawWithMeta(meta, allLines, 'block');
        const first = firstPositional(meta.attr);

        if (kind === 'listing') {
            if (first !== '' && first !== 'source') return this.rawWithMeta(meta, allLines, 'block');
            const language = meta.attr?.positional[1] || meta.attr?.named.language || null;
            const codeKind: CodeBlockKind = first === 'source' || language ? 'source' : 'listing';
            const consumed = meta.attr?.positional[1] !== undefined ? 2 : first === 'source' ? 1 : 0;
            const extra = leftoverParts(meta.attr, consumed, ['language']);
            return this.codeBlock(meta, codeKind, language, extra, content.join('\n'));
        }
        if (kind === 'literal') {
            if (first !== '' && first !== 'literal') return this.rawWithMeta(meta, allLines, 'block');
            const extra = leftoverParts(meta.attr, first === 'literal' ? 1 : 0);
            return this.codeBlock(meta, 'literal', null, extra, content.join('\n'));
        }
        if (kind === 'example' && isAdmonitionType(first)) {
            const inner = new BlockParser(content, this.schema).parseBlocks();
            if (inner.length === 0) inner.push(this.schema.nodes.paragraph!.create());
            return this.admonition(first, meta, inner);
        }
        return this.rawWithMeta(meta, allLines, kind === 'table' ? 'table' : 'block');
    }

    private parseFence(language: string | null): PMNode {
        const start = this.pos;
        let end = this.pos + 1;
        while (end < this.lines.length && this.lines[end] !== '```') end += 1;
        const content = this.lines.slice(start + 1, end);
        const allLines = this.lines.slice(start, Math.min(end + 1, this.lines.length));
        this.pos = Math.min(end + 1, this.lines.length);
        const meta = this.takePending();
        if (meta.unsupported || firstPositional(meta.attr) !== '') {
            return this.rawWithMeta(meta, allLines, 'block');
        }
        const extra = leftoverParts(meta.attr, 0);
        return this.codeBlock(
            meta,
            language ? 'source' : 'listing',
            language,
            extra,
            content.join('\n'),
        );
    }

    private parseList(): PMNode {
        const meta = this.takePending();
        const start = this.pos;
        const firstMatch = LIST_ITEM_RX.exec(this.line() as string) as RegExpExecArray;
        const marker = parseMarker(firstMatch[1] as string);
        this.listStack.push(marker.key);
        const items: PMNode[] = [];
        while (this.pos < this.lines.length) {
            // Blank lines between sibling items do not end the list.
            const save = this.pos;
            while (this.pos < this.lines.length && isBlank(this.line())) this.pos += 1;
            const next = this.line();
            const m = next === undefined ? null : LIST_ITEM_RX.exec(next);
            if (!m || parseMarker(m[1] as string).key !== marker.key) {
                this.pos = save;
                break;
            }
            items.push(this.parseListItem(m[2] as string, marker));
        }
        this.listStack.pop();
        if (meta.unsupported) {
            return this.rawWithMeta(meta, this.lines.slice(start, this.pos), 'block');
        }
        const type = marker.ordered ? 'orderedList' : 'bulletList';
        const attrs = this.meta(meta, leftoverParts(meta.attr, 0));
        return this.schema.nodes[type]!.create(attrs, items);
    }

    private parseListItem(firstText: string, marker: ListMarker): PMNode {
        this.pos += 1;
        let checked: boolean | null = null;
        let text = firstText;
        const check = CHECKBOX_RX.exec(text);
        if (check) {
            checked = check[1] !== ' ';
            text = text.slice(check[0].length);
        }
        const textLines = [text];
        while (this.pos < this.lines.length) {
            const line = this.line() as string;
            if (isBlank(line) || line === '+' || LIST_ITEM_RX.test(line) || DELIM_RX.test(line)) break;
            if (ATTRLIST_RX.test(line)) {
                // Asciidoctor ends the item text here and discards the dangling attribute line.
                this.pos += 1;
                break;
            }
            textLines.push(line.trim());
            this.pos += 1;
        }
        const children: PMNode[] = [this.paragraph(textLines, null)];

        while (this.pos < this.lines.length) {
            if (this.line() === '+') {
                this.pos += 1;
                while (this.pos < this.lines.length && !isBlank(this.line())) {
                    const node = this.parseNext();
                    if (node) {
                        children.push(node);
                        break;
                    }
                }
                continue;
            }
            const save = this.pos;
            while (this.pos < this.lines.length && isBlank(this.line())) this.pos += 1;
            const next = this.line();
            const m = next === undefined ? null : LIST_ITEM_RX.exec(next);
            if (m) {
                const key = parseMarker(m[1] as string).key;
                if (key !== marker.key && !this.listStack.includes(key)) {
                    children.push(this.parseList());
                    continue;
                }
            }
            this.pos = save;
            break;
        }
        return this.schema.nodes.listItem!.create({checked}, children);
    }
}

function mergeAttrLists(a: AttrList, b: AttrList): AttrList {
    return {
        positional: b.positional.length > 0 ? b.positional : a.positional,
        named: {...a.named, ...b.named},
        id: b.id ?? a.id,
        roles: [...a.roles, ...b.roles],
        options: [...a.options, ...b.options],
    };
}

export function parseAsciiDoc(text: string, schema: Schema): PMNode {
    const lines = text.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return new BlockParser(lines, schema).parseDocument();
}
