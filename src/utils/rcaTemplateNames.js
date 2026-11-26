/** Keep code generation aligned with writeWorkspace's RCA template payload (75 chars). */
export const rcaTemplateCode = name => String(name || '').trim().toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 75);
/** Detect a duplicate generated SQL unique code (and an identical display name). */
export function duplicateRcaTemplate(templates, candidate, excludeId = null) {
    const code = rcaTemplateCode(candidate);
    const name = String(candidate || '').trim().toLocaleLowerCase();
    return (templates || []).find(t => String(t.id) !== String(excludeId)
        && (rcaTemplateCode(t.code || t.name) === code
            || String(t.name || '').trim().toLocaleLowerCase() === name)) || null;
}
