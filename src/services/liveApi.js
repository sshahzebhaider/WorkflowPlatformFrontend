/** SQL-backed workflow API client. No localStorage data writes or silently mocked responses. */
export const LIVE_API = import.meta.env.VITE_DATA_MODE !== 'mock';
const root = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
let currentDevUsername = '';
let tokenProvider = null;
export function setDevIdentity(username) { currentDevUsername = username || ''; }
/** Configure this with your OIDC/MSAL acquisition function in a real SSO deployment. */
export function setTokenProvider(provider) { tokenProvider = provider; }
export class ApiError extends Error {
    constructor(message, status, traceId) { super(message); this.name = 'ApiError'; this.status = status; this.traceId = traceId; }
}
export async function apiRequest(path, { method = 'GET', body, signal, idempotencyKey, devUser, headers: extraHeaders, raw = false } = {}) {
    const headers = { Accept: 'application/json', ...(extraHeaders || {}) };
    if (body !== undefined && !(body instanceof FormData))
        headers['Content-Type'] = 'application/json';
    const token = await tokenProvider?.();
    if (token)
        headers.Authorization = `Bearer ${token}`;
    else if (import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'jwt') {
        const name = devUser || currentDevUsername;
        if (name)
            headers['X-Dev-User'] = name;
    }
    if (idempotencyKey)
        headers['Idempotency-Key'] = idempotencyKey;
    let res;
    try {
        res = await fetch(`${root}${path}`, {
            method, headers, signal,
            body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
    }
    catch (error) {
        throw new ApiError(`Cannot reach the .NET API at ${root}. Check that it is running and Vite's proxy points to port 5080. ${error.message}`, 0);
    }
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(data.detail || data.title || `API request failed (${res.status})`, res.status, data.traceId);
    }
    if (raw)
        return res;
    if (res.status === 204)
        return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}
export const get = (path, options) => apiRequest(path, options);
export const post = (path, body, options) => apiRequest(path, { ...options, body, method: 'POST' });
export const upload = (path, fields, file) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields || {}))
        if (value != null)
            form.append(key, String(value));
    form.append('file', file, file.name);
    return apiRequest(path, { method: 'POST', body: form });
};
export async function download(path, filename = 'attachment') {
    const response = await apiRequest(path, { raw: true });
    const data = await response.blob();
    const href = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function newIdempotencyKey() {
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    return Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
}
