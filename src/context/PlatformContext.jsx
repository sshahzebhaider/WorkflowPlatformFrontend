import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { seed, defaultTerms } from '../data/seed';
import { DEFAULT_ROLES, projectAccess, projectPermissions, roleLabels, isProjectSetupAdmin } from '../auth/permissions';
import { uid, slug, sampleNodes, sampleEdges } from '../utils/helpers';
import { applyAbsence, syncDirectoryPreview, refreshAssignments } from '../utils/workforce';
const DB_KEY = 'workflow-platform-jsx-db-v1';
const SESSION_KEY = 'workflow-platform-jsx-session-v1';
export const PlatformContext = createContext(null);
const Context = PlatformContext;
function readStorage(key, fallback) { try {
    const data = JSON.parse(localStorage.getItem(key));
    return data ?? fallback;
}
catch {
    return fallback;
} }
const entityKinds = ['calendars', 'dataSources', 'lookups', 'projects', 'teams', 'forms', 'workflows', 'cases', 'caseTypes', 'notifications', 'fieldLibrary', 'roles', 'roleAssignments', 'users', 'teamAbsences', 'rcaTemplates'];
export function PlatformProvider({ children }) {
    const [db, setDb] = useState(() => {
        const old = readStorage(DB_KEY, null);
        if (!old || !Array.isArray(old.projects) || !Array.isArray(old.users))
            return structuredClone(seed);
        return { ...structuredClone(seed), ...old, fieldLibrary: old.fieldLibrary || [], roles: [...DEFAULT_ROLES.map(r => ({ ...r, ...old.roles?.find(o => o.id === r.id) })), ...(old.roles || []).filter(r => !DEFAULT_ROLES.some(d => d.id === r.id))], roleAssignments: old.roleAssignments || [], teamAbsences: old.teamAbsences || [], rcaTemplates: old.rcaTemplates || [], projectStatusHistory: old.projectStatusHistory || [] };
    });
    const [session, setSession] = useState(() => readStorage(SESSION_KEY, { userId: null, projectId: null }));
    useEffect(() => localStorage.setItem(DB_KEY, JSON.stringify(db)), [db]);
    useEffect(() => localStorage.setItem(SESSION_KEY, JSON.stringify(session)), [session]);
    const user = db.users.find(u => u.id === session.userId && u.directoryStatus !== 'resigned' && u.active !== false) || null;
    const project = db.projects.find(p => p.id === session.projectId) || null;
    const isPlatformAdmin = Boolean(user?.platformAdmin);
    const canSetup = useCallback((projectId) => isProjectSetupAdmin(db, projectId, user?.id), [db, user]);
    const accessible = db.projects.filter(p => !!user && projectAccess(db, p.id, user.id));
    const canAccess = useCallback((projectId) => !!user && projectAccess(db, projectId, user.id), [db, user]);
    const can = useCallback((permission, projectId) => !!user && (isPlatformAdmin || projectPermissions(db, projectId, user.id).includes(permission)), [db, user, isPlatformAdmin]);
    const labels = useCallback(projectId => user ? roleLabels(db, projectId, user.id) : [], [db, user]);
    const log = (action, entity, projectId = null, extra = {}) => ({ id: uid(), action, entity, projectId, actorId: session.userId, date: new Date().toISOString(), ...extra });
    const add = (kind, data) => {
        if (!entityKinds.includes(kind))
            throw new Error('Unknown entity type');
        const item = { ...data, ...(data.name && ['calendars', 'dataSources', 'lookups', 'projects', 'teams', 'forms', 'workflows', 'caseTypes', 'fieldLibrary', 'roles', 'rcaTemplates'].includes(kind) ? { code: slug(data.name) } : {}), id: data.id || uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        setDb(s => { const next = { ...s, [kind]: [...s[kind], item], audits: [log('Created', kind, item.projectId || null, { entityId: item.id }), ...s.audits] }; return kind === 'teams' ? refreshAssignments(next, item.projectId) : next; });
        return item;
    };
    const update = (kind, id, patch) => {
        if (!entityKinds.includes(kind))
            throw new Error('Unknown entity type');
        setDb(s => { const original = s[kind].find(x => x.id === id); const next = { ...s, [kind]: s[kind].map(x => x.id === id ? { ...x, ...patch, ...(patch.name && ['calendars', 'dataSources', 'lookups', 'projects', 'teams', 'forms', 'workflows', 'caseTypes', 'fieldLibrary', 'roles', 'rcaTemplates'].includes(kind) ? { code: slug(patch.name) } : {}), updatedAt: new Date().toISOString() } : x), audits: [log('Updated', kind, patch.projectId || original?.projectId || null, { entityId: id }), ...s.audits] }; return kind === 'teams' ? refreshAssignments(next, original?.projectId) : next; });
    };
    const remove = (kind, id) => {
        if (!entityKinds.includes(kind))
            throw new Error('Unknown entity type');
        setDb(s => ({ ...s, [kind]: s[kind].filter(x => x.id !== id), audits: [log('Deleted', kind, s[kind].find(x => x.id === id)?.projectId || null, { entityId: id }), ...s.audits] }));
    };
    const createProject = (data) => {
        const exists = db.projects.some(p => p.code.toUpperCase() === data.code.toUpperCase());
        if (exists)
            throw new Error('A project with this code already exists.');
        const rcaTemplate = data.rcaConfig?.enabled ? db.rcaTemplates?.find(t => t.id === data.rcaConfig?.templateId) : null;
        if (data.rcaConfig?.enabled && !rcaTemplate)
            throw Error('Select a configured RCA template before onboarding this project.');
        const projectRow = { ...data, rcaConfig: data.rcaConfig?.enabled ? { ...data.rcaConfig, requiredOnClose: true, fields: structuredClone(rcaTemplate.fields), templateName: rcaTemplate.name } : data.rcaConfig, code: slug(data.name), id: uid(), status: 'UAT', terms: { ...defaultTerms, ...data.terms }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const scaffolding = [];
        if (/^step[123]$/.test(data.templateKey)) {
            const count = Number(data.templateKey.slice(-1));
            const nodes = [sampleNodes()[0], ...Array.from({ length: count }, (_, i) => ({ id: `step${i+1}`, type: 'flowNode', position: { x: 300+260*i, y: 180 }, data: { label: `Step ${i+1}`, kind: 'task', formIds: [], teamId: null } })), { ...sampleNodes()[2], position: { x: 300+260*count, y: 180 } }];
            const edges = nodes.slice(1).map((node,i) => ({ id: `e-${nodes[i].id}-${node.id}`, source: nodes[i].id, target: node.id, type: 'smoothstep' }));
            scaffolding.push({ kind: 'workflows', item: { id: uid(), projectId: projectRow.id, name: `${count}-step workflow`, code: 'INITIAL_WORKFLOW', status: 'Draft', version: 0, nodes, edges, createdAt: new Date().toISOString() } });
        }
        setDb(s => ({ ...s, projects: [...s.projects, projectRow], forms: [...s.forms, ...scaffolding.filter(x => x.kind === 'forms').map(x => x.item)], workflows: [...s.workflows, ...scaffolding.filter(x => x.kind === 'workflows').map(x => x.item)], projectStatusHistory: [...(s.projectStatusHistory || []), { id: uid(), projectId: projectRow.id, fromStatus: null, toStatus: 'UAT', description: null, actorName: user?.name || '', changedAt: projectRow.createdAt }], audits: [log('Onboarded', 'projects', projectRow.id, { detail: projectRow.name }), ...s.audits] }));
        setSession(s => ({ ...s, projectId: projectRow.id }));
        return projectRow;
    };
    const changeProjectStatus = (projectId, targetStatus, description = '') => {
        if (!isPlatformAdmin)
            throw Error('Only a Platform Admin can change project status.');
        if (!['UAT', 'Live'].includes(targetStatus))
            throw Error('Choose UAT or Live.');
        const existing = db.projects.find(p => p.id === projectId);
        if (!existing)
            throw Error('Project not found.');
        if (existing.status === targetStatus)
            throw Error('Project is already in that status.');
        if (!((existing.status === 'Draft' && targetStatus === 'UAT') ||
            (existing.status === 'UAT' && targetStatus === 'Live') ||
            (existing.status === 'Live' && targetStatus === 'UAT')))
            throw Error('Invalid status transition.');
        if (String(description).length > 1000)
            throw Error('Description is too long.');
        const stamp = new Date().toISOString(), change = { id: uid(), projectId,
            fromStatus: existing.status, toStatus: targetStatus, description: String(description).trim() || null,
            actorName: user?.name || '', changedAt: stamp };
        setDb(old => ({ ...old, projects: old.projects.map(p => p.id === projectId ? { ...p, status: targetStatus, updatedAt: stamp } : p),
            projectStatusHistory: [...(old.projectStatusHistory || []), change],
            audits: [log('ProjectStatusChanged', 'projects', projectId, { fromStatus: existing.status, toStatus: targetStatus,
                    description: change.description }), ...old.audits] }));
    };
    const login = (userId) => { if (db.users.find(u => u.id === userId)?.directoryStatus === 'resigned' || db.users.find(u => u.id === userId)?.active === false)
        throw Error('This account is inactive. Contact an administrator.'); setSession({ userId, projectId: db.projects.find(p => projectAccess(db, p.id, userId))?.id || null }); };
    const logout = () => setSession({ userId: null, projectId: null });
    const selectProject = (id) => { if (canAccess(id))
        setSession(s => ({ ...s, projectId: id })); };
    const saveAbsence = (absence) => {
        if (!user || String(absence.userId) !== String(user.id))
            throw Error('You can only submit leave for your own account.');
        setDb(s => { const next = applyAbsence(s, absence); return { ...next, audits: [log('Leave and backup updated', 'teamAbsences', absence.projectId, { entityId: absence.userId, detail: absence.backupUserId }), ...s.audits] }; });
    };
    const syncProjectDirectory = (projectId) => { const result = syncDirectoryPreview(db, projectId); setDb(s => ({ ...syncDirectoryPreview(s, projectId).db, audits: [log('Directory preview sync', 'users', projectId, { detail: `${result.removed.length} resigned identities reviewed` }), ...s.audits] })); return result.removed.length; };
    const reset = () => { if (!isPlatformAdmin)
        return; setDb(structuredClone(seed)); setSession({ userId: null, projectId: null }); };
    const value = useMemo(() => ({ db, session, user, project, isPlatformAdmin, accessible, canAccess, can, canSetup, roleLabels: labels, login, logout, selectProject, add, update, remove, createProject, saveAbsence, syncProjectDirectory, changeProjectStatus, reset }), [db, session, user, project, isPlatformAdmin, accessible, canAccess, can, canSetup, labels]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlatform() { const ctx = useContext(Context); if (!ctx)
    throw new Error('PlatformProvider missing'); return ctx; }
