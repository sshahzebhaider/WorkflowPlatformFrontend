import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, Descriptions, Form, Input, InputNumber, Select, Space, Table, Tag, Timeline, Spin } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, FileTextOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { usePlatform } from '../context/PlatformContext';
import { CaseFields } from '../components/CaseFields';
import { DataSourceResponse } from '../components/DataSourceResponse';
import { PageEmpty, PageHeading, Panel, Pill, SmallTitle } from '../components/UI';
import { CaseTatTimer } from '../components/CaseTatTimer';
import { caseClassificationRows } from '../utils/caseClassification.js';
import { niceDate } from '../utils/helpers';
import dayjs from 'dayjs';
import { isRcaFieldVisible, rcaValidationError } from '../utils/rcaFields.js';
const display = v => v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
const own = (record, userId) => record?.assignedTo === userId;
/** All actions and history on this screen are served by SQL; the local workflow simulator is never called. */
export function ApiCaseWorkspace() {
    const { projectId, caseId } = useParams(), nav = useNavigate();
    const { db, user, refreshCase, completeTask, forwardTask, submitRca, api, canSetup } = usePlatform();
    const msg = AntApp.useApp().message;
    const [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false), [selectedTask, setSelectedTask] = useState(null);
    const [action, setAction] = useState('Complete'), [toUserId, setToUserId] = useState(null), [attachmentField, setAttachmentField] = useState('attachment');
    const [form] = Form.useForm(), [rcaForm] = Form.useForm();
    const record = db.cases.find(c => c.id === caseId && c.projectId === projectId && c.intakeSnapshot);
    const project = db.projects.find(p => p.id === projectId);
    const caseWord = project?.terms?.case || 'Case';
    const fetchDetails = async () => { try {
        setLoadError('');
        await refreshCase(projectId, caseId);
    }
    catch (error) {
        setLoadError(error.message);
    } };
    useEffect(() => { void fetchDetails(); }, [projectId, caseId]);
    const rcaValues = Form.useWatch('fields', rcaForm) || {};
    const rcaFields = record?.rcaConfigSnapshot?.fields || [];
    const tasks = record?.runtime?.tasks || [];
    const openTasks = tasks.filter(t => t.status === 'Open');
    const current = openTasks.find(t => t.id === selectedTask) || openTasks.find(t => own(t, user?.id)) || openTasks[0];
    const node = record?.workflowSnapshot?.nodes?.find(n => n.id === current?.nodeId);
    const team = db.teams.find(t => t.id === current?.teamId);
    const routingStage = String(current?.routingStage || 'Officer').toLowerCase();
    const isRoleQueue = node?.data?.assignmentMode === 'roleQueue';
    const canForward = Boolean(current && own(current, user?.id) && !isRoleQueue && ['unithead', 'teamlead'].includes(routingStage));
    const canAssign = Boolean(current && !current.assignedTo && (canSetup(projectId) || team?.leadIds?.includes(user?.id) || team?.unitHeadIds?.includes(user?.id)));
    const canWork = Boolean(current && own(current, user?.id) && (routingStage === 'officer' || isRoleQueue));
    const teamMembers = canAssign ? [...(team?.members || []), ...(team?.leadIds || []), ...(team?.unitHeadIds || [])] :
        routingStage === 'unithead' ? (team?.leadIds?.length ? team.leadIds : team?.members || []) :
            routingStage === 'teamlead' ? team?.members || [] : [];
    const stepForms = (current?.formIds || []).map(id => record?.stepFormSnapshots?.[id]).filter(Boolean);
    const allowedActions = node?.data?.actions?.length ? node.data.actions : ['Complete', 'Approve', 'Reject', 'Return', 'Request information'];
    const intake = record?.intakeSnapshot;
    const priorAnswers = useMemo(() => {
        const values = { ...(record?.intakeValues || {}), ...(record?.integrationValues || {}) };
        for (const section of Object.values(record?.stepValues || {}))
            for (const answers of Object.values(section || {}))
                Object.assign(values, answers || {});
        return values;
    }, [record]);
    useEffect(() => {
        if (!current)
            return;
        const steps = {};
        for (const fieldForm of stepForms) {
            steps[fieldForm.id] = {};
            for (const field of fieldForm.fields || []) {
                const v = priorAnswers[field.key];
                if (v !== undefined)
                    steps[fieldForm.id][field.key] = field.type === 'date' && typeof v === 'string' ? dayjs(v) : v;
            }
        }
        form.setFieldsValue({ steps });
    }, [current?.id, record?.id]);
    async function run(operation, success) {
        setBusy(true);
        try {
            await operation();
            await fetchDetails();
            msg.success(success);
        }
        catch (error) {
            msg.error(error.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function complete(v) {
        if (!canWork)
            return msg.error('The task must be assigned to your account.');
        const answers = {};
        for (const f of stepForms) {
            if (!f.versionId)
                return msg.error(`Published version missing for ${f.name}.`);
            const result = { ...(v.steps?.[f.id] || {}) };
            for (const field of f.fields || [])
                if (field.type === 'attachment') {
                    const uploaded = record.attachments.filter(doc => doc.fieldKey === field.key && doc.taskId === current.id);
                    if (field.required && !uploaded.length)
                        return msg.error(`Upload ${field.label} in Attachments before completing this task.`);
                    if (uploaded.length)
                        result[field.key] = uploaded.map(doc => doc.id);
                }
            answers[f.versionId] = Object.fromEntries(Object.entries(result).map(([key, value]) => [key, dayjs.isDayjs(value) ? value.format('YYYY-MM-DD') : value]));
        }
        await run(() => completeTask(current.id, action, answers, v.comment || ''), `${action} recorded in SQL Server`);
        form.resetFields();
        setSelectedTask(null);
    }
    async function forward() {
        if (!current || !toUserId)
            return msg.error('Select a recipient first.');
        if (!canForward && !canAssign)
            return msg.error('This task cannot be reassigned by the current user.');
        await run(() => canAssign ? api.post(`/tasks/${current.id}/assign`, { toUserId }) : forwardTask(current.id, toUserId), canAssign ? 'Task assigned' : 'Task forwarded');
        setToUserId(null);
    }
    async function saveRca(values) {
        const fields = Object.fromEntries(rcaFields.filter(f => isRcaFieldVisible(f, values.fields || {})).map(f => [f.key, values.fields?.[f.key]]));
        const error = rcaValidationError(rcaFields, fields);
        if (error) return msg.error(error);
        await run(() => submitRca(caseId, { summary: '', fields, reasonId: null, formValues: {} }), 'RCA submitted');
    }
    async function uploadFile(event) {
        const file = event.target.files?.[0];
        if (!file)
            return;
        await run(() => api.upload(`/projects/${projectId}/cases/${caseId}/attachments`, {
            fieldKey: attachmentField, taskId: current?.id || undefined
        }, file), 'File uploaded. Malware scan approval is required before download.');
        event.target.value = '';
    }
    if (loadError)
        return <PageEmpty title="Could not load case" description={loadError} actionText="Retry" onAction={() => void fetchDetails()}/>;
    if (!record)
        return <div style={{ padding: 42, textAlign: 'center' }}><Spin tip="Loading case from SQL Server"><div style={{ height: 100 }}/></Spin></div>;
    const status = record.status;
    const types = record.caseTypeSnapshot?.name || caseWord;
    const openCount = openTasks.length;
    const classificationRows = caseClassificationRows(record, db, project);
    return <div className="stack">
    <PageHeading title={record.reference} description={`${types} · ${record.title}`} actions={<Space wrap>
      <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/project/${projectId}/cases`)}>Back to {project?.terms?.cases || 'Cases'}</Button>
      <Button onClick={() => void fetchDetails()} loading={busy}>Refresh</Button><Pill status={status}>{status}</Pill>
      <CaseTatTimer mini dueAt={record.dueAt} closedAt={record.closedAt} status={record.status} targetHours={record.caseTypeSnapshot?.slaHours || project?.slaHours} tatMode={record.caseTypeSnapshot?.tatMode} calendarName={project?.calendarId ? (db.calendars.find(cal => cal.id === project.calendarId)?.name || 'Project business calendar') : 'Not assigned'}/>
    </Space>}/>
    <div className="case-workspace-columns"><div className="stack">
      <Panel title={`${caseWord} summary`} extra={<Tag color="blue">Workflow v{record.caseTypeSnapshot?.version || '—'} (pinned)</Tag>}>
        <Descriptions size="small" column={2} bordered items={[
            { key: 'title', label: 'Title', children: record.title }, { key: 'type', label: 'Type', children: types },
            { key: 'status', label: 'Status', children: status }, { key: 'creator', label: 'Created by', children: db.users.find(u => u.id === record.createdBy)?.name || '—' },
            { key: 'date', label: 'Created', children: niceDate(record.createdAt) },
            { key: 'due', label: 'Due', children: niceDate(record.dueAt) }
        ]}/>
      </Panel>
      <Panel title={`Intake form · ${intake?.name || 'Submitted details'}`}>
        <div className="case-value-grid">{(intake?.fields || []).map(f => <div className="case-value" key={f.key}>
          <span>{f.label}</span><strong>{display(record.intakeValues?.[f.key])}</strong>
        </div>)}</div>
        {record.integrationValues?.api_response !== undefined && <DataSourceResponse title="DATA SOURCE RESULTS · CASE LODGEMENT" data={record.integrationValues.api_response}/>}
        {Object.keys(record.integrationValues || {}).some(key => key !== 'api_response') && <DataSourceResponse title="WORKFLOW DATA SOURCE VALUES" data={Object.fromEntries(Object.entries(record.integrationValues).filter(([key]) => key !== 'api_response'))}/>}
        {classificationRows.length > 0 && <><SmallTitle>INITIAL CLASSIFICATION</SmallTitle>
          <div className="case-value-grid">{classificationRows.map(item => <div key={item.key} className="case-value"><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></>}
      </Panel>
      {!!Object.keys(record.stepValues || {}).length && <Panel title="Completed team forms · Information carried forward">
        {Object.entries(record.stepValues).map(([taskId, forms]) => <div key={taskId} className="case-task-form" style={{ marginBottom: 12 }}>
          {Object.entries(forms).map(([formId, answers]) => <div key={formId}><SmallTitle>{record.stepFormSnapshots?.[formId]?.name || 'Completed form'}</SmallTitle>
            <div className="case-value-grid">{Object.entries(answers).map(([key, v]) => <div className="case-value" key={key}><span>{record.stepFormSnapshots?.[formId]?.fields?.find(f => f.key === key)?.label || key}</span><strong>{display(v)}</strong></div>)}</div>
          </div>)}
        </div>)}
      </Panel>}
      <Panel title={`Audit journey · ${record.runtime.events.length} events`}>
        <Timeline items={[...record.runtime.events].reverse().map(e => ({ color: 'gray', children: <div><strong>{e.message}</strong>
          <div className="helper-text">{niceDate(e.at)} · {db.users.find(u => u.id === e.actorId)?.name || 'System'}</div></div> }))}/>
      </Panel>
      <Panel title={`Attachments · ${record.attachments.length}`}>
        <></>
        {record.attachments.map(f => <div className="holiday-row" key={f.id}><span><b>{f.name}</b><div className="helper-text">{f.fieldKey} · {f.scanStatus} · {Math.ceil(f.size / 1024)} KB</div></span>
          <Button disabled={f.scanStatus !== 'Clean'} onClick={() => api.download(`/projects/${projectId}/cases/${caseId}/attachments/${f.id}`, f.name).catch(e => msg.error(e.message))}>Download</Button></div>)}
        <Space wrap><Input placeholder="Field key" value={attachmentField} onChange={e => setAttachmentField(e.target.value)} style={{ width: 160 }}/>
          <label className="ant-btn ant-btn-default" style={{ cursor: 'pointer' }}><UploadOutlined /> Upload document
            <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={uploadFile} disabled={busy}/>
          </label></Space>
      </Panel>
    </div><div className="stack">
      <Panel title={`Open tasks · ${openCount}`}>
        {openTasks.length ? openTasks.map(t => <button type="button" key={t.id} className={`case-task-card ${current?.id === t.id ? 'active' : ''}`} onClick={() => { setSelectedTask(t.id); setAction('Complete'); setToUserId(null); form.resetFields(); }}>
          <div><strong>{record.workflowSnapshot?.nodes?.find(n => n.id === t.nodeId)?.data?.label || t.stepName || 'Human task'}</strong>
            <Tag color={own(t, user?.id) ? 'green' : 'default'}>{own(t, user?.id) ? 'Assigned to you' : 'Read only'}</Tag></div>
          <div className="helper-text">{db.teams.find(x => x.id === t.teamId)?.name || 'Team'} · {db.users.find(x => x.id === t.assignedTo)?.name || 'Unassigned'} · {t.priority}</div>
        </button>) : <div className="muted">No open tasks. {status === 'Closed' ? 'Case completed.' : 'Check the case history.'}</div>}
      </Panel>
      {current && <Panel title="Process selected task">
        <CaseTatTimer compact title="Current task SLA" dueAt={current.dueAt} status={current.status} targetHours={node?.data?.slaHours || project?.slaHours}/>
        <div className="note-strip" style={{ marginBottom: 12 }}>{node?.data?.label || 'Human task'} · {team?.name || 'Team'}
          {current.assignedTo ? ` · Assigned to ${db.users.find(u => u.id === current.assignedTo)?.name || 'a team member'}` : ' · Unassigned'}</div>
        {!canWork && <div className="helper-text" style={{ marginBottom: 12 }}>{canForward ? "Forward to the next review role" : "Read-only"}</div>}
        <div className="case-task-form" style={{ marginBottom: 14 }}><SmallTitle>INFORMATION CARRIED FORWARD</SmallTitle>
          <div className="case-value-grid">{Object.entries(priorAnswers).map(([key, v]) => <div className="case-value" key={key}><span>{key}</span><strong>{display(v)}</strong></div>)}</div>
        </div>
        <Form layout="vertical" form={form} onFinish={complete} disabled={!canWork || busy}>
          {stepForms.map(f => <div key={f.id} className="case-task-form"><SmallTitle>{f.name}</SmallTitle>
            <CaseFields fields={f.fields} db={db} project={project} form={form} base={['steps', f.id]}/></div>)}
          <Form.Item name="comment" label="Comment (optional)"><Input.TextArea rows={2} maxLength={1000} placeholder="Add an action note for the audit trail"/></Form.Item>
          <Form.Item label="Action"><Select value={action} onChange={setAction} options={allowedActions.map(v => ({ value: v, label: v }))}/></Form.Item>
          <Button type="primary" htmlType="submit" loading={busy} icon={<CheckOutlined />}>Submit {action}</Button>
        </Form>
        <div className="section-divider"/>
        <SmallTitle>ROUTE / ASSIGN TASK</SmallTitle>
        <Select style={{ width: '100%', margin: '10px 0' }} placeholder="Select reviewer" showSearch optionFilterProp="label" value={toUserId} onChange={setToUserId} options={[...new Set(teamMembers)].filter(id => id !== current.assignedTo)
                .map(id => ({ value: id, label: db.users.find(u => u.id === id)?.name || id }))}/>
        <Button disabled={busy || !toUserId || (!canForward && !canAssign)} onClick={forward}>{canAssign ? 'Assign reviewer' : 'Forward to reviewer'}</Button>
      </Panel>}
      {status === 'Pending RCA' && <Panel title="Root cause analysis required">
        <Alert showIcon type="warning" style={{ marginBottom: 12 }} message="Workflow completed · RCA pending"/>
        <Form form={rcaForm} layout="vertical" onFinish={saveRca}>
          {rcaFields.some(f=>f.type==='select' && !f.options?.length && isRcaFieldVisible(f,rcaValues)) && <Alert type="warning" showIcon style={{marginBottom:12}} message="One or more RCA dropdowns have no saved options. Ask a project administrator to restore the matching RCA field options before closure."/>}
          <div className="two-column">{rcaFields.filter(f => isRcaFieldVisible(f, rcaValues)).map(field => <Form.Item key={field.key} name={['fields', field.key]} label={field.label} preserve={false} rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}>{field.type === 'number' ? <InputNumber style={{ width: '100%' }} min={0}/> : field.type === 'textarea' ? <Input.TextArea rows={3}/> : field.type === 'date' ? <Input type="date"/> : field.type === 'toggle' || field.type === 'select' ? <Select options={(field.type === 'toggle' ? ['Yes','No'] : field.options || []).map(v => ({value:v,label:v}))}/> : <Input/>}</Form.Item>)}</div>
          <Button type="primary" htmlType="submit" loading={busy}>Submit RCA and close</Button>
        </Form>
      </Panel>}
      <Panel title="Task history"><Table size="small" pagination={false} rowKey="id" dataSource={tasks} columns={[{ title: 'Step', render: (_, t) => record.workflowSnapshot?.nodes?.find(n => n.id === t.nodeId)?.data?.label || t.stepName || 'Task' },
            { title: 'Status', dataIndex: 'status', render: v => <Tag>{v}</Tag> }, { title: 'Priority', dataIndex: 'priority' }]}/></Panel>
    </div></div>
  </div>;
}
