import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

export default defineConfig({
    plugins: [tailwindcss()],
    build: {
        sourcemap: true,
        lib: {
            entry: 'src/index.ts',
            name: 'AsciiDocEditor',
            formats: ['es', 'iife'],
            fileName: (format) => (format === 'es' ? 'asciidoc-editor.js' : 'asciidoc-editor.iife.js'),
            cssFileName: 'asciidoc-editor',
        },
    },
});
