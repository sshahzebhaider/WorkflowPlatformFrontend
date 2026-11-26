import { parentIdsOf } from './lookupItemEditor.js';
/** Options for a standalone or dependent lookup. Item links use stable IDs; form values use item codes. */
export function lookupChoices(lists, lookupId, parentCode) {
    const list = lists.find(x => x.id === lookupId);
    if (!list || list.active === false)
        return [];
    let rows = (list.items || []).filter(i => i.active !== false);
    if (list.parentListId) {
        const parent = lists.find(x => x.id === list.parentListId);
        const parentItem = parent?.items?.find(i => i.code === parentCode && i.active !== false);
        if (!parentItem)
            return [];
        rows = rows.filter(i => parentIdsOf(i).includes(String(parentItem.id)));
    }
    return rows.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(i => ({ label: i.label, value: i.code }));
}
/** All child form fields that must be cleared after a parent field value changes. */
export function dependentFieldKeys(fields, changedKey) {
    const found = new Set();
    let pending = [changedKey];
    while (pending.length) {
        const current = pending.pop();
        for (const f of fields) {
            if (f.parentFieldKey === current && !found.has(f.key)) {
                found.add(f.key);
                pending.push(f.key);
            }
        }
    }
    return [...found];
}
