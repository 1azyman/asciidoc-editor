import {type DOMOutputSpec, type MarkSpec, type Node as PMNode, type NodeSpec, Schema,} from 'prosemirror-model';

/**
 * ProseMirror node and mark specs for the AsciiDoc document model.
 *
 * The specs are exported as plain objects so that the editor package can derive
 * TipTap extensions from them; createSchema() builds a plain ProseMirror schema
 * for tests and non-editor use. Both must describe the same schema, by name.
 */

export const ADMONITION_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;
export type AdmonitionType = (typeof ADMONITION_TYPES)[number];

export function isAdmonitionType(value: string): value is AdmonitionType {
    return (ADMONITION_TYPES as readonly string[]).includes(value);
}

/** Metadata that any AsciiDoc block can carry: anchor, block title, roles, options, leftover attrs. */
export interface BlockMetaAttrs {
    id: string | null;
    title: string | null;
    roles: string[];
    options: string[];
    /** Attribute list parts the block type did not consume, kept for round trip, e.g. ["linenums", "foo=bar"]. */
    extraAttrs: string[];
}

export const blockMetaAttrs = {
    id: {default: null},
    title: {default: null},
    roles: {default: []},
    options: {default: []},
    extraAttrs: {default: []},
};

export const EMPTY_META: BlockMetaAttrs = {
    id: null,
    title: null,
    roles: [],
    options: [],
    extraAttrs: [],
};

export type RawBlockKind =
    | 'unknown'
    | 'comment'
    | 'attribute'
    | 'macro'
    | 'table'
    | 'block'
    | 'dlist'
    | 'callout'
    | 'continuation';

export type CodeBlockKind = 'listing' | 'source' | 'literal';

function metaDOMAttrs(node: PMNode): Record<string, string> {
    const out: Record<string, string> = {};
    if (node.attrs.id) out['data-adoc-id'] = node.attrs.id;
    if (node.attrs.title) out['data-adoc-title'] = node.attrs.title;
    if (node.attrs.roles?.length) out['data-adoc-roles'] = node.attrs.roles.join(' ');
    return out;
}

function cls(...names: (string | null | undefined | false)[]): string {
    return names.filter(Boolean).join(' ');
}

const headingParseRules = [1, 2, 3, 4, 5, 6].map((h) => ({
    tag: `h${h}`,
    attrs: {level: Math.min(h, 5)},
}));

