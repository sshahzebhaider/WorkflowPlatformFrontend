/** Declarative REST operation contract shared by the designer, mock runner and case-type setup.
 * Legacy {{name}} placeholders remain supported for existing saved operations.
 */
export const requestLocations = ['path', 'query', 'body', 'header'];
export const requestTypes = ['string', 'number', 'boolean', 'object'];
const token = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;
const keyPattern = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
const nestedKeyPattern = /^[A-Za-z_][A-Za-z0-9_-]{0,99}(?:\.[A-Za-z_][A-Za-z0-9_-]{0,99}){0,5}$/;
const queryKeyPattern = /^[A-Za-z_][A-Za-z0-9_-]{0,99}$/;
const headerPattern = /^(x-[a-z0-9-]+|accept)$/i;
const tokens = value => [...String(value || '').matchAll(token)].map(m => m[1]);
const template = operation => typeof operation?.requestTemplate === 'string' ? operation.requestTemplate : JSON.stringify(operation?.requestTemplate || {});
export function operationInputDefinitions(operation) {
    const declared = (operation?.requestParameters || []).map(p => ({ ...p, name: String(p.name || '').trim() })).filter(p => p.name);
    const pathTokens = tokens(operation?.path), bodyTokens = tokens(template(operation));
    const extras = [...new Set([...pathTokens, ...bodyTokens])]
        .filter(name => !declared.some(p => p.name === name)).map(name => ({
        name, location: pathTokens.includes(name) ? 'path' : 'body', key: name, type: 'string', required: true, implicit: true
    }));
    return [...declared, ...extras];
}
export function operationInputs(operation) {
    return operationInputDefinitions(operation).filter(p => p.required !== false && (p.defaultValue === undefined || p.defaultValue === null || p.defaultValue === '')).map(p => p.name);
}
export function validateOperationContract(operation) {
    if (!operation?.name?.trim())
        throw Error('Operation name is required.');
    if (!/^\/(?!\/)/.test(operation.path || '') || /\.\.|#/.test(operation.path))
        throw Error('Use a safe relative API path beginning with /, without .. or #.');
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(operation.method))
        throw Error('Choose a valid HTTP method.');
    if (operation.requestTemplate && (typeof operation.requestTemplate === 'string')) {
        try {
            JSON.parse(operation.requestTemplate);
        }
        catch {
            throw Error('Request template must be valid JSON; put placeholders inside quoted strings.');
        }
    }
    if (operation.requestTemplate && operation.method === 'GET' && Object.keys(typeof operation.requestTemplate === 'string' ? JSON.parse(operation.requestTemplate) : operation.requestTemplate).length)
        throw Error('GET requests cannot have a JSON body.');
    const defined = new Set();
    for (const p of operation.requestParameters || []) {
        if (!keyPattern.test(p.name || ''))
            throw Error(`Input name '${p.name || ''}' must contain letters, digits and underscores, starting with a letter.`);
        if (defined.has(p.name))
            throw Error(`Duplicate input '${p.name}'.`);
        defined.add(p.name);
        if (!requestLocations.includes(p.location))
            throw Error(`Choose the destination for input '${p.name}'.`);
        if (!requestTypes.includes(p.type || 'string'))
            throw Error(`Invalid type for '${p.name}'.`);
        if (p.location === 'header' && !headerPattern.test(p.key || ''))
            throw Error(`Header '${p.key}' is not allowed. Use X-* or Accept; configure credentials on the server.`);
        if (p.location === 'body' && !nestedKeyPattern.test(p.key || ''))
            throw Error(`Invalid JSON body key for '${p.name}'.`);
        if (['path', 'query'].includes(p.location) && !queryKeyPattern.test(p.key || ''))
            throw Error(`Invalid request key for '${p.name}'.`);
        if (p.location !== 'body' && p.key.includes('.'))
            throw Error('Only JSON body keys may contain dot-separated paths.');
        if (p.location === 'header' && !headerPattern.test(p.key))
            throw Error(`Header '${p.key}' is not allowed. Use X-* or Accept; configure credentials on the server.`);
        if (p.location === 'path' && !tokens(operation.path).includes(p.name))
            throw Error(`Put {{${p.name}}} into the relative path before saving.`);
        if (p.location === 'body' && ['GET', 'DELETE'].includes(operation.method))
            throw Error(`${operation.method} operations cannot have mapped body parameters.`);
        if (p.defaultValue !== undefined && p.defaultValue !== null && p.defaultValue !== '')
            convertParameterValue(p, p.defaultValue);
    }
    const requestKeys = new Set();
    for (const p of operation.requestParameters || []) {
        const key = `${p.location}:${p.key}`;
        if (p.location !== 'path' && requestKeys.has(key))
            throw Error(`Duplicate ${p.location} destination '${p.key}'.`);
        requestKeys.add(key);
    }
    return true;
}
export function convertParameterValue(param, value) {
    if (param.type === 'number') {
        if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)))
            throw Error(`Input '${param.name}' must be numeric.`);
        return Number(value);
    }
    if (param.type === 'boolean') {
        if (value === true || value === 'true' || value === 1 || value === '1')
            return true;
        if (value === false || value === 'false' || value === 0 || value === '0')
            return false;
        throw Error(`Input '${param.name}' must be true or false.`);
    }
    if (param.type === 'object') {
        if (typeof value === 'object' && value !== null)
            return value;
        try {
            const parsed = JSON.parse(String(value));
            if (typeof parsed === 'object' && parsed !== null)
                return parsed;
        }
        catch { }
        throw Error(`Input '${param.name}' must be JSON object/array.`);
    }
    if (typeof value === 'object')
        throw Error(`Input '${param.name}' must be a string.`);
    return String(value);
}
const missingValue = value => value === undefined || value === null || value === '';
function setNested(target, path, value) {
    const parts = path.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (node[k] === undefined)
            node[k] = {};
        if (!node[k] || typeof node[k] !== 'object' || Array.isArray(node[k]))
            throw Error(`Cannot map JSON field '${path}' over a scalar value.`);
        node = node[k];
    }
    node[parts.at(-1)] = value;
}
function expandText(text, values, escape = false) {
    return String(text).replace(token, (_, name) => {
        if (missingValue(values[name]))
            throw Error(`Missing data source input: ${name}`);
        const out = String(values[name]);
        return escape ? encodeURIComponent(out) : out;
    });
}
function expandJson(value, inputs) {
    if (typeof value === 'string') {
        const whole = value.match(/^\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}$/);
        if (whole) {
            if (missingValue(inputs[whole[1]]))
                throw Error(`Missing data source input: ${whole[1]}`);
            return inputs[whole[1]];
        }
        return expandText(value, inputs);
    }
    if (Array.isArray(value))
        return value.map(v => expandJson(v, inputs));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandJson(v, inputs)]));
    return value;
}
/** Creates a preview of the exact typed request the REST executor sends, minus server secrets. */
export function prepareMappedRequest(operation, inputValues = {}) {
    validateOperationContract({ ...operation, name: operation?.name || 'Existing operation', method: operation?.method || 'GET' });
    operation = { ...operation, method: operation.method || 'GET' };
    const params = operationInputDefinitions(operation);
    const values = { ...inputValues };
    for (const p of params) {
        if (missingValue(values[p.name]) && !missingValue(p.defaultValue))
            values[p.name] = p.defaultValue;
        if (missingValue(values[p.name])) {
            if (p.required !== false)
                throw Error(`Missing data source input: ${p.name}`);
            continue;
        }
        values[p.name] = p.implicit ? values[p.name] : convertParameterValue(p, values[p.name]);
    }
    let path = expandText(operation.path, values, true);
    const query = new URLSearchParams();
    const headers = { ...operation.headers };
    const raw = operation.requestTemplate;
    let body = raw ? expandJson(typeof raw === 'string' ? JSON.parse(raw) : raw, values) : undefined;
    for (const p of operation.requestParameters || []) {
        const value = values[p.name];
        if (missingValue(value))
            continue;
        if (p.location === 'query')
            query.append(p.key, String(value));
        if (p.location === 'header')
            headers[p.key] = String(value);
        if (p.location === 'body') {
            if (body === undefined)
                body = {};
            if (!body || typeof body !== 'object' || Array.isArray(body))
                throw Error('JSON body template must be an object for mapped body inputs.');
            setNested(body, p.key, value);
        }
    }
    if (query.size)
        path += `${path.includes('?') ? '&' : '?'}${query.toString()}`;
    return { method: operation.method, path, body, headers };
}
