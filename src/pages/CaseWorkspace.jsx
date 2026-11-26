import { ApiCaseWorkspace } from './ApiCaseWorkspace';
import { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Alert, Button, Descriptions, Form, Input, InputNumber, Select, Space, Steps, Table, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, ClockCircleOutlined, FileTextOutlined, TeamOutlined, HistoryOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { usePlatform } from '../context/PlatformContext';
import { PageEmpty, PageHeading, Panel, Pill, SmallTitle } from '../components/UI';
import { canSeeCase, canWorkTask, completeCaseTask, continueWait, completeDataSourceStep, failDataSourceStep, openTasks, workflowStep } from '../utils/caseFlow';
import { CaseFields, fieldDisplayValue, resetDependentFields } from '../components/CaseFields';
import { dependentFieldKeys } from '../utils/lookups';
import { niceDate, availableLookups } from '../utils/helpers';
import { closeCaseWithRca, gateCaseClosure } from '../utils/rca';
import { rcaFieldsOf, isRcaFieldVisible } from '../utils/rcaFields';
import { CaseDetailDrawer } from '../components/CaseDetailDrawer';
import { CaseTatTimer } from '../components/CaseTatTimer';
import { caseClassificationRows } from '../utils/caseClassification.js';
import { AttachmentValue } from '../components/AttachmentInput';
import { caseInformationSections, stepPrefillValues } from '../utils/caseCarryForward';
import dayjs from 'dayjs';
import { callDataSource } from '../services/dataOperations';
import { routeTask, teamPeople, nextRoutingStage, activeUser, onLeave } from '../utils/workforce';
function LocalCaseWorkspace() {
    const { projectId, caseId } = useParams();
    const { db, user, update, can, canSetup } = usePlatform();
    const msg = AntApp.useApp().message, nav = useNavigate();
    const project = db.projects.find(p => p.id === projectId);
    const term = project?.terms?.case || 'Case', terms = project?.terms?.cases || 'Cases';
    const record = db.cases.find(c => c.projectId === projectId && c.id === caseId);
    const [selectedTask, setSelectedTask] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false), [runningOp, setRunningOp] = useState(null);
    const runningRef = useRef(new Set());
    const [action, setAction] = useState('Complete'), [forwardTo, setForwardTo] = useState(null);
    const [form] = Form.useForm(), [rcaForm] = Form.useForm();
    const rcaFieldValues = Form.useWatch('rcaDynamicFields', rcaForm) || {};
    const isAllowed = record && can('cases.view', projectId) && canSeeCase(record, user, project, db);
    const pendingOps = record?.runtime?.pendingOperations || [];
    const nextPending = pendingOps.find(o => o.status === 'Pending');
    const autoAttempt = async (pending) => {
        if (!record || runningRef.current.has(pending.id))
            return;
        runningRef.current.add(pending.id);
        setRunningOp(pending.id);
        try {
            const source = db.dataSources.find(s => s.id === pending.dataSourceId && project?.dataSourceIds?.includes(s.id));
            const operation = source?.operations?.find(o => o.code === pending.operationCode);
            if (!source || !operation)
                throw Error('Workflow data source or operation is not configured for this project');
            const context = { ...record.integrationValues, ...record.fieldValues, ...record.classificationValues, fields: record.fieldValues || {}, classification: record.classificationValues || {}, title: record.title, reference: record.reference, description: record.description };
            const result = await callDataSource(source, operation, context);
            const next = gateCaseClosure(completeDataSourceStep(record, pending.id, result.mapped, user?.id, db), record.rcaConfigSnapshot || project?.rcaConfig);
            update('cases', record.id, next);
            msg.success(`Data source completed · ${result.status}`);
        }
        catch (error) {
            update('cases', record.id, failDataSourceStep(record, pending.id, error.message, user?.id));
            msg.error(`Data source failed: ${error.message}`);
        }
        finally {
            runningRef.current.delete(pending.id);
            setRunningOp(null);
        }
    };
    useEffect(() => { if (isAllowed && nextPending)
        void autoAttempt(nextPending); }, [record?.id, nextPending?.id, isAllowed]);
    const prefillTask = record?.runtime?.tasks?.find(t => t.status === 'Open' && t.id === selectedTask) || record?.runtime?.tasks?.find(t => t.status === 'Open' && canWorkTask(t, user, project, db));
    // Every new reviewer starts with the original intake and prior team's answers.
    useEffect(() => {
        if (!prefillTask)
            return;
        const steps = {};
        for (const fid of prefillTask.formIds || []) {
            const definition = record?.stepFormSnapshots?.[fid] || db.forms.find(item => item.id === fid);
            if (!definition)
                continue;
            const values = stepPrefillValues(record, definition);
            steps[fid] = Object.fromEntries(Object.entries(values).map(([key, value]) => [
                key, definition.fields?.find(field => field.key === key)?.type === 'date' && typeof value === 'string' ? dayjs(value) : value
            ]));
        }
        form.setFieldsValue({ steps });
    }, [prefillTask?.id, record?.id, record?.stepValues, record?.fieldValues]);
    if (!record || !isAllowed)
        return <PageEmpty title={`${term} unavailable`} description={`This ${term.toLowerCase()} is not available to your project or team.`} actionText={`Back to ${terms.toLowerCase()}`} onAction={() => nav(`/project/${projectId}/cases`)}/>;
    const workflow = record.workflowSnapshot;
    const type = db.caseTypes.find(t => t.id === record.typeId);
    const intake = record.intakeSnapshot || db.forms.find(f => f.id === type?.formId);
    const classification = caseClassificationRows(record, db, project);
    const rcaSettings = record.rcaConfigSnapshot || project?.rcaConfig || {};
    const rcaDynamicFields = rcaFieldsOf(rcaSettings);
    const templateRca = Array.isArray(rcaSettings.fields);
    const rcaDetailForm = record.rcaFormSnapshot || db.forms.find(f => f.id === rcaSettings.formId && f.projectId === projectId);
    const reasonList = availableLookups(db, project).find(l => l.id === rcaSettings.reasonLookupId);
    const canCompleteRca = can('cases.manage', projectId) && canSeeCase(record, user, project, db);
    const tasks = openTasks(record);
    const active = tasks.find(t => t.id === selectedTask) || tasks.find(t => canWorkTask(t, user, project, db)) || tasks[0];
    const taskNode = active ? workflowStep(record, active.nodeId) : null;
    const canAct = Boolean(active && canWorkTask(active, user, project, db) && can('cases.manage', projectId));
    const carriedSections = caseInformationSections(record);
    const taskForms = (active?.formIds || []).map(fid => record.stepFormSnapshots?.[fid] || db.forms.find(f => f.id === fid && f.projectId === projectId)).filter(Boolean);
    const availableActions = taskNode?.data?.actions?.length ? taskNode.data.actions : ['Complete', 'Approve', 'Reject', 'Return', 'Forward', 'Request information'];
    const currentAction = availableActions.includes(action) ? action : availableActions[0];
    const currentTeam = db.teams.find(t => t.id === active?.teamId && t.projectId === projectId);
    const nextRole = nextRoutingStage(currentTeam, active?.routingStage, db);
    const routeCandidates = nextRole ? teamPeople(currentTeam, nextRole, db).filter(id => activeUser(db, id)) : [];
    const handoff = () => { try {
        if (!forwardTo)
            return msg.error('Choose the next person');
        const next = routeTask(record, active.id, user.id, forwardTo, db);
        update('cases', record.id, next);
        setForwardTo(null);
        msg.success('Case forwarded to the next person');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const apply = v => {
        try {
            if (!canAct)
                return msg.error('You are not assigned to this task');
            const needs = active.requireForm && taskForms.some(f => (f.fields || []).length);
            if (needs && (!v.steps || !Object.keys(v.steps).length))
                return msg.warning('Complete the required step form');
            const next = gateCaseClosure(completeCaseTask(record, active.id, currentAction, user.id, v.steps || {}, db), rcaSettings);
            update('cases', record.id, next);
            setSelectedTask(null);
            setAction('Complete');
            form.resetFields();
            msg.success(`${currentAction} saved · ${next.status}`);
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const submitRca = values => {
        try {
            if (!canCompleteRca)
                return msg.error('You cannot submit RCA for this case.');
            const next = closeCaseWithRca(record, { summary: templateRca ? '' : values.summary, reasonCode: templateRca ? undefined : values.reasonCode, formValues: templateRca ? {} : values.rcaFields || {}, fields: Object.fromEntries(rcaDynamicFields.filter(f => isRcaFieldVisible(f, values.rcaDynamicFields || {}) && values.rcaDynamicFields?.[f.key] !== undefined).map(f => [f.key, values.rcaDynamicFields[f.key]])) }, user.id, rcaSettings);
            update('cases', record.id, next);
            rcaForm.resetFields();
            msg.success('RCA completed and case closed');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const resume = wait => {
        try {
            const next = gateCaseClosure(continueWait(record, wait.id, user.id, db), rcaSettings);
            update('cases', record.id, next);
            msg.success('Timer resumed (simulation)');
        }
        catch (e) {
            msg.error(e.message);
        }
    };
    return <div className="stack">
    <PageHeading title={record.reference} description={`${type?.name || 'Case'} · ${record.title}`} actions={<Space wrap><Button icon={<HistoryOutlined />} onClick={() => setDetailsOpen(true)}>Details & audit</Button><Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/project/${projectId}/cases`)}>{terms}</Button><Pill status={record.status}>{record.status}</Pill><CaseTatTimer mini dueAt={record.dueAt} closedAt={record.closedAt} status={record.status} targetHours={record.caseTypeSnapshot?.slaHours || project?.slaHours} tatMode={record.caseTypeSnapshot?.tatMode} calendarName={project?.calendarId ? (db.calendars.find(cal => cal.id === project.calendarId)?.name || 'Project business calendar') : 'Not assigned'}/></Space>}/>
    <div className="case-workspace-columns">
      <div className="stack">
        <Panel title={`${term} summary`} extra={<Tag color="blue">{workflow ? `${workflow.name} · v${workflow.version}` : 'No published workflow'}</Tag>}>
          <Descriptions size="small" column={2} bordered items={[
            { key: 'title', label: 'Title', children: record.title }, { key: 'type', label: `${term} type`, children: record.caseTypeSnapshot?.name || type?.name || '—' },
            { key: 'status', label: 'Status', children: record.status }, { key: 'submitter', label: 'Created by', children: db.users.find(u => u.id === record.createdBy)?.name || 'Unknown' },
            { key: 'created', label: 'Created', children: niceDate(record.createdAt) }, { key: 'closed', label: 'Completed', children: niceDate(record.closedAt) }
        ]}/>
          {record.description && <div className="note-strip" style={{ marginTop: 15 }}>{record.description}</div>}
        </Panel>
        <Panel title={intake?.name ? `Intake form · ${intake.name}` : 'Intake details'}>
          {intake?.fields?.length ? <div className="case-value-grid">{intake.fields.map(f => <div key={f.id || f.key} className="case-value"><span>{f.label}</span><strong>{f.type === 'attachment' ? <AttachmentValue value={record.intakeValues?.[f.key] ?? record.fieldValues?.[f.key]}/> : fieldDisplayValue(f, record.intakeValues?.[f.key] ?? record.fieldValues?.[f.key], db, project)}</strong></div>)}</div> : <div className="muted">This case type has no intake form attached.</div>}
        </Panel>
        {classification.length > 0 && <Panel title="Case classification"><div className="case-value-grid">{classification.map(item => <div key={item.key} className="case-value"><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></Panel>}
        {record.rca?.completedAt && <Panel title="Root cause analysis"><div className="case-value-grid"><div className="case-value"><span>Reason</span><strong>{reasonList?.items?.find(i => i.code === record.rca.reasonCode)?.label || record.rca.reasonCode || '—'}</strong></div><div className="case-value"><span>Completed by</span><strong>{db.users.find(u => u.id === record.rca.completedBy)?.name || '—'}</strong></div><div className="case-value"><span>Summary</span><strong>{record.rca.summary}</strong></div>{rcaDynamicFields.filter(f => record.rca.fields?.[f.key] !== undefined).map(f => <div className="case-value" key={f.key}><span>{f.label}</span><strong>{String(record.rca.fields[f.key])}</strong></div>)}{(rcaDetailForm?.fields || []).map(field => <div className="case-value" key={field.id || field.key}><span>{field.label}</span><strong>{field.type === 'attachment' ? <AttachmentValue value={record.rca.formValues?.[field.key]}/> : fieldDisplayValue(field, record.rca.formValues?.[field.key], db, project)}</strong></div>)}</div></Panel>}
        <Panel title={`Case journey · ${(record.runtime?.events || []).length} events`}>
          <Timeline items={[...(record.runtime?.events || [])].reverse().map(event => ({ color: event.kind === 'error' ? 'red' : event.kind === 'action' ? 'green' : 'gray', children: <div><strong>{event.message}</strong><div className="helper-text">{new Date(event.at).toLocaleString()} · {db.users.find(u => u.id === event.actorId)?.name || 'System'}</div></div> }))}/>
        </Panel>
      </div>
      <div className="stack">
        <Panel title={`Open tasks · ${tasks.length}`}>
          {tasks.length ? tasks.map(task => {
            const step = workflowStep(record, task.nodeId), team = db.teams.find(t => t.id === task.teamId), mine = canWorkTask(task, user, project, db);
            return <button className={`case-task-card ${task.id === active?.id ? 'active' : ''}`} type="button" key={task.id} onClick={() => { setSelectedTask(task.id); setForwardTo(null); setAction('Complete'); form.resetFields(); }}><div><strong>{step?.data?.label || 'Team task'}</strong><Tag color={mine ? 'green' : 'default'}>{mine ? 'Assigned to you' : 'Read only'}</Tag></div><div className="helper-text">{team?.name || 'Unassigned'} · {db.users.find(u => u.id === task.assignedTo)?.name || 'Unassigned'} · {niceDate(task.createdAt)}</div></button>;
        }) : <div className="muted">No open human tasks. {record.status === 'Closed' ? 'This case is complete.' : 'Check the case journey below.'}</div>}
        </Panel>
        {active && <Panel title={nextRole ? "Forward to next reviewer" : "Process selected task"}>
          <CaseTatTimer compact title="Current task SLA" dueAt={active.dueAt} status={active.status} targetHours={taskNode?.data?.slaHours || project?.slaHours}/>
          {!canAct && <div className="helper-text" style={{ marginBottom: 12 }}>Read-only</div>}
          <div className="note-strip" style={{ marginBottom: 16 }}><strong>{taskNode?.data?.label}</strong><br />{currentTeam?.name || 'Unassigned team'} · Assigned to {db.users.find(u => u.id === active.assignedTo)?.name || 'Not assigned'}{active.delegatedFor ? ` (backup for ${db.users.find(u => u.id === active.delegatedFor)?.name || 'colleague'})` : ''}.</div>
          {!!carriedSections.length && <div className="case-task-form" style={{ marginBottom: 16 }}><SmallTitle>INFORMATION CARRIED FORWARD</SmallTitle><p className="helper-text">Read-only information lodged earlier and provided by previous teams. Available to every assigned reviewer.</p>{carriedSections.map(section => <div key={section.key} style={{ marginBottom: 12 }}><strong className="field-label">{section.title}</strong><div className="case-value-grid">{section.fields.map(f => <div className="case-value" key={f.key}><span>{f.label}</span><strong>{f.type === 'attachment' ? <AttachmentValue value={f.value}/> : f.type ? fieldDisplayValue(f, f.value, db, project) : typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value ?? '—')}</strong></div>)}</div></div>)}</div>}
          {nextRole ? <div className="stack"><></><div><label className="field-label">{nextRole === 'team_lead' ? 'Team Lead' : 'Team Member'} *</label><Select style={{ width: '100%' }} value={forwardTo} onChange={setForwardTo} showSearch optionFilterProp="label" placeholder="Select next reviewer" options={routeCandidates.map(id => ({ value: id, label: `${db.users.find(u => u.id === id)?.name}${onLeave(db, id, projectId) ? ' (on leave — backup will receive)' : ''}` }))}/></div><Button type="primary" onClick={handoff} disabled={!canAct || !forwardTo}>Forward {String(term).toLowerCase()}</Button></div> : <Form form={form} layout="vertical" onFinish={apply} disabled={!canAct} onValuesChange={changed => {
                    for (const f of taskForms) {
                        const inner = changed.steps?.[f.id];
                        if (!inner)
                            continue;
                        const changedKeys = Object.keys(inner);
                        const dependent = new Set(changedKeys.flatMap(key => dependentFieldKeys(f.fields || [], key)));
                        if (dependent.size)
                            form.setFieldsValue({ steps: { [f.id]: Object.fromEntries([...dependent].map(k => [k, undefined])) } });
                    }
                }}>
            {taskForms.map(f => <div key={f.id} className="case-task-form"><SmallTitle>{f.name} · Step form</SmallTitle><CaseFields fields={f.fields || []} db={db} project={project} form={form} base={['steps', f.id]}/></div>)}
            <Form.Item label="Action"><Select value={currentAction} disabled={!canAct} onChange={setAction} options={availableActions.map(a => ({ value: a, label: a }))}/></Form.Item>
            <Button htmlType="submit" type="primary" icon={<CheckOutlined />} disabled={!canAct}>Submit {currentAction.toLowerCase()}</Button>
          </Form>}
        </Panel>}
        {record.status === 'Pending RCA' && <Panel title="RCA required to close this case">
          <Alert type="warning" showIcon message="Workflow completed · RCA pending" description="This project requires root cause analysis before closing a case. Complete the details below." style={{ marginBottom: 14 }}/>
          {!canCompleteRca && <div className="helper-text" style={{ marginBottom: 12 }}>Read-only</div>}
          <Form form={rcaForm} layout="vertical" disabled={!canCompleteRca} onValuesChange={changed => resetDependentFields(changed, rcaDetailForm?.fields || [], rcaForm, 'rcaFields', db, project)} onFinish={submitRca} onFinishFailed={({ errorFields }) => msg.error(errorFields[0]?.errors?.[0] || 'Complete all required RCA fields')}>
            {!templateRca && rcaSettings.reasonLookupId && <Form.Item name="reasonCode" label="Root cause reason" rules={[{ required: true, message: 'Select a root cause reason' }]}><Select showSearch optionFilterProp="label" placeholder="Choose reason" options={(reasonList?.items || []).filter(i => i.active !== false).map(i => ({ value: i.code, label: i.label }))}/></Form.Item>}
            {!templateRca && <Form.Item name="summary" label="RCA summary" rules={[{ required: true, whitespace: true, message: 'Explain the root cause before closing' }]}><Input.TextArea rows={3} placeholder="What caused the case and what corrective action was taken?"/></Form.Item>}
            {rcaSettings.enabled && <div className="case-task-form"><SmallTitle>RCA DETAILS</SmallTitle><div className="two-column">{rcaDynamicFields.filter(f => isRcaFieldVisible(f, rcaFieldValues)).map(field => <Form.Item key={field.key} label={field.label} name={['rcaDynamicFields', field.key]} rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}>{field.type === 'number' ? <InputNumber style={{ width: '100%' }} min={field.min ?? 0}/> : field.type === 'text' ? <Input /> : field.type === 'textarea' ? <Input.TextArea rows={3}/> : field.type === 'date' ? <Input type="date"/> : <Select showSearch optionFilterProp="label" placeholder={`Select ${field.label}`} options={(field.type === 'toggle' ? ['Yes', 'No'] : field.options || []).map(v => ({ value: v, label: v }))}/>}</Form.Item>)}</div></div>}
            {!templateRca && rcaDetailForm?.fields?.length > 0 && <div className="case-task-form"><SmallTitle>{rcaDetailForm.name} · RCA form</SmallTitle><CaseFields fields={rcaDetailForm.fields} db={db} project={project} form={rcaForm} base={['rcaFields']}/></div>}
            <Button htmlType="submit" type="primary" icon={<CheckOutlined />} disabled={!canCompleteRca}>Submit RCA and close case</Button>
          </Form>
        </Panel>}
        {!!record.runtime?.pendingOperations?.length && <Panel title="Data-source operations"><></>{record.runtime.pendingOperations.map(p => <div className="holiday-row" key={p.id}><div><b>{workflowStep(record, p.nodeId)?.data?.label || 'API operation'}</b><div className="helper-text">{p.status}{p.lastError ? ` · ${p.lastError}` : ''}</div></div><Button loading={runningOp === p.id} disabled={runningOp !== null} onClick={() => void autoAttempt(p)}>{p.status === 'Failed' ? 'Retry API' : 'Run now'}</Button></div>)}</Panel>}
        {!!record.runtime?.waiting?.length && <Panel title="Waiting steps"><Alert type="warning" showIcon message="Demo timer" description="Timers do not run automatically in this browser-only prototype. Project administrators can manually continue a waiting node." style={{ marginBottom: 12 }}/>{record.runtime.waiting.map(wait => <div className="holiday-row" key={wait.id}><span><strong>{workflowStep(record, wait.nodeId)?.data?.label}</strong><div className="helper-text">Configured wait: {wait.delayMinutes} minutes</div></span><Button disabled={!canSetup(projectId)} onClick={() => resume(wait)}>Continue demo</Button></div>)}</Panel>}
        <Panel title="Task history"><Table rowKey="id" size="small" pagination={false} dataSource={record.runtime?.tasks || []} columns={[{ title: 'Step', render: (_, t) => workflowStep(record, t.nodeId)?.data?.label || 'Step' }, { title: 'Team', render: (_, t) => db.teams.find(tm => tm.id === t.teamId)?.name || '—' }, { title: 'Status', render: (_, t) => <Tag color={t.status === 'Completed' ? 'green' : 'blue'}>{t.action || t.status}</Tag> }]}/></Panel>
      </div>
    </div>
    <CaseDetailDrawer open={detailsOpen} onClose={() => setDetailsOpen(false)} record={record} db={db} project={project}/>
    <div className="note-strip">Browser-local workflow simulator. REST data-source steps call the allowlisted development proxy and persist mapped values in the browser; this is not durable server-side workflow execution. Notification delivery, timers and directory authentication require a backend.</div>
  </div>;
}
export function CaseWorkspace() { const { apiMode } = usePlatform(); return apiMode ? <ApiCaseWorkspace /> : <LocalCaseWorkspace />; }
