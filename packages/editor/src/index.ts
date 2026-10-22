import {parseAsciiDoc, serializeAsciiDoc} from '@monoted/asciidoc-editor-core';
import {Editor} from '@tiptap/core';
import {type BlockPanel, createBlockPanel} from './blockpanel.js';
import {createExtensions} from './extensions.js';
import {createToolbar, defaultToolbarItems, type Toolbar} from './toolbar.js';
import type {AsciiDocEditor, AsciiDocEditorOptions, EditorMode, ThemeTokens} from './types.js';
import './styles/editor.css';

export {AsciiDocEditorElement, defineAsciiDocEditorElement} from './element.js';
export {createExtensions} from './extensions.js';
export type {
    ToolbarButtonItem,
    ToolbarContext,
    ToolbarItem,
    ToolbarItemRef,
    ToolbarSelectItem,
} from './toolbar.js';
export {builtinItems as toolbarItems, defaultToolbarItems} from './toolbar.js';
export type {
    AsciiDocEditor,
    AsciiDocEditorOptions,
    ClassNameSlot,
    EditorMode,
    ThemeTokens,
} from './types.js';

function kebab(name: string): string {
    return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function applyTheme(root: HTMLElement, theme: Partial<ThemeTokens> | undefined): void {
    for (const [key, value] of Object.entries(theme ?? {})) {
        if (value !== undefined) root.style.setProperty(`--adoc-${kebab(key)}`, value);
    }
}

function addClasses(el: HTMLElement, classes: string | undefined): void {
    if (classes) el.classList.add(...classes.split(/\s+/).filter(Boolean));
}

/** Creates an editor inside `container`. The container's existing content is left untouched. */
export function createAsciiDocEditor(
    container: HTMLElement,
    options: AsciiDocEditorOptions = {},
): AsciiDocEditor {
    const classNames = options.classNames ?? {};
    let mode: EditorMode = options.mode ?? 'wysiwyg';
    let readOnly = options.readOnly ?? false;
    let destroyed = false;
    let changeTimer: ReturnType<typeof setTimeout> | null = null;
    const debounceMs = options.changeDebounceMs ?? 150;

    const root = document.createElement('div');
    root.className = 'adoc-editor';
    addClasses(root, classNames.root);
    root.setAttribute('data-adoc-mode', mode);
    if (options.colorScheme && options.colorScheme !== 'auto') {
        root.setAttribute('data-theme', options.colorScheme);
    }
    applyTheme(root, options.theme);

    const toolbarEl = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'adoc-content';
    addClasses(content, classNames.content);

    const source = document.createElement('textarea');
    source.className = 'adoc-source';
    addClasses(source, classNames.sourceEditor);
    source.spellcheck = false;
    source.hidden = true;
    if (options.placeholder) source.placeholder = options.placeholder;

    const panelEl = document.createElement('div');
    addClasses(panelEl, classNames.blockPanel);

    if (options.toolbar !== false) root.append(toolbarEl);
    root.append(panelEl, content, source);
    container.append(root);

    const tiptap = new Editor({
        element: content,
        extensions: createExtensions(),
        editable: !readOnly,
        injectCSS: false,
    });

    const setDocument = (text: string) => {
        const doc = parseAsciiDoc(text, tiptap.schema);
        tiptap.commands.setContent(doc.toJSON(), {emitUpdate: false});
    };
    setDocument(options.value ?? '');

    const getValue = (): string =>
        mode === 'source' ? source.value : serializeAsciiDoc(tiptap.state.doc);

    const emitChange = () => {
        if (!options.onChange) return;
        if (debounceMs <= 0) {
            options.onChange(getValue());
            return;
        }
        if (changeTimer) clearTimeout(changeTimer);
        changeTimer = setTimeout(() => {
            changeTimer = null;
            if (!destroyed) options.onChange?.(getValue());
        }, debounceMs);
    };

    let toolbar: Toolbar | null = null;
    const panel: BlockPanel = createBlockPanel(panelEl, tiptap);
    const toolbarCtx = {
        editor: tiptap,
        getMode: () => mode,
        setMode: (next: EditorMode) => api.setMode(next),
        toggleBlockPanel: (force?: boolean) => {
            panel.toggle(force);
            toolbar?.update();
        },
        isBlockPanelOpen: () => panel.isOpen(),
    };

    tiptap.on('update', emitChange);
    tiptap.on('transaction', () => {
        toolbar?.update();
        panel.update();
    });
    source.addEventListener('input', emitChange);

    const api: AsciiDocEditor = {
        element: root,
        tiptap,
        getValue,
        setValue(value) {
            if (mode === 'source') source.value = value;
            else setDocument(value);
        },
        getMode: () => mode,
        setMode(next) {
            if (next === mode) return;
            if (next === 'source') {
                source.value = serializeAsciiDoc(tiptap.state.doc);
                content.hidden = true;
                source.hidden = false;
            } else {
                setDocument(source.value);
                source.hidden = true;
                content.hidden = false;
            }
            mode = next;
            root.setAttribute('data-adoc-mode', mode);
            panelEl.hidden = mode === 'source' || !panel.isOpen();
            toolbar?.update();
        },
        setReadOnly(value) {
            readOnly = value;
            tiptap.setEditable(!value);
            source.readOnly = value;
            root.toggleAttribute('data-adoc-readonly', value);
            toolbar?.update();
            panel.update();
        },
        isReadOnly: () => readOnly,
        focus() {
            if (mode === 'source') source.focus();
            else tiptap.commands.focus();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (changeTimer) clearTimeout(changeTimer);
            toolbar?.destroy();
            panel.destroy();
            tiptap.destroy();
            root.remove();
        },
    };

    if (options.toolbar !== false) {
        toolbar = createToolbar(toolbarEl, toolbarCtx, options.toolbar ?? defaultToolbarItems, {
            toolbar: classNames.toolbar,
            toolbarButton: classNames.toolbarButton,
            toolbarSelect: classNames.toolbarSelect,
            toolbarSeparator: classNames.toolbarSeparator,
        });
    }
    if (mode === 'source') {
        mode = 'wysiwyg';
        api.setMode('source');
    }
    if (readOnly) api.setReadOnly(true);

    return api;
}
