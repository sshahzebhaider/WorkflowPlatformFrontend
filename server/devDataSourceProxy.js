/** Development-only, allowlisted API relay. NOT a production integration gateway. */
import { URL } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const json = (res, status, data) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data)); };
async function bodyOf(req) { let raw = ''; for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 128000)
        throw Error('Request exceeds 128 KB');
} return JSON.parse(raw); }
function privateIP(ip) { if (!ip)
    return true; const x = ip.toLowerCase(); if (x.includes(':'))
    return x === '::1' || x.startsWith('fe80:') || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('::ffff:127.'); const bytes = x.split('.').map(Number); return bytes[0] === 10 || bytes[0] === 127 || bytes[0] === 0 || bytes[0] === 169 && bytes[1] === 254 || bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31 || bytes[0] === 192 && bytes[1] === 168 || bytes[0] >= 224; }
export function dataSourceProxy(env = {}) {
    const allow = new Set(['jsonplaceholder.typicode.com', ...String(env.DATA_SOURCE_ALLOWED_HOSTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)]);
    const allowLocal = String(env.DATA_SOURCE_ALLOW_LOCAL_HTTP || '').toLowerCase() === 'true';
    return { name: 'workflow-dev-data-source-proxy', configureServer(server) {
            server.middlewares.use('/api/dev-data-source', async (req, res) => {
                if (req.method !== 'POST')
                    return json(res, 405, { error: 'POST required' });
                try {
                    const input = await bodyOf(req);
                    const { sourceCode, baseUrl, operation } = input;
                    if (!baseUrl || !operation?.path)
                        throw Error('Incomplete operation configuration');
                    const base = new URL(baseUrl);
                    if (base.username || base.password)
                        throw Error('Credentials must not be embedded in the URL');
                    if (!/^https?:$/.test(base.protocol))
                        throw Error('Only HTTP(S) URLs are supported');
                    if (!allow.has(base.host.toLowerCase()))
                        throw Error(`Host ${base.host} not in DATA_SOURCE_ALLOWED_HOSTS`);
                    if (base.protocol !== 'https:' && !(allowLocal && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(base.hostname.toLowerCase())))
                        throw Error('HTTPS required; local HTTP needs DATA_SOURCE_ALLOW_LOCAL_HTTP=true');
                    const target = new URL(operation.path.replace(/^\/+/, ''), base.href.replace(/\/?$/, '/'));
                    if (target.origin !== base.origin)
                        throw Error('Operation path cannot change the configured host');
                    if (target.username || target.password)
                        throw Error('Credentials in target URLs are forbidden');
                    const ip = isIP(target.hostname) ? [{ address: target.hostname }] : await lookup(target.hostname, { all: true });
                    if (ip.some(x => privateIP(x.address)) && !(allowLocal && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname.toLowerCase())))
                        throw Error('Private/internal network addresses are not supported by this demo proxy');
                    const method = String(operation.method || 'GET').toUpperCase();
                    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
                        throw Error('Invalid HTTP method');
                    if (base.hostname.toLowerCase() === 'jsonplaceholder.typicode.com' && method !== 'GET')
                        throw Error('The built-in JSONPlaceholder sandbox is read-only (GET only)');
                    const headers = { 'accept': 'application/json', 'content-type': 'application/json' };
                    for (const [key, value] of Object.entries(input.headers || {}))
                        if (/^(x-[\w-]+|accept|content-type)$/i.test(key) && typeof value === 'string')
                            headers[key] = value;
                    const token = env[`DATA_SOURCE_TOKEN_${String(sourceCode || '').replace(/[^A-Z0-9_]/gi, '_').toUpperCase()}`];
                    if (token)
                        headers.Authorization = `Bearer ${token}`;
                    const upstream = await fetch(target, { method, headers, body: ['GET', 'DELETE'].includes(method) ? undefined : JSON.stringify(operation.body ?? {}), signal: AbortSignal.timeout(10000), redirect: 'manual' });
                    if (upstream.status >= 300 && upstream.status < 400)
                        throw Error('Redirects are blocked by the development proxy');
                    const text = await upstream.text();
                    if (text.length > 1024 * 1024)
                        throw Error('Response exceeds 1 MB');
                    let value;
                    try {
                        value = JSON.parse(text);
                    }
                    catch {
                        value = { text: text.slice(0, 4096) };
                    }
                    json(res, upstream.ok ? 200 : upstream.status, { ok: upstream.ok, status: upstream.status, body: value, error: upstream.ok ? null : `Upstream returned HTTP ${upstream.status}` });
                }
                catch (error) {
                    json(res, 400, { ok: false, error: error.message || 'Integration test failed' });
                }
            });
        } };
}
