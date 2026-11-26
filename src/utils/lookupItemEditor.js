import { slug } from './helpers.js';
/** Single-parent rows from earlier versions remain valid after the multi-parent upgrade. */
export function parentIdsOf(item) {
    const ids = Array.isArray(item?.parentItemIds) ? item.parentItemIds :
        item?.parentItemId != null ? [item.parentItemId] : [];
    return [...new Set(ids.filter(x => x !== null && x !== undefined && x !== '').map(String))];
}
export function validateLookupItemRows(rows, parentList = null) {
    if (!rows.length)
        return 'Add at least one item.';
    if (rows.length > 200)
        return 'A list can be created with up to 200 items at a time.';
    const seen = new Set();
    const available = new Set((parentList?.items || []).filter(i => i.active !== false).map(i => String(i.id)));
    for (const [index, row] of rows.entries()) {
        const code = slug(row.label);
        if (!String(row.label || '').trim() || !code)
            return `Row ${index + 1}: enter a valid item name.`;
        if (String(row.label).trim().length > 240)
            return `Row ${index + 1}: item name is too long (240 characters maximum).`;
        if (seen.has(code))
            return `Row ${index + 1}: duplicate item ${row.label}.`;
        seen.add(code);
        const parents = parentIdsOf(row);
        if (!parentList && parents.length)
            return `Row ${index + 1}: select a parent lookup first.`;
        if (parentList && !parents.length)
            return `Row ${index + 1}: select at least one parent item.`;
        if (parents.some(id => !available.has(id)))
            return `Row ${index + 1}: a selected parent item is unavailable.`;
    }
    return null;
}
export function lookupItemsFromRows(rows) {
    return rows.map((row, index) => ({
        label: String(row.label).trim(), code: slug(row.label), sortOrder: index + 1,
        active: true, parentItemIds: parentIdsOf(row), parentItemId: parentIdsOf(row)[0] ?? null,
    }));
}
/** Stored procedure input is expressed in parent *codes* so temporary UI IDs never reach SQL. */
export function lookupParentCodeLinks(items, parentList) {
    if (!parentList)
        return [];
    return items.map(item => {
        const parentCodes = parentIdsOf(item).map(id => {
            const parent = (parentList.items || []).find(p => String(p.id) === id && p.active !== false);
            if (!parent)
                throw new Error(`Unknown parent option for ${item.label || item.code}. Refresh the lookup and retry.`);
            return parent.code;
        });
        return { code: item.code || slug(item.label), parentCodes };
    });
}
