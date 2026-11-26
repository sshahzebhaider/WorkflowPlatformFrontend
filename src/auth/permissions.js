/** Browser-only preview permissions. The real backend must independently authenticate and authorize all actions. */
export const PERMISSION_GROUPS = [
    { label: 'Project workspace', permissions: [['project.view', 'View project overview'], ['cases.view', 'View cases'], ['cases.create', 'Create cases'], ['cases.manage', 'Manage cases'], ['reports.view', 'View reports']] },
    { label: 'People and administration', permissions: [['teams.view', 'View teams'], ['teams.manage', 'Manage teams'], ['roles.assign', 'Assign project roles'], ['settings.view', 'View project settings'], ['settings.manage', 'Change project settings']] },
    { label: 'Design and configuration', permissions: [['forms.view', 'View forms'], ['forms.manage', 'Design/publish forms'], ['workflows.view', 'View workflows'], ['workflows.manage', 'Design/publish workflows'], ['lookups.view', 'View lookups'], ['lookups.manage', 'Manage project lookups']] },
    { label: 'Operations', permissions: [['notifications.view', 'View notifications'], ['notifications.manage', 'Manage notification rules'], ['audit.view', 'View change history']] },
];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(group => group.permissions.map(([key]) => key));
const PROJECT_ADMIN = ALL_PERMISSIONS;
const VIEW_ONLY = ['project.view', 'cases.view', 'reports.view'];
export const DEFAULT_ROLES = [
    { id: 'platform_admin', name: 'Platform Admin', description: 'Full platform-wide access; managed through Platform users', permissions: ALL_PERMISSIONS, scope: 'platform', system: true },
    { id: 'project_admin', name: 'Project Admin', description: 'Full administration within assigned projects', permissions: PROJECT_ADMIN, scope: 'project', system: true },
    { id: 'unit_head', name: 'Unit Head', description: 'Oversight of multiple teams and their project work', permissions: [...VIEW_ONLY, 'cases.create', 'cases.manage'], scope: 'team', system: true },
    { id: 'team_lead', name: 'Team Lead', description: 'Lead and monitor an assigned team', permissions: [...VIEW_ONLY, 'cases.create', 'cases.manage'], scope: 'team', system: true },
    { id: 'team_member', name: 'Team Member', description: 'Work on cases assigned to the team', permissions: ['project.view', 'cases.view', 'cases.create', 'cases.manage', 'reports.view'], scope: 'team', system: true },
    { id: 'viewer', name: 'Viewer', description: 'Read-only access to permitted project screens', permissions: VIEW_ONLY, scope: 'project', system: true },
];
export function memberships(db, projectId, userId) {
    if (!userId || !projectId || db.users?.find(u => u.id === userId)?.directoryStatus === 'resigned' || db.users?.find(u => u.id === userId)?.active === false)
        return [];
    const p = db.projects.find(x => x.id === projectId);
    if (!p)
        return [];
    const roles = [];
    if (p.adminIds?.includes(userId))
        roles.push({ id: 'admin-' + projectId, roleId: 'project_admin', teamIds: [] });
    for (const team of db.teams || []) {
        if (team.projectId !== projectId)
            continue;
        if (team.leadId === userId || team.leadIds?.includes(userId))
            roles.push({ id: 'lead-' + team.id, roleId: 'team_lead', teamIds: [team.id] });
        if (team.unitHeadIds?.includes(userId))
            roles.push({ id: 'head-' + team.id, roleId: 'unit_head', teamIds: [team.id] });
        if (team.members?.includes(userId))
            roles.push({ id: 'member-' + team.id, roleId: 'team_member', teamIds: [team.id] });
    }
    roles.push(...(db.roleAssignments || []).filter(a => a.projectId === projectId && a.userId === userId));
    return roles;
}
export function projectPermissions(db, projectId, userId) {
    if (db.users?.find(u => u.id === userId)?.platformAdmin)
        return ALL_PERMISSIONS;
    const perms = new Set();
    const definitions = [...DEFAULT_ROLES, ...(db.roles || [])];
    for (const assignment of memberships(db, projectId, userId)) {
        const role = definitions.find(x => x.id === assignment.roleId);
        for (const key of role?.permissions || [])
            perms.add(key);
    }
    return [...perms];
}
export function projectAccess(db, projectId, userId) {
    if (db.users?.find(u => u.id === userId)?.platformAdmin)
        return true;
    return memberships(db, projectId, userId).length > 0;
}
export function roleLabels(db, projectId, userId) {
    const definitions = [...DEFAULT_ROLES, ...(db.roles || [])];
    return [...new Set(memberships(db, projectId, userId).map(a => definitions.find(r => r.id === a.roleId)?.name).filter(Boolean))];
}
export function isProjectSetupAdmin(db, projectId, userId) {
    const user = db.users?.find(u => u.id === userId);
    return !!user && user.directoryStatus !== 'resigned' && user.active !== false && (user.platformAdmin || db.projects?.find(p => p.id === projectId)?.adminIds?.includes(userId) || (db.roleAssignments || []).some(a => a.projectId === projectId && a.userId === userId && a.roleId === 'project_admin'));
}
