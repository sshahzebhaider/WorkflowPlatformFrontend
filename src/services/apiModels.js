/** Stable mapping between SQL Server's PascalCase API rows and the existing Chunk 6 JSX view models. */
export const value = (row, name, fallback = null) => {
    if (!row || typeof row !== 'object')
        return fallback;
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? fallback : row[key] ?? fallback;
};
export function json(input, fallback = {}) {
    if (input == null || input === '')
        return fallback;
    if (typeof input === 'object')
        return input;
    try {
        return JSON.parse(input);
    }
    catch {
        return fallback;
    }
}
export const list = (data) => Array.isArray(data) ? data : (data?.items || []);
export function output(result, key) { return value(result?.outputs, key) || value(result?.data?.[0], key); }
const isActive = row => value(row, 'isActive', value(row, 'active', true)) !== false;
export function toProject(row) {
    return { id: value(row, 'id'), code: value(row, 'code', ''), name: value(row, 'name', ''),
        description: value(row, 'description', ''), status: value(row, 'status', 'Live'),
        releaseStage: value(row, 'status', value(row, 'releaseStage', 'UAT')), releaseRevision: value(row, 'releaseRevision', 0),
        releaseCycle: value(row, 'releaseCycle', 1),
        ownerId: value(row, 'ownerUserId'), calendarId: value(row, 'calendarId'),
        owner: '', adminIds: [], terms: {}, slaHours: Math.round((value(row, 'defaultSlaMinutes', 1440) || 0) / 60),
        rcaConfig: { enabled: Boolean(value(row, 'rcaEnabled', value(row, 'rcaRequired')) || value(row, 'rcaRequired')), requiredOnClose: Boolean(value(row, 'rcaRequired')), templateId: value(row, 'rcaTemplateId') },
        templateKey: value(row, 'templateCode', 'blank'), createdAt: value(row, 'createdAt') };
}
export function toUser(row) {
    return { id: value(row, 'id'), username: value(row, 'username', value(row, 'userName', '')),
        name: value(row, 'name', value(row, 'displayName', '')), email: value(row, 'email'),
        platformAdmin: Boolean(value(row, 'platformAdmin')), active: isActive(row),
        directoryStatus: String(value(row, 'directoryStatus', 'Active')).toLowerCase() };
}
const timeZoneFromSql = { 'Pakistan Standard Time': 'Asia/Karachi', 'Arabian Standard Time': 'Asia/Dubai',
    'GMT Standard Time': 'Europe/London', 'Eastern Standard Time': 'America/New_York', 'UTC': 'UTC' };