export const nodeSpecs: Record<string, NodeSpec> = {
    doc: {
        content: 'docTitle? block+',
    },

    /** Document title line plus the raw header lines that follow it (author, attribute entries). */
    docTitle: {
        content: 'inline*',
        defining: true,
        attrs: {
            preLines: {default: []},
            headerLines: {default: []},
        },
        parseDOM: [{tag: 'h1.adoc-doctitle'}],
        toDOM: (): DOMOutputSpec => ['h1', {class: 'adoc-doctitle'}, 0],
    },

    paragraph: {
        content: 'inline*',
        group: 'block',
        attrs: {...blockMetaAttrs},
        parseDOM: [{tag: 'p'}],
        toDOM: (node): DOMOutputSpec => ['p', {class: 'adoc-paragraph', ...metaDOMAttrs(node)}, 0],
    },

    /** Section title. level is the AsciiDoc section level: `==` is 1, `======` is 5, `=` in the body is 0. */
    heading: {
        content: 'inline*',
        group: 'block',
        defining: true,
        attrs: {...blockMetaAttrs, level: {default: 1}},
        parseDOM: headingParseRules,
        toDOM: (node): DOMOutputSpec => [
            `h${Math.min(Number(node.attrs.level) + 1, 6)}`,
            {class: 'adoc-heading', 'data-adoc-level': String(node.attrs.level), ...metaDOMAttrs(node)},
            0,
        ],
    },

    bulletList: {
        content: 'listItem+',
        group: 'block',
        attrs: {...blockMetaAttrs},
        parseDOM: [{tag: 'ul'}],
        toDOM: (node): DOMOutputSpec => ['ul', {class: 'adoc-ulist', ...metaDOMAttrs(node)}, 0],
    },

    orderedList: {
        content: 'listItem+',
        group: 'block',
        attrs: {...blockMetaAttrs},
        parseDOM: [{tag: 'ol'}],
        toDOM: (node): DOMOutputSpec => ['ol', {class: 'adoc-olist', ...metaDOMAttrs(node)}, 0],
    },

    listItem: {
        content: 'paragraph block*',
        defining: true,
        attrs: {checked: {default: null}},
        parseDOM: [{tag: 'li'}],
        toDOM: (node): DOMOutputSpec => [
            'li',
            {
                class: cls('adoc-list-item', node.attrs.checked !== null && 'adoc-checklist-item'),
                ...(node.attrs.checked !== null ? {'data-adoc-checked': String(node.attrs.checked)} : {}),
            },
            0,
        ],
    },

    codeBlock: {
        content: 'text*',
        group: 'block',
        marks: '',
        code: true,
        defining: true,
        attrs: {...blockMetaAttrs, language: {default: null}, kind: {default: 'listing'}},
        parseDOM: [
            {
                tag: 'pre',
                preserveWhitespace: 'full',
                getAttrs: (el) => {
                    const lang = (el as HTMLElement).getAttribute('data-adoc-language');
                    const kind = (el as HTMLElement).getAttribute('data-adoc-kind') ?? 'listing';
                    return {language: lang, kind};
                },
            },
        ],
        toDOM: (node): DOMOutputSpec => [
            'pre',
            {
                class: cls('adoc-codeblock', `adoc-codeblock-${node.attrs.kind}`),
                'data-adoc-kind': node.attrs.kind,
                ...(node.attrs.language ? {'data-adoc-language': node.attrs.language} : {}),
                ...metaDOMAttrs(node),
            },
            ['code', 0],
        ],
    },

    admonition: {
        content: 'block+',
        group: 'block',
        defining: true,
        attrs: {...blockMetaAttrs, type: {default: 'NOTE'}},
        parseDOM: [
            {
                tag: 'div.adoc-admonition',
                getAttrs: (el) => ({
                    type: (el as HTMLElement).getAttribute('data-adoc-type') ?? 'NOTE',
                }),
            },
        ],
        toDOM: (node): DOMOutputSpec => [
            'div',
            {
                class: cls('adoc-admonition', `adoc-admonition-${String(node.attrs.type).toLowerCase()}`),
                'data-adoc-type': node.attrs.type,
                ...metaDOMAttrs(node),
            },
            0,
        ],
    },

    image: {
        group: 'block',
        atom: true,
        draggable: true,
        attrs: {
            ...blockMetaAttrs,
            src: {default: ''},
            alt: {default: ''},
            /** Attribute list parts after alt, verbatim, e.g. ["300", "align=center"]. */
            extra: {default: []},
        },
        parseDOM: [
            {
                tag: 'img[src]',
                getAttrs: (el) => ({
                    src: (el as HTMLElement).getAttribute('src'),
                    alt: (el as HTMLElement).getAttribute('alt') ?? '',
                }),
            },
        ],
        toDOM: (node): DOMOutputSpec => [
            'figure',
            {class: 'adoc-image', ...metaDOMAttrs(node)},
            ['img', {src: node.attrs.src, alt: node.attrs.alt}],
        ],
    },

    include: {
        group: 'block',
        atom: true,
        attrs: {target: {default: ''}, attrlist: {default: ''}},
        toDOM: (node): DOMOutputSpec => [
            'div',
            {
                class: 'adoc-include',
                'data-adoc-target': node.attrs.target,
                'data-adoc-attrlist': node.attrs.attrlist,
            },
            `include::${node.attrs.target}[${node.attrs.attrlist}]`,
        ],
    },

    /** Any AsciiDoc the parser does not model. Source is kept verbatim and emitted as is. */
    rawBlock: {
        group: 'block',
        atom: true,
        attrs: {source: {default: ''}, kind: {default: 'unknown'}},
        toDOM: (node): DOMOutputSpec => [
            'pre',
            {class: 'adoc-raw', 'data-adoc-kind': node.attrs.kind},
            node.attrs.source,
        ],
    },

    text: {
        group: 'inline',
    },

    hardBreak: {
        inline: true,
        group: 'inline',
        selectable: false,
        parseDOM: [{tag: 'br'}],
        toDOM: (): DOMOutputSpec => ['br'],
    },

    attributeRef: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: {name: {default: ''}},
        toDOM: (node): DOMOutputSpec => [
            'span',
            {class: 'adoc-attribute-ref', 'data-adoc-name': node.attrs.name},
            `{${node.attrs.name}}`,
        ],
    },

    xref: {
        inline: true,
        group: 'inline',
        atom: true,
        /** macro: written as `xref:target[text]` rather than `<<target,text>>`. */
        attrs: {target: {default: ''}, text: {default: null}, macro: {default: false}},
        toDOM: (node): DOMOutputSpec => [
            'span',
            {class: 'adoc-xref', 'data-adoc-target': node.attrs.target},
            node.attrs.text ?? node.attrs.target,
        ],
    },
};

export const markSpecs: Record<string, MarkSpec> = {
    link: {
        attrs: {href: {default: ''}},
        inclusive: false,
        parseDOM: [
            {
                tag: 'a[href]',
                getAttrs: (el) => ({href: (el as HTMLElement).getAttribute('href')}),
            },
        ],
        toDOM: (mark): DOMOutputSpec => ['a', {href: mark.attrs.href, class: 'adoc-link'}, 0],
    },
    strong: {
        parseDOM: [{tag: 'strong'}, {tag: 'b'}],
        toDOM: (): DOMOutputSpec => ['strong', 0],
    },
    em: {
        parseDOM: [{tag: 'em'}, {tag: 'i'}],
        toDOM: (): DOMOutputSpec => ['em', 0],
    },
    code: {
        parseDOM: [{tag: 'code'}],
        toDOM: (): DOMOutputSpec => ['code', 0],
    },
    highlight: {
        parseDOM: [{tag: 'mark'}],
        toDOM: (): DOMOutputSpec => ['mark', 0],
    },
    superscript: {
        parseDOM: [{tag: 'sup'}],
        toDOM: (): DOMOutputSpec => ['sup', 0],
    },
    subscript: {
        parseDOM: [{tag: 'sub'}],
        toDOM: (): DOMOutputSpec => ['sub', 0],
    },
};

/** Serialization order of marks; outer marks first. */
export const MARK_ORDER = [
    'link',
    'strong',
    'em',
    'code',
    'highlight',
    'superscript',
    'subscript',
] as const;

export function createSchema(): Schema {
    return new Schema({nodes: nodeSpecs, marks: markSpecs, topNode: 'doc'});
}
