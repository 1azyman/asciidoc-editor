import {ADMONITION_TYPES} from '@monoted/asciidoc-editor-core';
import type {Editor} from '@tiptap/core';
import type {Node as PMNode} from '@tiptap/pm/model';

/**
 * Block properties panel: a plain DOM form for the attributes of the block at the cursor that
 * have no WYSIWYG representation (block title, anchor id, roles, options, leftover attribute
 * list parts, and per-type extras such as code block language). Edits are applied on change.
 */

export interface BlockPanel {
    update(): void;

    toggle(force?: boolean): void;

    isOpen(): boolean;

    destroy(): void;
}

interface Target {
    node: PMNode;
    pos: number;
}

interface Field {
    key: string;
    label: string;
    kind: 'text' | 'select';
    options?: readonly { value: string; label: string }[];
    placeholder?: string;

    read(node: PMNode): string;

    write(value: string): Record<string, unknown>;
}

const list = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);
const splitWords = (value: string): string[] => value.split(/\s+/).filter(Boolean);
const splitCommas = (value: string): string[] =>
    value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
const nullable = (value: string): string | null => (value.trim() === '' ? null : value.trim());

const META_FIELDS: Field[] = [
    {
        key: 'title',
        label: 'Title',
        kind: 'text',
        placeholder: 'Block title',
        read: (n) => String(n.attrs.title ?? ''),
        write: (v) => ({title: nullable(v)}),
    },
    {
        key: 'id',
        label: 'ID',
        kind: 'text',
        placeholder: 'anchor-id',
        read: (n) => String(n.attrs.id ?? ''),
        write: (v) => ({id: nullable(v)}),
    },
    {
        key: 'roles',
        label: 'Roles',
        kind: 'text',
        placeholder: 'role1 role2',
        read: (n) => list(n.attrs.roles).join(' '),
        write: (v) => ({roles: splitWords(v)}),
    },
    {
        key: 'options',
        label: 'Options',
        kind: 'text',
        placeholder: 'opt1, opt2',
        read: (n) => list(n.attrs.options).join(', '),
        write: (v) => ({options: splitCommas(v)}),
    },
    {
        key: 'extraAttrs',
        label: 'Attributes',
        kind: 'text',
        placeholder: 'linenums, foo=bar',
        read: (n) => list(n.attrs.extraAttrs).join(', '),
        write: (v) => ({extraAttrs: splitCommas(v)}),
    },
];

const TYPE_FIELDS: Record<string, Field[]> = {
    codeBlock: [
        {
            key: 'kind',
            label: 'Kind',
            kind: 'select',
            options: [
                {value: 'listing', label: 'Listing'},
                {value: 'source', label: 'Source'},
                {value: 'literal', label: 'Literal'},
            ],
            read: (n) => String(n.attrs.kind),
            write: (v) => (v === 'literal' ? {kind: v, language: null} : {kind: v}),
        },
        {
            key: 'language',
            label: 'Language',
            kind: 'text',
            placeholder: 'java',
            read: (n) => String(n.attrs.language ?? ''),
            write: (v) => {
                const language = nullable(v);
                return language ? {language, kind: 'source'} : {language};
            },
        },
    ],
    admonition: [
        {
            key: 'type',
            label: 'Type',
            kind: 'select',
            options: ADMONITION_TYPES.map((t) => ({value: t, label: t})),
            read: (n) => String(n.attrs.type),
            write: (v) => ({type: v}),
        },
    ],
    image: [
        {
            key: 'src',
            label: 'Target',
            kind: 'text',
            placeholder: 'images/file.png',
            read: (n) => String(n.attrs.src),
            write: (v) => ({src: v.trim()}),
        },
        {
            key: 'alt',
            label: 'Alt text',
            kind: 'text',
            read: (n) => String(n.attrs.alt),
            write: (v) => ({alt: v}),
        },
        {
            key: 'extra',
            label: 'Image attributes',
            kind: 'text',
            placeholder: '300, align=center',
            read: (n) => list(n.attrs.extra).join(', '),
            write: (v) => ({extra: splitCommas(v)}),
        },
    ],
};

