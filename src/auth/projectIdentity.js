/** A user's role is always evaluated against the *selected* project, never all projects. */
export const sameId = (left, right) => left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
export const projectRoleLabels = (assignments, projectId) => [...new Set((assignments || [])
        .filter(a => a.scope?.toLowerCase() === 'platform' && a.projectId == null || sameId(a.projectId, projectId))
        .map(a => a.roleName || a.roleCode).filter(Boolean))];
export const isProjectAdministrator = (assignments, projectId) => (assignments || []).some(a => String(a.roleCode || '').toLowerCase() === 'project_admin' && sameId(a.projectId, projectId));
