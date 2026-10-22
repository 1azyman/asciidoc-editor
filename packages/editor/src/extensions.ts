import {markSpecs, nodeSpecs} from '@monoted/asciidoc-editor-core';
import {
    Extension,
    type Extensions,
    Mark,
    Node,
    type NodeViewRenderer,
    textblockTypeInputRule,
    wrappingInputRule,
} from '@tiptap/core';
import {Dropcursor, Gapcursor, UndoRedo} from '@tiptap/extensions';
import type {MarkSpec, NodeSpec} from '@tiptap/pm/model';
import {includeView, rawBlockView} from './nodeviews.js';

/**
 * TipTap extensions derived from the core ProseMirror specs, so that the editor schema and the
 * schema used by the parser and serializer are the same by construction.
 */

function attributesFromSpec(attrs: NodeSpec['attrs'] | MarkSpec['attrs']) {
    return Object.fromEntries(
        Object.entries(attrs ?? {}).map(([name, spec]) => [
            name,
            {default: spec.default, rendered: false, parseHTML: () => null},
        ]),
    );
}

function nodeExtension(name: string, spec: NodeSpec, nodeView?: NodeViewRenderer): Node {
    return Node.create({
        name,
        topNode: name === 'doc',
        content: spec.content,
        group: spec.group,
        inline: spec.inline ?? false,
        atom: spec.atom ?? false,
        marks: spec.marks,
        code: spec.code ?? false,
        defining: spec.defining ?? false,
        selectable: spec.selectable ?? true,
        draggable: spec.draggable ?? false,
        whitespace: spec.whitespace,
        addAttributes() {
            return attributesFromSpec(spec.attrs);
        },
        parseHTML() {
            return spec.parseDOM ?? [];
        },
        renderHTML({node}) {
            return spec.toDOM ? spec.toDOM(node) : ['div', 0];
        },
        addNodeView() {
            return nodeView ?? null;
        },
    });
}

function markExtension(name: string, spec: MarkSpec): Mark {
    return Mark.create({
        name,
        inclusive: spec.inclusive ?? true,
        excludes: spec.excludes,
        spanning: spec.spanning ?? true,
        addAttributes() {
            return attributesFromSpec(spec.attrs);
        },
        parseHTML() {
            return spec.parseDOM ?? [];
        },
        renderHTML({mark}) {
            return spec.toDOM ? spec.toDOM(mark, true) : ['span', 0];
        },
    });
}

const nodeViews: Record<string, NodeViewRenderer> = {
    rawBlock: rawBlockView,
    include: includeView,
};

const AsciiDocBehaviors = Extension.create({
    name: 'asciidocBehaviors',

    addKeyboardShortcuts() {
        // `editor.commands` must be read at call time: each access binds a fresh transaction to the
        // current state, and a captured one would be applied to a stale state.
        const editor = this.editor;
        const shortcuts: Record<string, () => boolean> = {
            'Mod-b': () => editor.commands.toggleMark('strong'),
            'Mod-i': () => editor.commands.toggleMark('em'),
            'Mod-e': () => editor.commands.toggleMark('code'),
            'Mod-Shift-h': () => editor.commands.toggleMark('highlight'),
            'Mod-.': () => editor.commands.toggleMark('superscript'),
            'Mod-,': () => editor.commands.toggleMark('subscript'),
            'Shift-Enter': () => editor.commands.insertContent({type: 'hardBreak'}),
            Enter: () => editor.commands.splitListItem('listItem'),
            Tab: () => editor.commands.sinkListItem('listItem'),
            'Shift-Tab': () => editor.commands.liftListItem('listItem'),
            'Mod-Enter': () => editor.commands.exitCode(),
            'Mod-Alt-0': () => editor.commands.setNode('paragraph'),
        };
        for (let level = 1; level <= 5; level += 1) {
            shortcuts[`Mod-Alt-${level}`] = () => editor.commands.setNode('heading', {level});
        }
        return shortcuts;
    },

    addInputRules() {
        const {nodes} = this.editor.schema;
        return [
            textblockTypeInputRule({
                find: /^(={2,6})\s$/,
                type: nodes.heading!,
                getAttributes: (match) => ({level: (match[1] as string).length - 1}),
            }),
            wrappingInputRule({find: /^\s*[*-]\s$/, type: nodes.bulletList!}),
            wrappingInputRule({find: /^\s*(?:\.|\d+\.)\s$/, type: nodes.orderedList!}),
            wrappingInputRule({
                find: /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s$/,
                type: nodes.admonition!,
                getAttributes: (match) => ({type: match[1]}),
            }),
            textblockTypeInputRule({find: /^(?:----|```)\s$/, type: nodes.codeBlock!}),
        ];
    },
});

export function createExtensions(): Extensions {
    const nodes = Object.entries(nodeSpecs).map(([name, spec]) =>
        nodeExtension(name, spec, nodeViews[name]),
    );
    const marks = Object.entries(markSpecs).map(([name, spec]) => markExtension(name, spec));
    return [...nodes, ...marks, UndoRedo, Gapcursor, Dropcursor, AsciiDocBehaviors];
}
