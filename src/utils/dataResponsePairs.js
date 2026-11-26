/**
 * Present approved API responses as read-only field/value pairs.
 * Handles objects, arrays and APIs that return JSON *encoded as a string*.
 * Never interprets strings as HTML or executes content.
 */
export function parseStructuredResponse(value) {
    if (typeof value !== 'string' || value.length > 262144)
        return value;
    const text = value.trim();
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))))
        return value;
    try {
        return JSON.parse(text);
    }
    catch {
        return value;
    }
}
export function responseFieldPairs(data, limit = 160) {
    const rows = [];
    function visit(original, path = '', depth = 0) {
        if (rows.length >= limit)
            return;
        const value = parseStructuredResponse(original);
        if (depth > 10) {
            rows.push({ path: path || 'Value', value: '[nested data]' });
            return;
        }
        if (Array.isArray(value)) {
            if (!value.length)
                rows.push({ path: path || 'Result', value: '[]' });
            for (let index = 0; index < value.length && rows.length < limit; index++)
                visit(value[index], `${path}[${index}]`, depth + 1);
            return;
        }
        if (value && typeof value === 'object') {
            const entries = Object.entries(value);
            if (!entries.length)
                rows.push({ path: path || 'Result', value: '{}' });
            for (const [key, item] of entries) {
                if (rows.length >= limit)
                    break;
                visit(item, path ? `${path}.${key}` : key, depth + 1);
            }
            return;
        }
        const text = value === null || value === undefined ? '—' : String(value);
        rows.push({ path: path || 'Value', value: text.length > 240 ? `${text.slice(0, 240)}…` : text });
    }
    visit(data);
    return rows;
}
/** Flatten server-provided {path,value} rows as well, including JSON-encoded values. */
export function mappedResponseFieldPairs(fields, limit = 160) {
    if (!Array.isArray(fields))
        return [];
    const rows = [];
    for (const field of fields) {
        if (rows.length >= limit)
            break;
        const key = String(field?.path ?? field?.Path ?? field?.key ?? field?.Key ?? `Field ${rows.length + 1}`);
        const value = field?.value ?? field?.Value;
        const parsed = parseStructuredResponse(value);
        if (parsed !== value || (parsed && typeof parsed === 'object')) {
            for (const pair of responseFieldPairs(parsed, limit - rows.length))
                rows.push({ path: pair.path === 'Value' ? key : pair.path.startsWith('[') ? `${key}${pair.path}` : `${key}.${pair.path}`, value: pair.value });
        }
        else {
            const text = value == null ? '—' : String(value);
            rows.push({ path: key, value: text.length > 240 ? `${text.slice(0, 240)}…` : text });
        }
    }
    return rows;
}

/** Build dropdown rows using the authorized projections, not the raw API payload. */
export function responseRecordRows(records = []) {
    const projections = records.map(record => new Map((Array.isArray(record.fields)
        ? mappedResponseFieldPairs(record.fields) : responseFieldPairs(record.payload))
        .map(({path,value}) => [path,value])));
    const paths = [...new Set(projections.flatMap(row => [...row.keys()]))];
    return paths.map(path => ({ path, options: projections.map((row,index) => ({
        value: index, label: row.get(path) ?? '—'
    })) }));
}
