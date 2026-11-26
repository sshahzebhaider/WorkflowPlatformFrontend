import { lookupParentCodeLinks } from '../utils/lookupItemEditor.js';
import { get, post, upload, newIdempotencyKey } from './liveApi';
import { output, value } from './apiModels';
const codeOf = s => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 75);
const timeZoneToSql = { 'Asia/Karachi': 'Pakistan Standard Time', 'Asia/Dubai': 'Arabian Standard Time',
    'Europe/London': 'GMT Standard Time', 'America/New_York': 'Eastern Standard Time', 'UTC': 'UTC' };
const serverTimeZone = tz => timeZoneToSql[tz] || tz || 'Pakistan Standard Time';
const noDelete = kind => { throw new Error(`The current .NET API has no deletion endpoint for ${kind}. No changes were saved.`); };
const generatedId = response => output(response, 'ProjectId') || output(response, 'CalendarId') || output(response, 'ListId') || output(response, 'FormId') ||
    output(response, 'WorkflowId') || output(response, 'CaseTypeId') || output(response, 'TeamId') || output(response, 'LibraryFieldId') ||
    output(response, 'RoleId') || output(response, 'DataSourceId') || output(response, 'RcaTemplateId') || output(response, 'RuleId') || output(response, 'UserId');
function resultAs(data, response) { const id = generatedId(response); if (!id)
    throw new Error('The API did not return a created ID. Check stored procedure outputs.'); return { ...data, id }; }
