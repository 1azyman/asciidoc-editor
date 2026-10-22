import type {Mark, Node as PMNode, Schema} from 'prosemirror-model';

/**
 * Inline AsciiDoc parser for the supported subset: constrained and unconstrained quotes,
 * links, cross references, attribute references, hard line breaks and backslash escapes.
 * Anything not recognized stays literal text so that it serializes back unchanged.
 */

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const QUOTE_MARKS: Record<string, string> = {
    '*': 'strong',
    _: 'em',
    '`': 'code',
    '#': 'highlight',
    '^': 'superscript',
    '~': 'subscript',
};
/** Marks whose single-character form is unconstrained (no word boundary rules, no spaces inside). */
const SINGLE_UNCONSTRAINED = new Set(['^', '~']);

const ATTRIBUTE_REF_RX = /^\{([A-Za-z0-9_][A-Za-z0-9_-]*)\}/;
const MACRO_RX =
    /^(?:(xref|link|mailto):([^\s[\]]+)\[([^\]]*)\]|((?:https?|ftp|irc):\/\/[^\s[\]<>]+)(?:\[([^\]]*)\])?)/;
const HARD_BREAK_RX = / \+$/;

export function isWordChar(ch: string | undefined): boolean {
    return ch !== undefined && WORD_CHAR.test(ch);
}

/**
 * Parses the lines of a paragraph. Soft line breaks become spaces, a trailing ` +` becomes a
 * hard break node.
 */
export function parseInlineLines(lines: string[], schema: Schema): PMNode[] {
    const out: PMNode[] = [];
    lines.forEach((line, index) => {
        let text = line;
        let hard = false;
        if (HARD_BREAK_RX.test(text)) {
            text = text.slice(0, -2);
            hard = true;
        }
        out.push(...parseInline(text, schema));
        const last = index === lines.length - 1;
        if (hard) out.push(schema.nodes.hardBreak!.create());
        else if (!last) out.push(schema.text(' '));
    });
    return out;
}

export function parseInline(text: string, schema: Schema, marks: readonly Mark[] = []): PMNode[] {
    const nodes: PMNode[] = [];
    let buffer = '';
    const flush = () => {
        if (buffer) {
            nodes.push(schema.text(buffer, marks));
            buffer = '';
        }
    };
    const withMark = (name: string, attrs?: Record<string, unknown>): readonly Mark[] =>
        schema.marks[name]!.create(attrs).addToSet(marks);

    let i = 0;
    while (i < text.length) {
        const ch = text[i] as string;
        const prev = text[i - 1];

        if (ch === '\\' && i + 1 < text.length) {
            buffer += ch + text[i + 1];
            i += 2;
            continue;
        }

        if (ch === '{') {
            const m = ATTRIBUTE_REF_RX.exec(text.slice(i));
            if (m) {
                flush();
                nodes.push(schema.nodes.attributeRef!.create({name: m[1]}, undefined, marks));
                i += m[0].length;
                continue;
            }
        }

        if (ch === '<' && text.startsWith('<<', i)) {
            const end = text.indexOf('>>', i + 2);
            if (end > i + 2) {
                const inner = text.slice(i + 2, end);
                const comma = inner.indexOf(',');
                const target = (comma < 0 ? inner : inner.slice(0, comma)).trim();
                const label = comma < 0 ? null : inner.slice(comma + 1).trim();
                flush();
                nodes.push(schema.nodes.xref!.create({target, text: label}, undefined, marks));
                i = end + 2;
                continue;
            }
        }

        if (!isWordChar(prev)) {
            const m = MACRO_RX.exec(text.slice(i));
            if (m) {
                flush();
                if (m[1] === 'xref') {
                    nodes.push(
                        schema.nodes.xref!.create(
                            {target: m[2], text: m[3] || null, macro: true},
                            undefined,
                            marks,
                        ),
                    );
                } else if (m[1] === 'link' || m[1] === 'mailto') {
                    const target = m[2] as string;
                    const href = m[1] === 'mailto' ? `mailto:${target}` : target;
                    const linkMarks = withMark('link', {href});
                    if (m[3]) nodes.push(...parseInline(m[3], schema, linkMarks));
                    else nodes.push(schema.text(target, linkMarks));
                } else {
                    let url = m[4] as string;
                    let consumed = m[0].length;
                    if (m[5] === undefined) {
                        const trimmed = url.replace(/[.,;:!?]+$/, '');
                        consumed -= url.length - trimmed.length;
                        url = trimmed;
                    }
                    const linkMarks = withMark('link', {href: url});
                    if (m[5]) nodes.push(...parseInline(m[5], schema, linkMarks));
                    else nodes.push(schema.text(url, linkMarks));
                    i += consumed;
                    continue;
                }
                i += m[0].length;
                continue;
            }
        }

        const markName = QUOTE_MARKS[ch];
        if (markName && !marks.some((m) => m.type.name === markName)) {
            if (text[i + 1] === ch) {
                const close = text.indexOf(ch + ch, i + 2);
                if (close > i + 1) {
                    const inner = text.slice(i + 2, close);
                    if (inner.length > 0) {
                        flush();
                        nodes.push(...parseInline(inner, schema, withMark(markName)));
                        i = close + 2;
                        continue;
                    }
                }
            } else if (SINGLE_UNCONSTRAINED.has(ch)) {
                const close = text.indexOf(ch, i + 1);
                if (close > i + 1 && !/\s/.test(text.slice(i + 1, close))) {
                    flush();
                    nodes.push(...parseInline(text.slice(i + 1, close), schema, withMark(markName)));
                    i = close + 1;
                    continue;
                }
            } else if (!isWordChar(prev) && text[i + 1] !== undefined && !/\s/.test(text[i + 1]!)) {
                const close = findConstrainedClose(text, ch, i + 1);
                if (close > i) {
                    flush();
                    nodes.push(...parseInline(text.slice(i + 1, close), schema, withMark(markName)));
                    i = close + 1;
                    continue;
                }
            }
        }

        buffer += ch;
        i += 1;
    }
    flush();
    return nodes;
}

function findConstrainedClose(text: string, ch: string, from: number): number {
    let j = from;
    while (true) {
        j = text.indexOf(ch, j);
        if (j < 0) return -1;
        const before = text[j - 1];
        const after = text[j + 1];
        if (before !== undefined && !/\s/.test(before) && !isWordChar(after)) return j;
        j += 1;
    }
}
