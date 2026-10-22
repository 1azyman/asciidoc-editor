import {createAsciiDocEditor} from './index.js';
import type {AsciiDocEditor, EditorMode} from './types.js';

/**
 * `<asciidoc-editor name="field">= Title ...</asciidoc-editor>`
 *
 * Custom element for markup-driven hosts. The initial value is the element's text content (or the
 * `value` attribute). When `name` is set, a hidden textarea with that name mirrors the value so the
 * editor takes part in normal form submission.
 */
export class AsciiDocEditorElement extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['readonly', 'mode'];
    }

    private editor: AsciiDocEditor | null = null;
    private textarea: HTMLTextAreaElement | null = null;
    private initialValue = '';

    connectedCallback(): void {
        if (this.editor) return;
        this.initialValue = this.getAttribute('value') ?? this.textContent ?? '';
        this.textContent = '';
        const name = this.getAttribute('name');
        if (name) {
            this.textarea = document.createElement('textarea');
            this.textarea.name = name;
            this.textarea.hidden = true;
            this.textarea.value = this.initialValue;
            this.append(this.textarea);
        }
        this.editor = createAsciiDocEditor(this, {
            value: this.initialValue,
            mode: (this.getAttribute('mode') as EditorMode | null) ?? 'wysiwyg',
            readOnly: this.hasAttribute('readonly'),
            toolbar: this.hasAttribute('no-toolbar') ? false : undefined,
            onChange: (value) => {
                if (this.textarea) this.textarea.value = value;
                this.dispatchEvent(new CustomEvent('change', {detail: {value}, bubbles: true}));
            },
        });
    }

    disconnectedCallback(): void {
        this.editor?.destroy();
        this.editor = null;
        this.textarea = null;
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (!this.editor) return;
        if (name === 'readonly') this.editor.setReadOnly(value !== null);
        if (name === 'mode' && (value === 'wysiwyg' || value === 'source')) this.editor.setMode(value);
    }

    get value(): string {
        return this.editor ? this.editor.getValue() : this.initialValue;
    }

    set value(text: string) {
        this.initialValue = text;
        this.editor?.setValue(text);
        if (this.textarea) this.textarea.value = text;
    }

    get api(): AsciiDocEditor | null {
        return this.editor;
    }
}

export function defineAsciiDocEditorElement(tagName = 'asciidoc-editor'): void {
    if (!customElements.get(tagName)) customElements.define(tagName, AsciiDocEditorElement);
}
