import type {Mark, Node as PMNode} from 'prosemirror-model';
import {formatAttrLine} from '../parser/attrlist.js';
import {isWordChar} from '../parser/inline.js';
import {MARK_ORDER} from '../schema.js';

/**
 * Serializes a ProseMirror document built from the AsciiDoc schema back to AsciiDoc text.
 * Output is normalized: one blank line between blocks, canonical markers and delimiters.
 * Raw blocks are emitted verbatim.
 */

interface Ctx {
    exampleDepth: number;
    bulletDepth: number;
    orderedDepth: number;
}

const ROOT_CTX: Ctx = {exampleDepth: 0, bulletDepth: 0, orderedDepth: 0};

export function serializeAsciiDoc(doc: PMNode): string {
    let header: string | null = null;
    const blocks: PMNode[] = [];
    doc.forEach((child) => {
        if (child.type.name === 'docTitle') header = serializeDocTitle(child);
        else blocks.push(child);
    });
    const body = serializeBlocks(blocks, ROOT_CTX);
    const parts = [header, body].filter((p): p is string => p !== null && p !== '');
    return `${parts.join('\n\n')}\n`;
}

function serializeDocTitle(node: PMNode): string {
    const pre = node.attrs.preLines as string[];
    const header = node.attrs.headerLines as string[];
    return [...pre, `= ${serializeInline(node)}`, ...header].join('\n');
}

function serializeBlocks(nodes: PMNode[], ctx: Ctx): string {
    return nodes.map((n) => serializeBlock(n, ctx)).join('\n\n');
}

function metaPrefix(node: PMNode, known: string[], withTitle = true): string {
    const lines: string[] = [];
    if (withTitle && node.attrs.title) lines.push(`.${node.attrs.title}`);
    const attrLine = formatAttrLine(known, {
        id: node.attrs.id ?? null,
        roles: node.attrs.roles ?? [],
        options: node.attrs.options ?? [],
        extraAttrs: node.attrs.extraAttrs ?? [],
    });
    if (attrLine) lines.push(attrLine);
    return lines.map((l) => `${l}\n`).join('');
}

function hasOwnMeta(node: PMNode): boolean {
    return Boolean(
        node.attrs.id ||
        node.attrs.title ||
        node.attrs.roles?.length ||
        node.attrs.options?.length ||
        node.attrs.extraAttrs?.length,
    );
}

function serializeBlock(node: PMNode, ctx: Ctx): string {
    switch (node.type.name) {
        case 'paragraph':
            return metaPrefix(node, []) + serializeInline(node);
        case 'heading': {
            const level = Number(node.attrs.level);
            return `${metaPrefix(node, [], false)}${'='.repeat(level + 1)} ${serializeInline(node)}`;
        }
        case 'bulletList':
        case 'orderedList':
            return metaPrefix(node, []) + serializeList(node, ctx);
        case 'codeBlock':
            return serializeCodeBlock(node);
        case 'admonition':
            return serializeAdmonition(node, ctx);
        case 'image': {
            const parts = [node.attrs.alt as string, ...(node.attrs.extra as string[])];
            return `${metaPrefix(node, [])}image::${node.attrs.src}[${parts.join(',')}]`;
        }
        case 'include':
            return `include::${node.attrs.target}[${node.attrs.attrlist}]`;
        case 'rawBlock':
            return node.attrs.source as string;
        default:
            return node.isTextblock ? serializeInline(node) : '';
    }
}

function serializeCodeBlock(node: PMNode): string {
    const kind = node.attrs.kind as string;
    const language = node.attrs.language as string | null;
    const known: string[] = [];
    if (kind === 'source' || language) {
        known.push('source');
        if (language) known.push(language);
    }
    const text = node.textContent;
    let delim = kind === 'literal' ? '....' : '----';
    while (text.split('\n').includes(delim)) delim += delim[0];
    const body = text.length > 0 ? `${text}\n` : '';
    return `${metaPrefix(node, known)}${delim}\n${body}${delim}`;
}

function serializeAdmonition(node: PMNode, ctx: Ctx): string {
    const type = node.attrs.type as string;
    const only = node.childCount === 1 ? node.firstChild : null;
    if (only && only.type.name === 'paragraph' && !hasOwnMeta(only)) {
        return `${metaPrefix(node, [])}${type}: ${serializeInline(only)}`;
    }
    const delim = '='.repeat(4 + ctx.exampleDepth);
    const children: PMNode[] = [];
    node.forEach((c) => {
        children.push(c);
    });
    const inner = serializeBlocks(children, {...ctx, exampleDepth: ctx.exampleDepth + 1});
    return `${metaPrefix(node, [type])}${delim}\n${inner}\n${delim}`;
}

