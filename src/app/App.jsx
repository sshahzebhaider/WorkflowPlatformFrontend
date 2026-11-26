import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { usePlatform } from '../context/PlatformContext';
import { Shell } from '../components/Layout';
import { Login, NoProject } from '../pages/Login';
import { PlatformHome, ProjectsPage, CalendarPage, DataSourcesPage, LookupPage, UsersPage, HistoryPage } from '../pages/PlatformPages';
import { OnboardProject } from '../pages/Onboarding';
import { ProjectHome, TeamsPage, TerminologyPage, ProjectDataSources, SlaPage, ReportsPage, NotificationsPage, CasesPage, CaseTypesPage } from '../pages/ProjectPages';
import { RolesPage, ProjectAccessPage } from '../pages/AccessPages';
import { FormsPage, FormDesigner, WorkflowsPage, WorkflowDesigner } from '../pages/Designers';
import { CaseWorkspace } from '../pages/CaseWorkspace';
import { RcaPage } from '../pages/RcaPage';
import { MyTasksPage, MyTeamPage } from '../pages/MyTeamTasks';
import { RcaTemplatesPage } from '../pages/RcaTemplates';
import { managedTeams } from '../utils/workforce';
function PlatformOnly() { const { isPlatformAdmin, accessible } = usePlatform(); return isPlatformAdmin ? <Outlet /> : <Navigate to={accessible[0] ? `/project/${accessible[0].id}` : '/no-project'} replace/>; }
function SetupOnly({ children }) {
    const { projectId } = useParams();
    const { canSetup } = usePlatform();
    return canSetup(projectId) ? children : <Navigate to={`/project/${projectId}/cases`} replace/>;
}
function TeamManager({ children }) { const { projectId } = useParams(), { db, user, canSetup } = usePlatform(); return canSetup(projectId) || managedTeams(db, projectId, user?.id).length > 0 ? children : <Navigate to={`/project/${projectId}/my-tasks`} replace/>; }
function Permit({ permission, children }) {
    const { projectId } = useParams();
    const { can } = usePlatform();
    return can(permission, projectId) ? children : <Navigate to={`/project/${projectId}`} replace/>;
}
export function App() {
    const { user, isPlatformAdmin, accessible } = usePlatform();
    if (!user)
        return <Routes><Route path="/login" element={<Login />}/><Route path="*" element={<Navigate to="/login" replace/>}/></Routes>;
    const home = isPlatformAdmin ? '/platform' : accessible[0] ? `/project/${accessible[0].id}` : '/no-project';
    return <Routes>
    <Route path="/login" element={<Navigate to={home} replace/>}/>
    <Route path="/no-project" element={<NoProject />}/>
    <Route element={<Shell />}>
      <Route element={<PlatformOnly />}>
      <Route path="/platform" element={<PlatformHome />}/>
      <Route path="/platform/projects" element={<ProjectsPage />}/>
      <Route path="/platform/projects/new" element={<OnboardProject />}/>
      <Route path="/platform/calendars" element={<CalendarPage />}/>
      <Route path="/platform/data-sources" element={<DataSourcesPage />}/>
      <Route path="/platform/lookups" element={<LookupPage mode="platform"/>}/>
      <Route path="/platform/users" element={<UsersPage />}/>
      <Route path="/platform/roles" element={<RolesPage />}/>
      <Route path="/platform/rca-templates" element={<RcaTemplatesPage />}/>
      <Route path="/platform/audit" element={<HistoryPage />}/>
      </Route>
      <Route path="/project/:projectId" element={<ProjectHome />}/>
      <Route path="/project/:projectId/my-tasks" element={<Permit permission="cases.view"><MyTasksPage /></Permit>}/>
      <Route path="/project/:projectId/my-team" element={<TeamManager><MyTeamPage /></TeamManager>}/>
      <Route path="/project/:projectId/teams" element={<SetupOnly><Permit permission="teams.view"><TeamsPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/access" element={<SetupOnly><Permit permission="roles.assign"><ProjectAccessPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/terminology" element={<SetupOnly><Permit permission="settings.manage"><TerminologyPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/lookups" element={<SetupOnly><Permit permission="lookups.view"><LookupPage mode="project"/></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/data-sources" element={<SetupOnly><Permit permission="settings.manage"><ProjectDataSources /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/calendar" element={<SetupOnly><Permit permission="settings.manage"><SlaPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/forms" element={<SetupOnly><Permit permission="forms.view"><FormsPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/forms/:formId" element={<SetupOnly><Permit permission="forms.manage"><FormDesigner /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/workflows" element={<SetupOnly><Permit permission="workflows.view"><WorkflowsPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/workflows/:workflowId" element={<SetupOnly><Permit permission="workflows.manage"><WorkflowDesigner /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/rca" element={<SetupOnly><Permit permission="settings.manage"><RcaPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/case-types" element={<SetupOnly><Permit permission="settings.manage"><CaseTypesPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/cases" element={<Permit permission="cases.view"><CasesPage /></Permit>}/>
      <Route path="/project/:projectId/cases/:caseId" element={<Permit permission="cases.view"><CaseWorkspace /></Permit>}/>
      <Route path="/project/:projectId/cases/new" element={<Permit permission="cases.create"><CasesPage create/></Permit>}/>
      <Route path="/project/:projectId/reports" element={<Permit permission="reports.view"><ReportsPage /></Permit>}/>
      <Route path="/project/:projectId/notifications" element={<SetupOnly><Permit permission="notifications.view"><NotificationsPage /></Permit></SetupOnly>}/>
      <Route path="/project/:projectId/audit" element={<SetupOnly><Permit permission="audit.view"><HistoryPage /></Permit></SetupOnly>}/>
    </Route>
    <Route path="*" element={<Navigate to={home} replace/>}/>
  </Routes>;
}
