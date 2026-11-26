import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link, Outlet, Navigate } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { Avatar, Button, Dropdown, Input, Tooltip, Tag } from 'antd';
import { AppstoreOutlined, CalendarOutlined, DatabaseOutlined, FileTextOutlined, FormOutlined, SettingOutlined, TeamOutlined, BranchesOutlined, BarChartOutlined, BellOutlined, SolutionOutlined, SafetyOutlined, HistoryOutlined, FolderOpenOutlined, PlusOutlined, SearchOutlined, DownOutlined, LogoutOutlined, UnorderedListOutlined, FieldStringOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CheckCircleOutlined, HomeOutlined, DashboardOutlined } from '@ant-design/icons';
import { usePlatform } from '../context/PlatformContext';
import { initials } from '../utils/helpers';
import { managedTeams } from '../utils/workforce';
const platformMenu = [
    { section: 'PLATFORM', items: [
            { label: 'Overview', path: '/platform', icon: <DashboardOutlined /> },
            { label: 'Projects', path: '/platform/projects', icon: <AppstoreOutlined /> },
            { label: 'Onboard a project', path: '/platform/projects/new', icon: <PlusOutlined /> },
            { label: 'Calendars', path: '/platform/calendars', icon: <CalendarOutlined /> },
            { label: 'Data connections', path: '/platform/data-sources', icon: <DatabaseOutlined /> },
            { label: 'Lookup manager', path: '/platform/lookups', icon: <UnorderedListOutlined /> },
            { label: 'Platform users', path: '/platform/users', icon: <UserOutlined /> },
            { label: 'Roles and rights', path: '/platform/roles', icon: <SafetyOutlined /> },
            { label: 'RCA templates', path: '/platform/rca-templates', icon: <SolutionOutlined /> },
            { label: 'Audit history', path: '/platform/audit', icon: <HistoryOutlined /> }
        ] }
];
const projectMenu = (id, terms) => [
    { section: 'WORK', items: [
            { label: 'Overview', path: `/project/${id}`, icon: <DashboardOutlined /> },
            { label: `New ${terms.case.toLowerCase()}`, path: `/project/${id}/cases/new`, icon: <PlusOutlined /> },
            { label: `${terms.cases}`, path: `/project/${id}/cases`, icon: <FileTextOutlined /> },
            { label: 'My Tasks', path: `/project/${id}/my-tasks`, icon: <CheckCircleOutlined /> },
            { label: 'My Team', path: `/project/${id}/my-team`, icon: <TeamOutlined /> },
            { label: 'Reports', path: `/project/${id}/reports`, icon: <BarChartOutlined /> },
        ] },
    { section: 'SETUP', items: [
            { label: `${terms.case} types`, path: `/project/${id}/case-types`, icon: <FolderOpenOutlined /> },
            { label: 'Teams and people', path: `/project/${id}/teams`, icon: <TeamOutlined /> },
            { label: 'Project access', path: `/project/${id}/access`, icon: <SafetyOutlined /> },
            { label: 'Notifications', path: `/project/${id}/notifications`, icon: <BellOutlined /> },
            { label: 'RCA setup', path: `/project/${id}/rca`, icon: <SolutionOutlined /> },
            { label: 'Lists', path: `/project/${id}/lookups`, icon: <UnorderedListOutlined /> },
            { label: 'Terminology', path: `/project/${id}/terminology`, icon: <FieldStringOutlined /> }
        ] },
    { section: 'ENGINE', items: [
            { label: 'Workflows', path: `/project/${id}/workflows`, icon: <BranchesOutlined /> },
            { label: 'Forms', path: `/project/${id}/forms`, icon: <FormOutlined /> },
            { label: 'Data sources', path: `/project/${id}/data-sources`, icon: <DatabaseOutlined /> },
            { label: 'Calendar and SLA', path: `/project/${id}/calendar`, icon: <CalendarOutlined /> },
            { label: 'Change history', path: `/project/${id}/audit`, icon: <HistoryOutlined /> }
        ] }
];
export function Shell() {
    const { user, project, db, session, accessible, isPlatformAdmin, selectProject, logout, canAccess, can, canSetup, roleLabels, apiMode } = usePlatform();
    const { projectId } = useParams();
    const navigate = useNavigate(), location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [switchError, setSwitchError] = useState('');
    useEffect(() => {
        if (!apiMode || !projectId || String(session.projectId) === String(projectId) || !canAccess(projectId))
            return;
        let mounted = true;
        selectProject(projectId).catch(e => { if (mounted)
            setSwitchError(e.message); });
        return () => { mounted = false; };
    }, [apiMode, projectId, session.projectId, selectProject, canAccess]);
    const isPlatformArea = location.pathname.startsWith('/platform');
    if (isPlatformArea && !isPlatformAdmin)
        return <Navigate to={accessible[0] ? `/project/${accessible[0].id}` : '/login'} replace/>;
    if (!isPlatformArea && projectId && !canAccess(projectId))
        return <Navigate to={isPlatformAdmin ? '/platform' : '/login'} replace/>;
    const activeProject = db.projects.find(p => p.id === projectId) || project;
    const terms = { case: 'Case', cases: 'Cases', ...activeProject?.terms };
    const requires = {
        '': 'project.view', 'cases': 'cases.view', 'cases/new': 'cases.create', 'reports': 'reports.view',
        'my-tasks': 'cases.view', 'my-team': 'teams.view', 'case-types': 'settings.manage', 'rca': 'settings.manage', 'teams': 'teams.view', 'access': 'roles.assign',
        'notifications': 'notifications.view', 'lookups': 'lookups.view', 'terminology': 'settings.manage',
        'workflows': 'workflows.view', 'forms': 'forms.view', 'data-sources': 'settings.manage',
        'calendar': 'settings.manage', 'audit': 'audit.view'
    };
    const groups = isPlatformArea ? platformMenu : projectMenu(projectId, terms).filter(group => group.section === 'WORK' || canSetup(projectId)).map(group => ({ ...group, items: group.items.filter(item => { const suffix = item.path.split(`/project/${projectId}/`)[1] || ''; return suffix === 'my-team' ? managedTeams(db, projectId, user?.id).length > 0 : can(requires[suffix] || 'project.view', projectId); }) })).filter(group => group.items.length);
    const items = groups.flatMap(g => g.items);
    const active = items.filter(i => location.pathname === i.path || location.pathname.startsWith(i.path + '/')).sort((a, b) => b.path.length - a.path.length)[0];
    const projectOptions = [...(isPlatformAdmin ? [{ key: 'platform', label: 'All projects · Platform administration' }] : []), ...accessible.map(p => ({ key: p.id, label: p.name }))];
    const displayedName = isPlatformArea ? 'Workflow Platform' : activeProject?.name || 'Workflow Platform';
    return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-area" role="button" tabIndex={0} onClick={() => navigate(isPlatformAdmin ? '/platform' : `/project/${accessible[0]?.id}`)} onKeyDown={e => e.key === 'Enter' && navigate('/platform')}>
        <span className="brand-mark" style={{ background: isPlatformArea ? '#111827' : activeProject?.color || '#DC2626' }}>{isPlatformArea ? 'W' : initials(activeProject?.code || 'W')[0]}</span>
        {!collapsed && <span className="brand-text"><strong>{isPlatformArea ? 'Workflow Platform' : activeProject?.code || 'Project'}</strong><small>{isPlatformArea ? 'Organization workspace' : activeProject?.name || 'Workflow Platform'}</small></span>}
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {groups.map(g => <div key={g.section} className="sidebar-section"><div className="sidebar-section-title">{!collapsed ? g.section : '·'}</div>{g.items.map(item => <Tooltip key={item.path} title={collapsed ? item.label : null} placement="right"><Link className={`nav-link ${active?.path === item.path ? 'active' : ''}`} to={item.path}><span className="nav-icon">{item.icon}</span>{!collapsed && <span>{item.label}</span>}</Link></Tooltip>)}</div>)}
        {isPlatformAdmin && !isPlatformArea && <div className="sidebar-section"><div className="sidebar-section-title">{!collapsed ? 'PLATFORM' : '·'}</div><Link className="nav-link" to="/platform"><span className="nav-icon"><AppstoreOutlined /></span>{!collapsed && 'Platform administration'}</Link></div>}
      </nav>
      <div className="sidebar-bottom"><Button type="text" size="small" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(c => !c)} aria-label="Collapse menu"/>{!collapsed && <span>Workflow Platform</span>}</div>
    </aside>
    <div className="main-column"><header className="top-header"><div className="breadcrumb-text"><span>{isPlatformArea ? 'Platform' : activeProject?.code || 'Project'}</span><span className="slash">/</span><span>{active?.label || displayedName}</span></div><div className="header-right"><Tag color="purple" className="demo-tag">{apiMode ? 'Development' : 'Local preview'}</Tag><Input className="header-search" prefix={<SearchOutlined style={{ color: '#9ca3af' }}/>} placeholder="Search reference or name" onPressEnter={e => { const q = e.currentTarget.value; if (q)
        navigate(isPlatformArea ? '/platform/projects' : `/project/${projectId}/cases?search=${encodeURIComponent(q)}`); }}/><Dropdown trigger={['click']} menu={{ items: projectOptions, onClick: async ({ key }) => { if (key === 'platform') {
            navigate('/platform');
            return;
        } try {
            setSwitchError('');
            await selectProject(key);
            navigate(`/project/${key}`);
        }
        catch (error) {
            setSwitchError(error.message);
        } } }}><Button>{isPlatformArea ? 'All projects' : activeProject?.name || 'Select project'} <DownOutlined /></Button></Dropdown><Dropdown trigger={['click']} menu={{ items: [{ key: 'account', label: user?.username, disabled: true }, { type: 'divider' }, { key: 'logout', label: 'Sign out', icon: <LogoutOutlined /> }], onClick: ({ key }) => key === 'logout' && logout() }}><div className="header-user"><Avatar style={{ background: isPlatformAdmin ? '#111827' : '#DC2626' }}>{initials(user?.name)}</Avatar><div className="header-user-text"><strong>{user?.name}</strong><span>{isPlatformAdmin ? 'Platform admin' : (roleLabels(projectId || activeProject?.id)[0] || 'Project user')}</span></div></div></Dropdown></div></header><main className={`main-content ${location.pathname.includes('/designer/') ? 'editor-content' : ''}`}>{switchError && <div role="alert" style={{ color: '#b91c1c', padding: 12 }}>{switchError}</div>}{!isPlatformArea && apiMode && projectId && String(session.projectId) !== String(projectId) ? <div style={{ padding: 24 }}>Loading project permissions…</div> : <Outlet />}</main></div>
  </div>;
}
