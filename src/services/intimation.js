export function intimationMessage(record, task, recipient, priority, reason) {
    if (!recipient?.email)
        throw Error('Assigned colleague has no email. Update their directory details first.');
    const subject = `Action required · ${priority} · ${record.reference}`;
    const body = `Dear ${recipient.name},\n\nThe ${record.reference} task (${record.title || 'case'}) needs your attention.\nPriority: ${priority}\nReason: ${reason}\n\nPlease open My Tasks and respond.\n\nWorkflow Platform`;
    return { to: recipient.email, subject, body };
}
export async function sendIntimation(payload) {
    const response = await fetch('/api/dev-intimation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({ ok: false, error: `Invalid notification response (HTTP ${response.status})` }));
    if (!response.ok || !data.ok)
        throw Error(data.error || `Notification error: ${response.status}`);
    return data;
}
