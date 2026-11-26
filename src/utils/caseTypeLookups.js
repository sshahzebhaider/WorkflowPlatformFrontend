import { availableLookups, slug } from './helpers.js';
/** Stable field descriptors generated from the lookup lists configured for a case type. */
export function caseTypeLookupFields(db, project, type) {
    const lists = availableLookups(db, project);
    const lookupById = new Map(lists.map(x => [x.id, x]));
    const requested = (type?.lookupListIds || []).map(id => lookupById.get(id)).filter(Boolean);
    const withParents = [];
    const visited = new Set();
    function addAncestors(list, stack = new Set()) {
        if (!list || stack.has(list.id) || visited.has(list.id))
            return;
        const next = new Set(stack);
        next.add(list.id);
        addAncestors(lookupById.get(list.parentListId), next);
        visited.add(list.id);
        withParents.push(list);
    }
    requested.forEach(l => addAncestors(l));
    const key = list => `classification_${slug(list.code || list.name).toLowerCase()}`;
    const required = new Set(type?.requiredLookupIds || []);
    // A required child list also needs a parent choice so its options can be selected.
    for (const id of [...required]) {
        let current = lookupById.get(id);
        const seen = new Set();
        while (current?.parentListId && !seen.has(current.id)) {
            seen.add(current.id);
            required.add(current.parentListId);
            current = lookupById.get(current.parentListId);
        }
    }
    return withParents.map(list => ({
        id: `case-type-${list.id}`, key: key(list), label: list.name, type: 'select',
        lookupId: list.id,
        parentFieldKey: list.parentListId && visited.has(list.parentListId) ? key(lookupById.get(list.parentListId)) : null,
        required: required.has(list.id),
        isClassification: true,
    }));
}
