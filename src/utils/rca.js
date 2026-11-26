import { uid } from './helpers.js';
import { rcaFieldsOf, rcaValidationError } from './rcaFields.js';
const now = () => new Date().toISOString();
export function rcaRequired(projectOrConfig) {
    const config = projectOrConfig?.rcaConfig || projectOrConfig;
    return Boolean(config?.enabled && config?.requiredOnClose);
}
/** Transform a completed workflow into a case awaiting root-cause analysis. */
export function gateCaseClosure(record, config) {
    if (!['Closed', 'Rejected'].includes(record.status) || !rcaRequired(config) || record.rca?.completedAt)
        return record;
    const updated = structuredClone(record);
    updated.rcaPendingFinalStatus = record.status;
    updated.status = 'Pending RCA';
    updated.closedAt = null;
    updated.updatedAt = now();
    updated.runtime ||= { tasks: [], events: [], waiting: [] };
    updated.runtime.events ||= [];
    if (!updated.runtime.events.some(x => x.kind === 'rca-required'))
        updated.runtime.events.push({
            id: uid(),
            kind: 'rca-required', at: now(), message: 'Workflow completed; RCA is required before case closure.'
        });
    return updated;
}
export function closeCaseWithRca(record, values, actorId, config) {
    if (record.status !== 'Pending RCA')
        throw new Error('This case is not waiting for RCA.');
    const settings = config?.rcaConfig || config || {};
    const templateOnly = Array.isArray(settings.fields);
    if (!templateOnly && !String(values.summary || '').trim())
        throw new Error('RCA summary is required.');
    if (!templateOnly && settings.reasonLookupId && !values.reasonCode)
        throw new Error('Select a root cause reason.');
    const fieldError = Array.isArray(settings.fields) ? rcaValidationError(settings.fields, values.fields || {}) : null;
    if (fieldError && settings.enabled)
        throw new Error(fieldError);
    const changed = structuredClone(record);
    changed.rca = { ...values, completedAt: now(), completedBy: actorId };
    changed.status = changed.rcaPendingFinalStatus || 'Closed';
    changed.closedAt = now();
    changed.updatedAt = now();
    changed.runtime.events.push({ id: uid(), kind: 'rca-complete', at: now(), actorId, message: 'RCA submitted and case closed.' });
    return changed;
}