export function toCalendar(row, detail) {
    const intervals = detail?.intervals || detail?.sets?.[1] || [];
    const days = intervals.map(x => value(x, 'dayOfWeek')).filter(x => x != null).map(day => day === 7 ? 0 : day);
    const one = intervals[0];
    const hhmm = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const holidays = (detail?.holidays || detail?.sets?.[2] || []).map(h => ({ id: value(h, 'id', value(h, 'holidayId')), name: value(h, 'name'), startDate: value(h, 'startDate')?.slice?.(0, 10), endDate: value(h, 'endDate')?.slice?.(0, 10) }));
    return { id: value(row, 'id'), name: value(row, 'name'), code: value(row, 'code'), timezone: timeZoneFromSql[value(row, 'timeZoneId', 'UTC')] || value(row, 'timeZoneId', 'UTC'),
        description: value(row, 'description'), workingDays: [...new Set(days)], startTime: one ? hhmm(value(one, 'startMinute', 540)) : '09:00',
        endTime: one ? hhmm(value(one, 'endMinute', 1020)) : '17:00', holidays };
}
export function toLookup(row, items = []) {
    return { id: value(row, 'id'), code: String(value(row, 'code', '')).toLowerCase(), name: value(row, 'name', ''),
        projectId: value(row, 'projectId'), scope: String(value(row, 'scope', 'global')).toLowerCase(), parentListId: value(row, 'parentListId'),
        active: isActive(row), items: items.map(i => {
            const legacyId = value(i, 'parentItemId');
            const csv = value(i, 'parentItemIdsCsv');
            const ids = Array.isArray(value(i, 'parentItemIds')) ? value(i, 'parentItemIds') :
                csv ? String(csv).split(',').filter(Boolean).map(Number) : legacyId != null ? [legacyId] : [];
            return { id: value(i, 'id', value(i, 'itemId')), code: value(i, 'code'), label: value(i, 'label'),
                parentItemId: legacyId, parentItemIds: ids, sortOrder: value(i, 'sortOrder', 0), active: isActive(i) };
        }) };
}
export function toForm(row, full = null, projectId = null) {
    const core = full?.form || row;
    const draft = json(value(core, 'draftJson'), { fields: [] });
    const versions = full?.versions || [];
    const published = versions[0];
    const pub = json(value(published, 'definitionJson'), { fields: [] });
    const live = Boolean(value(core, 'liveVersionId'));
    return { id: value(row, 'id'), projectId, name: value(core, 'name'), code: value(core, 'code'), description: value(core, 'description'),
        status: live ? 'Published' : 'Draft', version: value(published, 'versionNumber', live ? 1 : 0),
        fields: Array.isArray((live ? pub : draft).fields) ? (live ? pub : draft).fields : [],
        draftFields: draft.fields || [], publishedVersionId: value(core, 'liveVersionId'), createdAt: value(row, 'createdAt'), updatedAt: value(row, 'updatedAt') };
}
export function toWorkflow(row, full = null, projectId = null) {
    const core = full?.workflow || row;
    const draft = json(value(core, 'draftGraphJson'), { nodes: [], edges: [] });
    const versions = full?.versions || [];
    const pub = json(value(versions[0], 'graphJson'), { nodes: [], edges: [] });
    const live = Boolean(value(core, 'liveVersionId'));
    const view = live ? pub : draft;
    return { id: value(row, 'id'), projectId, name: value(core, 'name'), code: value(core, 'code'),
        status: live ? 'Published' : 'Draft', version: value(versions[0], 'versionNumber', live ? 1 : 0),
        nodes: view.nodes || [], edges: view.edges || [], draftNodes: draft.nodes || [], draftEdges: draft.edges || [],
        publishedVersionId: value(core, 'liveVersionId'), createdAt: value(row, 'createdAt'), updatedAt: value(row, 'updatedAt') };
}
export function toCaseType(row, projectId) {
    const draftConfig = json(value(row, 'draftJson'), {});
    const config = json(value(row, 'publishedConfigJson'), draftConfig);
    const live = Boolean(value(row, 'liveVersionId'));
    return { id: value(row, 'id'), projectId, code: value(row, 'code'), name: value(row, 'name'),
        ...config, draftConfig, status: live ? 'Published' : 'Draft', version: value(row, 'versionNumber', live ? 1 : 0), publishedConfig: live ? config : null,
        liveVersionId: value(row, 'liveVersionId'), updatedAt: value(row, 'updatedAt') };
}
export function toTeam(row, members = [], projectId) {
    const belonging = members.filter(m => value(m, 'teamId') === value(row, 'id') && isActive(m));
    const pick = kind => belonging.filter(m => String(value(m, 'teamRole')).toLowerCase() === kind).map(m => value(m, 'userId'));
    const leadIds = pick('teamlead'), unitHeadIds = pick('unithead');
    return { id: value(row, 'id'), projectId, name: value(row, 'name'), description: value(row, 'description'), code: value(row, 'code'),
        leadIds, leadId: leadIds[0] || null, unitHeadIds, members: pick('officer') };
}
export function toCase(row, projectId) {
    return { id: value(row, 'id', value(row, 'caseId')), projectId, reference: value(row, 'reference', value(row, 'referenceNo')),
        title: value(row, 'title', 'Request'), status: value(row, 'status', 'Open'), priority: value(row, 'priority', 'Normal'),
        createdBy: value(row, 'createdBy'), createdAt: value(row, 'createdAt'), dueAt: value(row, 'dueAt'), closedAt: value(row, 'closedAt'),
        typeVersionId: value(row, 'caseTypeVersionId'), typeId: value(row, 'caseTypeId'), openTaskCount: value(row, 'openTaskCount'), runtime: { tasks: [], events: [], pendingOperations: [], waiting: [] } };
}
export function toTask(row) {
    return { id: value(row, 'taskId', value(row, 'id')), nodeId: value(row, 'nodeId'), teamId: value(row, 'teamId'),
        assignedTo: value(row, 'assignedTo'), actorId: value(row, 'completedBy'), action: value(row, 'actionCode'),
        routingStage: value(row, 'routingStage'), status: value(row, 'taskStatus', value(row, 'status')),
        priority: value(row, 'priority', 'Normal'), createdAt: value(row, 'createdAt'), dueAt: value(row, 'dueAt'), completedAt: value(row, 'completedAt'),
        stepName: value(row, 'stepName'), teamName: value(row, 'teamName'), formIds: [] };
}
export function toCaseDetail(payload, projectId, snapshot) {
    const raw = payload?.caseRecord || {};
    const item = toCase(raw, projectId);
    const pub = snapshot?.published || {};
    const workflowGraph = json(value(pub, 'workflowGraphJson'), { nodes: [], edges: [] });
    const intakeDefinition = json(value(pub, 'intakeDefinitionJson'), { fields: [] });
    const config = json(value(pub, 'caseTypeConfigJson'), {});
    const stepFormSnapshots = {};
    const nodeForms = {};
    for (const row of snapshot?.stepForms || []) {
        const fid = value(row, 'formId'), nodeKey = value(row, 'nodeKey');
        if (!fid || !nodeKey)
            continue;
        stepFormSnapshots[fid] = { id: fid, versionId: value(row, 'formVersionId'), name: value(row, 'name'), fields: json(value(row, 'definitionJson'), { fields: [] }).fields || [] };
        (nodeForms[nodeKey] ??= []).push(fid);
    }
    const nodeKeys = Object.fromEntries((snapshot?.nodes || []).map(n => [value(n, 'nodeId'), value(n, 'nodeKey')]));
    const tasks = (payload?.tasks || []).map(t => ({ ...toTask(t), nodeId: nodeKeys[value(t, 'nodeId')] || value(t, 'nodeId'), formIds: nodeForms[nodeKeys[value(t, 'nodeId')]] || [] }));
    const events = (payload?.events || []).map(e => ({ id: value(e, 'eventId'), kind: value(e, 'eventType'), message: value(e, 'message'), at: value(e, 'occurredAt'), actorId: value(e, 'actorUserId') }));
    const answerRows = payload?.answers || [];
    const stepValues = {};
    for (const ans of answerRows) {
        const fid = value(ans, 'formVersionId');
        const taskId = value(ans, 'taskId');
        const formId = value((snapshot?.stepForms || []).find(f => value(f, 'formVersionId') === fid), 'formId', fid);
        (stepValues[taskId || fid] ??= {})[formId] = json(value(ans, 'answersJson'), {});
    }
    const attachments = (payload?.attachments || []).map(x => ({ id: value(x, 'documentId'), taskId: value(x, 'taskId'),
        fieldKey: value(x, 'fieldKey'), name: value(x, 'originalFileName'), mimeType: value(x, 'mimeType'), size: value(x, 'fileSizeBytes'), scanStatus: value(x, 'scanStatus') }));
    const integrationOutput = { ...json(value(raw, 'integrationValuesJson'), {}) };
    for (const run of payload?.integrations || [])
        Object.assign(integrationOutput, json(value(run, 'mappedFieldsJson'), {}));
    const rcaFields = json(value(raw, 'rcaFieldsSnapshotJson'), []).map(field => {
        const key = value(field, 'fieldKey');
        const fallback = json(value((payload?.rcaOptions || []).find(row => value(row,'fieldKey') === key),'optionsJson'), []);
        return { key, label: value(field,'label',key), type: value(field,'fieldType','text'), required: Boolean(value(field,'required')), parentKey: value(field,'parentFieldKey'), parentValue: value(field,'parentValue'), options: json(value(field,'optionsJson'), fallback) };
    });
    return { ...item, typeId: value(pub, 'caseTypeId'), caseTypeSnapshot: { name: value(pub, 'caseTypeName'), version: value(pub, 'caseTypeVersion'), ...config },
        workflowSnapshot: workflowGraph, intakeSnapshot: { id: value(pub, 'intakeFormId'), name: value(pub, 'intakeFormName'),
            version: value(pub, 'intakeFormVersion'), fields: intakeDefinition.fields || [] }, stepFormSnapshots, fieldValues: json(value(raw, 'intakeJson'), {}),
        intakeValues: json(value(raw, 'intakeJson'), {}), classificationValues: json(value(raw, 'classificationJson'), {}),
        integrationValues: integrationOutput, stepValues, attachments,
        runtime: { tasks, events, pendingOperations: [], waiting: [] }, rcaConfigSnapshot: { enabled: Boolean(value(raw,'rcaRequiredAtCreation')), requiredOnClose: Boolean(value(raw,'rcaRequiredAtCreation')), fields: rcaFields },
        rca: value(raw, 'rcaJson') ? json(value(raw, 'rcaJson')) : null };
}
