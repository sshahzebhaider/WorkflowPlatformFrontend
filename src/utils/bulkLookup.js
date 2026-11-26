import { slug } from './helpers.js';
/** Each line: `Label` or `Label | PARENT_ITEM_CODE` for a dependent list. */
export function parseBulkLookupItems(text, existingItems = [], parentList = null, defaultParentItemId = null) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const errors = [];
    if (!lines.length)
        errors.push('Enter at least one item.');
    if (lines.length > 200)
        errors.push('Add up to 200 items in one batch.');
    const used = new Set(existingItems.map(x => x.code));
    const prepared = [];
    for (const [index, raw] of lines.entries()) {
        if (index >= 200)
            break;
        const segments = raw.split('|').map(x => x.trim());
        const label = segments[0], code = slug(label);
        if (!label || !code) {
            errors.push(`Line ${index + 1}: item label is missing or invalid.`);
            continue;
        }
        if (segments.length > 2) {
            errors.push(`Line ${index + 1}: use only one | separator.`);
            continue;
        }
        if (used.has(code)) {
            errors.push(`Line ${index + 1}: duplicate item code ${code}.`);
            continue;
        }
        let parentItemId = null;
        if (parentList) {
            if (segments[1]) {
                const wanted = slug(segments[1]);
                const parent = (parentList.items || []).find(x => x.active !== false && (x.code === wanted || slug(x.label) === wanted));
                if (!parent) {
                    errors.push(`Line ${index + 1}: parent item ${segments[1]} not found.`);
                    continue;
                }
                parentItemId = parent.id;
            }
            else {
                parentItemId = defaultParentItemId || null;
            }
            if (!parentItemId || !(parentList.items || []).some(x => x.id === parentItemId && x.active !== false)) {
                errors.push(`Line ${index + 1}: select a valid parent item or write Label | PARENT_CODE.`);
                continue;
            }
        }
        else if (segments[1]) {
            errors.push(`Line ${index + 1}: parent code is only valid for a child lookup list.`);
            continue;
        }
        used.add(code);
        prepared.push({ label, code, parentItemId, active: true, sortOrder: existingItems.length + prepared.length + 1 });
    }
    return { items: errors.length ? [] : prepared, errors };
}
