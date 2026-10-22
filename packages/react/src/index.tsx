import {
    type AsciiDocEditor as AsciiDocEditorApi,
    type AsciiDocEditorOptions,
    createAsciiDocEditor,
} from '@monoted/asciidoc-editor';
import {type CSSProperties, useCallback, useEffect, useRef, useState} from 'react';

export type {AsciiDocEditorApi, AsciiDocEditorOptions};

/**
 * Lifecycle glue only: the vanilla editor is created on a container element and destroyed on
 * unmount. All editing behavior lives in @monoted/asciidoc-editor.
 */

export interface UseAsciiDocEditorResult {
    /** Attach to the container element. */
    ref: (element: HTMLElement | null) => void;
    /** The editor instance once mounted, otherwise null. */
    editor: AsciiDocEditorApi | null;
}

export function useAsciiDocEditor(
    options: Omit<AsciiDocEditorOptions, 'value'> & { value?: string; defaultValue?: string },
): UseAsciiDocEditorResult {
    const [editor, setEditor] = useState<AsciiDocEditorApi | null>(null);
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const ref = useCallback((element: HTMLElement | null) => setContainer(element), []);

    useEffect(() => {
        if (!container) return;
        const initial = optionsRef.current;
        const instance = createAsciiDocEditor(container, {
            ...initial,
            value: initial.value ?? initial.defaultValue ?? '',
            onChange: (value) => optionsRef.current.onChange?.(value),
        });
        setEditor(instance);
        return () => {
            instance.destroy();
            setEditor(null);
        };
    }, [container]);

    const {value, readOnly, mode} = options;

    useEffect(() => {
        if (editor && value !== undefined && value !== editor.getValue()) editor.setValue(value);
    }, [editor, value]);

    useEffect(() => {
        if (editor && readOnly !== undefined && readOnly !== editor.isReadOnly()) {
            editor.setReadOnly(readOnly);
        }
    }, [editor, readOnly]);

    useEffect(() => {
        if (editor && mode !== undefined && mode !== editor.getMode()) editor.setMode(mode);
    }, [editor, mode]);

    return {ref, editor};
}

export interface AsciiDocEditorProps extends Omit<AsciiDocEditorOptions, 'value'> {
    /** Controlled value. */
    value?: string;
    /** Uncontrolled initial value. */
    defaultValue?: string;
    className?: string;
    style?: CSSProperties;
}

export function AsciiDocEditor({className, style, ...options}: AsciiDocEditorProps) {
    const {ref} = useAsciiDocEditor(options);
    return <div ref={ref} className={className} style={style}/>;
}
