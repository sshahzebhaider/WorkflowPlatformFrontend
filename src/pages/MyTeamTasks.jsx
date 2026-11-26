import { useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, DatePicker, Form, Input, Modal, Drawer, Progress, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import './MyTeamTasks.css';
import { useNavigate } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { SyncOutlined, CalendarOutlined, TeamOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePlatform } from '../context/PlatformContext';
import { PageEmpty, PageHeading, Panel, SmallTitle } from '../components/UI';
import { managedTeams, teamMemberIds, teamPeople, onLeave, taskForUser } from '../utils/workforce';
import { canSeeCase } from '../utils/caseFlow';
import { canForceIntimate, forceIntimation } from '../utils/escalations.js';
import { intimationMessage, sendIntimation } from '../services/intimation.js';
import { teamWorkload, canRebalanceTask } from '../utils/teamWorkload.js';
function stageLabel(stage) { return ({ unit_head: 'Unit Head review', team_lead: 'Team Lead assignment', officer: 'Officer action', unassigned: 'Awaiting assignment' })[stage] || 'Team task'; }
function person(db, id) { return db.users.find(u => u.id === id)?.name || 'Not assigned'; }
export function MyTeamPage() {
    const { projectId } = useParams(), nav = useNavigate();
    const { db, user, canSetup, syncProjectDirectory, update, refresh, api, apiMode, forceIntimation: forceIntimationLive } = usePlatform(), msg = AntApp.useApp().message;
    const teams = managedTeams(db, projectId, user?.id), [selectedTeam, setSelectedTeam] = useState(null), [intimationRow, setIntimationRow] = useState(null), [intimationBusy, setIntimationBusy] = useState(false), [intimationForm] = Form.useForm();
    const team = teams.find(t => t.id === selectedTeam) || teams[0];
    const project = db.projects.find(p => p.id === projectId), term = project?.terms?.case || 'Case';
    const selfIsHead = teamPeople(team, 'unit_head', db).includes(user?.id), selfIsLead = teamPeople(team, 'team_lead', db).includes(user?.id);
    const admin = canSetup(projectId);
    const people = teamMemberIds(team, db).map(id => db.users.find(u => u.id === id)).filter(Boolean);
    const tasks = (db.cases || []).filter(c => c.projectId === projectId).flatMap(c => (c.runtime?.tasks || []).filter(t => t.teamId === team?.id && t.status === 'Open').map(t => ({ id: t.id, case: c, task: t })));
    const [workloadDrawer, setWorkloadDrawer] = useState(false), [workloadSource, setWorkloadSource] = useState(null), [selectedWorkIds, setSelectedWorkIds] = useState([]), [rebalanceTarget, setRebalanceTarget] = useState(null), [rebalanceNote, setRebalanceNote] = useState(''), [rebalanceBusy, setRebalanceBusy] = useState(false);
    const workload = teamWorkload(people, tasks);
    const openBalance = (userId = null) => { setWorkloadSource(userId); setSelectedWorkIds([]); setRebalanceTarget(null); setRebalanceNote(''); setWorkloadDrawer(true); };
    const selectableTasks = tasks.filter(row => workloadSource === null ? true : String(row.task.assignedTo) === String(workloadSource));
    const targetPerson = people.find(u => String(u.id) === String(rebalanceTarget));
    const selectedTasks = selectableTasks.filter(row => selectedWorkIds.some(id => String(id) === String(row.task.id)));
    const eligibleSelected = selectedTasks.length > 0 && selectedTasks.every(row => canRebalanceTask(row, workloadSource, targetPerson, db, team?.id, projectId)) && !onLeave(db, rebalanceTarget, projectId);
    const routeWork = async () => {
        if (!team || !eligibleSelected)
            return msg.error('Select open tasks and an available teammate with the same workflow role.');
        if (selectedWorkIds.length > 50)
            return msg.error('Reassign at most 50 tasks at once.');
        setRebalanceBusy(true);
        try {
            if (apiMode) {
                await api.post(`/projects/${projectId}/teams/${team.id}/tasks/rebalance`, {
                    taskIdsJson: selectedWorkIds, toUserId: rebalanceTarget, reason: rebalanceNote.trim() || null
                });
                await refresh(projectId);
            }
            else {
                for (const record of new Map(selectedTasks.map(t => [t.case.id, t.case])).values()) {
                    const copy = structuredClone(record);
                    for (const task of copy.runtime?.tasks || []) {
                        if (!selectedWorkIds.some(id => String(id) === String(task.id)))
                            continue;
                        const from = task.assignedTo;
                        task.assignedTo = rebalanceTarget;
                        task.delegatedFor = null;
                        task.assignedAt = new Date().toISOString();
                        if (String(task.routingStage || '').toLowerCase() === 'unassigned')
                            task.routingStage = 'officer';
                        copy.runtime.events.push({ id: `rebalance-${task.id}-${Date.now()}`, kind: 'TaskRebalanced', actorId: user.id,
                            at: new Date().toISOString(), message: `Task reassigned from ${person(db, from)} to ${person(db, rebalanceTarget)}`, reason: rebalanceNote });
                    }
                    await update('cases', record.id, copy);
                }
            }
            setWorkloadDrawer(false);
            setSelectedWorkIds([]);
            msg.success(`${selectedTasks.length} task(s) reassigned. Original due dates retained.`);
        }
        catch (error) {
            msg.error(error.message);
        }
        finally {
            setRebalanceBusy(false);
        }
    };
    const sync = () => { if (apiMode)
        return msg.warning('Directory sync is not connected. The backend currently returns 501.'); const n = syncProjectDirectory(projectId); msg.info(n ? `${n} resigned account(s) removed from this project's active teams. Their history remains visible.` : 'No resigned users found in the demo directory.'); };
    const openIntimation = row => { setIntimationRow(row); intimationForm.resetFields(); intimationForm.setFieldsValue({ priority: 'High', reason: '' }); };
    const submitIntimation = async (values) => {
        if (!intimationRow)
            return;
        setIntimationBusy(true);
        try {
            const { case: record, task } = intimationRow;
            if (!canForceIntimate(db, projectId, user?.id, task))
                throw Error('You can only intimate an active subordinate task.');
            const recipient = db.users.find(u => u.id === task.assignedTo);
            const message = intimationMessage(record, task, recipient, values.priority, values.reason);
            if (apiMode) {
                await forceIntimationLive(task.id, values.priority, values.reason);
                setIntimationRow(null);
                msg.success('Priority raised in SQL Server; notification queued for preview.');
            }
            else {
                const result = await sendIntimation({ ...message, operationId: `${record.id}:${task.id}:${Date.now()}` });
                update('cases', record.id, forceIntimation(record, task.id, user.id, values.priority, values.reason, result, db));
                setIntimationRow(null);
                if (result.mode === 'preview')
                    msg.info('Priority updated. Email preview generated; no email was sent.');
                else
                    msg.success('Priority updated. Email accepted by provider; delivery is not yet confirmed.');
            }
        }
        catch (error) {
            msg.error(error.message);
        }
        finally {
            setIntimationBusy(false);
        }
    };
    return <>
 <PageHeading title="My Team" description="Review your team’s workload and route work to available members. Employees manage their own leave under My Tasks." actions={<Space>{admin && <Button onClick={() => nav(`/project/${projectId}/teams`)}>Team setup</Button>}<Tooltip title="Demo sync: uses directory statuses entered in Platform users. Does not connect to AD."><Button icon={<SyncOutlined />} disabled={apiMode} onClick={sync}>{apiMode ? 'AD sync unavailable' : 'AD sync (demo)'}</Button></Tooltip></Space>}/>
 <></>
 {!teams.length ? <Panel><PageEmpty title="No managed teams" description="You need to be assigned as a Team Lead, Unit Head or Project Admin to manage teams. Team members can still use My Tasks."/></Panel> : <div className="case-type-layout my-team-layout">
 <aside className="case-type-sidebar"><SmallTitle>MY TEAMS · {teams.length}</SmallTitle><div className="side-list">{teams.map(t => <button type="button" key={t.id} className={`side-list-item ${t.id === team.id ? 'selected' : ''}`} style={{ width: '100%', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setSelectedTeam(t.id)}><strong>{t.name}</strong><small>{teamPeople(t, 'unit_head', db).includes(user?.id) ? 'Unit Head' : teamPeople(t, 'team_lead', db).includes(user?.id) ? 'Team Lead' : 'Project Admin'} · {teamMemberIds(t, db).length} people</small></button>)}</div></aside>
 <main className="case-type-main stack">
 <div className="case-type-toolbar"><div><h2>{team.name}</h2><div className="helper-text">{team.description || 'Team members, backups and work'} · {tasks.length} pending</div></div><Space>{selfIsHead && <Tag color="red">Unit Head</Tag>}{selfIsLead && <Tag color="blue">Team Lead</Tag>}</Space></div>
 <Panel title={`Team workload · ${tasks.length} open tasks`} padding={false}>
 <div className="toolbar" style={{ padding: '12px 16px', marginBottom: 0 }}><span className="helper-text">Percentage = member's share of assigned open tasks (not capacity utilization).</span>
 <Button type="primary" onClick={() => openBalance(null)}>Balance workload</Button></div>
 <div className="team-member-list" aria-label="Team members and workload">
  {workload.length === 0 && <PageEmpty title="No team members" description="Add members to this team to see their workload."/>}
  {workload.map(u => {
                const isHead = teamPeople(team, 'unit_head', db).includes(u.id);
                const isLead = teamPeople(team, 'team_lead', db).includes(u.id);
                const plan = (db.teamAbsences || []).find(p => p.projectId === projectId && p.teamId === team.id && p.userId === u.id);
                const availability = u.directoryStatus === 'resigned' ? 'Resigned' : onLeave(db, u.id, projectId) ? 'On leave' : 'Available';
                return <button key={u.id} type="button" className="team-member-row" aria-label={`View ${u.name}'s tasks and workload`} onClick={() => openBalance(u.id)}>
     <span className="team-member-identity"><strong>{u.name}</strong><small>{u.username}</small></span>
     <span className="team-member-role">{isHead ? 'Unit Head' : isLead ? 'Team Lead' : 'Officer'}</span>
     <span className="team-member-count"><strong>{u.openTasks}</strong><small>Open tasks</small></span>
     <span className="team-member-progress"><Progress percent={u.workloadPct} size="small" format={pct => `${pct}%`}/></span>
     <span className="team-member-availability"><Tag color={availability === 'Resigned' ? 'red' : availability === 'On leave' ? 'gold' : 'green'}>{availability}</Tag>{plan && <small>Backup: {person(db, plan.backupUserId)}</small>}</span>
     <span className="team-member-view">View tasks ›</span>
   </button>;
            })}
 </div></Panel>
 <Panel title={`Pending ${String(term).toLowerCase()} tasks · ${tasks.length}`} padding={false}>
   {tasks.length ? <div className="team-pending-list">{tasks.map(row => <div key={row.id} className="team-pending-row">
    <button type="button" className="team-pending-open" onClick={() => nav(`/project/${projectId}/cases/${row.case.id}`)}>
      <strong>{row.case.reference || row.case.id}</strong>
      <span>{row.case.workflowSnapshot?.nodes?.find(n => n.id === row.task.nodeId)?.data?.label || 'Review'}</span>
      <small>{person(db, row.task.assignedTo)} · {stageLabel(row.task.routingStage)}</small>
    </button>
    <div className="team-pending-actions">
      <Tag color={row.task.priority === 'Urgent' ? 'red' : row.task.priority === 'High' ? 'orange' : 'default'}>{row.task.priority || 'Normal'}</Tag>
      {canForceIntimate(db, projectId, user?.id, row.task) && <Button type="link" danger onClick={() => openIntimation(row)}>Force intimation</Button>}
      <Button type="link" onClick={() => nav(`/project/${projectId}/cases/${row.case.id}`)}>Open case</Button>
    </div>
   </div>)}</div> : <PageEmpty title="No pending team tasks" description="New requests will appear here when the workflow forwards them to this team."/>}
 </Panel>
 </main></div>}
 <Drawer title={`Balance workload · ${team?.name || 'Team'}`} width="min(720px, 100vw)" open={workloadDrawer} onClose={() => { setWorkloadDrawer(false); setSelectedWorkIds([]); }} destroyOnHidden>
   <></>
   {workloadSource != null && <div className="team-drawer-member-summary">
     <strong>{person(db, workloadSource)}</strong>
     <span>{workload.find(w => String(w.id) === String(workloadSource))?.openTasks || 0} open tasks · {workload.find(w => String(w.id) === String(workloadSource))?.workloadPct || 0}% of assigned work</span>
     <small>Leave is managed by the employee from My Tasks, not by a team manager.</small>
   </div>}
   <div className="stack" style={{ gap: 12 }}>
    <div><label className="field-label">Tasks currently assigned to</label>
      <Select style={{ width: '100%' }} value={workloadSource} allowClear placeholder="All members / unassigned" onChange={id => { setWorkloadSource(id ?? null); setSelectedWorkIds([]); setRebalanceTarget(null); }} options={people.map(u => ({ value: u.id, label: `${u.name} (${tasks.filter(r => String(r.task.assignedTo) === String(u.id)).length} open)` }))}/></div>
    <Table size="small" rowKey={row => String(row.task.id)} dataSource={selectableTasks} pagination={{ pageSize: 8 }} rowSelection={{ selectedRowKeys: selectedWorkIds.map(String), onChange: keys => setSelectedWorkIds(keys) }} columns={[{ title: 'Case', render: (_, row) => row.case.reference || row.case.id },
            { title: 'Step', render: (_, row) => row.task.stepName || 'Review' },
            { title: 'Current assignee', render: (_, row) => person(db, row.task.assignedTo) },
            { title: 'Stage', render: (_, row) => stageLabel(row.task.routingStage) },
            { title: 'Due', render: (_, row) => row.task.dueAt ? new Date(row.task.dueAt).toLocaleString() : '—' }]}/>
    <div><label className="field-label">Reassign to *</label>
      <Select showSearch optionFilterProp="label" style={{ width: '100%' }} value={rebalanceTarget} onChange={setRebalanceTarget} placeholder="Choose an available teammate" options={people.filter(u => u.directoryStatus !== 'resigned' && u.active !== false && !onLeave(db, u.id, projectId))
            .map(u => ({ value: u.id, label: `${u.name} · ${workload.find(w => String(w.id) === String(u.id))?.openTasks || 0} open` }))}/>
      {selectedTasks.length > 0 && rebalanceTarget && !eligibleSelected && <div className="helper-text" style={{ color: '#b91c1c', marginTop: 5 }}>The selected teammate must hold the same workflow role as every selected task, and cannot already be assigned those tasks.</div>}
    </div>
    <div><label className="field-label">Reason (optional)</label>
      <Input.TextArea maxLength={500} rows={2} value={rebalanceNote} onChange={e => setRebalanceNote(e.target.value)} placeholder="e.g. Balance the pending review queue"/></div>
    <Space><Button type="primary" loading={rebalanceBusy} disabled={!eligibleSelected || selectedTasks.length > 50} onClick={routeWork}>Reassign {selectedTasks.length || ''} selected task(s)</Button>
      <Button onClick={() => setWorkloadDrawer(false)}>Cancel</Button></Space>
   </div>
 </Drawer>
 <Modal title={`Force intimation · ${intimationRow?.case?.reference || ''}`} open={!!intimationRow} onCancel={() => setIntimationRow(null)} onOk={() => intimationForm.submit()} okText="Set priority & notify" confirmLoading={intimationBusy} destroyOnClose>
  <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="Manager intimation" description="Notify the assigned subordinate and raise task priority. In development, an email preview is generated by default and no email is sent. The action is added to the case audit."/>
  <div className="helper-text" style={{ marginBottom: 10 }}>Assigned to: {person(db, intimationRow?.task?.assignedTo)}</div>
  <Form form={intimationForm} layout="vertical" onFinish={submitIntimation}><Form.Item name="priority" label="Priority" rules={[{ required: true }]}><Select options={[{ value: 'High', label: 'High' }, { value: 'Urgent', label: 'Urgent' }]}/></Form.Item><Form.Item name="reason" label="Reason for intimation" rules={[{ required: true, whitespace: true, message: 'Enter a reason' }]}><Input.TextArea rows={3} placeholder="The task has passed its agreed response time..."/></Form.Item></Form>
 </Modal>
 </>;
}
export function MyTasksPage() {
    const { projectId } = useParams(), nav = useNavigate(), { db, user, saveAbsence } = usePlatform(), msg = AntApp.useApp().message;
    const [myLeaveOpen, setMyLeaveOpen] = useState(false), [myLeaveTeamId, setMyLeaveTeamId] = useState(null), [myLeaveForm] = Form.useForm();
    const myTeams = db.teams.filter(t => t.projectId === projectId && teamMemberIds(t, db).includes(user?.id));
    const selectedLeaveTeam = myTeams.find(t => t.id === myLeaveTeamId) || myTeams[0];
    const leaveBackupUsers = teamMemberIds(selectedLeaveTeam, db).filter(id => id !== user?.id && db.users.find(u => u.id === id)?.directoryStatus !== 'resigned' && !onLeave(db, id, projectId));
    const saveMyLeave = async (values) => { try {
        const [from, to] = values.dates || [];
        await saveAbsence({ projectId, teamId: selectedLeaveTeam.id, userId: user.id, backupUserId: values.backupUserId, from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') });
        setMyLeaveOpen(false);
        msg.success('Leave backup saved. Existing tasks were checked for reassignment.');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const project = db.projects.find(p => p.id === projectId);
    const all = db.cases.filter(c => c.projectId === projectId).flatMap(c => (c.runtime?.tasks || []).map(t => ({ id: t.id, case: c, task: t })));
    const pending = all.filter(x => taskForUser(x.task, user?.id, db, projectId));
    const approved = all.filter(x => x.task.status === 'Completed' && x.task.actorId === user?.id && x.task.action === 'Approve');
    const completed = all.filter(x => x.task.status === 'Completed' && x.task.actorId === user?.id && x.task.action !== 'Approve');
    const cols = [{ title: project?.terms?.case || 'Case', render: (_, row) => <a onClick={() => nav(`/project/${projectId}/cases/${row.case.id}`)}><b>{row.case.reference}</b><div className="helper-text">{row.case.title}</div></a> },
        { title: 'Step', render: (_, row) => row.case.workflowSnapshot?.nodes?.find(n => n.id === row.task.nodeId)?.data?.label || 'Review' },
        { title: 'Team', render: (_, row) => db.teams.find(t => t.id === row.task.teamId)?.name || '—' },
        { title: 'Stage / decision', render: (_, row) => row.task.status === 'Open' ? <Space direction="vertical" size={3}><span>{stageLabel(row.task.routingStage)}</span>{['High', 'Urgent'].includes(row.task.priority) && <Tag color={row.task.priority === 'Urgent' ? 'red' : 'orange'}>{row.task.priority} priority</Tag>}</Space> : <Tag color="green">{row.task.action || 'Completed'}</Tag> },
        { title: 'Date', render: (_, row) => new Date(row.task.completedAt || row.task.createdAt).toLocaleDateString() },
        { title: '', render: (_, row) => <Button type="link" onClick={() => nav(`/project/${projectId}/cases/${row.case.id}`)}>Open</Button> }];
    const data = (records, label) => records.length ? <Table rowKey="id" dataSource={label === 'pending tasks' ? [...records].sort((a, b) => (b.task.priority === 'Urgent' ? 2 : b.task.priority === 'High' ? 1 : 0) - (a.task.priority === 'Urgent' ? 2 : a.task.priority === 'High' ? 1 : 0)) : [...records].reverse()} columns={cols} pagination={{ pageSize: 10 }} scroll={{ x: 730 }}/> : <PageEmpty title={`No ${label.toLowerCase()}`} description="Tasks will appear when the workflow reaches a step assigned to you."/>;
    return <><PageHeading title="My Tasks" description="Your pending assignments, approved decisions and completed actions across this project." actions={myTeams.length > 0 && <Button icon={<CalendarOutlined />} onClick={() => { setMyLeaveTeamId(myTeams[0]?.id); myLeaveForm.resetFields(); myLeaveForm.setFieldsValue({ dates: [dayjs(), dayjs().add(3, 'day')] }); setMyLeaveOpen(true); }}>My leave & backup</Button>}/><div className="my-tasks-summary" aria-label="Task totals"><div className="my-tasks-summary-card"><div className="my-tasks-summary-icon pending"><ClockCircleOutlined /></div><div className="my-tasks-summary-text"><span>Pending tasks</span><strong>{pending.length}</strong><small>Waiting for your action</small></div></div><div className="my-tasks-summary-card"><div className="my-tasks-summary-icon approved"><CheckCircleOutlined /></div><div className="my-tasks-summary-text"><span>Approved tasks</span><strong>{approved.length}</strong><small>Your approved decisions</small></div></div><div className="my-tasks-summary-card"><div className="my-tasks-summary-icon completed"><TeamOutlined /></div><div className="my-tasks-summary-text"><span>Other completed</span><strong>{completed.length}</strong><small>Resolved and returned work</small></div></div></div><Panel><Tabs items={[{ key: 'pending', label: `Pending (${pending.length})`, children: data(pending, 'pending tasks') }, { key: 'approved', label: `Approved (${approved.length})`, children: data(approved, 'approved tasks') }, { key: 'completed', label: `Other completed (${completed.length})`, children: data(completed, 'completed tasks') }]}/></Panel><Modal title="My leave & backup" open={myLeaveOpen} onCancel={() => setMyLeaveOpen(false)} onOk={() => myLeaveForm.submit()} okText="Save leave" destroyOnClose><Form form={myLeaveForm} layout="vertical" onFinish={saveMyLeave}><Form.Item label="Team" required><Select style={{ width: '100%' }} value={selectedLeaveTeam?.id} onChange={value => { setMyLeaveTeamId(value); myLeaveForm.setFieldValue('backupUserId', undefined); }} options={myTeams.map(t => ({ value: t.id, label: t.name }))}/></Form.Item><Form.Item name="dates" label="Leave period (inclusive)" rules={[{ required: true }]}><DatePicker.RangePicker style={{ width: '100%' }}/></Form.Item><Form.Item name="backupUserId" label="Backup person" rules={[{ required: true }]}><Select placeholder="Select available teammate" showSearch optionFilterProp="label" options={leaveBackupUsers.map(id => ({ value: id, label: person(db, id) }))}/></Form.Item><></></Form></Modal></>;
}
