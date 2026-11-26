import { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { PlusOutlined, ArrowRightOutlined, FileTextOutlined, TeamOutlined, BranchesOutlined, FormOutlined, BarChartOutlined, EditOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePlatform } from '../context/PlatformContext';
import { PageHeading, PageEmpty, Panel, StatCard, Pill, SmallTitle, InfoRow, AvatarMark } from '../components/UI';
import { TERM_KEYS, FIELD_TYPES } from '../data/seed';
import { niceDate, slug, saveCSV, availableLookups, getProjectTerms } from '../utils/helpers';
import { AutoCode } from '../components/AutoCode';
import { CaseFields, resetDependentFields } from '../components/CaseFields';
import { canSeeCase, openTasks, startCase } from '../utils/caseFlow';
import { dependentFieldKeys, lookupChoices } from '../utils/lookups';
import { caseTypeLookupFields } from '../utils/caseTypeLookups';
import { gateCaseClosure } from '../utils/rca';
import { CaseDetailDrawer } from '../components/CaseDetailDrawer';
import { ReportBuilder } from '../components/ReportBuilder';
import { ProjectReleaseControl } from '../components/ProjectReleaseControl';
import { DataSourceResponse } from '../components/DataSourceResponse';
import { operationInputDefinitions, convertParameterValue } from '../utils/dataSourceContract';
import { calculateDemoTatDueAt } from '../utils/tatTimer.js';
import { callDataSource, lodgementRecordPayloads } from '../services/dataOperations';
import { responseFieldPairs } from '../utils/dataResponsePairs';
import { newIdempotencyKey, get as liveGet } from '../services/liveApi';
import { toCase, toCaseDetail } from '../services/apiModels';
import { matchingIntakeValues } from '../utils/intakeAutofill.js';
function projectData() { const context = usePlatform(), { projectId } = useParams(); return { ...context, projectId, project: context.db.projects.find(p => p.id === projectId) }; }
function formFields(form) { return form?.fields || []; }
export function ProjectHome() {
    const { db, project, projectId, can, canSetup, user, apiMode } = projectData(), navigate = useNavigate(), cases = db.cases.filter(c => c.projectId===projectId && (apiMode ? !!c.createdAt : canSeeCase(c, user, project, db)));
    const values = [{ label: 'Open cases', value: apiMode ? (db.caseCounts?.[projectId]?.openCount ?? 0) : cases.filter(c => c.status !== 'Closed').length, icon: <FileTextOutlined /> }, { label: 'Workflows', value: db.workflows.filter(w => w.projectId === projectId).length, icon: <BranchesOutlined /> }, { label: 'Forms', value: db.forms.filter(f => f.projectId === projectId).length, icon: <FormOutlined /> }, { label: 'Teams', value: db.teams.filter(t => t.projectId === projectId).length, icon: <TeamOutlined /> }];
    const quick = [['Case types', 'Set up the types of records this project will manage.', 'case-types'], ['Build a form', 'Define reusable fields and dropdowns for each step.', 'forms'], ['Design workflow', 'Create a visual workflow and attach forms to nodes.', 'workflows'], ['Set up teams', 'Assign preview directory users to project teams.', 'teams']];
    const setupAllowed = canSetup(projectId);
    const projectInformation = <Panel title="Project information"><InfoRow label="Status" value={project?.status}/>{setupAllowed && <ProjectReleaseControl project={project}/>}<InfoRow label="Code" value={project?.code}/><InfoRow label="Owner" value={project?.owner}/><InfoRow label="Calendar" value={db.calendars.find(x => x.id === project?.calendarId)?.name}/><InfoRow label="Admins" value={project?.adminIds?.map(id => db.users.find(u => u.id === id)?.name).join(', ')}/><InfoRow label="SLA target" value={`${project?.slaHours || 0} working hours`}/></Panel>;
    return <><PageHeading title={`${project?.name || 'Project'} overview`} description={setupAllowed ? `Independent configuration for ${project?.code}. Set up forms, workflows, teams and case types to get started.` : `Your project workspace · ${project?.code}. Review and process work assigned to your team.`} actions={can('cases.create', projectId) && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/project/${projectId}/cases/new`)}>New {(project?.terms?.case || 'case').toLowerCase()}</Button>}/><div className="stats-grid">{values.map(x => <StatCard key={x.label} {...x} detail="This project only"/>)}</div>{setupAllowed ? <div className="two-column" style={{ gridTemplateColumns: '1.35fr 1fr' }}><Panel title="Configure your project"><div className="two-column" style={{ gridTemplateColumns: '1fr 1fr' }}>{quick.filter(([, , to]) => can(({ 'case-types': 'settings.manage', 'forms': 'forms.manage', 'workflows': 'workflows.manage', 'teams': 'teams.manage' })[to], projectId)).map(([name, description, to]) => <button key={to} type="button" className="template-tile" onClick={() => navigate(`/project/${projectId}/${to}`)}><h3>{name} <ArrowRightOutlined style={{ float: 'right', color: '#dc2626' }}/></h3><p>{description}</p></button>)}</div></Panel>{projectInformation}</div> : <div>{projectInformation}</div>}<div style={{ marginTop: 19 }}><Panel title="Recent cases">{!can('cases.view', projectId) ? <PageEmpty title="Restricted" description="Your project role does not grant access to case records."/> : cases.length ? <Table size="small" pagination={false} rowKey="id" dataSource={(apiMode ? [...cases].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)) : [...cases].reverse()).slice(0, 5)} columns={[{ title: 'Reference', dataIndex: 'reference' }, { title: 'Title', dataIndex: 'title' }, { title: 'Status', dataIndex: 'status', render: v => <Pill status={v}>{v}</Pill> }, { title: 'Created', dataIndex: 'createdAt', render: niceDate }]}/> : <PageEmpty title="No cases yet" description="Start a case after configuring your forms and case types." actionText={can('cases.create', projectId) ? 'Create first case' : undefined} onAction={can('cases.create', projectId) ? () => navigate(`/project/${projectId}/cases/new`) : undefined}/>}</Panel></div></>;
}
export function TeamsPage() {
    const { db, add, update, projectId, can } = projectData(), msg = AntApp.useApp().message;
    const [open, setOpen] = useState(false), [editing, setEditing] = useState(null), [form] = Form.useForm();
    const teams = db.teams.filter(x => x.projectId === projectId), allowed = can('teams.manage', projectId);
    const show = (t = null) => { setEditing(t); form.resetFields(); form.setFieldsValue(t ? { ...t, leadIds: t.leadIds || (t.leadId ? [t.leadId] : []), unitHeadIds: t.unitHeadIds || [] } : { name: '', description: '', members: [], leadIds: [], unitHeadIds: [] }); setOpen(true); };
    const submit = async (v) => {
        const payload = { ...v, leadId: v.leadIds?.[0] || null };
        try {
            if (editing)
                await update('teams', editing.id, payload);
            else
                await add('teams', { ...payload, projectId });
            setOpen(false);
            msg.success('Team saved. Assigned users can now sign in to this project.');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const users = db.users.filter(u => !u.platformAdmin && u.directoryStatus !== 'resigned' && u.active !== false).map(u => ({ value: u.id, label: `${u.name} (${u.username})` }));
    return <><PageHeading title="Teams and people" description="Assign members, team leads and unit heads. Each assignment immediately grants access to this project in the preview." actions={allowed && <Button type="primary" icon={<PlusOutlined />} onClick={() => show()}>Create team</Button>}/>
 <Panel padding={false}>{teams.length ? <Table rowKey="id" dataSource={teams} pagination={false} scroll={{ x: 720 }} columns={[
                { title: 'Team', render: (_, r) => <><span className="table-title">{r.name}</span><span className="table-subtitle">{r.code || slug(r.name)} · {r.description}</span></> },
                { title: 'Team lead', render: (_, r) => (r.leadIds || (r.leadId ? [r.leadId] : [])).map(id => db.users.find(u => u.id === id)?.name).filter(Boolean).join(', ') || '—' },
                { title: 'Unit head', render: (_, r) => (r.unitHeadIds || []).map(id => db.users.find(u => u.id === id)?.name).filter(Boolean).join(', ') || '—' },
                { title: 'Members', render: (_, r) => (r.members || []).length },
                { title: 'Assigned users', render: (_, r) => [...new Set([...(r.members || []), ...(r.leadIds || []), ...(r.unitHeadIds || [])])].map(id => db.users.find(u => u.id === id)?.name).filter(Boolean).join(', ') || '—' },
                { title: '', render: (_, r) => allowed && <Button type="link" onClick={() => show(r)}>Edit team</Button> }
            ]}/> : <PageEmpty title="No teams created" description="Create your first project team to give directory users access." actionText={allowed ? 'Create team' : undefined} onAction={allowed ? () => show() : undefined}/>}</Panel>
 <div className="note-strip" style={{ marginTop: 16 }}>A user may lead one team and act as Unit Head for several teams. Roles are determined per project; this demo does not authenticate real AD/Entra users.</div>
 <Modal title={editing ? 'Edit team' : 'Create project team'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose width={620}>
   <Form form={form} layout="vertical" onFinish={submit}>
     <Form.Item name="name" label="Team name" rules={[{ required: true }]}><Input placeholder="e.g. Verification team"/></Form.Item>
     <Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item>
     <Form.Item name="members" label="Team members" extra="Members can sign in and access project work according to the Team Member role."><Select showSearch mode="multiple" optionFilterProp="label" options={users}/></Form.Item>
     <Form.Item name="leadIds" label="Team lead(s)" extra="Leads can view the work and case-management screens for their team."><Select mode="multiple" showSearch optionFilterProp="label" options={users}/></Form.Item>
     <Form.Item name="unitHeadIds" label="Unit head(s)" extra="Assign the same head to multiple teams in the same project."><Select mode="multiple" showSearch optionFilterProp="label" options={users}/></Form.Item>
   </Form>
 </Modal></>;
}
export function TerminologyPage() {
    const { project, update, projectId } = projectData(), msg = AntApp.useApp().message;
    const [terms, setTerms] = useState(() => getProjectTerms(project));
    return <><PageHeading title="Terminology" description="Customize words for this project. Labels automatically adapt across its screens." actions={<Button type="primary" onClick={async () => { try {
        await update('projects', projectId, { terms });
        msg.success('Terminology saved');
    }
    catch (error) {
        msg.error(error.message);
    } }}>Save terminology</Button>}/><div className="two-column" style={{ gridTemplateColumns: '1.5fr 1fr' }}><Panel title="Project labels"><div className="three-column" style={{ gridTemplateColumns: '1fr 1fr' }}>{TERM_KEYS.map(t => <div key={t.key}><label className="field-label">{t.label}</label><Input value={terms[t.key] || ''} onChange={e => setTerms(s => ({ ...s, [t.key]: e.target.value }))}/><div className="helper-text">{t.example}</div></div>)}</div></Panel><Panel title="Live label preview"><SmallTitle>{terms.cases || 'Cases'}</SmallTitle><div className="note-strip" style={{ marginBottom: 16 }}>New {String(terms.case || 'case').toLowerCase()} created for {terms.subject || 'subject'}.</div><InfoRow label="Record" value={terms.case}/><InfoRow label="Plural" value={terms.cases}/><InfoRow label="Actor group" value={terms.team}/><InfoRow label="Action" value={terms.resolve}/><InfoRow label="Reference example" value={`${terms.referencePrefix || 'CASE'}-2026-000001`}/></Panel></div></>;
}
export function ProjectDataSources() {
    const { db, project, projectId, update } = projectData(), msg = AntApp.useApp().message;
    const [selection, setSelection] = useState(project.dataSourceIds || []);
    // An administrator may switch projects while this page is mounted. Never carry
    // the previous project's pending approval selection into the next project.
    useEffect(() => { setSelection(project.dataSourceIds || []); }, [projectId, project.dataSourceIds]);
    const data = db.dataSources.filter(x => selection.includes(x.id));
    return <><PageHeading title="Data sources" description="Approved platform connections that can be called by this project's workflow nodes." actions={<Button type="primary" onClick={async () => { try {
        await update('projects', projectId, { dataSourceIds: selection });
        msg.success('Connections updated');
    }
    catch (error) {
        msg.error(error.message);
    } }}>Save selection</Button>}/><Panel title="Available platform integrations"><Select mode="multiple" style={{ width: '100%', marginBottom: 20 }} placeholder="Select available connections" value={selection} onChange={setSelection} options={db.dataSources.map(s => ({ value: s.id, label: s.name }))}/>{data.length ? <Table pagination={false} size="small" rowKey="id" dataSource={data} columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Type', dataIndex: 'kind' }, { title: 'Operations', render: (_, r) => r.operations?.length || 0 }]}/> : <PageEmpty title="No connections selected" description="The platform administrator must register shared integrations first."/>}</Panel><div className="note-strip" style={{ marginTop: 16 }}>Project approval controls whether a connection can be used during case lodging and workflow execution. The .NET API handles requests and credentials server-side.</div></>;
}
export function SlaPage() {
    const { db, project, projectId, update } = projectData(), msg = AntApp.useApp().message;
    const [calendarId, setCalendarId] = useState(project.calendarId), [hours, setHours] = useState(project.slaHours || 24);
    const cal = db.calendars.find(c => c.id === calendarId);
    return <><PageHeading title="Calendar and SLA" description="Choose this project's business calendar and default working-hour target." actions={<Button type="primary" onClick={async () => { try {
        await update('projects', projectId, { calendarId, slaHours: hours });
        msg.success('SLA settings saved');
    }
    catch (error) {
        msg.error(error.message);
    } }}>Save settings</Button>}/><div className="two-column" style={{ gridTemplateColumns: '1.3fr 1fr' }}><Panel title="Default SLA settings"><div style={{ maxWidth: 470 }}><label className="field-label">Business calendar</label><Select style={{ width: '100%', marginBottom: 20 }} value={calendarId} onChange={setCalendarId} options={db.calendars.map(c => ({ value: c.id, label: c.name }))}/><label className="field-label">Default SLA target (working hours)</label><InputNumber min={1} max={2000} style={{ width: '100%', marginBottom: 15 }} value={hours} onChange={setHours}/><div className="note-strip">These are persisted configuration values. Automated SLA timers and deadline escalation are not active without a backend.</div></div></Panel><Panel title="Calendar summary">{cal ? <><InfoRow label="Calendar" value={cal.name}/><InfoRow label="Timezone" value={cal.timezone}/><InfoRow label="Working days" value={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, i) => cal.workingDays.includes(i)).join(', ')}/><InfoRow label="Hours" value={`${cal.startTime} – ${cal.endTime}`}/><InfoRow label="Holidays" value={cal.holidays?.length || 0}/></> : <PageEmpty title="No calendar assigned" description="Create one under Platform → Calendars."/>}</Panel></div></>;
}
export { CaseTypesPage } from './CaseTypeSetup';
export function CasesPage({ create = false }) {
    const { db, project, projectId, add, can, user, apiMode, api, createCase: createLiveCase } = projectData(), nav = useNavigate(), msg = AntApp.useApp().message, [params] = useSearchParams();
    const [typeId, setTypeId] = useState(null), [detailsId, setDetailsId] = useState(null), [form] = Form.useForm(), [lookupForm] = Form.useForm(), [lookupResult, setLookupResult] = useState(null), [lookupBusy, setLookupBusy] = useState(false);
    const types = db.caseTypes.filter(x => x.projectId === projectId && x.status === 'Published'), cases = db.cases.filter(x => x.projectId === projectId);
    const search = (params.get('search') || '').toLowerCase();
    const scopeKey = `${projectId}:${search}`;
    const [pageState, setPageState] = useState({ scopeKey: '', current: 1, size: 10 });
    const page = pageState.scopeKey === scopeKey ? pageState : { scopeKey, current: 1, size: 10 };
    const [serverPage, setServerPage] = useState({ key: '', rows: [], total: 0, error: null, loading: true });
    const [serverDetail, setServerDetail] = useState(null);
    const pageKey = `${scopeKey}:${page.current}:${page.size}`;
    useEffect(() => {
        if (!apiMode || create || !projectId) return;
        const controller = new AbortController(); let active = true;
        setServerPage(old => ({ ...old, key: pageKey, loading: true, error: null, rows: old.key === pageKey ? old.rows : [] }));
        liveGet(`/projects/${projectId}/cases?skip=${(page.current-1)*page.size}&take=${page.size}&search=${encodeURIComponent(search)}`, { signal: controller.signal })
            .then(result => { if (!active) return; const total = Number(result.total || 0);
                if (page.current > 1 && (page.current-1)*page.size >= total) {
                    setPageState({ scopeKey, current: Math.max(1, Math.ceil(total/page.size)), size: page.size }); return;
                }
                setServerPage({ key: pageKey, rows: (result.items || []).map(row => toCase(row,projectId)), total, error: null, loading: false }); })
            .catch(error => { if (active) setServerPage({ key: pageKey, rows: [], total: 0, error: error.message, loading: false }); });
        return () => { active = false; controller.abort(); };
    }, [apiMode, create, projectId, scopeKey, pageKey, page.current, page.size, search, db.cases]);
    useEffect(() => {
        setServerDetail(null);
        if (!apiMode || !detailsId || !projectId || create) return;
        const controller = new AbortController(); let active = true;
        const path = `/projects/${projectId}/cases/${detailsId}`;
        Promise.all([liveGet(path, { signal: controller.signal }), liveGet(`${path}/ui-context`, { signal: controller.signal })])
            .then(([data,snapshot]) => { if(active) setServerDetail(toCaseDetail(data,projectId,snapshot)); })
            .catch(error => { if(active) { msg.error(error.message); setDetailsId(null); } });
        return () => { active = false; controller.abort(); };
    }, [apiMode, detailsId, projectId, create]);
    const type = types.find(x => x.id === typeId);
    const typeConfig = type?.publishedConfig || type || {};
    const intake = typeConfig.formSnapshot || db.forms.find(x => x.id === typeConfig.formId);
    const fields = formFields(intake);
    const classificationFields = caseTypeLookupFields(db, project, typeConfig).map(f => ({ ...f, readOnly: typeConfig.lockedValues?.[f.key] !== undefined && typeConfig.lockedValues?.[f.key] !== null }));
    const operationId = typeConfig.lodgementIntegration?.operationId;
    const operationSource = db.dataSources.find(source => source.operations?.some(op => String(op.id) === String(operationId)));
    const operation = operationSource?.operations?.find(op => String(op.id) === String(operationId));
    const needsLookup = Boolean(operationId);
    const appliedLookup = useRef(null);
    const recordChoices = lookupResult?.records || [];
    const recordIndex = lookupResult?.recordIndex ?? 0;
    const recordValues = recordChoices.map(record => matchingIntakeValues(fields, record.intakeValues, db, project));
    const recordKeys = [...new Set(recordValues.flatMap(Object.keys))];
    const selectRecord = index => {
        if (!recordChoices[index] || index === recordIndex) return;
        caseKey.current = null;
        setLookupResult({ ...recordChoices[index], records: recordChoices, recordIndex: index, payload: recordChoices[index].payload ?? null });
    };
    useEffect(() => {
        if (!lookupResult || appliedLookup.current === lookupResult) return;
        appliedLookup.current = lookupResult;
        const matches = matchingIntakeValues(fields, lookupResult.intakeValues, db, project);
        form.setFieldsValue({ fields: { ...Object.fromEntries(recordKeys.map(key => [key, null])), ...matches } });
    }, [lookupResult, fields, db, project, form, msg]);
    const inputDefinitions = operationInputDefinitions(operation);
    const chooseCaseType = next => {
        lookupSequence.current++;
        caseKey.current = null;
        setTypeId(next);
        setLookupResult(null);
        lookupForm.resetFields();
        form.resetFields();
        const chosen = types.find(t => t.id === next);
        const config = chosen?.publishedConfig || chosen || {};
        form.setFieldsValue({ classification: { ...(config.defaultLookupValues || config.lockedValues || {}) } });
        const op = db.dataSources.flatMap(x => x.operations || []).find(x => String(x.id) === String(config.lodgementIntegration?.operationId));
        lookupForm.setFieldsValue(Object.fromEntries(operationInputDefinitions(op)
            .filter(p => p.defaultValue !== undefined && p.defaultValue !== null && p.defaultValue !== '')
            .map(p => [p.name, p.type === 'object' && typeof p.defaultValue === 'object' ? JSON.stringify(p.defaultValue, null, 2) : p.defaultValue])));
    };
    const performLookup = async (values) => {
        if (!type || !operation || !operationSource)
            return msg.error('The selected operation is unavailable. Ask the Project Admin to review the Case Type.');
        const sequence = ++lookupSequence.current;
        setLookupBusy(true);
        try {
            const inputs = {};
            for (const param of inputDefinitions) {
                const value = values[param.name] ?? param.defaultValue;
                if (value === undefined || value === null || value === '') {
                    if (param.required !== false)
                        throw Error(`Enter ${param.name} to continue.`);
                    continue;
                }
                inputs[param.name] = convertParameterValue(param, value);
            }
            if (apiMode) {
                const response = await api.post(`/projects/${projectId}/case-types/${typeId}/data-lookup`, { inputs });
                if (sequence === lookupSequence.current) {
                    setLookupResult({ ...response, payload: null });
                }
            }
            else {
                const response = await callDataSource(operationSource, operation, inputs);
                const mapped = response.mapped || {};
                const combined = { ...mapped.context, ...mapped.intake, ...mapped.classification };
                const payload = operation.responseMappings?.length ? combined : response.body;
                if (sequence === lookupSequence.current) {
                    const records = lodgementRecordPayloads(operation, response.body).map(row => ({ payload: row, fields: responseFieldPairs(row), intakeValues: row }));
                    setLookupResult(records.length ? { ...records[0], records: records.length > 1 ? records : [], recordIndex: 0 } : { payload, fields: responseFieldPairs(payload), intakeValues: payload });
                }
            }
        }
        catch (error) {
            if (sequence === lookupSequence.current)
                msg.error(error.message || 'Data-source lookup failed.');
        }
        finally {
            if (sequence === lookupSequence.current)
                setLookupBusy(false);
        }
    };
    const lookupSequence = useRef(0), caseKey = useRef(null);
    const onValuesChange = changed => { resetDependentFields(changed, fields, form, 'fields', db, project); resetDependentFields(changed, classificationFields, form, 'classification', db, project); };
    const createCase = async (v) => {
        if (apiMode) {
            try {
                if (!type || type.status !== 'Published')
                    return msg.error('Choose a published case type.');
                const title = String(v.fields?.[typeConfig.subjectField] || v.fields?.title || type.name || 'Request');
                caseKey.current ||= newIdempotencyKey();
                const saved = await createLiveCase(projectId, typeId, v, title, lookupResult, caseKey.current);
                msg.success(`${saved.reference || 'Request'} created in SQL Server`);
                nav(`/project/${projectId}/cases/${saved.id}`);
            }
            catch (error) {
                msg.error(error.message);
            }
            return;
        }
        if (!type || type.status !== 'Published')
            return msg.error('Select a published case type first.');
        if (needsLookup && !lookupResult)
            return msg.error('Verify the data source first.');
        const workflowDefinition = typeConfig.workflowSnapshot || db.workflows.find(w => w.id === typeConfig.workflowId && w.projectId === projectId);
        if (!workflowDefinition || workflowDefinition.status !== 'Published')
            return msg.error('The selected case type needs a published workflow.');
        if (typeConfig.subjectField && !typeConfig.allowDuplicate) {
            const value = String(v.fields?.[typeConfig.subjectField] ?? '').trim().toLowerCase();
            if (value && cases.some(c => c.typeId === typeId && c.status !== 'Closed' && String(c.fieldValues?.[typeConfig.subjectField] ?? '').trim().toLowerCase() === value))
                return msg.error('An open record already exists for this subject in this type.');
        }
        const reference = `${project?.terms?.referencePrefix || project?.code || 'CASE'}-${new Date().getFullYear()}-${String(Math.max(0, ...cases.map(c => Number(c.reference?.split('-').at(-1)) || 0)) + 1).padStart(6, '0')}`;
        const bound = workflowDefinition;
        const snapshots = Object.fromEntries((bound?.nodes || []).flatMap(n => n.data?.formIds || []).map(fid => [fid, db.forms.find(f => f.id === fid)]).filter(([, f]) => f).map(([id, f]) => [id, { id: f.id, name: f.name, version: f.version, fields: structuredClone(f.fields || []) }]));
        const record = gateCaseClosure(startCase({ projectId, typeId,
            createdAt: new Date().toISOString(),
            dueAt: typeConfig.tatMode === 'elapsed'
                ? new Date(Date.now() + Number(typeConfig.slaHours || project?.slaHours || 24) * 3600000).toISOString()
                : calculateDemoTatDueAt(new Date(), typeConfig.slaHours || project?.slaHours, db.calendars.find(c => c.id === project?.calendarId)),
            caseTypeSnapshot: type ? { id: type.id, name: type.name, code: type.code, version: type.version || 0, slaHours: typeConfig.slaHours || project?.slaHours, tatMode: typeConfig.tatMode || 'working' } : null, title: String(v.fields?.[typeConfig.subjectField] || v.fields?.title || type.name || 'Request') + (v.fields?.[typeConfig.subjectField] ? ` · ${type.name}` : ''), reference, description: String(v.fields?.description || ''), fieldValues: v.fields || {}, intakeValues: { ...(v.fields || {}) }, stepValues: {}, integrationValues: lookupResult ? { api_response: lookupResult.payload } : {}, classificationValues: { ...(typeConfig.lockedValues || {}), ...(v.classification || {}) }, classificationSnapshot: structuredClone(classificationFields), rcaConfigSnapshot: structuredClone(project?.rcaConfig || {}), rcaFormSnapshot: db.forms.find(f => f.id === project?.rcaConfig?.formId) ? structuredClone(db.forms.find(f => f.id === project.rcaConfig.formId)) : null, intakeSnapshot: intake ? { id: intake.id, name: intake.name, version: intake.version, fields: structuredClone(fields) } : null, stepFormSnapshots: snapshots, workflowId: typeConfig.workflowId || null }, bound, user.id, db), project?.rcaConfig);
        const saved = add('cases', record);
        msg.success(`${reference} created`);
        nav(`/project/${projectId}/cases/${saved.id}`);
    };
    if (create && !can('cases.create', projectId))
        return <PageEmpty title="Permission required" description="Your role cannot create cases in this project."/>;
    if (create)
        return <><PageHeading title={`New ${(project?.terms?.case || 'case').toLowerCase()}`} />
 <Panel><div style={{ maxWidth: 750 }}>
 <div><label className="field-label">{project?.terms?.case || 'Case'} type *</label>
 <Select style={{ width: '100%' }} placeholder="Select a type" value={typeId} onChange={chooseCaseType} options={types.map(t => ({ value: t.id, label: t.name }))}/>
 {!types.length && <div className="helper-text">Publish a Case Type with a form and workflow before starting a new record.</div>}</div>
 {typeId && needsLookup && !lookupResult && <div className="case-intake-panel" style={{ margin: '18px 0' }}>
   <SmallTitle>STEP 1 · DATA SOURCE INPUTS</SmallTitle>
   {operation?.method && !['GET'].includes(operation.method) && <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="This lookup may change external data" description="The configured operation is not GET. Fetching again can repeat an external side effect; use only an approved lookup operation."/>}
   {!operation ? <Alert type="error" showIcon message="Configured operation is unavailable" description="Ask your Project Admin to review the approved data source."/> :
                    <Form form={lookupForm} layout="vertical" onFinish={performLookup}>
     {inputDefinitions.map(param => <Form.Item key={param.name} label={param.name} name={param.name} rules={[{ required: param.required !== false && (param.defaultValue === null || param.defaultValue === undefined || param.defaultValue === ''), message: `${param.name} is required` }]} extra={`Type: ${param.type || 'string'}${param.defaultValue !== undefined && param.defaultValue !== '' ? ` · Default: ${String(param.defaultValue)}` : ''}`}>
       {param.type === 'number' ? <InputNumber style={{ width: '100%' }}/> :
                                param.type === 'boolean' ? <Select options={[{ label: 'True', value: true }, { label: 'False', value: false }]} placeholder="Select true or false"/> :
                                    param.type === 'object' ? <Input.TextArea rows={4} placeholder='Enter JSON object / array'/> :
                                        <Input placeholder={`Enter ${param.name}`}/>}
     </Form.Item>)}
     <Space><Button onClick={() => nav(`/project/${projectId}/cases`)}>Cancel</Button>
       <Button type="primary" htmlType="submit" loading={lookupBusy}>Fetch data & continue <ArrowRightOutlined /></Button></Space>
   </Form>}
 </div>}
 {typeId && needsLookup && lookupResult && <>
   <DataSourceResponse fields={lookupResult.fields} data={lookupResult.payload} title="STEP 1 · VERIFIED DATA SOURCE RESPONSE" recordSelection={{ records: recordChoices, index: recordIndex, onChange: selectRecord }}/>
   {lookupResult.truncated && <span className="helper-text">Response preview limited. </span>}
   <Button size="small" onClick={() => { lookupSequence.current++; caseKey.current=null; setLookupResult(null); form.resetFields(); form.setFieldsValue({classification:{...(typeConfig.defaultLookupValues || typeConfig.lockedValues || {})}}); }}>Change API inputs / fetch again</Button>
 </>}
 {typeId && (!needsLookup || lookupResult) && <Form form={form} layout="vertical" onFinish={createCase} onValuesChange={onValuesChange} onFinishFailed={({ errorFields }) => { const labels = errorFields.map(e => e.errors?.[0] || e.name.join(' / ')); msg.error(`Please check: ${labels.slice(0, 3).join('; ')}`); if (errorFields[0])
                form.scrollToField(errorFields[0].name, { block: 'center' }); }}>
 {classificationFields.length > 0 && <div className="case-intake-panel" style={{ margin: '18px 0' }}>
   <SmallTitle>CASE CLASSIFICATION</SmallTitle><CaseFields fields={classificationFields} db={db} project={project} form={form} base={['classification']}/>
 </div>}
 <div className="case-intake-panel" style={{ margin: '18px 0' }}>{intake ? <>
   <SmallTitle>{needsLookup ? 'STEP 2 · ' : ''}{intake.name} · Required information</SmallTitle>
   <CaseFields fields={fields} db={db} project={project} form={form} recordSelection={recordChoices.length > 1 ? { values: recordValues, keys: recordKeys, index: recordIndex, onChange: selectRecord } : null} stageContext={apiMode ? { projectId, caseTypeId: typeId } : null}/>
 </> : <Alert type="warning" showIcon message="No intake form attached" description="A Project Admin can attach a reusable form in Setup → Case types."/>}
 {typeConfig.workflowId && !db.workflows.some(w => w.id === typeConfig.workflowId && w.status === 'Published') &&
                    <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Workflow not published" description="Publish the workflow before creating this case."/>}
 </div>
 <Space><Button onClick={() => nav(`/project/${projectId}/cases`)}>Cancel</Button>
   <Button disabled={!type || !intake || !typeConfig.workflowId} type="primary" htmlType="submit">Create {String(project?.terms?.case || 'case').toLowerCase()}</Button>
 </Space></Form>}
 </div></Panel>
 </>;
    const rows = apiMode ? (serverPage.key === pageKey ? serverPage.rows : []) : cases.filter(c => canSeeCase(c, user, project, db) && `${c.reference} ${c.title}`.toLowerCase().includes(search));
    return <><PageHeading title={project?.terms?.cases || 'Cases'} description="Records created in this project, with project-specific reference numbers and form values." actions={can('cases.create', projectId) && <Button type="primary" icon={<PlusOutlined />} onClick={() => nav(`/project/${projectId}/cases/new`)}>New {String(project?.terms?.case || 'case').toLowerCase()}</Button>}/><Panel padding={false}>{apiMode && serverPage.error && serverPage.key === pageKey ? <Alert type="error" showIcon message={serverPage.error}/> : (rows.length || (apiMode && (serverPage.loading || serverPage.key !== pageKey))) ? <Table rowKey="id" dataSource={apiMode ? rows : [...rows].reverse()} loading={apiMode && (serverPage.loading || serverPage.key !== pageKey)} pagination={apiMode ? { current: page.current, pageSize: page.size, total: serverPage.total, showSizeChanger: true, pageSizeOptions: [10,20,50,100], onChange: (current,size) => setPageState({scopeKey,current,size}) } : undefined} columns={[{ title: 'Reference', dataIndex: 'reference', render: (x, r) => <a onClick={() => nav(`/project/${projectId}/cases/${r.id}`)}><b>{x}</b></a> }, { title: 'Title', dataIndex: 'title' }, { title: 'Type', render: (_, r) => types.find(x => x.id === r.typeId)?.name || '—' }, { title: 'Status', dataIndex: 'status', render: s => <Pill status={s}>{s}</Pill> }, { title: 'Case TAT due', render: (_, r) => r.dueAt ? <span title='Calculated using the project business calendar'>{niceDate(r.dueAt)}{r.status !== 'Closed' && new Date(r.dueAt) < new Date() && <Tag color="red" style={{ marginLeft: 6 }}>Breached</Tag>}</span> : '—' }, { title: 'Open tasks', render: (_, r) => r.openTaskCount ?? openTasks(r).length }, { title: '', render: (_, r) => <Space><Button type="link" onClick={() => setDetailsId(r.id)}>Details / audit</Button><Button type="link" onClick={() => nav(`/project/${projectId}/cases/${r.id}`)}>Open case</Button></Space> }, { title: 'Created', dataIndex: 'createdAt', render: niceDate }]}/> : <PageEmpty title="No matching cases" description="New case records will appear here after creation." actionText={can('cases.create', projectId) ? 'Create a case' : undefined} onAction={can('cases.create', projectId) ? () => nav(`/project/${projectId}/cases/new`) : undefined}/>}</Panel><CaseDetailDrawer open={!!detailsId} onClose={() => setDetailsId(null)} record={apiMode ? (serverDetail?.id === detailsId && serverDetail?.projectId === projectId ? serverDetail : null) : cases.find(c => c.id === detailsId)} db={db} project={project}/></>;
}
export function ReportsPage() {
    const { db, project, projectId, apiMode, api, canSetup } = projectData();
    const allowed = Boolean(canSetup?.(projectId));
    return <>
   <PageHeading title="Reports" description="Build project-specific reports by selecting datasets, log fields, and columns."/>
   {allowed
            ? <ReportBuilder db={db} project={project} projectId={projectId} apiMode={apiMode} api={api} canSetup={allowed}/>
            : <div className="helper-text">Project Administrator access required.</div>}
 </>;
}
export function NotificationsPage() {
    const { db, projectId, add, update, can, apiMode } = projectData(), msg = AntApp.useApp().message, [modal, setModal] = useState(false), [editing, setEditing] = useState(null), [form] = Form.useForm();
    const rows = db.notifications.filter(n => n.projectId === projectId);
    const open = (item = null) => { setEditing(item); form.resetFields(); form.setFieldsValue(item || { enabled: true, channel: 'Email', event: 'Case created', subject: '', body: '' }); setModal(true); };
    const save = async (v) => { try {
        if (editing)
            await update('notifications', editing.id, v);
        else
            await add('notifications', { ...v, projectId });
        setModal(false);
        msg.success('Notification rule saved');
    }
    catch (error) {
        msg.error(error.message);
    } };
    return <><PageHeading title="Notifications" description="Configure project-specific triggers, templates, recipients and delivery channels." actions={can('notifications.manage', projectId) && <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>New notification</Button>}/><Panel padding={false}>{rows.length ? <Table rowKey="id" dataSource={rows} pagination={false} columns={[{ title: 'Notification', render: (_, r) => <><b>{r.name}</b><span className="table-subtitle">{r.event}</span></> }, { title: 'Channel', dataIndex: 'channel' }, { title: 'Active', render: (_, r) => <Switch size="small" checked={r.enabled} disabled={apiMode || !can('notifications.manage', projectId)} onChange={async (v) => { try {
                await update('notifications', r.id, { enabled: v });
            }
            catch (e) {
                msg.error(e.message);
            } }}/> }, { title: '', render: (_, r) => <Button type="link" disabled={!can('notifications.manage', projectId)} onClick={() => open(r)}>Edit</Button> }]}/> : <PageEmpty title="No notifications configured" description="Create a rule for project events such as case creation or approval." actionText={can('notifications.manage', projectId) ? 'New notification' : undefined} onAction={can('notifications.manage', projectId) ? () => open() : undefined}/>}</Panel><div className="note-strip" style={{ marginTop: 14 }}>{apiMode ? 'Rules and templates are stored in SQL Server. Delivery is processed through the outbox when Notifications:DeliveryMode=Live and providers are configured.' : 'Rules are configuration-only in this JSX frontend. No emails or messages are actually sent.'}</div>
 <Modal title={editing ? 'Edit notification' : 'New notification'} open={modal} onCancel={() => setModal(false)} onOk={() => form.submit()} width={640} destroyOnClose><Form form={form} layout="vertical" onFinish={save}><Form.Item name="name" label="Rule name" rules={[{ required: true }]}><Input /></Form.Item><div className="two-column" style={{ gridTemplateColumns: '1fr 1fr' }}><Form.Item name="event" label="Trigger"><Select options={['Case created', 'Task assigned', 'SLA approaching', 'SLA breached', 'Workflow completed', 'Case closed'].map(v => ({ value: v, label: v }))}/></Form.Item><Form.Item name="channel" label="Channel"><Select options={['Email', 'SMS', 'In-app'].map(v => ({ value: v, label: v }))}/></Form.Item></div><Form.Item name="subject" label="Subject"><Input placeholder="Case {{reference}} created"/></Form.Item><Form.Item name="body" label="Message template"><Input.TextArea rows={4}/></Form.Item><Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch disabled={apiMode}/></Form.Item></Form></Modal></>;
}
