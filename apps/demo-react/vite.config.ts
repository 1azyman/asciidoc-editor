import {fileURLToPath} from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

const src = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@monoted/asciidoc-editor-core': src('../../packages/core/src/index.ts'),
            '@monoted/asciidoc-editor-react': src('../../packages/react/src/index.tsx'),
            '@monoted/asciidoc-editor': src('../../packages/editor/src/index.ts'),
        },
    },
});
