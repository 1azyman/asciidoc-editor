import {ADMONITION_TYPES} from '@monoted/asciidoc-editor-core';
import type {Editor} from '@tiptap/core';
import {icons} from './icons.js';
import type {EditorMode} from './types.js';

/**
 * Plain DOM toolbar. Items are described by data so hosts can reorder, remove or add their own;
 * `toolbar: false` in the editor options disables it entirely.
 */

export interface ToolbarContext {
    editor: Editor;

    getMode(): EditorMode;

    setMode(mode: EditorMode): void;

    /** Shows or hides the block properties panel. */
    toggleBlockPanel(force?: boolean): void;

    isBlockPanelOpen(): boolean;
}

export interface ToolbarButtonItem {
    kind?: 'button';
    id: string;
    label: string;
    /** Inline SVG markup; falls back to the label text. */
    icon?: string;

    run(ctx: ToolbarContext): void;

    isActive?(ctx: ToolbarContext): boolean;

    isEnabled?(ctx: ToolbarContext): boolean;
}

export interface ToolbarSelectItem {
    kind: 'select';
    id: string;
    label: string;
    options: { value: string; label: string }[];

    getValue(ctx: ToolbarContext): string;

    setValue(ctx: ToolbarContext, value: string): void;

    isEnabled?(ctx: ToolbarContext): boolean;
}

export type ToolbarItem = ToolbarButtonItem | ToolbarSelectItem;
export type ToolbarItemRef = string | ToolbarItem;

const SEPARATOR = '|';

const inWysiwyg = (ctx: ToolbarContext) => ctx.getMode() === 'wysiwyg' && ctx.editor.isEditable;

function markButton(id: string, label: string, mark: string): ToolbarButtonItem {
    return {
        id,
        label,
        icon: icons[id],
        run: (ctx) => ctx.editor.chain().focus().toggleMark(mark).run(),
        isActive: (ctx) => ctx.editor.isActive(mark),
        isEnabled: (ctx) => inWysiwyg(ctx) && ctx.editor.can().toggleMark(mark),
    };
}

export const builtinItems: Record<string, ToolbarItem> = {
    undo: {
        id: 'undo',
        label: 'Undo',
        icon: icons.undo,
        run: (ctx) => ctx.editor.chain().focus().undo().run(),
        isEnabled: (ctx) => inWysiwyg(ctx) && ctx.editor.can().undo(),
    },
    redo: {
        id: 'redo',
        label: 'Redo',
        icon: icons.redo,
        run: (ctx) => ctx.editor.chain().focus().redo().run(),
        isEnabled: (ctx) => inWysiwyg(ctx) && ctx.editor.can().redo(),
    },
    block: {
        kind: 'select',
        id: 'block',
        label: 'Block type',
        options: [
            {value: 'paragraph', label: 'Paragraph'},
            {value: 'h1', label: 'Section 1'},
            {value: 'h2', label: 'Section 2'},
            {value: 'h3', label: 'Section 3'},
            {value: 'h4', label: 'Section 4'},
            {value: 'h5', label: 'Section 5'},
        ],
        getValue: (ctx) =>
            ctx.editor.isActive('heading')
                ? `h${ctx.editor.getAttributes('heading').level}`
                : 'paragraph',
        setValue: (ctx, value) => {
            const chain = ctx.editor.chain().focus();
            if (value === 'paragraph') chain.setNode('paragraph').run();
            else chain.setNode('heading', {level: Number(value.slice(1))}).run();
        },
        isEnabled: inWysiwyg,
    },
    bold: markButton('bold', 'Bold', 'strong'),
    italic: markButton('italic', 'Italic', 'em'),
    code: markButton('code', 'Monospace', 'code'),
    highlight: markButton('highlight', 'Highlight', 'highlight'),
    superscript: markButton('superscript', 'Superscript', 'superscript'),
    subscript: markButton('subscript', 'Subscript', 'subscript'),
    link: {
        id: 'link',
        label: 'Link',
        icon: icons.link,
        run: (ctx) => {
            const current = ctx.editor.getAttributes('link').href as string | undefined;
            const href = window.prompt('Link target', current ?? 'https://');
            if (href === null) return;
            const chain = ctx.editor.chain().focus().extendMarkRange('link');
            if (href.trim() === '') chain.unsetMark('link').run();
            else chain.setMark('link', {href: href.trim()}).run();
        },
        isActive: (ctx) => ctx.editor.isActive('link'),
        isEnabled: (ctx) => inWysiwyg(ctx) && !ctx.editor.state.selection.empty,
    },
    bulletList: {
        id: 'bulletList',
        label: 'Bullet list',
        icon: icons.bulletList,
        run: (ctx) => ctx.editor.chain().focus().toggleList('bulletList', 'listItem').run(),
        isActive: (ctx) => ctx.editor.isActive('bulletList'),
        isEnabled: inWysiwyg,
    },
    orderedList: {
        id: 'orderedList',
        label: 'Ordered list',
        icon: icons.orderedList,
        run: (ctx) => ctx.editor.chain().focus().toggleList('orderedList', 'listItem').run(),
        isActive: (ctx) => ctx.editor.isActive('orderedList'),
        isEnabled: inWysiwyg,
    },
    admonition: {
        kind: 'select',
        id: 'admonition',
        label: 'Admonition',
        options: [
            {value: '', label: 'No admonition'},
            ...ADMONITION_TYPES.map((t) => ({value: t, label: t})),
        ],
        getValue: (ctx) =>
            ctx.editor.isActive('admonition') ? String(ctx.editor.getAttributes('admonition').type) : '',
        setValue: (ctx, value) => {
            const chain = ctx.editor.chain().focus();
            if (value === '') chain.lift('admonition').run();
            else if (ctx.editor.isActive('admonition')) {
                chain.updateAttributes('admonition', {type: value}).run();
            } else chain.wrapIn('admonition', {type: value}).run();
        },
        isEnabled: inWysiwyg,
    },
    codeBlock: {
        id: 'codeBlock',
        label: 'Code block',
        icon: icons.codeBlock,
        run: (ctx) => ctx.editor.chain().focus().toggleNode('codeBlock', 'paragraph').run(),
        isActive: (ctx) => ctx.editor.isActive('codeBlock'),
        isEnabled: inWysiwyg,
    },
    image: {
        id: 'image',
        label: 'Image',
        icon: icons.image,
        run: (ctx) => {
            const src = window.prompt('Image target', '');
            if (!src) return;
            const alt = window.prompt('Alternative text', '') ?? '';
            ctx.editor.chain().focus().insertContent({type: 'image', attrs: {src, alt}}).run();
        },
        isEnabled: inWysiwyg,
    },
    attributes: {
        id: 'attributes',
        label: 'Block properties',
        icon: icons.attributes,
        run: (ctx) => ctx.toggleBlockPanel(),
        isActive: (ctx) => ctx.isBlockPanelOpen(),
        isEnabled: (ctx) => ctx.getMode() === 'wysiwyg',
    },
    source: {
        id: 'source',
        label: 'Source',
        icon: icons.source,
        run: (ctx) => ctx.setMode(ctx.getMode() === 'source' ? 'wysiwyg' : 'source'),
        isActive: (ctx) => ctx.getMode() === 'source',
    },
};

