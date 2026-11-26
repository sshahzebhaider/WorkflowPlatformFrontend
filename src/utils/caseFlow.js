import { uid } from './helpers.js';
/** Browser-only case workflow simulation. No external calls, timers, or notifications are executed. */
import { initialTeamAssignment, taskForUser, teamMemberIds } from './workforce.js';
import { carryForwardAnswers } from './caseCarryForward.js';
import { calculateDemoTatDueAt } from './tatTimer.js';
const HUMAN = new Set(['task', 'officerRouting', 'groupReview', 'requestInfo']);
const stamp = () => new Date().toISOString();
const id = uid;
const labelOf = node => node?.data?.label || node?.data?.kind || 'Step';
const links = (graph, nodeId) => (graph.edges || []).filter(edge => edge.source === nodeId);
const destination = edge => edge?.target;
export const workflowStep = (record, nodeId) => record.workflowSnapshot?.nodes?.find(n => n.id === nodeId);
export const taskIsOpen = task => task.status === 'Open';
export const openTasks = record => (record.runtime?.tasks || []).filter(taskIsOpen);
export function canWorkTask(task, user, project, db) {
    if (!user || !task || !project)
        return false;
    // New tasks are addressed to a specific user at each stage; membership alone must not permit action.
    if (Object.hasOwn(task, 'assignedTo'))
        return taskForUser(task, user.id, db, project.id);
    if (user.platformAdmin || project.adminIds?.includes(user.id) || (db.roleAssignments || []).some(a => a.projectId === project.id && a.userId === user.id && a.roleId === 'project_admin'))
        return true;
    if (!task.teamId)
        return false;
    const team = (db.teams || []).find(t => t.id === task.teamId && t.projectId === project.id);
    if (!team)
        return false;
    return !!(team.members || []).includes(user.id) || (team.leadIds || []).includes(user.id) || team.leadId === user.id || (team.unitHeadIds || []).includes(user.id) || (db.roleAssignments || []).some(a => a.projectId === project.id && a.userId === user.id && a.teamIds?.includes(team.id));
}
export function canSeeCase(record, user, project, db) {
    if (!user || !project || record.projectId !== project.id)
        return false;
    if (user.platformAdmin || project.adminIds?.includes(user.id) || (db.roleAssignments || []).some(a => a.projectId === project.id && a.userId === user.id && a.roleId === 'project_admin'))
        return true;
    if (record.createdBy === user.id)
        return true;
    const relevantTeams = new Set((record.runtime?.tasks || []).map(t => t.teamId).filter(Boolean));
    for (const id of relevantTeams) {
        const team = db.teams?.find(t => t.id === id && t.projectId === project.id);
        if (teamMemberIds(team, db).includes(user.id))
            return true;
    }
    return false;
}
function decisionPass(node, record) {
    const data = node.data || {};
    const value = data.conditionField === 'title' ? record.title : data.conditionField === 'description' ? record.description : record.fieldValues?.[data.conditionField];
    const wanted = String(data.conditionValue ?? '').trim().toLowerCase();
    const actual = String(value ?? '').trim().toLowerCase();
    switch (data.conditionOperator || 'equals') {
        case 'notEquals': return actual !== wanted;
        case 'contains': return actual.includes(wanted);
        case 'isEmpty': return !actual;
        case 'notEmpty': return !!actual;
        case 'greaterThan': return Number(value) > Number(data.conditionValue);
        default: return actual === wanted;
    }
}
function chooseEdges(node, graph, record, action) {
    const edges = links(graph, node.id);
    if (node.data?.kind === 'decision') {
        const result = decisionPass(node, record);
        const aliases = result ? ['yes', 'true', 'pass', 'approved'] : ['no', 'false', 'fail', 'rejected'];
        const hit = edges.find(e => aliases.includes(String(e.data?.outcome || e.label || '').trim().toLowerCase()));
        return hit ? [hit] : (edges[result ? 0 : 1] ? [edges[result ? 0 : 1]] : []);
    }
    if (action) {
        const chosen = edges.filter(e => String(e.data?.outcome || e.label || '').toLowerCase() === String(action).toLowerCase());
        if (chosen.length)
            return chosen;
        if (['Reject', 'Return', 'Request information'].includes(action))
            return [];
        const defaultEdges = edges.filter(e => !e.data?.outcome && !e.label);
        if (defaultEdges.length)
            return defaultEdges;
    }
    return node.data?.kind === 'parallel' ? edges : edges.slice(0, 1);
}
function advance(record, entryNodeIds, actorId, actionLabel, db = null) {
    const graph = record.workflowSnapshot;
    if (!graph)
        return record;
    const runtime = structuredClone(record.runtime || { tasks: [], events: [], waiting: [], pendingOperations: [] });
    runtime.pendingOperations ||= [];
    const queue = [...entryNodeIds];
    let steps = 0, reachedEnd = false;
    while (queue.length && steps++ < 100) {
        const nodeId = queue.shift();
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node)
            continue;
        const kind = node.data?.kind;
        runtime.events.push({ id: id(), at: stamp(), actorId, stepId: node.id, kind: 'entered', message: `Reached ${labelOf(node)}` });
        if (kind === 'end') {
            reachedEnd = true;
            continue;
        }
        if (HUMAN.has(kind)) {
            const teamIds = kind === 'groupReview' ? (node.data?.teamIds || []) : [node.data?.teamId || null];
            for (const teamId of teamIds.length ? teamIds : [null]) {
                const assignment = db ? initialTeamAssignment(db, record.projectId, teamId, node.data?.routeViaHierarchy !== false, node.data?.assignmentMode, node.data?.assignedRole) : {};
                const openedAt = stamp();
                const project = db?.projects?.find(p => p.id === record.projectId);
                const calendar = db?.calendars?.find(c => c.id === project?.calendarId);
                const dueAt = calculateDemoTatDueAt(openedAt, node.data?.slaHours || project?.slaHours, calendar);
                runtime.tasks.push({ id: id(), nodeId: node.id, teamId, status: 'Open', createdAt: openedAt, dueAt, formIds: node.data?.formIds || [], requireForm: Boolean(node.data?.requireForm), ...assignment });
                if (db)
                    runtime.events.push({ id: id(), at: stamp(), actorId: null, stepId: node.id, kind: 'assigned', message: assignment.routingStage === 'unit_head' ? 'Sent to Unit Head for review' : assignment.routingStage === 'team_lead' ? 'Sent to Team Lead for assignment' : assignment.assignedTo ? 'Assigned to Officer' : 'No available recipient; assignment required', recipientId: assignment.assignedTo, teamId });
            }
            continue;
        }
        if (kind === 'wait') {
            runtime.waiting.push({ id: id(), nodeId: node.id, createdAt: stamp(), delayMinutes: node.data?.delayMinutes || 60 });
            runtime.events.push({ id: id(), at: stamp(), actorId, kind: 'simulation', message: 'Timer paused for manual continuation in demo' });
            continue;
        }
        if (kind === 'dataSource') {
            runtime.pendingOperations.push({ id: id(), nodeId: node.id, status: 'Pending', createdAt: stamp(), dataSourceId: node.data?.dataSourceId, operationCode: node.data?.operationCode });
            runtime.events.push({ id: id(), at: stamp(), actorId, stepId: node.id, kind: 'integration', message: `Queued API operation · ${labelOf(node)}` });
            continue;
        }
        if (kind === 'notify')
            runtime.events.push({ id: id(), at: stamp(), actorId, kind: 'simulation', message: `Notification step ${labelOf(node)} is configuration only; no message sent` });
        for (const edge of chooseEdges(node, graph, record, actionLabel))
            queue.push(destination(edge));
    }
    if (steps >= 100)
        runtime.events.push({ id: id(), at: stamp(), actorId, kind: 'error', message: 'Simulation stopped after 100 steps (possible cycle)' });
    const pending = runtime.tasks.some(taskIsOpen) || runtime.waiting.length > 0 || runtime.pendingOperations.some(x => ['Pending', 'Sending', 'Failed'].includes(x.status));
    const status = reachedEnd && !pending ? 'Closed' : runtime.pendingOperations.some(o => o.status === 'Failed') ? 'Integration failed' : runtime.pendingOperations.some(o => ['Pending', 'Sending'].includes(o.status)) ? 'Waiting for integration' : runtime.waiting.length && !runtime.tasks.some(taskIsOpen) ? 'Waiting' : runtime.tasks.some(taskIsOpen) ? 'In progress' : record.status;
    return { ...record, status, runtime, updatedAt: stamp(), closedAt: status === 'Closed' ? stamp() : record.closedAt };
}
export function startCase(record, workflow, actorId, db = null) {
    const first = { ...record, intakeValues: { ...(record.intakeValues || record.fieldValues || {}) }, stepValues: { ...(record.stepValues || {}) }, workflowSnapshot: workflow?.status === 'Published' ? { id: workflow.id, name: workflow.name, code: workflow.code, version: workflow.version, nodes: structuredClone(workflow.nodes || []), edges: structuredClone(workflow.edges || []) } : null, runtime: { tasks: [], events: [{ id: id(), at: stamp(), actorId, kind: 'created', message: 'Case submitted' }], waiting: [], pendingOperations: [] }, status: 'Open', createdBy: actorId };
    if (!first.workflowSnapshot)
        return { ...first, runtime: { ...first.runtime, events: [...first.runtime.events, { id: id(), at: stamp(), actorId, kind: 'warning', message: 'No published workflow bound — awaiting setup' }] } };
    const starts = first.workflowSnapshot.nodes.filter(n => n.data?.kind === 'start');
    if (starts.length !== 1)
        return { ...first, runtime: { ...first.runtime, events: [...first.runtime.events, { id: id(), at: stamp(), actorId, kind: 'error', message: 'Workflow has no unique start node' }] } };
    return advance(first, [starts[0].id], actorId, null, db);
}
export function completeCaseTask(record, taskId, action, actorId, formValues = {}, db = null) {
    const runtime = record.runtime;
    const task = runtime?.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'Open')
        throw new Error('This task is no longer available.');
    if (db && task.routingStage && task.routingStage !== 'officer')
        throw Error('Forward this task through the team hierarchy before completing the review.');
    if (db && !taskForUser(task, actorId, db, record.projectId))
        throw Error('This task is not assigned to you.');
    const node = workflowStep(record, task.nodeId);
    if (!node)
        throw new Error('Workflow step was not found.');
    const allowed = node.data?.actions?.length ? node.data.actions : ['Complete', 'Approve', 'Reject', 'Return', 'Forward', 'Request information'];
    if (!allowed.includes(action))
        throw new Error('This action is not allowed on this step.');
    const changed = structuredClone(record);
    const target = changed.runtime.tasks.find(t => t.id === taskId);
    Object.assign(target, { status: 'Completed', completedAt: stamp(), actorId, action, formValues });
    changed.runtime.events.push({ id: id(), at: stamp(), actorId, stepId: task.nodeId, kind: 'action', message: `${action} · ${labelOf(node)}` });
    // Preserve step answers by form AND merge into shared fields for all subsequent teams.
    const carried = carryForwardAnswers(changed, formValues);
    changed.fieldValues = carried.fieldValues;
    changed.stepValues = carried.stepValues;
    if (changed.runtime.tasks.some(t => t.nodeId === task.nodeId && t.status === 'Open'))
        return { ...changed, updatedAt: stamp() };
    const next = chooseEdges(node, changed.workflowSnapshot, changed, action);
    if (!next.length) {
        if (action === 'Reject')
            return { ...changed, status: 'Rejected', closedAt: stamp(), updatedAt: stamp() };
        if (action === 'Return' || action === 'Request information')
            return { ...changed, status: 'Waiting for information', updatedAt: stamp() };
        return { ...changed, status: 'Waiting', updatedAt: stamp(), runtime: { ...changed.runtime, events: [...changed.runtime.events, { id: id(), at: stamp(), actorId, kind: 'warning', message: 'No next transition configured' }] } };
    }
    return advance(changed, next.map(destination), actorId, action, db);
}
export function continueWait(record, waitId, actorId, db = null) {
    const existing = record.runtime?.waiting?.find(w => w.id === waitId);
    if (!existing)
        throw new Error('Timer is no longer pending.');
    const changed = structuredClone(record);
    changed.runtime.waiting = changed.runtime.waiting.filter(w => w.id !== waitId);
    changed.runtime.events.push({ id: id(), at: stamp(), actorId, kind: 'simulation', message: 'Timer manually resumed in demo' });
    const next = links(changed.workflowSnapshot, existing.nodeId);
    return advance(changed, next.map(destination), actorId, null, db);
}
/** External calls are asynchronous. The case remains persisted in a pending state until a verified response is received. */
export function completeDataSourceStep(record, operationId, mapped, actorId = null, db = null) {
    const pending = record.runtime?.pendingOperations?.find(x => x.id === operationId);
    if (!pending || !['Pending', 'Failed', 'Sending'].includes(pending.status))
        throw Error('No pending integration operation found');
    const changed = structuredClone(record);
    changed.runtime.pendingOperations = changed.runtime.pendingOperations.filter(x => x.id !== operationId);
    changed.fieldValues = { ...(changed.fieldValues || {}), ...(mapped?.intake || {}) };
    changed.classificationValues = { ...(changed.classificationValues || {}), ...(mapped?.classification || {}) };
    changed.integrationValues = { ...(changed.integrationValues || {}), ...(mapped?.context || {}), ...(mapped?.intake || {}) };
    changed.runtime.events.push({ id: id(), kind: 'integration-success', at: stamp(), actorId, stepId: pending.nodeId, message: `Data source responded · ${Object.keys(mapped?.intake || {}).length + Object.keys(mapped?.context || {}).length + Object.keys(mapped?.classification || {}).length} fields mapped` });
    return advance(changed, links(changed.workflowSnapshot, pending.nodeId).map(destination), actorId, null, db);
}
export function failDataSourceStep(record, operationId, error, actorId = null) {
    const changed = structuredClone(record);
    const pending = changed.runtime?.pendingOperations?.find(x => x.id === operationId);
    if (!pending)
        throw Error('Integration operation no longer pending');
    pending.status = 'Failed';
    pending.lastError = String(error).slice(0, 400);
    pending.updatedAt = stamp();
    changed.status = 'Integration failed';
    changed.updatedAt = stamp();
    changed.runtime.events.push({ id: id(), kind: 'error', at: stamp(), actorId, stepId: pending.nodeId, message: `API operation failed: ${pending.lastError}` });
    return changed;
}
