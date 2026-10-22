import {fileURLToPath} from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

const src = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** The demo runs against package sources so edits in packages/* reload without a build. */
export default defineConfig({
    plugins: [tailwindcss()],
    resolve: {
        alias: {
            '@monoted/asciidoc-editor-core': src('../../packages/core/src/index.ts'),
            '@monoted/asciidoc-editor': src('../../packages/editor/src/index.ts'),
        },
    },
    server: {port: 5173},
});
