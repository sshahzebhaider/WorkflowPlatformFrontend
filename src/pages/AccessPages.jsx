import { useState } from 'react';
import { App as AntApp, Button, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, SafetyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { usePlatform } from '../context/PlatformContext';
import { PageHeading, Panel, SmallTitle } from '../components/UI';
import { PERMISSION_GROUPS, memberships, roleLabels } from '../auth/permissions';
/** Platform administrator chooses which permissions custom roles grant. */
export function RolesPage() {
    const { db, add, update, remove, apiMode } = usePlatform();
    const message = AntApp.useApp().message;
    const [editing, setEditing] = useState(null), [open, setOpen] = useState(false), [form] = Form.useForm();
    const begin = (role) => { setEditing(role); form.resetFields(); form.setFieldsValue(role || { name: '', description: '', scope: 'project', permissions: ['project.view'] }); setOpen(true); };
    const save = async (v) => {
        if (editing?.system) v = { ...v, name: editing.name, scope: editing.scope };
        if (db.roles.some(r => r.name.toLowerCase() === v.name.trim().toLowerCase() && r.id !== editing?.id))
            return message.error('A role with this name already exists');
        try {
            if (editing)
                await update('roles', editing.id, { ...v });
            else
                await add('roles', { ...v, name: v.name.trim(), system: false });
            setOpen(false);
            message.success('Role saved');
        }
        catch (error) {
            message.error(error.message);
        }
    };
    return <><PageHeading title="Roles and rights" description="Maintain reusable role definitions, project permissions and team-level responsibilities." actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => begin(null)}>New role</Button>}/>
    <Panel padding={false}><Table rowKey="id" dataSource={db.roles} pagination={false} scroll={{ x: 820 }} columns={[
            { title: 'Role', render: (_, r) => <><b>{r.name}</b><div className="table-subtitle">{r.description}</div></> },
            { title: 'Scope', dataIndex: 'scope', render: s => <Tag>{s === 'platform' ? 'Platform' : s === 'team' ? 'Team / unit' : 'Project'}</Tag> },
            { title: 'Rights', render: (_, r) => `${(r.permissions || []).length} permissions` },
            { title: 'Type', render: (_, r) => r.system ? 'Built-in' : 'Custom' },
            { title: '', render: (_, r) => <Space><Button type="link" disabled={r.scope === 'platform'} onClick={() => begin(r)}>Edit rights</Button>{!r.system && <Popconfirm title="Delete this role?" description="Unassign this role before deleting it." onConfirm={() => { if (db.roleAssignments.some(a => a.roleId === r.id))
                    return message.error('Role is still assigned to users'); remove('roles', r.id); }}><Button type="link" danger disabled={apiMode} title={apiMode ? "Role deletion is not available from the backend" : undefined} icon={<DeleteOutlined />}/></Popconfirm>}</Space> }
        ]}/></Panel>
    <div className="note-strip" style={{ marginTop: 16 }}>Platform Admin retains full access. Built-in role permissions are editable; system role names and scopes are protected. Existing administrator-only operations still require the administrator role.</div>
    <Modal title={editing ? `Edit role · ${editing.name}` : 'Create role'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} width={780} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={save}>
        <div className="three-column" style={{ gridTemplateColumns: '1fr 1fr' }}><Form.Item name="name" label="Role name" rules={[{ required: true }]}><Input disabled={Boolean(editing?.system)} placeholder="e.g. Quality Reviewer"/></Form.Item><Form.Item name="scope" label="Assignment scope"><Select disabled={Boolean(editing?.system)} options={[{ value: 'project', label: 'Project-wide' }, { value: 'team', label: 'Team or unit' }]}/></Form.Item></div>
        <Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item>
        <Form.Item label="Permissions" name="permissions" rules={[{ validator: (_, v) => v?.length ? Promise.resolve() : Promise.reject(new Error('Select at least one permission')) }]}>
          <Checkbox.Group style={{ width: '100%' }}><div className="permissions-grid">{PERMISSION_GROUPS.map(group => <div key={group.label} className="permission-group"><SmallTitle>{group.label}</SmallTitle>{group.permissions.map(([code, label]) => <Checkbox key={code} value={code} style={{ display: 'flex', margin: '9px 0' }}>{label}</Checkbox>)}</div>)}</div></Checkbox.Group>
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
/** Assigns custom or built-in roles for one project; team-scoped grants may cover multiple teams. */
export function ProjectAccessPage() {
    const { projectId } = useParams();
    const { db, add, remove, can, apiMode } = usePlatform();
    const msg = AntApp.useApp().message;
    const [open, setOpen] = useState(false), [form] = Form.useForm();
    const teams = db.teams.filter(t => t.projectId === projectId);
    const assignments = db.roleAssignments.filter(a => a.projectId === projectId);
    const allowed = can('roles.assign', projectId);
    const submit = async (v) => {
        const role = db.roles.find(r => r.id === v.roleId);
        if (role?.scope === 'team' && !v.teamIds?.length)
            return msg.error('Choose at least one team for team-scoped rights');
        if (assignments.some(a => a.userId === v.userId && a.roleId === v.roleId && JSON.stringify([...(a.teamIds || [])].sort()) === JSON.stringify([...(v.teamIds || [])].sort())))
            return msg.warning('This assignment already exists');
        try {
            await add('roleAssignments', { projectId, userId: v.userId, roleId: v.roleId, teamIds: role?.scope === 'team' ? v.teamIds : [] });
            setOpen(false);
            msg.success('Project role assigned');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    return <><PageHeading title="Project access" description="Assign roles for this project. Team-scoped permissions may cover one or several teams." actions={allowed && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Assign role</Button>}/>
    <Panel padding={false}><Table rowKey="id" dataSource={assignments} pagination={false} columns={[
            { title: 'User', render: (_, a) => db.users.find(u => u.id === a.userId)?.name || 'Unknown' },
            { title: 'Role', render: (_, a) => db.roles.find(r => r.id === a.roleId)?.name || a.roleId },
            { title: 'Applies to', render: (_, a) => a.teamIds?.length ? a.teamIds.map(id => teams.find(t => t.id === id)?.name).filter(Boolean).join(', ') : 'Whole project' },
            { title: '', render: (_, a) => allowed && <Popconfirm title="Remove assignment?" onConfirm={() => remove('roleAssignments', a.id)}><Button size="small" danger type="link" disabled={apiMode} title={apiMode ? "Assignment removal is not yet available from the backend" : undefined}>Remove</Button></Popconfirm> }
        ]} locale={{ emptyText: 'No explicit grants yet. Project administrators and team memberships already receive their built-in roles.' }}/></Panel>
    <Panel title="Effective access from project teams"><Table rowKey="id" size="small" pagination={false} dataSource={db.users.filter(u => memberships(db, projectId, u.id).length > 0)} columns={[
            { title: 'User', dataIndex: 'name' }, { title: 'Username', dataIndex: 'username' }, { title: 'Effective roles', render: (_, u) => roleLabels(db, projectId, u.id).map(label => <Tag key={label}>{label}</Tag>) },
            { title: 'Teams', render: (_, u) => teams.filter(t => t.members?.includes(u.id) || t.leadId === u.id || t.leadIds?.includes(u.id) || t.unitHeadIds?.includes(u.id) || assignments.some(a => a.userId === u.id && a.teamIds?.includes(t.id))).map(t => t.name).join(', ') || '—' }
        ]}/></Panel>
    <Modal title="Assign project role" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose><Form form={form} layout="vertical" onFinish={submit} initialValues={{ scope: 'project' }}>
      <Form.Item name="userId" label="Directory user" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={db.users.filter(u => !u.platformAdmin).map(u => ({ value: u.id, label: `${u.name} · ${u.username}` }))}/></Form.Item>
      <Form.Item name="roleId" label="Role" rules={[{ required: true }]}><Select options={db.roles.filter(r => r.scope !== 'platform').map(r => ({ value: r.id, label: r.name }))}/></Form.Item>
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.roleId !== cur.roleId}>{({ getFieldValue }) => {
            const role = db.roles.find(r => r.id === getFieldValue('roleId'));
            return role?.scope === 'team' && <Form.Item name="teamIds" label="Teams covered by this role" rules={[{ required: true, message: 'Select one or more teams' }]}><Select mode="multiple" options={teams.map(t => ({ value: t.id, label: t.name }))} placeholder="Select one or more teams"/></Form.Item>;
        }}</Form.Item>
    </Form></Modal>
    <div className="note-strip" style={{ marginTop: 14 }}>Team members, team leads and unit heads automatically gain role access when assigned in Teams and people. Explicit grants above are additional.</div>
  </>;
}
