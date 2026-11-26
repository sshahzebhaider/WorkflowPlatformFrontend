import { uid } from './helpers.js';
/** Frontend demo permissions and immutable audit updates for manager force intimation. */
import { teamPeople } from './workforce.js';
const id = uid;
export function canForceIntimate(db, projectId, actorId, task) {
    if (!actorId || !task?.teamId || !task?.assignedTo || task.assignedTo === actorId || task.status !== 'Open')
        return false;
    const team = (db.teams || []).find(t => t.id === task.teamId && t.projectId === projectId);
    if (!team)
        return false;
    if (teamPeople(team, 'unit_head', db).includes(actorId))
        return ['team_lead', 'officer'].includes(task.routingStage);
    if (teamPeople(team, 'team_lead', db).includes(actorId))
        return task.routingStage === 'officer';
    return false;
}
export function forceIntimation(record, taskId, actorId, priority, reason, delivery, db) {
    const task = record.runtime?.tasks?.find(t => t.id === taskId);
    if (!canForceIntimate(db, record.projectId, actorId, task))
        throw Error('Only this team’s Unit Head or Team Lead can intimate subordinate open tasks');
    if (!['High', 'Urgent'].includes(priority))
        throw Error('Choose High or Urgent priority');
    if (!String(reason || '').trim())
        throw Error('Provide a reason');
    const changed = structuredClone(record), target = changed.runtime.tasks.find(t => t.id === taskId), at = new Date().toISOString();
    target.priority = priority;
    target.escalations = [...(target.escalations || []), { id: id(), at, actorId, priority, reason: reason.trim(), deliveryMode: delivery?.mode || 'failed', deliveryMessage: delivery?.message || null }];
    const outcome = delivery?.mode === 'live' ? 'Email provider accepted message' : delivery?.mode === 'preview' ? 'Email preview only — no email sent' : 'Email failed';
    changed.runtime.events = [...(changed.runtime.events || []), { id: id(), kind: 'escalation', at, actorId, stepId: target.nodeId, recipientId: target.assignedTo, taskId, message: `Force intimation · ${priority} · ${outcome}`, reason: reason.trim() }];
    changed.updatedAt = at;
    return changed;
}
