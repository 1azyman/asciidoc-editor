import type {NodeViewRenderer} from '@tiptap/core';
import type {Node as PMNode} from '@tiptap/pm/model';

/** Plain DOM node views for atoms that need their own editing UI. */

const RAW_LABELS: Record<string, string> = {
    unknown: 'AsciiDoc source',
    comment: 'Comment',
    attribute: 'Attribute entry',
    macro: 'Block macro',
    table: 'Table',
    block: 'Block',
    dlist: 'Description list',
    callout: 'Callout list',
    continuation: 'List continuation',
};

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

function autosize(textarea: HTMLTextAreaElement): void {
    textarea.rows = Math.max(1, textarea.value.split('\n').length);
}

export const rawBlockView: NodeViewRenderer = ({node, getPos, editor}) => {
    let current: PMNode = node;
    const dom = el('div', 'adoc-raw');
    dom.setAttribute('data-adoc-kind', String(node.attrs.kind));
    const label = el(
        'div',
        'adoc-raw-label',
        RAW_LABELS[String(node.attrs.kind)] ?? RAW_LABELS.unknown,
    );
    const textarea = el('textarea', 'adoc-raw-source');
    textarea.value = String(node.attrs.source);
    textarea.spellcheck = false;
    textarea.readOnly = !editor.isEditable;
    autosize(textarea);
    textarea.addEventListener('input', () => {
        autosize(textarea);
        const pos = getPos();
        if (pos === undefined) return;
        editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {...current.attrs, source: textarea.value}),
        );
    });
    dom.append(label, textarea);
    return {
        dom,
        update(updated: PMNode) {
            if (updated.type !== current.type) return false;
            current = updated;
            if (textarea.value !== updated.attrs.source) {
                textarea.value = String(updated.attrs.source);
                autosize(textarea);
            }
            textarea.readOnly = !editor.isEditable;
            return true;
        },
        stopEvent: () => true,
        ignoreMutation: () => true,
        selectNode: () => dom.classList.add('adoc-selected'),
        deselectNode: () => dom.classList.remove('adoc-selected'),
    };
};

export const includeView: NodeViewRenderer = ({node, getPos, editor}) => {
    let current: PMNode = node;
    const dom = el('div', 'adoc-include');
    const label = el('span', 'adoc-include-label', 'include');
    const target = el('code', 'adoc-include-target', String(node.attrs.target));
    const attrs = el('code', 'adoc-include-attrs', `[${node.attrs.attrlist}]`);
    dom.append(label, target, attrs);
    dom.title = 'Double-click to edit the include target';
    dom.addEventListener('dblclick', () => {
        if (!editor.isEditable) return;
        const next = window.prompt('Include target', String(current.attrs.target));
        if (next === null || next === current.attrs.target) return;
        const pos = getPos();
        if (pos === undefined) return;
        editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {...current.attrs, target: next}),
        );
    });
    return {
        dom,
        update(updated: PMNode) {
            if (updated.type !== current.type) return false;
            current = updated;
            target.textContent = String(updated.attrs.target);
            attrs.textContent = `[${updated.attrs.attrlist}]`;
            return true;
        },
        selectNode: () => dom.classList.add('adoc-selected'),
        deselectNode: () => dom.classList.remove('adoc-selected'),
    };
};
