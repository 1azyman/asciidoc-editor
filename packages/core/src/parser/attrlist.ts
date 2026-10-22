/**
 * Parsing and formatting of AsciiDoc block attribute lists: `[source,java,linenums,id=x]`,
 * including the shorthand in the first positional attribute: `[NOTE#id.role%option]`.
 */

export interface AttrList {
    positional: string[];
    named: Record<string, string>;
    id: string | null;
    roles: string[];
    options: string[];
}

export function emptyAttrList(): AttrList {
    return {positional: [], named: {}, id: null, roles: [], options: []};
}

function splitParts(raw: string): string[] {
    const parts: string[] = [];
    let current = '';
    let quote: string | null = null;
    for (const ch of raw) {
        if (quote) {
            current += ch;
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
        } else if (ch === ',') {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts.map((p) => p.trim());
}

function unquote(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        if ((first === '"' || first === "'") && value.endsWith(first)) {
            return value.slice(1, -1);
        }
    }
    return value;
}

export function parseAttrList(raw: string): AttrList {
    const result = emptyAttrList();
    if (raw.trim() === '') return result;
    const parts = splitParts(raw);
    for (const part of parts) {
        const named = /^([A-Za-z_][\w-]*)=(.*)$/.exec(part);
        if (named) {
            result.named[named[1] as string] = unquote(named[2] as string);
        } else {
            result.positional.push(unquote(part));
        }
    }

    const first = result.positional[0];
    if (first !== undefined) {
        const shorthand = /^([^#.%]*)((?:[#.%][^#.%]+)*)$/.exec(first);
        if (shorthand?.[2]) {
            result.positional[0] = shorthand[1] as string;
            for (const token of shorthand[2].match(/[#.%][^#.%]+/g) ?? []) {
                const value = token.slice(1);
                if (token[0] === '#') result.id = value;
                else if (token[0] === '.') result.roles.push(value);
                else result.options.push(value);
            }
        }
    }

    if (result.named.id !== undefined) {
        result.id = result.named.id;
        delete result.named.id;
    }
    if (result.named.role !== undefined) {
        result.roles.push(...result.named.role.split(/\s+/).filter(Boolean));
        delete result.named.role;
    }
    for (const key of ['opts', 'options']) {
        const value = result.named[key];
        if (value !== undefined) {
            result.options.push(
                ...value
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean),
            );
            delete result.named[key];
        }
    }
    return result;
}

export function firstPositional(attr: AttrList | null): string {
    return attr?.positional[0] ?? '';
}

/**
 * Attribute list parts a block did not consume: positional entries after `consumedPositional`
 * and named entries other than `consumedNamed`, as strings ready to be re-emitted.
 */
export function leftoverParts(
    attr: AttrList | null,
    consumedPositional: number,
    consumedNamed: string[] = [],
): string[] {
    if (!attr) return [];
    const parts = attr.positional.slice(consumedPositional).map(quoteIfNeeded);
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    for (const [key, value] of Object.entries(attr.named)) {
        if (!consumedNamed.includes(key)) parts.push(`${key}=${quoteIfNeeded(value)}`);
    }
    return parts;
}

export function quoteIfNeeded(value: string): string {
    return /[,"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export interface AttrLineInput {
    id: string | null;
    roles: string[];
    options: string[];
    extraAttrs: string[];
}

/** Builds `[first#id.role%opt,rest...]` or returns null when there is nothing to emit. */
export function formatAttrLine(known: string[], meta: AttrLineInput): string | null {
    const parts = [...known, ...meta.extraAttrs];
    let shorthand = '';
    if (meta.id) shorthand += `#${meta.id}`;
    for (const role of meta.roles) shorthand += `.${role}`;
    for (const option of meta.options) shorthand += `%${option}`;
    if (shorthand) {
        if (parts.length === 0) parts.push(shorthand);
        else parts[0] = `${parts[0]}${shorthand}`;
    }
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    if (parts.length === 0) return null;
    return `[${parts.join(',')}]`;
}
