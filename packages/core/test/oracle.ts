import {createRequire} from 'node:module';

/**
 * Asciidoctor.js as an independent oracle: two AsciiDoc texts are considered equivalent when
 * they convert to the same HTML after whitespace normalization.
 */

const require = createRequire(import.meta.url);

interface AsciidoctorModule {
    convert(text: string, options: Record<string, unknown>): Promise<string> | string;
}

let asciidoctor: AsciidoctorModule | null = null;

async function load(): Promise<AsciidoctorModule> {
    if (!asciidoctor) asciidoctor = require('asciidoctor') as AsciidoctorModule;
    return asciidoctor;
}

export async function toHtml(text: string): Promise<string> {
    const a = await load();
    const html = await a.convert(text, {
        standalone: false,
        safe: 'safe',
        attributes: {'source-highlighter!': ''},
    });
    return normalize(String(html));
}

export function normalize(html: string): string {
    return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
}
