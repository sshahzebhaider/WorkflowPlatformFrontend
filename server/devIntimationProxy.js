/** Development-only manager email escalation. Preview by default; never claim email was sent in preview mode. */
const send = (res, status, data) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data)); };
const isEmail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 254;
export function validateIntimation(payload) {
    if (!payload || typeof payload !== 'object')
        throw Error('Invalid intimation request');
    const { to, subject, body, operationId } = payload;
    if (!isEmail(to))
        throw Error('Assigned user has no valid email address');
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 200)
        throw Error('Invalid email subject');
    if (typeof body !== 'string' || !body.trim() || body.length > 4000)
        throw Error('Invalid email body');
    if (typeof operationId !== 'string' || operationId.length < 10 || operationId.length > 160)
        throw Error('Invalid intimation operation ID');
    return payload;
}
export function intimationProxy(env = {}) {
    const mode = String(env.NOTIFICATION_DELIVERY_MODE || 'preview').toLowerCase();
    const allowed = new Set(String(env.NOTIFICATION_ALLOWED_RECIPIENTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const accepted = new Set();
    return { name: 'workflow-dev-force-intimation', configureServer(server) {
            server.middlewares.use('/api/dev-intimation', async (req, res) => {
                if (req.method !== 'POST')
                    return send(res, 405, { ok: false, error: 'POST required' });
                try {
                    let raw = '';
                    for await (const chunk of req) {
                        raw += chunk;
                        if (raw.length > 16000)
                            throw Error('Request too large');
                    }
                    const payload = validateIntimation(JSON.parse(raw));
                    if (mode === 'preview')
                        return send(res, 200, { ok: true, mode: 'preview', message: 'Email preview generated — no email was sent', recipient: payload.to, subject: payload.subject, body: payload.body });
                    if (mode !== 'live')
                        throw Error('Unsupported notification delivery mode');
                    if (!allowed.has(payload.to.toLowerCase()))
                        throw Error('Recipient is not in NOTIFICATION_ALLOWED_RECIPIENTS');
                    if (!env.NOTIFICATION_RESEND_API_KEY || !isEmail(env.NOTIFICATION_FROM_EMAIL))
                        throw Error('Resend provider and sender must be configured server-side');
                    if (accepted.has(payload.operationId))
                        return send(res, 200, { ok: true, mode: 'live', message: 'Previously accepted by email provider' });
                    const result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${env.NOTIFICATION_RESEND_API_KEY}`, 'Idempotency-Key': payload.operationId }, body: JSON.stringify({ from: env.NOTIFICATION_FROM_EMAIL, to: [payload.to], subject: payload.subject, text: payload.body }), signal: AbortSignal.timeout(12000) });
                    if (!result.ok)
                        throw Error(`Email provider rejected the message (HTTP ${result.status})`);
                    accepted.add(payload.operationId);
                    return send(res, 200, { ok: true, mode: 'live', message: 'Email accepted by provider, delivery not yet confirmed' });
                }
                catch (error) {
                    send(res, 400, { ok: false, error: error?.message || 'Intimation could not be processed' });
                }
            });
        } };
}
