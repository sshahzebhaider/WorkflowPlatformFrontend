import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Alert, Button } from 'antd';
import { PlatformContext } from './PlatformContext';
import { emptyDb, loadWorkspace } from '../services/loadWorkspace';
import { LIVE_API, apiRequest, download, get, post, setDevIdentity, upload } from '../services/liveApi';
import { workspaceWrites } from '../services/writeWorkspace';
import { toCaseDetail, value as readApiField } from '../services/apiModels';
import { projectRoleLabels, isProjectAdministrator } from '../auth/projectIdentity.js';
const KEY = 'workflow-platform-live-session';
const readSession = () => { try {
    return JSON.parse(sessionStorage.getItem(KEY)) || {};
}
catch {
    return {};
} };
export function ApiPlatformProvider({ children }) {
    const saved = useRef(readSession());
    const identityName = useRef(saved.current.username || '');
    const activeProject = useRef(saved.current.projectId || null);
    const [db, setDb] = useState(emptyDb);
    const [user, setUser] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [session, setSession] = useState({ userId: null, projectId: activeProject.current });
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(Boolean(identityName.current));
    const [errors, setErrors] = useState([]);
    const [loginError, setLoginError] = useState(null);
    const ongoing = useRef(0);
    const hydrate = useCallback(async (username = identityName.current, projectId = activeProject.current) => {
        if (!username && import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'jwt')
            return null;
        const attempt = ++ongoing.current;
        setDevIdentity(username);
        const loaded = await loadWorkspace(projectId);
        if (attempt !== ongoing.current)
            return null;
        identityName.current = username;
        activeProject.current = loaded.projectId;
        // Fetch and normalize role grants before exposing a new project's UI to prevent stale rights.
        const latestIdentity = await get('/me');
        if (attempt !== ongoing.current)
            return null;
        const scoped = (latestIdentity.assignments || []).map(a => ({
            roleCode: readApiField(a, 'roleCode', ''), roleName: readApiField(a, 'roleName', ''),
            projectId: readApiField(a, 'projectId'), teamId: readApiField(a, 'teamId'), scope: readApiField(a, 'scope')
        }));
        setAssignments(scoped);
        setPermissions(loaded.permissions);
        setErrors(loaded.errors);
        setDb(loaded.db);
        setUser(loaded.identity);
        setSession({ userId: loaded.identity.id, projectId: loaded.projectId });
        if (import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'jwt')
            sessionStorage.setItem(KEY, JSON.stringify({ username, projectId: loaded.projectId }));
        return loaded;
    }, []);
    useEffect(() => {
        if (!identityName.current && import.meta.env.VITE_AUTH_MODE !== 'jwt')
            return;
        hydrate().catch(error => { setLoginError(error.message); setUser(null); sessionStorage.removeItem(KEY); }).finally(() => setLoading(false));
    }, [hydrate]);
    const login = useCallback(async (username) => {
        setLoginError(null);
        setLoading(true);
        try {
            const actual = String(username || '').trim();
            if (!actual && import.meta.env.VITE_AUTH_MODE !== 'jwt')
                throw new Error('Enter your provisioned SQL directory username.');
            activeProject.current = null;
            return await hydrate(actual, null);
        }
        catch (error) {
            setLoginError(error.message);
            throw error;
        }
        finally {
            setLoading(false);
        }
    }, [hydrate]);
    const logout = useCallback(() => {
        ongoing.current++;
        identityName.current = '';
        activeProject.current = null;
        setDevIdentity('');
        sessionStorage.removeItem(KEY);
        setDb(emptyDb());
        setUser(null);
        setAssignments([]);
        setPermissions({});
        setErrors([]);
        setSession({ userId: null, projectId: null });
    }, []);
    const selectProject = useCallback(async (id) => {
        const matching = db.projects.find(p => String(p.id) === String(id));
        if (!matching)
            throw new Error('No access to this project');
        return hydrate(identityName.current, matching.id);
    }, [hydrate, db.projects]);
    const refresh = useCallback(async (projectId) => hydrate(identityName.current, projectId || activeProject.current), [hydrate]);
    const refreshCase = useCallback(async (projectId, caseId) => {
        if (!user)
            return null;
        const path = `/projects/${projectId}/cases/${caseId}`;
        const [caseData, snapshot] = await Promise.all([get(path), get(`${path}/ui-context`)]);
        const details = toCaseDetail(caseData, projectId, snapshot);
        setDb(old => ({ ...old, cases: [...old.cases.filter(c => c.id !== caseId), details] }));
        return details;
    }, [user]);
    const writes = useMemo(() => workspaceWrites(db, refresh, session.projectId), [db, refresh, session.projectId]);
    const isPlatformAdmin = !!user?.platformAdmin;
    const accessible = useMemo(() => user ? db.projects : [], [db.projects, user]);
    const canAccess = useCallback(projectId => !!user && db.projects.some(p => p.id === projectId), [user, db.projects]);
    const can = useCallback((permission, projectId) => !!user && (isPlatformAdmin || (permissions[projectId] || []).includes(permission)), [user, isPlatformAdmin, permissions]);
    const canSetup = useCallback(projectId => !!user && (isPlatformAdmin || isProjectAdministrator(assignments, projectId)), [user, isPlatformAdmin, assignments]);
    const roleLabels = useCallback(projectId => projectRoleLabels(assignments, projectId), [assignments]);
    const contextValue = useMemo(() => ({
        db, session, user, project: db.projects.find(p => p.id === session.projectId) || null, isPlatformAdmin, accessible,
        can, canAccess, canSetup, roleLabels, login, logout, selectProject, ...writes,
        refresh, refreshCase, apiMode: true, loading, errors, loginError,
        api: { get, post, request: apiRequest, upload, download },
        syncProjectDirectory: () => { throw new Error('The AD/Entra connector is not configured; the API returns 501.'); },
        reset: () => { throw new Error('Database reset is disabled for SQL-backed projects.'); }
    }), [db, session, user, isPlatformAdmin, accessible, can, canAccess, canSetup, roleLabels, login, logout, selectProject, writes,
        refresh, refreshCase, loading, errors, loginError]);
    if (loading && !user)
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin size="large" tip="Connecting to the workflow API"><div style={{ width: 220, height: 100 }}/></Spin>
  </div>;
    return <PlatformContext.Provider value={contextValue}>
    {user && errors.length > 0 && <div style={{ padding: '8px 24px 0', background: '#fff' }}>
      <Alert type="warning" showIcon closable message="Some API data could not load" description={errors.slice(0, 3).join(' | ')} action={<Button size="small" onClick={() => void refresh().catch(e => setErrors([e.message]))}>Retry</Button>}/>
    </div>}
    {children}
  </PlatformContext.Provider>;
}
