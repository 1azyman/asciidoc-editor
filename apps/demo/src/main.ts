import {createAsciiDocEditor} from '@monoted/asciidoc-editor';
import sample from './sample.adoc?raw';

const output = document.getElementById('output') as HTMLPreElement;
const container = document.getElementById('editor') as HTMLDivElement;

const editor = createAsciiDocEditor(container, {
    value: sample,
    onChange: (value) => {
        output.textContent = value;
    },
});
output.textContent = editor.getValue();

(document.getElementById('dark') as HTMLInputElement).addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    if (on) editor.element.setAttribute('data-theme', 'dark');
    else editor.element.removeAttribute('data-theme');
});

(document.getElementById('readonly') as HTMLInputElement).addEventListener('change', (e) => {
    editor.setReadOnly((e.target as HTMLInputElement).checked);
});

document.getElementById('reset')?.addEventListener('click', () => {
    editor.setValue(sample);
    output.textContent = editor.getValue();
});

// Handy for poking around in the browser console.
Object.assign(window, {editor});
