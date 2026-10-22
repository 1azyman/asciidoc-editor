# AsciiDoc editor

A WYSIWYG editor for AsciiDoc that runs in the browser. You edit formatted
text, headings, lists, admonitions and code blocks; the editor reads and
writes plain AsciiDoc. Anything it does not understand is kept exactly as
written, so existing documents survive a load and save cycle.

It works in any web page without a framework, and there is a small React
wrapper for React apps.

## Try it

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. The left side is the editor, the right side
shows the AsciiDoc it produces as you type.

To open a demo without a dev server, build once and open
`apps/demo/standalone.html` in a browser:

```bash
pnpm build
```

For the React demo:

```bash
pnpm dev:react
```

## Editing

* Toolbar buttons or shortcuts for bold (Cmd/Ctrl+B), italic (Cmd/Ctrl+I),
  monospace (Cmd/Ctrl+E), highlight, superscript, subscript and links.
* Type AsciiDoc markers at the start of a line and they turn into blocks:
  `== ` for a section, `* ` or `. ` for a list, `NOTE: ` for an
  admonition, `----` for a code block.
* Tab and Shift+Tab nest and unnest list items. Shift+Enter inserts a hard
  line break.
* The sliders button opens the block properties panel for the block at the
  cursor: title, anchor id, roles, options and extra attributes, plus the
  language of a code block or the type of an admonition.
* The Source button switches to the raw AsciiDoc text and back.
* Tables, description lists, comments and other unsupported content appear
  as editable source boxes inside the document.

## Using it in your own page

Install the package and import it, or drop the two files from
`packages/editor/dist` into a page with a script and a link tag.

```ts
import { createAsciiDocEditor } from '@monoted/asciidoc-editor';
import '@monoted/asciidoc-editor/asciidoc-editor.css';

const editor = createAsciiDocEditor(document.getElementById('editor'), {
  value: '= Title\n\nHello *world*.',
  onChange: (text) => console.log(text),
});

editor.getValue();        // current AsciiDoc text
editor.setValue(text);
editor.setMode('source'); // or 'wysiwyg'
editor.setReadOnly(true);
editor.destroy();
```

Without a bundler:

```html
<link rel="stylesheet" href="asciidoc-editor.css">
<script src="asciidoc-editor.iife.js"></script>
<script>
  const editor = AsciiDocEditor.createAsciiDocEditor(container, { value: text });
</script>
```

Or as a custom element that posts its value with a normal form:

```html
<asciidoc-editor name="description">= Title ...</asciidoc-editor>
<script type="module">
  import { defineAsciiDocEditorElement } from '@monoted/asciidoc-editor';
  defineAsciiDocEditorElement();
</script>
```

React:

```tsx
import { AsciiDocEditor } from '@monoted/asciidoc-editor-react';

<AsciiDocEditor value={text} onChange={setText} />
```

### Options

| Option | What it does |
|---|---|
| `value` | Initial AsciiDoc text |
| `onChange` | Called with the current text after edits, debounced by `changeDebounceMs` (150 ms) |
| `mode` | `wysiwyg` (default) or `source` |
| `readOnly` | Disables editing |
| `toolbar` | List of item ids in the order you want, `'|'` for a separator, or `false` to hide it |
| `theme` | Colors, fonts, radius and spacing, applied as CSS variables |
| `colorScheme` | `light`, `dark` or `auto` |
| `classNames` | Extra CSS classes for the root, toolbar, buttons, content area and panels |
| `placeholder` | Placeholder text for an empty source editor |

### Styling

The stylesheet is self-contained and scoped under `.adoc-editor`, so it
does not clash with Bootstrap, Tailwind or anything else on the host page.
Change the look by overriding the `--adoc-*` CSS variables, by passing
`theme`, or by targeting the `adoc-*` classes directly. Set
`data-theme="dark"` on the editor element for dark mode.

## Supported AsciiDoc

Document title and header, sections, paragraphs, bold, italic, monospace,
highlight, superscript, subscript, links, cross references, attribute
references, hard line breaks, bullet, ordered and check lists with nesting
and continuations, the five admonitions, listing, source and literal
blocks, block images, includes, comments, and block title, id, roles and
options.

Everything else, such as tables, description lists, sidebars, quotes and
conditionals, is preserved verbatim and can be edited as source inside the
editor.

Saving normalizes formatting: one blank line between blocks, `*` bullets,
`.` numbering, `----` code fences.

## Project layout

* `packages/core` - parser and serializer, no UI
* `packages/editor` - the editor, `@monoted/asciidoc-editor`
* `packages/react` - React wrapper, `@monoted/asciidoc-editor-react`
* `apps/demo` - plain demo, `apps/demo-react` - React demo

## Commands

```bash
pnpm install     # once
pnpm dev         # demo with hot reload on port 5173
pnpm dev:react   # React demo on port 5174
pnpm build       # build all packages into their dist folders
pnpm test        # run the tests
pnpm lint        # check formatting and lint rules
pnpm lint:fix    # fix what can be fixed automatically
```

Requires Node 24 and pnpm 10.

## Not done yet

Source mode is a plain text area without highlighting. Tables and
description lists are edited as source, not as structured blocks. Text
typed in the editor that looks like AsciiDoc markup is not escaped. The
packages are not published to npm.
