import { uid } from './helpers.js';
/** Browser-local assignment model. A future API must enforce every operation. */
const now = () => new Date().toISOString();
const freshId = uid;
export function activeUser(db, userId) { return Boolean(userId && db.users?.some(u => u.id === userId && u.directoryStatus !== 'resigned' && u.active !== false)); }
export function todayISO(date = new Date()) { return new Date(date).toISOString().slice(0, 10); }
export function onLeave(db, userId, projectId, day = todayISO()) {
    return (db.teamAbsences || []).some(x => x.projectId === projectId && x.userId === userId && x.enabled !== false && x.from <= day && day <= x.to);
}
export function teamPeople(team, kind, db = null) {
    if (!team)
        return [];
    const base = kind === 'unit_head' ? (team.unitHeadIds || []) : kind === 'team_lead' ? [...(team.leadIds || []), ...(team.leadId ? [team.leadId] : [])] : team.members || [];
    const role = kind === 'unit_head' ? 'unit_head' : kind === 'team_lead' ? 'team_lead' : 'team_member';
    const assigned = (db?.roleAssignments || []).filter(a => a.projectId === team.projectId && a.roleId === role && a.teamIds?.includes(team.id)).map(a => a.userId);
    return [...new Set([...base, ...assigned])];
}
export function managedTeams(db, projectId, userId) {
    const teams = (db.teams || []).filter(t => t.projectId === projectId);
    const project = db.projects?.find(p => p.id === projectId);
    if (db.users?.find(u => u.id === userId)?.platformAdmin || project?.adminIds?.includes(userId) || db.roleAssignments?.some(a => a.projectId === projectId && a.userId === userId && a.roleId === 'project_admin'))
        return teams;
    return teams.filter(t => teamPeople(t, 'unit_head', db).includes(userId) || teamPeople(t, 'team_lead', db).includes(userId));
}
export function teamMemberIds(team, db = null) { return [...new Set([...teamPeople(team, 'officer', db), ...teamPeople(team, 'team_lead', db), ...teamPeople(team, 'unit_head', db)])]; }
export function backupFor(db, projectId, teamId, userId, day = todayISO()) {
    const absent = (db.teamAbsences || []).find(x => x.projectId === projectId && x.teamId === teamId && x.userId === userId && x.enabled !== false && x.from <= day && day <= x.to);
    if (!absent)
        return null;
    const member = db.teams?.find(t => t.projectId === projectId && t.id === teamId);
    return teamMemberIds(member, db).includes(absent.backupUserId) && activeUser(db, absent.backupUserId) && !onLeave(db, absent.backupUserId, projectId, day) ? absent.backupUserId : null;
}
function eligible(db, projectId, teamId, candidates) {
    for (const candidate of candidates) {
        if (!activeUser(db, candidate))
            continue;
        if (!onLeave(db, candidate, projectId))
            return { assignedTo: candidate, delegatedFor: null };
        const backup = backupFor(db, projectId, teamId, candidate);
        if (backup)
            return { assignedTo: backup, delegatedFor: candidate };
    }
    return { assignedTo: null, delegatedFor: null };
}
export function initialTeamAssignment(db, projectId, teamId, routeViaHierarchy = true, assignmentMode = null, assignedRole = null) {
    if (!db || !teamId)
        return { routingStage: 'unassigned', assignedTo: null, delegatedFor: null };
    const team = db.teams?.find(t => t.projectId === projectId && t.id === teamId);
    if (!team)
        return { routingStage: 'unassigned', assignedTo: null, delegatedFor: null };
    const roleStage = { unit_head: 'unit_head', team_lead: 'team_lead', team_member: 'officer' }[assignedRole];
    const levels = assignmentMode === 'direct' ? ['officer'] : assignmentMode === 'roleQueue' && roleStage ? [roleStage] : routeViaHierarchy ? ['unit_head', 'team_lead', 'officer'] : ['officer'];
    for (const stage of levels) {
        const candidates = teamPeople(team, stage, db);
        if (!candidates.length)
            continue;
        const matched = eligible(db, projectId, teamId, candidates);
        return { routingStage: stage, ...matched };
    }
    return { routingStage: 'unassigned', assignedTo: null, delegatedFor: null };
}
export function taskForUser(task, userId, db, projectId) {
    if (!task || task.status !== 'Open' || !activeUser(db, userId))
        return false;
    if (Object.hasOwn(task, 'assignedTo'))
        return task.assignedTo === userId;
    // Legacy records with no individual assignment are still visible to the team.
    const team = db.teams?.find(t => t.id === task.teamId && t.projectId === projectId);
    return teamMemberIds(team, db).includes(userId);
}
export function nextRoutingStage(team, currentStage, db = null) {
    if (currentStage === 'unit_head')
        return teamPeople(team, 'team_lead', db).length ? 'team_lead' : 'officer';
    if (currentStage === 'team_lead')
        return 'officer';
    return null;
}
export function routeTask(record, taskId, actorId, recipientId, db) {
    const recordCopy = structuredClone(record);
    const task = recordCopy.runtime?.tasks?.find(t => t.id === taskId);
    if (!task || task.status !== 'Open')
        throw Error('This task is no longer open.');
    const team = db.teams?.find(t => t.id === task.teamId && t.projectId === record.projectId);
    if (!team)
        throw Error('The workflow team is missing.');
    if (!taskForUser(task, actorId, db, record.projectId))
        throw Error('Only the assigned reviewer or their authorized backup can forward this task.');
    const targetStage = nextRoutingStage(team, task.routingStage, db);
    if (!targetStage)
        throw Error('This task is ready for a final review; it cannot be forwarded again.');
    if (!teamPeople(team, targetStage, db).includes(recipientId))
        throw Error('Choose a person in the next team role.');
    if (!activeUser(db, recipientId))
        throw Error('The selected directory user is inactive.');
    const resolved = eligible(db, record.projectId, team.id, [recipientId]);
    if (!resolved.assignedTo)
        throw Error('The selected person is unavailable and has no active backup.');
    Object.assign(task, { routingStage: targetStage, assignedTo: resolved.assignedTo, delegatedFor: resolved.delegatedFor, assignedAt: now(), routingHistory: [...(task.routingHistory || []), { at: now(), actorId, to: resolved.assignedTo, forUser: resolved.delegatedFor, stage: targetStage }] });
    recordCopy.runtime.events.push({ id: freshId(), kind: 'forward', at: now(), actorId, stepId: task.nodeId, message: targetStage === 'team_lead' ? 'Forwarded for team lead review' : 'Assigned to team member', recipientId: resolved.assignedTo, teamId: team.id });
    recordCopy.updatedAt = now();
    return recordCopy;
}
export function applyAbsence(db, absence) {
    const team = db.teams?.find(t => t.id === absence.teamId && t.projectId === absence.projectId);
    if (!team || !teamMemberIds(team, db).includes(absence.userId))
        throw Error('The absent user must belong to the selected team.');
    if (absence.from > absence.to)
        throw Error('Leave end date must be after the start date.');
    if (!absence.backupUserId || absence.backupUserId === absence.userId || !teamMemberIds(team, db).includes(absence.backupUserId))
        throw Error('Choose a different backup from this team.');
    if (!activeUser(db, absence.backupUserId) || onLeave(db, absence.backupUserId, absence.projectId))
        throw Error('Backup must be active and available.');
    const plans = [...(db.teamAbsences || []).filter(a => !(a.projectId === absence.projectId && a.teamId === absence.teamId && a.userId === absence.userId)), { id: absence.id || freshId(), ...absence, enabled: true }];
    return refreshAssignments({ ...db, teamAbsences: plans }, absence.projectId);
}
export function refreshAssignments(db, projectId) {
    // Only redistribute tasks whose current assignee is absent or resigned. Leave historical actions untouched.
    const cases = (db.cases || []).map(record => {
        if (record.projectId !== projectId)
            return record;
        const changed = structuredClone(record);
        let reassigned = false;
        for (const task of changed.runtime?.tasks || []) {
            if (task.status !== 'Open' || !task.teamId || !Object.hasOwn(task, 'assignedTo'))
                continue;
            if (task.assignedTo && activeUser(db, task.assignedTo) && !onLeave(db, task.assignedTo, projectId))
                continue;
            if (!task.assignedTo) {
                const newTarget = initialTeamAssignment(db, projectId, task.teamId, true);
                if (newTarget.assignedTo) {
                    Object.assign(task, newTarget, { assignedAt: now() });
                    reassigned = true;
                    changed.runtime.events.push({ id: freshId(), at: now(), kind: 'assigned', actorId: null, stepId: task.nodeId, message: 'Unassigned work sent to the available team reviewer', recipientId: newTarget.assignedTo });
                }
                continue;
            }
            const team = db.teams.find(t => t.id === task.teamId && t.projectId === projectId);
            const candidates = teamPeople(team, task.routingStage || 'officer', db);
            const backup = backupFor(db, projectId, task.teamId, task.assignedTo);
            let result = backup ? { assignedTo: backup, delegatedFor: task.assignedTo } : eligible(db, projectId, task.teamId, candidates.filter(id => id !== task.assignedTo));
            const before = task.assignedTo;
            // When a role no longer has an active holder after directory sync, skip to the next team level.
            if (!result.assignedTo) {
                const fallback = nextRoutingStage(team, task.routingStage, db);
                if (fallback) {
                    const next = eligible(db, projectId, task.teamId, teamPeople(team, fallback, db));
                    if (next.assignedTo) {
                        result = next;
                        task.routingStage = fallback;
                    }
                }
            }
            Object.assign(task, { ...result, assignedAt: now() });
            if (before !== result.assignedTo) {
                reassigned = true;
                changed.runtime.events.push({ id: freshId(), at: now(), kind: 'delegation', actorId: null, stepId: task.nodeId, message: result.assignedTo ? 'Task redirected to available backup or teammate' : 'Task unassigned — no available team member', fromUserId: before, recipientId: result.assignedTo });
            }
        }
        return reassigned ? { ...changed, updatedAt: now() } : record;
    });
    return { ...db, cases };
}
export function syncDirectoryPreview(db, projectId) {
    const resigned = (db.users || []).filter(u => u.directoryStatus === 'resigned' || u.active === false).map(u => u.id);
    const removed = new Set(resigned);
    if (!resigned.length)
        return { db, removed: [] };
    const teams = db.teams.map(team => team.projectId !== projectId ? team : { ...team, members: (team.members || []).filter(id => !removed.has(id)), leadIds: (team.leadIds || []).filter(id => !removed.has(id)), unitHeadIds: (team.unitHeadIds || []).filter(id => !removed.has(id)), leadId: removed.has(team.leadId) ? null : team.leadId });
    const projects = db.projects.map(project => project.id !== projectId ? project : { ...project, adminIds: (project.adminIds || []).filter(id => !removed.has(id)) });
    const next = { ...db, teams, projects, roleAssignments: (db.roleAssignments || []).filter(a => a.projectId !== projectId || !removed.has(a.userId)), teamAbsences: (db.teamAbsences || []).filter(a => a.projectId !== projectId || (!removed.has(a.userId) && !removed.has(a.backupUserId))) };
    return { db: refreshAssignments(next, projectId), removed: resigned };
}