const p = id => `/projects/${encodeURIComponent(id)}`;
async function teamMembership(projectId, teamId, before, after) {
    const groups = [['Officer', 'members'], ['TeamLead', 'leadIds'], ['UnitHead', 'unitHeadIds']];
    const find = (obj, key) => key === 'leadIds' ? (obj?.leadIds || (obj?.leadId ? [obj.leadId] : [])) : (obj?.[key] || []);
    for (const [role, key] of groups) {
        const previous = new Set(find(before, key)), next = new Set(find(after, key));
        for (const uid of previous)
            if (!next.has(uid))
                await post(`${p(projectId)}/teams/${teamId}/members`, { userId: uid, teamRole: role, isActive: false });
        for (const uid of next)
            if (!previous.has(uid))
                await post(`${p(projectId)}/teams/${teamId}/members`, { userId: uid, teamRole: role, isActive: true });
    }
}
async function saveOperation(sourceId, op, existing = null) {
    const requestTemplate = op.requestTemplate;
    const response = await post(`/data-sources/${sourceId}/operations`, {
        name: op.name, code: codeOf(op.code || op.name), httpMethod: op.method || 'GET', urlPath: op.path || '/',
        requestTemplateJson: typeof requestTemplate === 'string' && requestTemplate.trim() ? JSON.parse(requestTemplate) : requestTemplate || {},
        responseMapJson: op.responseMappings || [], headerTemplateJson: op.headers || {}, requestParamsJson: op.requestParameters || [],
        ...(existing ? { operationId: existing.id } : {})
    });
    return output(response, 'OperationId');
}
async function saveSchedule(calId, calendar) {
    const [startHour, startMinute] = String(calendar.startTime || '09:00').split(':').map(Number);
    const [endHour, endMinute] = String(calendar.endTime || '17:00').split(':').map(Number);
    const start = startHour * 60 + startMinute, end = endHour * 60 + endMinute;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        throw new Error('Working hours must be valid and end after start.');
    await post(`/calendars/${calId}/schedule`, (calendar.workingDays || []).map(dayOfWeek => ({ dayOfWeek: dayOfWeek === 0 ? 7 : dayOfWeek, startMinute: start, endMinute: end })));
}
export function workspaceWrites(db, refresh, selectedProjectId) {
    async function add(kind, data) {
        let response;
        switch (kind) {
            case 'calendars':
                response = await post('/calendars', { name: data.name, code: codeOf(data.code || data.name), timeZoneId: serverTimeZone(data.timezone) });
                {
                    const row = resultAs(data, response);
                    await saveSchedule(row.id, data);
                    return (await refresh(), row);
                }
            case 'projects': return noDelete('projects (use onboarding)');
            case 'teams': {
                response = await post(`${p(data.projectId)}/teams`, { name: data.name, code: codeOf(data.name) });
                const row = resultAs(data, response);
                await teamMembership(data.projectId, row.id, null, data);
                await refresh();
                return row;
            }
            case 'lookups': {
                const parentList = db.lookups.find(l => l.id === data.parentListId);
                const links = lookupParentCodeLinks(data.items || [], parentList);
                const itemJson = (data.items || []).map((x, index) => ({
                    code: codeOf(x.code || x.label), label: x.label, parentCode: links[index]?.parentCodes[0] || null,
                    sortOrder: x.sortOrder || index + 1, active: x.active !== false
                }));
                const payload = { name: data.name, code: codeOf(data.code || data.name),
                    scope: data.scope === 'global' ? 'Global' : 'Project',
                    projectId: data.scope === 'global' ? null : data.projectId || selectedProjectId,
                    parentListId: data.parentListId || null };
                if (itemJson.length) {
                    // One SQL transaction: no half-created list if item/link validation fails.
                    try {
                        response = await post('/lookups/create-with-items', {
                            ...payload, itemsJson: itemJson, linksJson: links
                        });
                    }
                    catch (error) {
                        if (error?.status === 404) {
                            throw new Error('Lookup creation endpoint is missing: POST /api/lookups/create-with-items. Deploy the updated .NET ConfigurationEndpoints.cs, rebuild/restart the API, and verify SQL migration 30.');
                        }
                        throw error;
                    }
                }
                else
                    response = await post('/lookups', payload);
                const row = resultAs(data, response);
                await refresh();
                return row;
            }
            case 'forms': {
                response = await post(`${p(data.projectId)}/forms`, { name: data.name, code: codeOf(data.code || data.name), description: data.description || '' });
                const row = resultAs(data, response);
                await post(`/forms/${row.id}/draft`, { definitionJson: { fields: data.fields || [] } });
                if (data.status === 'Published')
                    await post(`/forms/${row.id}/publish`, {});
                await refresh();
                return row;
            }
            case 'workflows': {
                response = await post(`${p(data.projectId)}/workflows`, { name: data.name, code: codeOf(data.code || data.name) });
                const row = resultAs(data, response);
                await post(`/workflows/${row.id}/draft`, { graphJson: { nodes: data.nodes || [], edges: data.edges || [] } });
                if (data.status === 'Published')
                    await post(`/workflows/${row.id}/publish`, {});
                await refresh();
                return row;
            }
            case 'caseTypes': {
                response = await post(`${p(data.projectId)}/case-types`, { name: data.name, code: codeOf(data.code || data.name) });
                const row = resultAs(data, response);
                const { _publishNow, ...draftPayload } = data;
                await post(`/case-types/${row.id}/draft`, { ...draftPayload, isNew: undefined });
                if (_publishNow === true)
                    await post(`/case-types/${row.id}/publish`, { configJson: data.publishedConfig || data });
                await refresh();
                return row;
            }
            case 'fieldLibrary': {
                response = await post('/field-library', { name: data.name || data.label, code: codeOf(data.code || data.name || data.label),
                    projectId: data.projectId || null, fieldType: data.type || 'text', defaultConfigJson: data });
                const row = resultAs(data, response);
                await refresh();
                return row;
            }
            case 'roles': {
                response = await post('/roles', { name: data.name, code: codeOf(data.code || data.name), scope: data.scope === 'team' ? 'Team' : 'Project', permissionsJson: data.permissions || [], description: data.description || '' });
                const row = resultAs(data, response);
                await refresh();
                return row;
            }
            case 'roleAssignments': {
                const role = db.roles.find(r => r.id === data.roleId);
                if (!role)
                    throw new Error('Choose a database-backed role.');
                for (const teamId of data.teamIds?.length ? data.teamIds : [null])
                    await post('/roles/assign', { userId: data.userId, roleCode: role.code, projectId: data.projectId, teamId });
                await refresh();
                return data;
            }
            case 'users': {
                response = data.platformAdmin
                    ? await post('/directory/create-platform-admin', { userName: data.username, displayName: data.name, email: data.email })
                    : await post('/directory/upsert', { userName: data.username, displayName: data.name, email: data.email, directoryStatus: data.directoryStatus || 'Active' });
                const row = resultAs(data, response);
                await refresh();
                return row;
            }
            case 'rcaTemplates': {
                response = await post('/rca-templates', { name: data.name, code: codeOf(data.code || data.name), fieldsJson: data.fields || [] });
                const row = resultAs(data, response);
                await refresh();
                return row;
            }
            case 'dataSources': {
                response = await post('/data-sources', { name: data.name, code: codeOf(data.code || data.name), kind: data.kind || 'REST',
                    baseUrl: data.baseUrl, description: data.description || '', credentialSecretRef: data.credentialSecretRef });
                const row = resultAs(data, response);
                for (const operation of data.operations || [])
                    await saveOperation(row.id, operation);
                await refresh();
                return row;
            }
            case 'notifications': {
                if (data.enabled === false)
                    throw new Error('Disabling notification rules is not supported by the current API.');
                const channel = data.channel === 'In-app' ? 'InApp' : data.channel || 'Email';
                const template = await post('/notifications/templates', { projectId: data.projectId, name: data.name,
                    code: codeOf(data.name), channel, languageCode: 'en', subject: data.subject || '', body: data.body || 'Notification from Workflow Platform' });
                const templateId = output(template, 'TemplateId');
                if (!templateId)
                    throw new Error('Notification template was not returned by SQL Server.');
                response = await post(`${p(data.projectId)}/notifications/rules`, { eventCode: codeOf(data.event || 'CASE_CREATED'),
                    templateId, recipientRuleJson: data.recipients || {} });
                const row = resultAs(data, response);
                await refresh();
                return row;
            }
            case 'cases': throw new Error('Use createCase() for SQL-backed requests. Client-side simulator writes are disabled.');
            default: throw new Error(`No API create endpoint for ${kind}. No browser-only record was created.`);
        }
    }
    async function update(kind, id, patch) {
        const original = (db[kind] || []).find(row => row.id === id);
        if (!original)
            throw new Error(`${kind} record is no longer available; refresh the page.`);
        const updated = { ...original, ...patch };
        switch (kind) {
            case 'forms':
                await post(`/forms/${id}/draft`, { definitionJson: { fields: updated.fields || [] } });
                if (patch.status === 'Published')
                    await post(`/forms/${id}/publish`, {});
                break;
            case 'workflows':
                await post(`/workflows/${id}/draft`, { graphJson: { nodes: updated.nodes || [], edges: updated.edges || [] } });
                if (patch.status === 'Published')
                    await post(`/workflows/${id}/publish`, {});
                break;
            case 'caseTypes': {
                const { _publishNow, ...draftPayload } = updated;
                await post(`/case-types/${id}/draft`, draftPayload);
                if (patch._publishNow === true)
                    await post(`/case-types/${id}/publish`, { configJson: updated.publishedConfig || updated });
                break;
            }
            case 'users':
                if (patch.directoryStatus !== undefined) {
                    await post(`/directory/${encodeURIComponent(id)}/status`, {
                        directoryStatus: String(patch.directoryStatus).slice(0, 1).toUpperCase() + String(patch.directoryStatus).slice(1).toLowerCase()
                    });
                }
                else
                    throw new Error('Only directory status editing is supported on this screen.');
                break;
            case 'teams':
                if (patch.name || patch.description !== undefined)
                    await post(`${p(original.projectId)}/teams/${id}/details`, { name: updated.name, description: updated.description });
                await teamMembership(original.projectId, id, original, updated);
                break;
            case 'fieldLibrary':
                await post('/field-library', { libraryFieldId: id, name: updated.name || updated.label, code: codeOf(updated.code || updated.label),
                    projectId: updated.projectId || null, fieldType: updated.type, defaultConfigJson: updated });
                break;
            case 'rcaTemplates':
                await post('/rca-templates', { rcaTemplateId: id, name: updated.name, code: codeOf(updated.code || updated.name), fieldsJson: updated.fields || [] });
                break;
            case 'roles':
                await post('/roles', { roleId: id, name: original.system ? original.name : updated.name, code: original.system ? original.code : codeOf(updated.code || updated.name),
                    scope: (original.system ? original.scope : updated.scope) === 'team' ? 'Team' : 'Project', permissionsJson: updated.permissions || [], description: updated.description || '' });
                break;
            case 'calendars':
                await post(`/calendars/${id}/details`, { name: updated.name, timezone: serverTimeZone(updated.timezone) });
                await saveSchedule(id, updated);
                // Holiday ranges are dedicated server objects, not a replacement JSON array.
                if (patch.holidays) {
                    const before = new Map((original.holidays || []).map(h => [h.id, h]));
                    const after = new Map(patch.holidays.map(h => [h.id, h]));
                    for (const [holidayId] of before)
                        if (!after.has(holidayId))
                            await post(`/calendars/holidays/${holidayId}/remove`, {});
                    for (const [holidayId, h] of after)
                        if (!before.has(holidayId))
                            await post(`/calendars/${id}/holidays`, {
                                name: h.name, startDate: h.startDate || h.start, endDate: h.endDate || h.end
                            });
                }
                break;
            case 'projects': {
                if (patch.terms)
                    await post(`${p(id)}/terminology`, { termsJson: patch.terms });
                if (patch.calendarId || patch.slaHours != null)
                    await post(`${p(id)}/calendar`, { calendarId: updated.calendarId, slaMinutes: Math.round(updated.slaHours * 60) });
                if (patch.dataSourceIds) {
                    const old = new Set(original.dataSourceIds || []), now = new Set(patch.dataSourceIds);
                    for (const sourceId of new Set([...old, ...now]))
                        if (old.has(sourceId) !== now.has(sourceId))
                            await post(`${p(id)}/allow-data-source`, { dataSourceId: sourceId, allowed: now.has(sourceId) });
                }
                if (patch.lookupIds) {
                    const old = new Set(original.lookupIds || []), now = new Set(patch.lookupIds);
                    for (const listId of new Set([...old, ...now]))
                        if (old.has(listId) !== now.has(listId))
                            await post(`${p(id)}/allow-lookup`, { listId, allowed: now.has(listId) });
                }
                if (patch.rcaConfig)
                    await post(`${p(id)}/rca-config`, { enabled: !!patch.rcaConfig.enabled, requiredOnClose: !!patch.rcaConfig.requiredOnClose, templateId: patch.rcaConfig.templateId || null, fieldsJson: patch.rcaConfig.fields || [] });
                break;
            }
            case 'dataSources': {
                const operations = updated.operations || [], previous = original.operations || [];
                if (patch.name || patch.baseUrl || patch.description || patch.credentialSecretRef !== undefined)
                    await post('/data-sources', { dataSourceId: id, name: updated.name,
                        code: codeOf(updated.code || updated.name), kind: updated.kind, baseUrl: updated.baseUrl, description: updated.description, credentialSecretRef: patch.credentialSecretRef });
                const generatedOperationIds = new Map();
                for (const op of operations) {
                    const prev = previous.find(p => p.id === op.id || p.code === op.code);
                    if (!prev || JSON.stringify(prev) !== JSON.stringify(op)) {
                        const savedId = await saveOperation(id, op, prev);
                        generatedOperationIds.set(op.id, savedId);
                    }
                }
                updated.operations = operations.map(op => generatedOperationIds.has(op.id) ? { ...op, id: generatedOperationIds.get(op.id) } : op);
                if (previous.some(op => !operations.some(x => x.id === op.id)))
                    throw new Error('Deleting API operations is not yet supported by the backend; other changes were saved.');
                break;
            }
            case 'notifications': {
                if (patch.enabled === false)
                    throw new Error('Disabling notification rules is not supported by the current API.');
                if (!updated.templateId)
                    throw new Error('A notification template is required.');
                const template = await post('/notifications/templates', { templateId: updated.templateId,
                    projectId: updated.projectId, name: updated.name, code: codeOf(updated.name),
                    channel: updated.channel === 'In-app' ? 'InApp' : updated.channel || 'Email', languageCode: 'en',
                    subject: updated.subject || '', body: updated.body || 'Notification from Workflow Platform' });
                await post(`${p(updated.projectId)}/notifications/rules`, { ruleId: id,
                    eventCode: codeOf(updated.event || updated.eventCode), templateId: updated.templateId,
                    recipientRuleJson: updated.recipients || {} });
                break;
            }
            case 'lookups': {
                if (patch.parentListId !== undefined)
                    await post(`/lookups/${id}/parent`, { parentListId: updated.parentListId });
                if (patch.items) {
                    const old = new Map((original.items || []).map(i => [i.id, i]));
                    const newer = patch.items.filter(i => !old.has(i.id));
                    const parentList = db.lookups.find(l => l.id === updated.parentListId);
                    const newerLinks = lookupParentCodeLinks(newer, parentList);
                    if (newer.length)
                        await post(`/lookups/${id}/items/bulk`, { itemsJson: newer.map((x, index) => ({ code: codeOf(x.code || x.label),
                                label: x.label, parentCode: newerLinks[index]?.parentCodes[0] || null, sortOrder: x.sortOrder || 0, active: x.active !== false })) });
                    for (const item of patch.items) {
                        const was = old.get(item.id);
                        if (was && JSON.stringify(was) !== JSON.stringify(item))
                            await post(`/lookups/items/${item.id}`, { label: item.label, sortOrder: item.sortOrder || 0,
                                isActive: item.active !== false, parentItemId: item.parentItemId || null });
                    }
                    for (const item of old.values())
                        if (!patch.items.some(x => x.id === item.id))
                            await post(`/lookups/items/${item.id}`, { label: item.label, sortOrder: item.sortOrder || 0, isActive: false,
                                parentItemId: item.parentItemId || null });
                    if (parentList)
                        await post(`/lookups/${id}/item-parents`, {
                            linksJson: lookupParentCodeLinks(patch.items, parentList)
                        });
                }
                break;
            }
            case 'cases': throw new Error('Use the case action endpoints. Local workflow writes are disabled in API mode.');
            default: throw new Error(`The current backend has no update endpoint for ${kind}. No local-only change was saved.`);
        }
        await refresh();
        return updated;
    }
    const remove = (kind, id) => noDelete(kind);
    async function createProject(data) {
        const response = await post('/projects/onboard', { name: data.name, code: codeOf(data.code || data.name),
            ownerUserId: data.ownerId || null, calendarId: data.calendarId, adminIdsJson: data.adminIds,
            termsJson: data.terms || {}, teamsJson: (data.teams || []).filter(name => name?.trim()), description: data.description, templateCode: data.templateKey || 'blank',
            rcaTemplateId: data.rcaConfig?.enabled ? data.rcaConfig?.templateId : null, rcaRequired: !!data.rcaConfig?.enabled,
            defaultSlaMinutes: Math.round((data.slaHours || 24) * 60) });
        const row = resultAs(data, response);
        const warnings = [];
        for (const dataSourceId of data.dataSourceIds || []) {
            try { await post(`${p(row.id)}/allow-data-source`, { dataSourceId, allowed: true }); }
            catch (error) { warnings.push(`Data source ${dataSourceId} was not connected: ${error.message}`); }
        }
        let loaded = null;
        try { loaded = await refresh(row.id); }
        catch (error) { warnings.push('Project was created but the workspace could not refresh. Reload the page.'); }
        const expectedTeams = (data.teams || []).filter(name => name?.trim());
        const confirmed = value(response?.data?.[0], 'initialTeamCount');
        // Do not retry onboarding automatically: the project is already committed.
        // Report any mismatch rather than claiming a successful configuration.
        if (expectedTeams.length && (confirmed === null || Number(confirmed) !== expectedTeams.length ||
            (loaded && expectedTeams.some(name => !loaded.db.teams.some(t => String(t.projectId) === String(row.id) && t.name.trim().toLowerCase() === name.trim().toLowerCase())))))
            warnings.push('Initial teams could not be verified. Open Teams and check the configuration; do not recreate the project.');
        if (warnings.length) row.onboardingWarning = 'Project created. ' + warnings.join(' ');
        return row;
    }
    async function saveAbsence(data) {
        await post(`${p(data.projectId)}/teams/${data.teamId}/absence`, {
            userId: data.userId, backupUserId: data.backupUserId, startDate: data.from, endDate: data.to
        });
        await refresh();
    }
    async function createCase(projectId, caseTypeId, values, title, lookupPreview = null, requestKey = null) {
        const response = await post(`${p(projectId)}/cases`, { caseTypeId, intakeJson: Object.fromEntries(Object.entries(values.fields || {}).map(([key, v]) => [key, Array.isArray(v) && v.some(x => x?.storage === 'staged') ? v.map(x => String(x.id)) : v])),
            classificationJson: values.classification || {}, title,
            ...(lookupPreview?.previewId ? { previewId: lookupPreview.previewId, previewToken: lookupPreview.previewToken } : {})
        }, { idempotencyKey: requestKey || newIdempotencyKey() });
        const caseId = output(response, 'CaseId'), reference = output(response, 'ReferenceNo');
        if (!caseId)
            throw new Error('Case submission returned no CaseId. Inspect the backend procedure output.');
        await refresh();
        return { id: caseId, reference };
    }
    async function completeTask(taskId, action, answersByFormJson, comment = '') {
        const res = await post(`/tasks/${taskId}/complete`, { action, answersByFormJson, comment });
        await refresh();
        return res;
    }
    async function forwardTask(taskId, toUserId) { const res = await post(`/tasks/${taskId}/forward`, { toUserId }); await refresh(); return res; }
    async function forceIntimation(taskId, priority, reason) { const res = await post(`/tasks/${taskId}/force-intimation`, { priority, reason }); await refresh(); return res; }
    async function submitRca(caseId, values) {
        const res = await post(`/cases/${caseId}/rca`, {
            summary: values.summary ?? '', fieldsJson: values.fields || {}, rootReasonItemId: values.reasonId || null,
            formAnswersJson: values.formValues || {}
        });
        await refresh();
        return res;
    }
    return { add, update, remove, createProject, saveAbsence, createCase, completeTask, forwardTask, forceIntimation, submitRca };
}