export const defaultToolbarItems: ToolbarItemRef[] = [
    'undo',
    'redo',
    SEPARATOR,
    'block',
    SEPARATOR,
    'bold',
    'italic',
    'code',
    'highlight',
    'superscript',
    'subscript',
    'link',
    SEPARATOR,
    'bulletList',
    'orderedList',
    'admonition',
    'codeBlock',
    'image',
    SEPARATOR,
    'attributes',
    'source',
];

export interface ToolbarClassNames {
    toolbar?: string;
    toolbarButton?: string;
    toolbarSelect?: string;
    toolbarSeparator?: string;
}

export interface Toolbar {
    update(): void;

    destroy(): void;
}

function resolveItem(ref: ToolbarItemRef): ToolbarItem | null {
    if (typeof ref !== 'string') return ref;
    if (ref === SEPARATOR) return null;
    const item = builtinItems[ref];
    if (!item) throw new Error(`Unknown toolbar item: ${ref}`);
    return item;
}

export function createToolbar(
    container: HTMLElement,
    ctx: ToolbarContext,
    items: ToolbarItemRef[],
    classNames: ToolbarClassNames = {},
): Toolbar {
    container.classList.add('adoc-toolbar');
    if (classNames.toolbar) container.classList.add(...classNames.toolbar.split(/\s+/));
    container.setAttribute('role', 'toolbar');
    const updaters: (() => void)[] = [];

    for (const ref of items) {
        const item = resolveItem(ref);
        if (item === null) {
            const sep = document.createElement('span');
            sep.className = `adoc-toolbar-separator ${classNames.toolbarSeparator ?? ''}`.trim();
            container.append(sep);
            continue;
        }
        if (item.kind === 'select') {
            const select = document.createElement('select');
            select.className = `adoc-toolbar-select ${classNames.toolbarSelect ?? ''}`.trim();
            select.setAttribute('data-adoc-item', item.id);
            select.title = item.label;
            select.setAttribute('aria-label', item.label);
            for (const option of item.options) {
                const el = document.createElement('option');
                el.value = option.value;
                el.textContent = option.label;
                select.append(el);
            }
            select.addEventListener('change', () => item.setValue(ctx, select.value));
            container.append(select);
            updaters.push(() => {
                select.value = item.getValue(ctx);
                select.disabled = item.isEnabled ? !item.isEnabled(ctx) : false;
            });
            continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `adoc-toolbar-button ${classNames.toolbarButton ?? ''}`.trim();
        button.setAttribute('data-adoc-item', item.id);
        button.title = item.label;
        button.setAttribute('aria-label', item.label);
        if (item.icon) button.innerHTML = item.icon;
        else button.textContent = item.label;
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => item.run(ctx));
        container.append(button);
        updaters.push(() => {
            const active = item.isActive ? item.isActive(ctx) : false;
            button.classList.toggle('adoc-active', active);
            button.setAttribute('aria-pressed', String(active));
            button.disabled = item.isEnabled ? !item.isEnabled(ctx) : false;
        });
    }

    const update = () => {
        for (const u of updaters) u();
    };
    update();
    return {
        update,
        destroy: () => {
            container.replaceChildren();
        },
    };
}