const TYPE_LABELS: Record<string, string> = {
    paragraph: 'Paragraph',
    heading: 'Section',
    bulletList: 'Bullet list',
    orderedList: 'Ordered list',
    codeBlock: 'Code block',
    admonition: 'Admonition',
    image: 'Image',
};

/** The closest block around the selection that carries block metadata attributes. */
export function findMetaBlock(editor: Editor): Target | null {
    const {$from, node} = editor.state.selection as typeof editor.state.selection & {
        node?: PMNode;
    };
    if (node && node.attrs.extraAttrs !== undefined) return {node, pos: $from.pos};
    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const candidate = $from.node(depth);
        if (candidate.attrs.extraAttrs !== undefined) {
            return {node: candidate, pos: $from.before(depth)};
        }
    }
    return null;
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function createBlockPanel(container: HTMLElement, editor: Editor): BlockPanel {
    container.classList.add('adoc-block-panel');
    container.hidden = true;
    let open = false;
    let renderedFor: { type: string; pos: number } | null = null;
    const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();

    const apply = (field: Field, value: string) => {
        const target = findMetaBlock(editor);
        if (!target) return;
        const attrs = {...target.node.attrs, ...field.write(value)};
        editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, undefined, attrs));
    };

    const render = (target: Target | null) => {
        container.replaceChildren();
        inputs.clear();
        if (!target) {
            container.append(el('div', 'adoc-block-panel-empty', 'Place the cursor in a block.'));
            renderedFor = null;
            return;
        }
        const typeName = target.node.type.name;
        renderedFor = {type: typeName, pos: target.pos};
        container.append(el('div', 'adoc-block-panel-title', TYPE_LABELS[typeName] ?? typeName));
        const fields = [...(TYPE_FIELDS[typeName] ?? []), ...META_FIELDS];
        for (const field of fields) {
            const label = el('label', 'adoc-block-panel-field');
            label.append(el('span', 'adoc-block-panel-label', field.label));
            let input: HTMLInputElement | HTMLSelectElement;
            if (field.kind === 'select') {
                input = document.createElement('select');
                for (const option of field.options ?? []) {
                    const o = document.createElement('option');
                    o.value = option.value;
                    o.textContent = option.label;
                    input.append(o);
                }
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.placeholder = field.placeholder ?? '';
                input.spellcheck = false;
            }
            input.className = 'adoc-block-panel-input';
            input.setAttribute('data-adoc-field', field.key);
            input.value = field.read(target.node);
            input.disabled = !editor.isEditable;
            input.addEventListener('change', () => apply(field, input.value));
            (input as HTMLElement).addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    input.blur();
                    editor.commands.focus();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    editor.commands.focus();
                }
            });
            inputs.set(field.key, input);
            label.append(input);
            container.append(label);
        }
    };

    const update = () => {
        if (!open) return;
        const target = findMetaBlock(editor);
        const same =
            target !== null &&
            renderedFor !== null &&
            renderedFor.type === target.node.type.name &&
            renderedFor.pos === target.pos;
        if (!same) {
            render(target);
            return;
        }
        // Same block: refresh values without rebuilding, so a focused field keeps focus.
        const fields = [...(TYPE_FIELDS[target.node.type.name] ?? []), ...META_FIELDS];
        for (const field of fields) {
            const input = inputs.get(field.key);
            if (!input || input === document.activeElement) continue;
            const value = field.read(target.node);
            if (input.value !== value) input.value = value;
            input.disabled = !editor.isEditable;
        }
    };

    return {
        update,
        isOpen: () => open,
        toggle(force) {
            open = force ?? !open;
            container.hidden = !open;
            if (open) render(findMetaBlock(editor));
        },
        destroy() {
            container.replaceChildren();
        },
    };
}
