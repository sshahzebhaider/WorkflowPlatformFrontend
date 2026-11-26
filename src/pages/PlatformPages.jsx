import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, Calendar, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tabs } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { PlusOutlined, CalendarOutlined, DatabaseOutlined, AppstoreOutlined, TeamOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ArrowRightOutlined, FileTextOutlined, UnorderedListOutlined, ExportOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePlatform } from '../context/PlatformContext';
import { AvatarMark, PageHeading, Panel, PageEmpty, Pill, StatCard, SmallTitle, InfoRow, ScopeTag } from '../components/UI';
import { uid, niceDate, slug } from '../utils/helpers';
import { AutoCode } from '../components/AutoCode';
import { ProjectReleaseControl } from '../components/ProjectReleaseControl';
import { addHolidayRange, holidayBounds, holidayDayCount, holidaysOn, removeHolidayDate } from '../utils/calendarHolidays';
import { parseBulkLookupItems } from '../utils/bulkLookup';
import { get } from '../services/liveApi';
import { value as readApiField } from '../services/apiModels';
function useToast() { return AntApp.useApp().message; }
export function PlatformHome() {
    const { db } = usePlatform(), navigate = useNavigate();
    const cards = [{ label: 'Projects', value: db.projects.length, icon: <AppstoreOutlined />, to: '/platform/projects' }, { label: 'Business calendars', value: db.calendars.length, icon: <CalendarOutlined />, to: '/platform/calendars' }, { label: 'Data connections', value: db.dataSources.length, icon: <DatabaseOutlined />, to: '/platform/data-sources' }, { label: 'Lookup lists', value: db.lookups.filter(l => l.scope === 'global').length, icon: <UnorderedListOutlined />, to: '/platform/lookups' }];
    return <><PageHeading title="Platform overview" description="Configure shared resources first, then onboard independently managed projects." actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/platform/projects/new')}>Onboard a project</Button>}/>
  <div className="stats-grid">{cards.map(c => <div key={c.label} onClick={() => navigate(c.to)} style={{ cursor: 'pointer' }}><StatCard label={c.label} value={c.value} icon={c.icon} detail="Platform-wide configuration"/></div>)}</div>
  <div className="two-column"><Panel title="Getting started"><div className="stack">{[
            ['1', 'Set up business calendars', 'Create working-day schedules, hours and holidays.', '/platform/calendars'],
            ['2', 'Register data connections', 'Define reusable integration operations for workflows.', '/platform/data-sources'],
            ['3', 'Manage global lookups', 'Create dropdown lists shared across projects.', '/platform/lookups'],
            ['4', 'Onboard your first project', 'Assign administrators and attach shared resources.', '/platform/projects/new']
        ].map(([n, title, desc, to]) => <div key={n} style={{ display: 'flex', gap: 13, alignItems: 'center' }}><span className="wizard-number">{n}</span><div style={{ flex: 1 }}><strong>{title}</strong><div className="helper-text">{desc}</div></div><Button type="link" onClick={() => navigate(to)}>Open <ArrowRightOutlined /></Button></div>)}</div></Panel><Panel title="Recent projects" extra={<Button type="link" onClick={() => navigate('/platform/projects')}>View all</Button>}>{db.projects.length ? db.projects.slice(-5).reverse().map(p => <div key={p.id} className="info-row"><span><strong>{p.name}</strong><div className="helper-text">{p.code}</div></span><Button size="small" onClick={() => navigate(`/project/${p.id}`)}>Open</Button></div>) : <PageEmpty title="No projects onboarded" description="A blank workspace is ready for your first project." actionText="Onboard project" onAction={() => navigate('/platform/projects/new')}/>}</Panel></div>
 </>;
}
export function ProjectsPage() {
    const { db, selectProject } = usePlatform(), navigate = useNavigate();
    const rows = db.projects.map(p => ({ ...p, teams: db.teams.filter(x => x.projectId === p.id).length, forms: db.forms.filter(x => x.projectId === p.id).length, workflows: db.workflows.filter(x => x.projectId === p.id).length }));
    return <><PageHeading title="Projects" description="Every project is configuration, not code. Each has its own teams, forms, workflows and terminology." actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/platform/projects/new')}>Onboard a project</Button>}/><Panel padding={false}>{rows.length ? <Table rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 850 }} columns={[
                { title: 'Project', dataIndex: 'name', render: (_, r) => <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}><AvatarMark name={r.code} color={r.color}/><div><span className="table-title">{r.name}</span><span className="table-subtitle">{r.code}</span></div></div> },
                { title: 'Status', dataIndex: 'status', render: x => <Pill status={x}>{x}</Pill> },
                { title: 'Forms', dataIndex: 'forms' }, { title: 'Workflows', dataIndex: 'workflows' }, { title: 'Teams', dataIndex: 'teams' },
                { title: 'Created', dataIndex: 'createdAt', render: niceDate },
                { title: 'Status history', render: (_, r) => <ProjectReleaseControl project={r} compact/> },
                { title: '', render: (_, r) => <Button type="link" onClick={() => { selectProject(r.id); navigate(`/project/${r.id}`); }}>Open project</Button> }
            ]}/> : <PageEmpty title="No active projects" description="Create your first project with the seven-step onboarding wizard." actionText="Onboard a project" onAction={() => navigate('/platform/projects/new')}/>}</Panel></>;
}
const weekOptions = [{ label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }];
export function CalendarPage() {
    const { db, add, update } = usePlatform(), msg = useToast();
    const [selected, setSelected] = useState(null), [modal, setModal] = useState(false), [editing, setEditing] = useState(null);
    const [holidayModal, setHolidayModal] = useState(false), [holidayDay, setHolidayDay] = useState(null);
    const [form] = Form.useForm(), [holidayForm] = Form.useForm(), [calendarMonth, setCalendarMonth] = useState(dayjs());
    const calendar = db.calendars.find(x => x.id === selected) || db.calendars[0];
    const holidays = calendar?.holidays || [];
    const open = (item = null) => { setEditing(item); form.resetFields(); form.setFieldsValue(item || { name: '', timezone: 'Asia/Karachi', workingDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }); setModal(true); };
    const submit = async (v) => { try {
        if (editing)
            await update('calendars', editing.id, v);
        else {
            const c = await add('calendars', { ...v, holidays: [] });
            setSelected(c.id);
        }
        setModal(false);
        msg.success(editing ? 'Calendar updated' : 'Calendar created');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const openHoliday = (date = dayjs()) => { holidayForm.resetFields(); holidayForm.setFieldsValue({ name: '', range: [date, date] }); setHolidayDay(null); setHolidayModal(true); };
    const saveHoliday = async (v) => {
        if (!calendar)
            return;
        try {
            const [start, end] = v.range || [];
            const next = addHolidayRange(holidays, { id: uid(), name: v.name.trim(), startDate: start?.format('YYYY-MM-DD'), endDate: end?.format('YYYY-MM-DD') });
            await update('calendars', calendar.id, { holidays: next });
            setHolidayModal(false);
            holidayForm.resetFields();
            setCalendarMonth(start);
            msg.success(`Holiday saved for ${start.isSame(end, 'day') ? '1 day' : `${end.diff(start, 'day') + 1} days`}`);
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const deleteHoliday = async (id) => { try {
        await update('calendars', calendar.id, { holidays: holidays.filter(h => h.id !== id) });
        setHolidayDay(null);
        msg.success('Holiday removed from calendar');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const deleteDate = async (id, date) => { try {
        await update('calendars', calendar.id, { holidays: removeHolidayDate(holidays, id, date, uid) });
        setHolidayDay(null);
        msg.success('Selected holiday date removed');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const selectDay = (date, info) => {
        setCalendarMonth(date);
        if (info?.source !== 'date' || !calendar)
            return;
        if (holidaysOn(holidays, date.format('YYYY-MM-DD')).length) {
            setHolidayDay(date.format('YYYY-MM-DD'));
            setHolidayModal(false);
        }
        else
            openHoliday(date);
    };
    const selectedHolidays = holidayDay ? holidaysOn(holidays, holidayDay) : [];
    const niceRange = h => { const { start, end } = holidayBounds(h); return start === end ? niceDate(start) : `${niceDate(start)} – ${niceDate(end)}`; };
    return <>
  <PageHeading title="Business calendars" description="Working days, hours and holidays used by projects for SLA and due date calculations." actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>New calendar</Button>}/>
  <div className="two-column">
   <Panel>
    <div className="side-list-head"><SmallTitle>CALENDARS</SmallTitle><Button size="small" type="link" onClick={() => open()}>+ New</Button></div>
    <div className="side-list">{db.calendars.map(c => <div key={c.id} className={`side-list-item ${calendar?.id === c.id ? 'selected' : ''}`} onClick={() => setSelected(c.id)}><strong>{c.name}</strong><small>{c.code || slug(c.name)} · {c.timezone} · {db.projects.filter(p => p.calendarId === c.id).length} projects</small></div>)}</div>
    {!db.calendars.length && <p className="muted">No calendars yet. Create one before onboarding a project.</p>}
   </Panel>
   <Panel title={calendar?.name || 'Calendar details'} extra={calendar && <Space><Button onClick={() => open(calendar)} icon={<EditOutlined />}>Edit</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openHoliday()}>Add holiday / range</Button></Space>}>
    {calendar ? <>
     <div className="three-column" style={{ marginBottom: 18 }}>
      <div><SmallTitle>Timezone</SmallTitle><strong>{calendar.timezone}</strong></div>
      <div><SmallTitle>Working hours</SmallTitle><strong>{calendar.startTime} – {calendar.endTime}</strong></div>
      <div><SmallTitle>Holiday days</SmallTitle><strong>{holidayDayCount(holidays)} days</strong></div>
     </div>
     <SmallTitle>Working days</SmallTitle>
     <div className="calendar-weekdays" style={{ marginBottom: 20 }}>{weekOptions.map(d => <span key={d.value} className="meta-tag" style={(calendar.workingDays || []).includes(d.value) ? { background: '#dcfce7', color: '#15803d' } : {}}>{d.label}</span>)}</div>
     <div className="small-title">HOLIDAYS <span className="helper-text">{holidays.length} events · {holidayDayCount(holidays)} dates</span></div>
     {holidays.length ? holidays.map(h => <div className="holiday-row" key={h.id}><span><strong>{h.name}</strong><div className="helper-text">{niceRange(h)}</div></span><Popconfirm title="Remove this entire holiday?" onConfirm={() => deleteHoliday(h.id)}><Button size="small" danger aria-label={`Remove ${h.name}`} icon={<DeleteOutlined />}/></Popconfirm></div>) : <p className="muted">No holidays for this calendar.</p>}
     <div className="small-title" style={{ marginTop: 22 }}>MONTHLY CALENDAR · CLICK ANY HOLIDAY TO EDIT / REMOVE</div>
     <div className="business-calendar"><Calendar fullscreen={false} value={calendarMonth} onPanelChange={setCalendarMonth} onSelect={selectDay} cellRender={(date, info) => {
                if (info.type !== 'date')
                    return null;
                const entries = holidaysOn(holidays, date.format('YYYY-MM-DD'));
                const off = !(calendar.workingDays || []).includes(date.day());
                return <div className={`business-calendar-cell ${entries.length ? 'holiday' : ''} ${off ? 'nonworking' : ''}`} title={entries.map(h => h.name).join(', ')}>{entries.length ? <span className="business-calendar-marker">{entries[0].name}</span> : off ? <span className="business-calendar-off">Off</span> : null}</div>;
            }}/></div>
     <div className="helper-text" style={{ marginTop: 8 }}>Red dates: holidays (click to remove one date or the entire range). Gray: non-working days. Click an empty date to create a holiday range.</div>
     <div className="note-strip" style={{ marginTop: 18 }}>Changes to a shared business calendar can affect SLA configuration in all linked projects.</div>
    </> : <PageEmpty title="Select or create a calendar" description="Platform calendars become available during project onboarding."/>}
   </Panel>
  </div>
  <Modal title={editing ? 'Edit business calendar' : 'Create business calendar'} open={modal} onCancel={() => setModal(false)} onOk={() => form.submit()} okText={editing ? 'Save changes' : 'Create calendar'} destroyOnClose>
   <Form form={form} layout="vertical" onFinish={submit} style={{ marginTop: 15 }}><Form.Item name="name" label="Calendar name" rules={[{ required: true }]}><Input placeholder="e.g. Standard business week"/></Form.Item><AutoCode /><Form.Item name="timezone" label="Timezone" rules={[{ required: true }]}><Select options={['Asia/Karachi', 'UTC', 'Asia/Dubai', 'Europe/London', 'America/New_York'].map(v => ({ value: v, label: v }))}/></Form.Item><Form.Item name="workingDays" label="Working days" rules={[{ required: true }]}><Checkbox.Group options={weekOptions}/></Form.Item><div className="three-column" style={{ gridTemplateColumns: '1fr 1fr' }}><Form.Item name="startTime" label="Starts at" rules={[{ required: true }]}><Input placeholder="09:00"/></Form.Item><Form.Item name="endTime" label="Ends at" rules={[{ required: true }]}><Input placeholder="17:00"/></Form.Item></div></Form>
  </Modal>
  <Modal title="Add holiday or date range" open={holidayModal} onCancel={() => setHolidayModal(false)} onOk={() => holidayForm.submit()} okText="Save holiday" destroyOnClose>
   <Form form={holidayForm} layout="vertical" onFinish={saveHoliday}><Form.Item name="name" label="Holiday name" rules={[{ required: true, whitespace: true }]}><Input placeholder="e.g. Eid-ul-Fitr"/></Form.Item><Form.Item name="range" label="Holiday dates (inclusive)" rules={[{ required: true, message: 'Select start and end dates' }]}><DatePicker.RangePicker style={{ width: '100%' }} allowClear={false}/></Form.Item><div className="note-strip">Select one day or a date range such as 3–4 Eid holidays. All dates will be marked on the calendar.</div></Form>
  </Modal>
  <Modal title={`Holiday on ${holidayDay ? niceDate(holidayDay) : ''}`} open={Boolean(holidayDay)} onCancel={() => setHolidayDay(null)} footer={<Button onClick={() => setHolidayDay(null)}>Done</Button>} destroyOnClose>
   {selectedHolidays.map(h => <div className="holiday-row" key={h.id}><span><strong>{h.name}</strong><div className="helper-text">{niceRange(h)}</div></span><Space wrap><Popconfirm title="Remove only this date?" onConfirm={() => deleteDate(h.id, holidayDay)}><Button size="small">Remove date</Button></Popconfirm><Popconfirm title="Remove the entire holiday range?" onConfirm={() => deleteHoliday(h.id)}><Button size="small" danger icon={<DeleteOutlined />}>Remove range</Button></Popconfirm></Space></div>)}
   <div className="helper-text" style={{ marginTop: 12 }}>Removing one day from a range keeps the other dates. Removing a range deletes all its dates.</div>
  </Modal>
 </>;
}
export { DataSourcesPage } from './DataSourcesSetup';
export function LookupPage({ mode }) {
    const { db, add, update, project, can } = usePlatform(), msg = useToast();
    const { projectId } = useParams();
    const [picked, setPicked] = useState(null), [filter, setFilter] = useState(''), [listModal, setListModal] = useState(false), [listEdit, setListEdit] = useState(null), [itemModal, setItemModal] = useState(false), [itemEdit, setItemEdit] = useState(null), [bulkModal, setBulkModal] = useState(false), [bulkText, setBulkText] = useState(''), [bulkParent, setBulkParent] = useState(null), [form] = Form.useForm(), [itemForm] = Form.useForm();
    const lists = db.lookups.filter(l => mode === 'platform' || l.projectId === projectId || (l.scope === 'global' && project?.lookupIds?.includes(l.id)));
    const shown = lists.filter(l => `${l.name} ${l.code}`.toLowerCase().includes(filter.toLowerCase()));
    const current = lists.find(l => l.id === picked) || lists[0];
    const canEdit = mode === 'platform' || can('lookups.manage', projectId);
    const currentEditable = Boolean(current && canEdit && (mode === 'platform' || current.scope !== 'global'));
    const parentList = current?.parentListId ? db.lookups.find(l => l.id === current.parentListId) : null;
    const parentOptions = (target) => {
        const scope = target?.scope || (mode === 'platform' ? 'global' : 'project'), owner = target?.projectId || (mode === 'platform' ? null : projectId);
        return db.lookups.filter(candidate => {
            if (candidate.active === false || candidate.id === target?.id)
                return false;
            if (scope === 'global' && candidate.scope !== 'global')
                return false;
            if (scope === 'project' && !(candidate.projectId === owner || candidate.scope === 'global' && db.projects.find(p => p.id === owner)?.lookupIds?.includes(candidate.id)))
                return false;
            // Prevent A -> B -> A, including longer circular parent chains.
            const seen = new Set();
            let next = candidate;
            while (next?.parentListId && !seen.has(next.id)) {
                seen.add(next.id);
                if (next.parentListId === target?.id)
                    return false;
                next = db.lookups.find(l => l.id === next.parentListId);
            }
            return true;
        }).map(l => ({ value: l.id, label: `${l.name} (${l.code})` }));
    };
    const openList = (item = null) => { setListEdit(item); form.resetFields(); form.setFieldsValue(item || { scope: mode === 'platform' ? 'global' : 'project', name: '', code: '', parentListId: null }); setListModal(true); };
    const saveList = async (v) => {
        const scope = listEdit?.scope || (mode === 'platform' ? 'global' : 'project'), owner = listEdit?.projectId || (scope === 'project' ? projectId : null), code = slug(v.name);
        if (db.lookups.some(l => l.code === code && l.id !== listEdit?.id && l.scope === scope && (scope === 'global' || l.projectId === owner)))
            return msg.error('A lookup with this code already exists in this scope');
        if (v.parentListId && !parentOptions(listEdit || { scope, projectId: owner }).some(x => x.value === v.parentListId))
            return msg.error('Invalid or circular parent list');
        try {
            if (listEdit) {
                const changed = listEdit.parentListId !== (v.parentListId || null);
                await update('lookups', listEdit.id, { name: v.name, code, parentListId: v.parentListId || null, items: changed ? (listEdit.items || []).map(i => ({ ...i, parentItemId: null })) : listEdit.items });
                if (changed)
                    msg.info('Old item parent links cleared; choose the new parent items');
                else
                    msg.success('List updated');
            }
            else {
                const row = await add('lookups', { name: v.name, code, scope, projectId: owner, parentListId: v.parentListId || null, items: [], active: true });
                setPicked(row.id);
                msg.success('Lookup created');
            }
            setListModal(false);
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const openItem = (item = null) => { setItemEdit(item); itemForm.resetFields(); itemForm.setFieldsValue(item || { label: '', code: '', active: true, sortOrder: (current?.items?.length || 0) + 1, parentItemId: null }); setItemModal(true); };
    const openBulk = () => { setBulkText(''); setBulkParent(null); setBulkModal(true); };
    const bulkPreview = parseBulkLookupItems(bulkText, current?.items || [], parentList, bulkParent);
    const saveBulk = async () => {
        if (!currentEditable || !current)
            return;
        if (bulkPreview.errors.length)
            return msg.error(bulkPreview.errors[0]);
        const items = bulkPreview.items.map(item => ({ ...item, id: uid() }));
        if (!items.length)
            return msg.error('Enter at least one lookup item');
        try {
            await update('lookups', current.id, { items: [...(current.items || []), ...items] });
            setBulkModal(false);
            setBulkText('');
            msg.success(`${items.length} lookup items added`);
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const totalCount = current?.items?.length || 0;
    const activeCount = (current?.items || []).filter(item => item.active !== false).length;
    const saveItem = async (v) => {
        const code = slug(v.label), items = current.items || [];
        if (items.some(i => i.code === code && i.id !== itemEdit?.id))
            return msg.error('Item code already exists');
        if (v.parentItemId && !parentList?.items?.some(i => i.id === v.parentItemId))
            return msg.error('Selected parent item no longer exists');
        const row = { ...v, code, parentItemId: v.parentItemId || null };
        const newItems = itemEdit ? items.map(i => i.id === itemEdit.id ? { ...i, ...row } : i) : [...items, { ...row, id: uid() }];
        try {
            await update('lookups', current.id, { items: newItems });
            setItemModal(false);
            msg.success('Lookup item saved');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    return <><PageHeading title={mode === 'platform' ? 'Lookup manager' : 'Lists'} description="Create reusable lists and optionally link child lists to parent lists for cascading dropdowns." actions={canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openList()}>New list</Button>}/>
   {mode === 'project' && canEdit && <Panel title="Shared global lookup lists"><div className="helper-text" style={{ marginBottom: 9 }}>Select the platform lists available to this project, including parent lists used by project-specific child lists.</div><Select mode="multiple" style={{ width: '100%' }} value={project?.lookupIds || []} placeholder="Select global lookup lists" options={db.lookups.filter(l => l.scope === 'global' && l.active !== false).map(l => ({ value: l.id, label: l.name }))} onChange={async (ids) => { const required = db.lookups.filter(l => l.projectId === projectId && l.parentListId).map(l => l.parentListId); if (required.some(id => db.lookups.some(l => l.id === id && l.scope === 'global') && !ids.includes(id)))
        return msg.error('A project child lookup still depends on one of the removed parent lists'); try {
        await update('projects', projectId, { lookupIds: ids });
        msg.success('Shared lists updated');
    }
    catch (error) {
        msg.error(error.message);
    } }}/></Panel>}
   <div className="two-column"><Panel><div className="side-list-head"><SmallTitle>LISTS</SmallTitle>{canEdit && <Button size="small" type="link" onClick={() => openList()}>+ New list</Button>}</div><Input prefix={<SearchOutlined />} placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 8 }}/><div className="side-list">{shown.map(l => <div key={l.id} className={`side-list-item ${current?.id === l.id ? 'selected' : ''}`} onClick={() => setPicked(l.id)}><strong>{l.name} {l.scope === 'global' && <Tag color="blue" style={{ marginLeft: 5, fontSize: 10 }}>Global</Tag>}</strong><small>{(l.items || []).length} items · {l.code}{l.parentListId ? ' · Child list' : ''}</small></div>)}</div>{!shown.length && <span className="helper-text">No lists match your filter.</span>}</Panel>
   <div><div className="toolbar" style={{ marginTop: 7 }}><div><h2 style={{ fontSize: 18, margin: 0 }}>{current?.name || 'Select a list'}</h2>{current && <span className="helper-text">{current.code} · {current.scope === 'global' ? 'Global' : 'Project list'}{parentList ? ` · Parent: ${parentList.name}` : ''}</span>}</div><Space>{currentEditable && <Button icon={<EditOutlined />} onClick={() => openList(current)}>Edit list</Button>}{currentEditable && <Button onClick={openBulk}>Add multiple</Button>}{currentEditable && <Button type="primary" icon={<PlusOutlined />} onClick={() => openItem()}>Add item</Button>}</Space></div>
   {current && <div className="lookup-counts" style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}><Tag style={{ padding: '5px 10px', fontSize: 12 }}>Total items: <strong>{totalCount}</strong></Tag><Tag color="green" style={{ padding: '5px 10px', fontSize: 12 }}>Active: {activeCount}</Tag><Tag color="default" style={{ padding: '5px 10px', fontSize: 12 }}>Inactive: {totalCount - activeCount}</Tag></div>}
   {parentList && <div className="note-strip" style={{ marginBottom: 12 }}>This list depends on <b>{parentList.name}</b>. When adding a child item, choose the matching parent item. Forms can then filter available values automatically.</div>}
   <Panel padding={false}>{current ? <Table size="middle" rowKey="id" dataSource={[...(current.items || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))} pagination={false} scroll={{ x: 650 }} locale={{ emptyText: 'No items yet. Add the first one.' }} columns={[
                { title: 'Item', dataIndex: 'label', render: v => <b>{v}</b> }, { title: 'Code', dataIndex: 'code' },
                ...(parentList ? [{ title: `Parent · ${parentList.name}`, render: (_, r) => parentList.items?.find(i => i.id === r.parentItemId)?.label || '—' }] : []),
                { title: 'Sort', dataIndex: 'sortOrder' },
                { title: 'Active', render: (_, r) => <Switch size="small" disabled={!currentEditable} checked={r.active !== false} onChange={checked => update('lookups', current.id, { items: current.items.map(i => i.id === r.id ? { ...i, active: checked } : i) })}/> },
                { title: '', render: (_, r) => currentEditable && <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openItem(r)}>Edit</Button> }
            ]}/> : <PageEmpty title="No lists yet" description="Create a global or project-specific lookup list."/>}</Panel><p className="context-note">Inactive items stay in history but are hidden from new dropdown selections.</p></div></div>
   <Modal title={listEdit ? 'Edit lookup list' : 'Create lookup list'} open={listModal} onCancel={() => setListModal(false)} onOk={() => form.submit()} destroyOnClose>
     <Form form={form} layout="vertical" onFinish={saveList}><Form.Item label="List name" name="name" rules={[{ required: true }]}><Input placeholder="e.g. Subcategory"/></Form.Item><AutoCode label="List code"/><Form.Item label="Scope" name="scope"><Select disabled options={[{ value: 'global', label: 'Global (all projects)' }, { value: 'project', label: 'Current project' }]}/></Form.Item><Form.Item label="Parent lookup list (optional)" name="parentListId" extra="Child items may be linked to an item in this parent list."><Select allowClear showSearch optionFilterProp="label" placeholder="No parent list · standalone" options={parentOptions(listEdit || { scope: mode === 'platform' ? 'global' : 'project', projectId: mode === 'platform' ? null : projectId })}/></Form.Item></Form>
   </Modal>
   <Modal title={itemEdit ? 'Edit lookup item' : 'Add lookup item'} open={itemModal} onCancel={() => setItemModal(false)} onOk={() => itemForm.submit()} destroyOnClose>
     <Form form={itemForm} layout="vertical" onFinish={saveItem}><Form.Item name="label" label="Item label" rules={[{ required: true }]}><Input /></Form.Item><AutoCode label="Item code" nameKey="label"/>
     {parentList && <Form.Item name="parentItemId" label={`Parent item from ${parentList.name}`} extra="The item will appear only when this parent option is selected in a dependent form dropdown."><Select allowClear showSearch optionFilterProp="label" placeholder="Select parent item" options={(parentList.items || []).filter(i => i.active !== false).map(i => ({ value: i.id, label: `${i.label} (${i.code})` }))}/></Form.Item>}
     <Form.Item name="sortOrder" label="Sort order"><InputNumber style={{ width: '100%' }} min={1}/></Form.Item><Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item></Form>
   </Modal>
   <Modal title={`Add multiple items · ${current?.name || ''}`} open={bulkModal} onCancel={() => setBulkModal(false)} onOk={saveBulk} okText={`Add ${bulkPreview.items.length || ''} items`} okButtonProps={{ disabled: Boolean(bulkPreview.errors.length) || !bulkPreview.items.length }} destroyOnClose width={620}>
    <p className="helper-text">Add one item per line. Each code is generated from its label automatically. You can add up to 200 items per batch.</p>
    {parentList && <><label className="field-label">Default parent item ({parentList.name})</label><Select allowClear showSearch optionFilterProp="label" style={{ width: '100%', marginBottom: 12 }} placeholder="Choose a parent for the batch" value={bulkParent} onChange={setBulkParent} options={(parentList.items || []).filter(i => i.active !== false).map(i => ({ value: i.id, label: `${i.label} (${i.code})` }))}/><div className="helper-text" style={{ marginBottom: 10 }}>For different parent items in the same batch, write <b>Child label | PARENT_CODE</b> on each line.</div></>}
    <Input.TextArea rows={8} value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={parentList ? 'ATM enquiry | ATM\nMobile banking | DIGITAL' : 'High\nMedium\nLow'}/>
    <div className="helper-text" style={{ marginTop: 10 }}>{bulkText.trim().split(/\r?\n/).filter(x => x.trim()).length} lines · {bulkPreview.items.length} ready to add</div>
    {!!bulkPreview.errors.length && <div className="note-strip" style={{ borderLeft: '3px solid #dc2626', marginTop: 8 }}>{bulkPreview.errors.slice(0, 5).map((error, index) => <div key={index} style={{ color: '#b91c1c' }}>{error}</div>)}{bulkPreview.errors.length > 5 && <span>And {bulkPreview.errors.length - 5} more errors</span>}</div>}
   </Modal>
 </>;
}
export function UsersPage() {
    const { db, add, update, apiMode, api, refresh, isPlatformAdmin } = usePlatform();
    const msg = useToast(), [modal, setModal] = useState(false), [saving, setSaving] = useState(false), [syncing, setSyncing] = useState(false), [granting, setGranting] = useState(null), [form] = Form.useForm();
    const submit = async (v) => {
        if (db.users.some(u => u.username?.toLowerCase() === v.username?.trim().toLowerCase()))
            return msg.error('Username exists');
        setSaving(true);
        try {
            await add('users', { ...v, username: v.username.trim(), platformAdmin: Boolean(v.platformAdmin) });
            setModal(false);
            form.resetFields();
            msg.success(v.platformAdmin ? 'User created and Platform Admin role assigned' : 'Directory user created');
        }
        catch (error) {
            msg.error(error.message);
        }
        finally {
            setSaving(false);
        }
    };
    const grantPlatformAdmin = async (target) => {
        if (target.platformAdmin)
            return;
        setGranting(target.id);
        try {
            if (apiMode) {
                // Actor identity comes from the authenticated API session, never the request body.
                await api.post('/roles/assign', { userId: target.id, roleCode: 'platform_admin', projectId: null, teamId: null });
                await refresh();
            }
            else {
                await update('users', target.id, { platformAdmin: true });
            }
            msg.success(`Platform Admin role assigned to ${target.name}`);
        }
        catch (error) {
            msg.error(error.message);
        }
        finally {
            setGranting(null);
        }
    };
    const syncDirectory = async () => {
        if (!apiMode)
            return msg.info('Local directory reconciliation is available when connected to SQL Server.');
        setSyncing(true);
        try {
            const result = await api.post('/directory/sync', {});
            await refresh();
            msg.success(`Directory checked: ${result.resignedUsers || 0} resigned users; ${result.rolesRevoked || 0} roles and ${result.membershipsRevoked || 0} memberships revoked.`);
        }
        catch (error) {
            msg.error(error.message);
        }
        finally {
            setSyncing(false);
        }
    };
    return <><PageHeading title="Platform users" description="Provision directory users and manage audited platform administrator assignments." actions={<Space><Button loading={syncing} disabled={!isPlatformAdmin} onClick={syncDirectory}>Sync local directory</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>New user</Button></Space>}/>
 <Panel padding={false}><Table rowKey="id" dataSource={db.users} pagination={false} scroll={{ x: 850 }} columns={[
            { title: 'Name', dataIndex: 'name', render: (_, r) => <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><AvatarMark name={r.name}/><b>{r.name}</b></div> },
            { title: 'Username', dataIndex: 'username' }, { title: 'Email', dataIndex: 'email' },
            { title: 'Directory status', render: (_, r) => <Select size="small" style={{ minWidth: 116 }} value={r.directoryStatus || 'active'} disabled={!isPlatformAdmin} onChange={async (v) => {
                        try {
                            if (v === 'resigned' && !window.confirm(`Resign ${r.name}? This revokes roles, removes team memberships, and requeues open tasks.`))
                                return;
                            await update('users', r.id, { directoryStatus: v });
                            msg.success('Directory status updated; access and pending assignments reconciled.');
                        }
                        catch (error) {
                            msg.error(error.message);
                        }
                    }} options={[{ value: 'active', label: 'Active' }, { value: 'onleave', label: 'On leave' }, { value: 'disabled', label: 'Disabled' }, { value: 'resigned', label: 'Resigned' }]}/> },
            { title: 'Platform role', render: (_, r) => r.platformAdmin ? <Pill status="live">Platform admin</Pill> : <Pill>Directory user</Pill> },
            { title: 'Grant role', render: (_, r) => r.platformAdmin ? '—' : <Popconfirm title="Grant Platform Admin?" description={`Give ${r.name} platform-wide administrative access?`} onConfirm={() => grantPlatformAdmin(r)} okText="Grant" okButtonProps={{ danger: true }}><Button size="small" loading={granting === r.id} disabled={!isPlatformAdmin || r.active === false || r.directoryStatus === 'resigned'}>Grant Platform Admin</Button></Popconfirm> },
            { title: 'Project admin of', render: (_, r) => db.projects.filter(p => p.adminIds?.includes(r.id)).map(p => p.code).join(', ') || '—' }
        ]}/></Panel>
 <Modal title={apiMode ? 'Create directory user' : 'Add preview user'} open={modal} onCancel={() => !saving && setModal(false)} onOk={() => form.submit()} okButtonProps={{ loading: saving }} destroyOnClose><Form form={form} layout="vertical" onFinish={submit}><Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item><Form.Item label="Username" name="username" rules={[{ required: true }]}><Input /></Form.Item><Form.Item label="Email" name="email"><Input /></Form.Item><Form.Item label="Platform admin" name="platformAdmin" valuePropName="checked" extra="Requires an authenticated Platform Admin; user creation and role assignment are saved atomically and audited by SQL Server."><Switch disabled={!isPlatformAdmin}/></Form.Item></Form></Modal>
 <div className="note-strip" style={{ marginTop: 15 }}>{apiMode ? 'Local directory reconciliation removes active rights, team memberships and open assignments for resigned users across every project. Entra synchronization can be enabled later as a separate integration.' : 'Demo users are browser-local placeholders. Production sync needs the backend.'}</div>
 </>;
}
export function HistoryPage() {
    const { db, apiMode } = usePlatform();
    const { projectId } = useParams();
    const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
    const [remote, setRemote] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(false), [error, setError] = useState('');
    useEffect(() => { setPagination(p => ({ ...p, current: 1 })); }, [projectId]);
    useEffect(() => {
        if (!apiMode)
            return;
        const controller = new AbortController();
        let active = true;
        setLoading(true);
        setError('');
        const endpoint = projectId ? `/projects/${encodeURIComponent(projectId)}/audit/paged` : '/audit/paged';
        get(`${endpoint}?page=${pagination.current}&pageSize=${pagination.pageSize}`, { signal: controller.signal })
            .then(data => {
            if (!active)
                return;
            setRemote({
                rows: (data?.rows || []).map(e => ({ id: readApiField(e, 'auditId'), projectId: readApiField(e, 'projectId'),
                    actor: readApiField(e, 'actorName') || 'System', action: readApiField(e, 'actionCode'),
                    entity: readApiField(e, 'entityType'), date: readApiField(e, 'occurredAt') })),
                total: Number(data?.total || 0)
            });
        })
            .catch(err => { if (active)
            setError(err.status === 404 ? 'Audit pagination endpoint not found. Deploy the updated PlatformEndpoints.cs backend.' : err.message); })
            .finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [apiMode, projectId, pagination.current, pagination.pageSize]);
    const localRows = (projectId ? db.audits.filter(a => String(a.projectId) === String(projectId)) : db.audits)
        .map(a => ({ ...a, actor: db.users.find(u => u.id === a.actorId)?.name || 'System' }));
    const rows = apiMode ? remote.rows : localRows;
    const total = apiMode ? remote.total : localRows.length;
    const changePage = (page, size) => setPagination(previous => ({ current: size !== previous.pageSize ? 1 : page, pageSize: size }));
    return <><PageHeading title="Change history" description="Review project and platform configuration activity."/>
   {error && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Could not load audit history" description={error}/>}
   <Panel padding={false}><Table rowKey="id" dataSource={rows} loading={loading} pagination={{ current: pagination.current, pageSize: pagination.pageSize, total,
            showSizeChanger: true, pageSizeOptions: ['10', '15', '25', '50', '100'],
            showTotal: (count, range) => `${range[0]}–${range[1]} of ${count} records`,
            onChange: changePage }} columns={[{ title: 'Action', dataIndex: 'action' }, { title: 'Entity', dataIndex: 'entity' },
            { title: 'Actor', dataIndex: 'actor' }, { title: 'Date', dataIndex: 'date', render: d => d ? new Date(d).toLocaleString() : '—' }]}/></Panel>
   {!apiMode && <p className="page-footer-note">Browser-local logs are not tamper resistant and cannot replace server-side production auditing.</p>}
 </>;
}
