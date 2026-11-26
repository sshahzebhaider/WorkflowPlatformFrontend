/** Basic read-only checks against a locally running .NET API, using the dev identity header. */
const base = process.env.WORKFLOW_API_URL || 'http://127.0.0.1:5080';
const username = process.env.WORKFLOW_DEV_USER;
const url = new URL(base);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    console.error('This script only sends development identity headers to a loopback server.');
    process.exit(2);
}
if (!username) {
    console.error('Set WORKFLOW_DEV_USER to your provisioned SQL directory username first.');
    process.exit(2);
}
async function check(path, auth) {
    const response = await fetch(base.replace(/\/$/, '') + path, {
        headers: auth ? { 'X-Dev-User': username } : {}, signal: AbortSignal.timeout(10000)
    });
    const body = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(body);
    }
    catch {
        parsed = body;
    }
    console.log(`${response.status} GET ${path}`);
    if (!response.ok)
        throw new Error(typeof parsed === 'string' ? parsed : parsed.detail || parsed.title || 'Request rejected');
    return parsed;
}
try {
    await check('/health/live', false);
    await check('/health/ready', false);
    const me = await check('/api/me', true);
    console.log('Identity:', me.username, me.platformAdmin ? '(Platform Admin)' : '');
    const projects = await check('/api/projects', true);
    console.log('Accessible projects:', projects.length);
    if (projects.length) {
        const id = projects[0].id;
        await check(`/api/projects/${id}/permissions`, true);
        await check(`/api/projects/${id}/lookups`, true);
        await check(`/api/projects/${id}/cases?take=10`, true);
    }
    console.log('API connectivity checks passed.');
}
catch (e) {
    console.error('API connectivity check failed:', e.message);
    process.exitCode = 1;
}