function serializeList(node: PMNode, ctx: Ctx): string {
    const bullet = node.type.name === 'bulletList';
    const depth = (bullet ? ctx.bulletDepth : ctx.orderedDepth) + 1;
    const marker = (bullet ? '*' : '.').repeat(depth);
    const childCtx: Ctx = {
        ...ctx,
        bulletDepth: bullet ? depth : ctx.bulletDepth,
        orderedDepth: bullet ? ctx.orderedDepth : depth,
    };
    const items: string[] = [];
    node.forEach((item) => {
        items.push(serializeListItem(item, marker, childCtx));
    });
    return items.join('\n');
}

function serializeListItem(item: PMNode, marker: string, ctx: Ctx): string {
    const lines: string[] = [];
    const checked = item.attrs.checked as boolean | null;
    const check = checked === null ? '' : checked ? '[x] ' : '[ ] ';
    item.forEach((child, _offset, index) => {
        if (index === 0) {
            lines.push(`${marker} ${check}${serializeInline(child)}`);
        } else if (child.type.name === 'bulletList' || child.type.name === 'orderedList') {
            lines.push(serializeList(child, ctx));
        } else {
            lines.push('+');
            lines.push(serializeBlock(child, ctx));
        }
    });
    return lines.join('\n');
}

interface Segment {
    text: string;
    marks: readonly Mark[];
}

function segments(node: PMNode): Segment[] {
    const out: Segment[] = [];
    node.forEach((child) => {
        if (child.isText) {
            out.push({text: child.text ?? '', marks: child.marks});
        } else if (child.type.name === 'hardBreak') {
            out.push({text: ' +\n', marks: []});
        } else if (child.type.name === 'attributeRef') {
            out.push({text: `{${child.attrs.name}}`, marks: child.marks});
        } else if (child.type.name === 'xref') {
            const text = child.attrs.text ?? '';
            const syntax = child.attrs.macro
                ? `xref:${child.attrs.target}[${text}]`
                : `<<${child.attrs.target}${text ? `,${text}` : ''}>>`;
            out.push({text: syntax, marks: child.marks});
        }
    });
    return out;
}

export function serializeInline(node: PMNode): string {
    return serializeSegments(segments(node), MARK_ORDER);
}

function serializeSegments(segs: Segment[], order: readonly string[]): string {
    if (segs.length === 0) return '';
    const markName = order[0];
    if (markName === undefined) return segs.map((s) => s.text).join('');
    const rest = order.slice(1);

    const runs: { mark: Mark | null; segs: Segment[] }[] = [];
    for (const seg of segs) {
        const mark = seg.marks.find((m) => m.type.name === markName) ?? null;
        const last = runs[runs.length - 1];
        if (last && (last.mark === mark || (last.mark && mark && last.mark.eq(mark)))) {
            last.segs.push(seg);
        } else {
            runs.push({mark, segs: [seg]});
        }
    }

    let out = '';
    runs.forEach((run, index) => {
        const inner = serializeSegments(run.segs, rest);
        if (!run.mark) {
            out += inner;
            return;
        }
        const prev = out.length > 0 ? out[out.length - 1] : undefined;
        const nextRun = runs[index + 1];
        const next = nextRun ? firstChar(nextRun.segs) : undefined;
        out += wrap(run.mark, inner, prev, next);
    });
    return out;
}

function firstChar(segs: Segment[]): string | undefined {
    for (const s of segs) if (s.text.length > 0) return s.text[0];
    return undefined;
}

const QUOTE_CHARS: Record<string, string> = {
    strong: '*',
    em: '_',
    code: '`',
    highlight: '#',
    superscript: '^',
    subscript: '~',
};

function wrap(
    mark: Mark,
    inner: string,
    prev: string | undefined,
    next: string | undefined,
): string {
    if (mark.type.name === 'link') return wrapLink(mark.attrs.href as string, inner);
    const ch = QUOTE_CHARS[mark.type.name];
    if (!ch) return inner;
    if (ch === '^' || ch === '~') return `${ch}${inner}${ch}`;
    const constrained =
        !isWordChar(prev) &&
        !isWordChar(next) &&
        !/^\s/.test(inner) &&
        !/\s$/.test(inner) &&
        !inner.startsWith(ch) &&
        !inner.endsWith(ch);
    return constrained ? `${ch}${inner}${ch}` : `${ch}${ch}${inner}${ch}${ch}`;
}

function wrapLink(href: string, inner: string): string {
    if (href.startsWith('mailto:')) return `mailto:${href.slice(7)}[${inner}]`;
    if (/^(https?|ftp|irc):\/\//.test(href)) {
        return inner === href ? href : `${href}[${inner}]`;
    }
    return `link:${href}[${inner}]`;
}
