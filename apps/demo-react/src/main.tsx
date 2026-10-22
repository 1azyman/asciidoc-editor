import {AsciiDocEditor} from '@monoted/asciidoc-editor-react';
import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import sample from '../../demo/src/sample.adoc?raw';

function App() {
    const [value, setValue] = useState(sample);
    const [readOnly, setReadOnly] = useState(false);
    return (
        <div className="page">
            <p>
                <strong>AsciiDoc editor React demo</strong>{' '}
                <label>
                    <input
                        type="checkbox"
                        checked={readOnly}
                        onChange={(e) => setReadOnly(e.target.checked)}
                    />{' '}
                    read only
                </label>
            </p>
            <div className="split">
                <AsciiDocEditor value={value} onChange={setValue} readOnly={readOnly}/>
                <textarea className="raw" value={value} onChange={(e) => setValue(e.target.value)}/>
            </div>
        </div>
    );
}

createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
        <App/>
    </StrictMode>,
);
