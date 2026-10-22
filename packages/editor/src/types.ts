import type {Editor} from '@tiptap/core';
import type {ToolbarItemRef} from './toolbar.js';

export type EditorMode = 'wysiwyg' | 'source';

/** Design tokens; each maps to a `--adoc-*` custom property on the root element. */
export interface ThemeTokens {
    fontFamily: string;
    fontMono: string;
    fontSize: string;
    colorBg: string;
    colorFg: string;
    colorMuted: string;
    colorBorder: string;
    colorAccent: string;
    colorToolbarBg: string;
    colorCodeBg: string;
    colorRawBg: string;
    colorSelection: string;
    colorNote: string;
    colorTip: string;
    colorImportant: string;
    colorWarning: string;
    colorCaution: string;
    radius: string;
    spacing: string;
}

export type ClassNameSlot =
    | 'root'
    | 'toolbar'
    | 'toolbarButton'
    | 'toolbarSelect'
    | 'toolbarSeparator'
    | 'content'
    | 'blockPanel'
    | 'sourceEditor';

export interface AsciiDocEditorOptions {
    /** Initial AsciiDoc text. */
    value?: string;
    mode?: EditorMode;
    readOnly?: boolean;
    /** Called with the current AsciiDoc text after edits, debounced. */
    onChange?: (value: string) => void;
    /** Debounce for onChange in milliseconds. 0 calls synchronously on every transaction. */
    changeDebounceMs?: number;
    /** Toolbar items in order, `'|'` for a separator. `false` hides the toolbar. */
    toolbar?: false | ToolbarItemRef[];
    /** Extra classes added to named parts of the editor. */
    classNames?: Partial<Record<ClassNameSlot, string>>;
    /** Overrides for design tokens, applied inline on the root element. */
    theme?: Partial<ThemeTokens>;
    /** `light`, `dark`, or `auto` to follow `prefers-color-scheme`. */
    colorScheme?: 'light' | 'dark' | 'auto';
    placeholder?: string;
}

export interface AsciiDocEditor {
    /** Current AsciiDoc text, from whichever mode is active. */
    getValue(): string;

    setValue(value: string): void;

    getMode(): EditorMode;

    setMode(mode: EditorMode): void;

    setReadOnly(readOnly: boolean): void;

    isReadOnly(): boolean;

    focus(): void;

    destroy(): void;

    /** The root element created inside the container. */
    readonly element: HTMLElement;
    /** The underlying TipTap editor, for hosts that want to run commands directly. */
    readonly tiptap: Editor;
}
