import { checkRegexDefinition, REGEX_FIELD_TYPES, IDENTITY_REGEX_PRESETS } from '../utils/fieldValidation.js';
import { useState } from 'react';
import { App as AntApp, Button, Drawer, Form, Input, Select, Switch, Table, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { FIELD_TYPES } from '../data/seed';
import { availableLookups, slug } from '../utils/helpers';
import { usePlatform } from '../context/PlatformContext';
export function FieldLibrary({ project, projectId, open, onClose, onInsert }) {
    const { db, add, update, remove } = usePlatform();
    const msg = AntApp.useApp().message;
    const [editing, setEditing] = useState(null), [editMode, setEditMode] = useState(false), [form] = Form.useForm();
    const fields = (db.fieldLibrary || []).filter(item => item.projectId === projectId);
    const lookupOptions = availableLookups(db, project).map(l => ({ value: l.id, label: l.name }));
    const begin = (field = null) => { setEditing(field); form.resetFields(); form.setFieldsValue(field || { name: '', type: 'text', required: false, placeholder: '' }); setEditMode(true); };
    const save = async (v) => {
        const code = slug(v.name);
        if (fields.some(f => f.code === code && f.id !== editing?.id))
            return msg.error('A reusable field with this name already exists');
        if (v.type === 'select' && !v.lookupId)
            return msg.error('Select a lookup for dropdown fields');
        if (REGEX_FIELD_TYPES.has(v.type) && checkRegexDefinition(v.regex))
            return msg.error(checkRegexDefinition(v.regex));
        const data = { ...v, label: v.name, key: editing?.key || code.toLowerCase(), projectId };
        try {
            if (editing)
                await update('fieldLibrary', editing.id, data);
            else
                await add('fieldLibrary', data);
            setEditMode(false);
            msg.success('Reusable field saved');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    return <Drawer title="Field library" width={560} open={open} onClose={onClose} destroyOnClose extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => begin()}>New field</Button>}>
    <div className="note-strip" style={{ marginBottom: 17 }}>Reusable field definitions belong to this project. Inserting one creates a separate copy in your form, so editing the library won't silently alter published forms.</div>
    <Table rowKey="id" size="small" pagination={false} dataSource={fields} columns={[
            { title: 'Field', render: (_, r) => <><strong>{r.name}</strong><span className="table-subtitle">{r.code} · {r.type}</span></> },
            { title: 'Actions', render: (_, r) => <Space size={0}>{onInsert && <Button type="link" size="small" onClick={() => onInsert(r)}>Insert</Button>}<Button type="text" size="small" icon={<EditOutlined />} onClick={() => begin(r)}/><Popconfirm title="Delete library field?" onConfirm={() => remove('fieldLibrary', r.id)}><Button type="text" size="small" danger icon={<DeleteOutlined />}/></Popconfirm></Space> }
        ]}/>
    {!fields.length && <p className="muted">No reusable fields yet. Add one to use it across multiple forms.</p>}
    <Drawer title={editing ? 'Edit reusable field' : 'Create reusable field'} open={editMode} width={420} onClose={() => setEditMode(false)} extra={<Button type="primary" onClick={() => form.submit()}>Save field</Button>}>
      <Form layout="vertical" form={form} onFinish={save}>
        <Form.Item name="name" label="Field name" rules={[{ required: true }]}><Input placeholder="e.g. Customer number"/></Form.Item>
        <Form.Item shouldUpdate noStyle>{({ getFieldValue }) => <div style={{ marginBottom: 16 }}><label className="field-label">Auto-generated field code</label><Input readOnly value={slug(getFieldValue('name'))}/></div>}</Form.Item>
        <Form.Item name="type" label="Field type"><Select options={FIELD_TYPES}/></Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue('type') === 'select' && <Form.Item name="lookupId" label="Lookup list"><Select options={lookupOptions} showSearch optionFilterProp="label"/></Form.Item>}</Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue("type") === "attachment" && <><Form.Item name="maxFiles" label="Maximum files" initialValue={1}><Select options={[1, 2, 3, 5, 10].map(n => ({ value: n, label: String(n) }))}/></Form.Item><Form.Item name="maxFileMB" label="Max MB per file" initialValue={5}><Select options={[2, 5, 10, 20].map(n => ({ value: n, label: String(n) }))}/></Form.Item><Form.Item name="allowedFileTypes" label="Accepted extensions" initialValue=".pdf,.png,.jpg,.jpeg,.doc,.docx"><Input /></Form.Item></>}</Form.Item>
        <Form.Item name="placeholder" label="Help text / placeholder"><Input /></Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => REGEX_FIELD_TYPES.has(getFieldValue('type')) && <>
          <Form.Item label="Identity regex preset"><Select placeholder="Choose preset (optional)" options={IDENTITY_REGEX_PRESETS} onChange={value=>form.setFieldsValue({regex:value,regexMessage:IDENTITY_REGEX_PRESETS.find(p=>p.value===value)?.message || ''})}/></Form.Item><Form.Item name="regex" label="Regex pattern"><Input placeholder="^[0-9]{13}$"/></Form.Item>
          <Form.Item name="regexMessage" label="Validation error message"><Input placeholder="Enter a valid value"/></Form.Item>
        </>}</Form.Item>
        <Form.Item name="required" label="Required" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Drawer>
  </Drawer>;
}
