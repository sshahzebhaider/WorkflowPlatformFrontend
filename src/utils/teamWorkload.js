/** Distribution of open tasks, not a subjective utilization or working-hours capacity score. */
export function teamWorkload(members, tasks) {
    const active = (members || []).filter(Boolean);
    const pending = (tasks || []).filter(row => row?.task?.status === 'Open');
    const assigned = pending.filter(row => row.task.assignedTo != null);
    const total = assigned.length;
    return active.map(member => {
        const count = assigned.filter(row => String(row.task.assignedTo) === String(member.id)).length;
        return { ...member, openTasks: count, workloadPct: total ? Math.round(count * 1000 / total) / 10 : 0 };
    });
}
export function canRebalanceTask(row, sourceUserId, destination, db, teamId, projectId) {
    if (!row || row.task?.status !== 'Open' || String(row.task.teamId) !== String(teamId))
        return false;
    if (sourceUserId != null && String(row.task.assignedTo) !== String(sourceUserId))
        return false;
    if (!destination || destination.active === false || destination.directoryStatus === 'resigned')
        return false;
    if (String(row.task.assignedTo) === String(destination.id))
        return false;
    const team = (db.teams || []).find(t => String(t.id) === String(teamId) && String(t.projectId) === String(projectId));
    if (!team)
        return false;
    const stage = String(row.task.routingStage || '').toLowerCase().replaceAll('_', '');
    const allowed = stage === 'unithead' ? team.unitHeadIds : stage === 'teamlead' ? team.leadIds || [team.leadId] : team.members;
    return (allowed || []).some(id => String(id) === String(destination.id));
}
