import { slug } from './helpers.js';
/** Resolve persisted classification codes to the option labels configured for that Case Type.
 * SQL stores item codes, not labels; use the case's published lookup IDs first. */
export function caseClassificationRows(record, db, project) {
    const values = record?.classificationValues || {};
    const fields = Array.isArray(record?.classificationSnapshot) ? record.classificationSnapshot : [];
    const config = record?.caseTypeSnapshot || {};
    const ids = new Set([...(config.lookupListIds || []), ...fields.map(f => f.lookupId)].filter(x => x != null).map(String));
    const allLists = (db?.lookups || []).filter(list => list && (String(list.projectId) === String(project?.id) || String(list.scope).toLowerCase() === 'global'));
    const keyForList = list => `classification_${slug(list.code || list.name).toLowerCase()}`;
    const readableKey = key => String(key).replace(/^classification_/i, '').replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    const matchesValue = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    const getLabel = (list, input) => {
        if (Array.isArray(input))
            return input.map(v => getLabel(list, v)).join(', ');
        if (input == null || input === '')
            return '—';
        const option = list?.items?.find(item => matchesValue(item.id, input) || matchesValue(item.code, input));
        return option?.label || String(input);
    };
    return Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([key, raw]) => {
        const field = fields.find(f => f.key === key);
        const selected = allLists.filter(list => ids.has(String(list.id)));
        // Legacy records may not carry a list-ID snapshot. Limit fallback to same-project lists.
        const candidates = selected.length ? selected : allLists.filter(list => String(list.projectId) === String(project?.id));
        const list = candidates.find(l => String(l.id) === String(field?.lookupId)) ||
            candidates.find(l => keyForList(l) === key);
        return { key, label: field?.label || list?.name || readableKey(key), value: getLabel(list, raw) };
    });
}
