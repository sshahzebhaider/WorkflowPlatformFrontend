import { get } from './liveApi';
import { json, value, list, toProject, toUser, toCalendar, toLookup, toForm, toWorkflow, toCaseType, toTeam, toCase, toTask } from './apiModels';
const emptyDb = () => ({ users: [], calendars: [], dataSources: [], lookups: [], projects: [], teams: [], forms: [], workflows: [], projectSummaries: {},
    cases: [], caseTypes: [], notifications: [], fieldLibrary: [], roles: [], roleAssignments: [], teamAbsences: [], rcaTemplates: [], audits: [] });
const unique = rows => [...new Map(rows.filter(Boolean).map(r => [r.id, r])).values()];
/** Null only for permission-denied optional screen data. Other errors must be displayed. */
async function optional(path, errors, label, fallback = null) {
    try {
        return await get(path);
    }
    catch (error) {
        if (error.status === 403 || error.status === 404)
            return fallback;
        errors.push(`${label}: ${error.message}`);
        return fallback;
    }
}
const safeId = x => encodeURIComponent(x);
export async function loadWorkspace(preferredProjectId = null) {
    // No browser seed data in API mode. Auth, project access and permissions come from .NET/SQL.
    const identity = await get('/me');
    const available = await get('/projects');
    const db = emptyDb(), errors = [];
    const current = toUser(identity);
    current.platformAdmin = Boolean(identity.platformAdmin);
    db.users = [current];
    db.projects = (available || []).map(toProject);
    const projectId = db.projects.find(p => String(p.id) === String(preferredProjectId))?.id ?? db.projects[0]?.id ?? null;
    const [users, roles, calendars, globalLookups, rcaTemplates, dataSources, audit] = await Promise.all([
        current.platformAdmin ? optional('/users?take=100', errors, 'Directory', []) : [],
        current.platformAdmin ? optional('/roles', errors, 'Roles', []) : [],
        current.platformAdmin ? optional('/calendars', errors, 'Calendars', []) : [],
        current.platformAdmin ? optional('/lookups', errors, 'Lookup Manager', []) : [],
        current.platformAdmin ? optional('/rca-templates', errors, 'RCA templates', []) : [],
        current.platformAdmin ? optional('/data-sources', errors, 'Data sources', []) : [],
        current.platformAdmin ? optional('/audit?take=100', errors, 'Platform audit', []) : [],
    ]);
    db.users = unique([current, ...(users || []).map(toUser)]);
    db.roles = (roles || []).map(r => ({ id: value(r, 'id'), name: value(r, 'name'), code: value(r, 'code'), scope: String(value(r, 'scope', 'Project')).toLowerCase(),
        description: value(r, 'description'), system: !!value(r, 'isSystem'), permissions: json(value(r, 'permissionsJson'), []).map(x => value(x, 'PermissionCode')) }));
    db.rcaTemplates = (rcaTemplates || []).map(x => ({ id: value(x, 'id'), code: value(x, 'code'), name: value(x, 'name'), description: value(x, 'description'), version: value(x, 'version'), fields: [] }));
    db.dataSources = (dataSources || []).map(s => ({ id: value(s, 'id'), name: value(s, 'name'), code: value(s, 'code'),
        kind: value(s, 'kind'), baseUrl: value(s, 'baseUrl'), hostApproved: !!value(s, 'hostApproved'), description: value(s, 'description'),
        authenticationScheme: value(s, 'authenticationScheme', 'None'), credentialConfigured: !!value(s, 'credentialConfigured'), operations: [] }));
    db.audits = (audit || []).map(e => ({ id: value(e, 'auditId'), actorId: value(e, 'actorUserId'), projectId: value(e, 'projectId'),
        action: value(e, 'actionCode'), entity: value(e, 'entityType'), date: value(e, 'occurredAt'), detail: json(value(e, 'detailsJson'), {}) }));
    // Global configuration is edited only by platform administrators, but nested records are loaded
    // so the existing UI can render its original calendar, lookup and data-source editors.
    const [calDetails, globalItems, operations, rcaFields] = await Promise.all([
        Promise.all(dbReady(calendars).map(c => optional(`/calendars/${safeId(value(c, 'id'))}`, errors, 'Calendar details'))),
        Promise.all(dbReady(globalLookups).map(l => optional(`/lookups/${safeId(value(l, 'id'))}/items`, errors, 'Global lookup items', []))),
        Promise.all(db.dataSources.map(s => optional(`/data-sources/${safeId(s.id)}/operations`, errors, 'Connection operations', []))),
        Promise.all(db.rcaTemplates.map(t => optional(`/rca-templates/${safeId(t.id)}/fields`, errors, 'RCA template fields', []))),
    ]);
    db.calendars = dbReady(calendars).map((c, i) => toCalendar(c, calDetails[i]));
    db.lookups = dbReady(globalLookups).map((l, i) => toLookup(l, globalItems[i] || []));
    db.dataSources = db.dataSources.map((s, i) => ({ ...s, operations: (operations[i] || []).map(o => ({ id: value(o, 'id'),
            name: value(o, 'name'), code: value(o, 'code'), method: value(o, 'httpMethod'), path: value(o, 'urlPath'),
            requestTemplate: json(value(o, 'requestTemplateJson'), {}), headers: json(value(o, 'headerTemplateJson'), {}),
            responseMappings: json(value(o, 'responseMapJson'), []),
            requestParameters: json(value(o, 'requestParamsJson'), []) })) }));
    db.rcaTemplates = db.rcaTemplates.map((t, i) => ({ ...t, fields: (rcaFields[i] || []).map(f => ({ key: value(f, 'fieldKey'),
            label: value(f, 'label'), description: value(f, 'description', ''), type: value(f, 'fieldType'), required: !!value(f, 'required'), parentKey: value(f, 'parentFieldKey'), parentValue: value(f, 'parentValue'), options: json(value(f, 'optionsJson'), []) })) }));
    const permissions = {};
    if (!projectId)
        return { db, identity: current, projectId: null, permissions, errors };
    const url = `/projects/${safeId(projectId)}`;
    const [projectDetails, p, dir, teams, lookups, fieldLibrary, forms, workflows, caseTypes, cases, mine, assignments, projectAudit, projectSources, projectRca, projectNotifications, projectTemplates, projectSummary] = await Promise.all([
        optional(url, errors, 'Project details'),
        optional(`${url}/permissions`, errors, 'Permissions', []),
        optional(`${url}/directory`, errors, 'Project people', []),
        optional(`${url}/teams`, errors, 'Teams'),
        optional(`${url}/lookups`, errors, 'Project lookups', []),
        optional(`${url}/field-library`, errors, 'Field Library', []),
        optional(`${url}/forms`, errors, 'Forms', []),
        optional(`${url}/workflows`, errors, 'Workflows', []),
        optional(`${url}/case-types`, errors, 'Case types', []),
        optional(`${url}/cases?take=100`, errors, 'Cases'),
        optional(`${url}/tasks/mine?includeCompleted=true`, errors, 'My Tasks', []),
        optional(`${url}/role-assignments`, errors, 'Project role assignments', []),
        optional(`${url}/audit?take=100`, errors, 'Project audit', []),
        optional(`${url}/data-sources`, errors, 'Project integrations', []),
        optional(`${url}/rca-fields`, errors, 'RCA setup', []),
        optional(`${url}/notification-rules`, errors, 'Notification rules', []),
        optional(`/notification-templates?projectId=${safeId(projectId)}`, errors, 'Notification templates', []),
        optional(`${url}/reports/summary`, errors, 'Reporting summary'),
    ]);
    if (!current.platformAdmin) {
        const [availableRoles, availableCalendars] = await Promise.all([
            optional(`${url}/available-roles`, errors, 'Available project roles', []),
            optional(`${url}/available-calendars`, errors, 'Available calendars', []),
        ]);
        db.roles = (availableRoles || []).map(r => ({ id: value(r, 'id'), name: value(r, 'name'), code: value(r, 'code'),
            scope: String(value(r, 'scope', 'Project')).toLowerCase(), description: value(r, 'description'), system: true,
            permissions: json(value(r, 'permissionsJson'), []).map(x => value(x, 'PermissionCode')) }));
        db.calendars = (availableCalendars || []).map(c => toCalendar(c));
    }
    permissions[projectId] = (p || []).map(row => typeof row === 'string' ? row : value(row, 'PermissionCode')).filter(Boolean);
    db.users = unique([...(dir || []).map(toUser), ...db.users]);
    if (projectDetails) {
        const project = db.projects.find(x => x.id === projectId);
        if (project) {
            project.terms = Object.fromEntries((projectDetails.terminology || []).map(t => [value(t, 'termKey'), value(t, 'termValue')]));
            project.owner = db.users.find(u => u.id === project.ownerId)?.name || '';
            project.rcaConfig = { ...project.rcaConfig, fields: (projectRca || []).map(r => json(value(r, 'configJson'), {})) };
            project.dataSourceIds = (projectSources || []).map(s => value(s, 'id'));
        }
    }
    if (!current.platformAdmin) {
        const approved = (projectSources || []).map(s => ({ id: value(s, 'id'), name: value(s, 'name'),
            code: value(s, 'code'), kind: value(s, 'kind'), baseUrl: value(s, 'baseUrl'),
            description: value(s, 'description'), operations: [] }));
        const operations = await Promise.all(approved.map(s => optional(`${url}/data-sources/${safeId(s.id)}/operations`, errors, 'Approved data-source operations', [])));
        db.dataSources = unique([...db.dataSources, ...approved.map((s, i) => ({ ...s, operations: (operations[i] || []).map(o => ({
                    id: value(o, 'id'), name: value(o, 'name'), code: value(o, 'code'), method: value(o, 'httpMethod'), path: value(o, 'urlPath'),
                    requestTemplate: json(value(o, 'requestTemplateJson'), {}),
                    responseMappings: json(value(o, 'responseMapJson'), []),
                    requestParameters: json(value(o, 'requestParamsJson'), [])
                })) }))]);
    }
    db.roleAssignments = (assignments || []).map(a => ({ id: value(a, 'assignmentId'), projectId, userId: value(a, 'userId'),
        roleId: db.roles.find(r => r.id === value(a, 'roleId'))?.id || value(a, 'roleId'),
        teamIds: value(a, 'teamId') ? [value(a, 'teamId')] : [], active: !!value(a, 'isActive'), roleCode: value(a, 'roleCode') }));
    const teamMembers = teams?.members || [];
    db.teams = (teams?.teams || []).map(t => toTeam(t, teamMembers, projectId));
    db.teamAbsences = (teams?.absences || []).map(a => ({ id: value(a, 'absenceId'), projectId, teamId: value(a, 'teamId'),
        userId: value(a, 'userId'), backupUserId: value(a, 'backupUserId'), from: value(a, 'startDate')?.slice(0, 10), to: value(a, 'endDate')?.slice(0, 10) }));
    const isProjectAdmin = current.platformAdmin || (assignments || []).some(a => String(value(a, 'userId')) === String(current.id) && String(value(a, 'roleCode', '')).toLowerCase() === 'project_admin' && value(a, 'isActive', true) !== false);
    const managedTeamIds = db.teams.filter(t => isProjectAdmin || t.leadIds?.includes(current.id) || t.unitHeadIds?.includes(current.id)).map(t => t.id);
    const teamTaskLists = await Promise.all(managedTeamIds.map(id => optional(`${url}/teams/${id}/tasks`, errors, 'My Team tasks', [])));
    const details = await Promise.all((lookups || []).map(l => optional(`${url}/lookups/${safeId(value(l, 'id'))}/items`, errors, 'Lookup items', [])));
    db.lookups = unique([...db.lookups, ...(lookups || []).map((l, i) => toLookup(l, details[i] || []))]);
    db.fieldLibrary = (fieldLibrary || []).filter(f => value(f, 'isActive', true) !== false).map(f => ({ ...json(value(f, 'defaultConfigJson'), {}), id: value(f, 'id'), projectId: value(f, 'projectId'), name: value(f, 'label'),
        code: value(f, 'code'), label: value(f, 'label'), type: String(value(f, 'fieldType', 'text')).toLowerCase() }));
    const [fullForms, fullWorkflows] = await Promise.all([
        Promise.all((forms || []).map(f => optional(`${url}/forms/${safeId(value(f, 'id'))}`, errors, 'Form versions'))),
        Promise.all((workflows || []).map(w => optional(`${url}/workflows/${safeId(value(w, 'id'))}`, errors, 'Workflow versions'))),
    ]);
    db.forms = (forms || []).map((f, i) => toForm(f, fullForms[i], projectId));
    db.workflows = (workflows || []).map((w, i) => toWorkflow(w, fullWorkflows[i], projectId));
    db.caseTypes = (caseTypes || []).map(c => toCaseType(c, projectId));
    db.cases = list(cases).map(c => toCase(c, projectId));
    db.caseCounts = { [projectId]: { total: cases?.total, openCount: cases?.openCount } };
    // My Tasks supplies task data for the existing summary cards even before case-detail navigation.
    for (const row of mine || []) {
        const caseId = value(row, 'caseId');
        if (!caseId)
            continue;
        let target = db.cases.find(c => c.id === caseId);
        if (!target) {
            target = toCase({ id: caseId, reference: value(row, 'referenceNo'), title: value(row, 'title'),
                status: value(row, 'caseStatus') }, projectId);
            db.cases.push(target);
        }
        target.runtime.tasks.push({ ...toTask(row), assignedTo: current.id, actorId: String(value(row, 'taskStatus')).toLowerCase() === 'completed' ? current.id : null });
    }
    for (const row of teamTaskLists.flat()) {
        const caseId = value(row, 'caseId');
        if (!caseId)
            continue;
        let c = db.cases.find(x => x.id === caseId);
        if (!c) {
            c = toCase({ id: caseId, reference: value(row, 'referenceNo'), title: value(row, 'title') }, projectId);
            db.cases.push(c);
        }
        if (!c.runtime.tasks.some(t => t.id === value(row, 'taskId')))
            c.runtime.tasks.push(toTask(row));
    }
    db.audits = [...db.audits, ...(projectAudit || []).map(e => ({ id: value(e, 'auditId'), actorId: value(e, 'actorUserId'),
            projectId, entity: value(e, 'entityType'), action: value(e, 'actionCode'), date: value(e, 'occurredAt') }))];
    const templateMap = new Map((projectTemplates || []).map(t => [value(t, 'templateId'), t]));
    db.notifications = (projectNotifications || []).map(n => {
        const template = templateMap.get(value(n, 'templateId')) || {};
        const eventCode = value(n, 'eventCode', 'CASE_CREATED');
        return { id: value(n, 'ruleId'), projectId, name: value(template, 'name', eventCode), event: eventCode.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            eventCode, templateId: value(n, 'templateId'), channel: value(template, 'channel', 'Email'),
            subject: value(template, 'subjectTemplate', ''), body: value(template, 'bodyTemplate', ''),
            enabled: !!value(n, 'isEnabled', true), recipients: json(value(n, 'recipientRuleJson'), {}) };
    });
    if (projectSummary)
        db.projectSummaries[projectId] = { byStatus: projectSummary.byStatus || [], byType: projectSummary.byType || [] };
    db.projects = db.projects.map(pj => pj.id === projectId ? { ...pj,
        adminIds: unique(db.roleAssignments.filter(a => a.roleCode === 'project_admin' && a.active).map(a => ({ id: a.userId }))).map(x => x.id) } : pj);
    return { db, identity: current, projectId, permissions, errors };
}
function dbReady(value) { return Array.isArray(value) ? value : []; }
export { emptyDb };
