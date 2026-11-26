import { checkRegexDefinition, REGEX_FIELD_TYPES, IDENTITY_REGEX_PRESETS } from '../utils/fieldValidation.js';
import { useMemo, useState } from 'react';
import { App as AntApp, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { FIELD_TYPES } from '../data/seed';
import { usePlatform } from '../context/PlatformContext';
import { availableLookups, slug } from '../utils/helpers';
import { SmallTitle } from './UI';
/** Library is part of the designer layout, not a drawer or a generic field-type palette. */
export function FieldLibrarySidebar({ project, projectId, onInsert, palette = false }) {
    const { db, add, update, remove } = usePlatform();
    const msg = AntApp.useApp().message;
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [form] = Form.useForm();
    const library = useMemo(() => (db.fieldLibrary || []).filter(field => field.projectId === projectId), [db.fieldLibrary, projectId]);
    const shown = library.filter(field => `${field.name || ''} ${field.code || ''} ${field.type || ''}`.toLowerCase().includes(search.toLowerCase()));
    const lookups = availableLookups(db, project).map(list => ({ value: list.id, label: list.name }));
    const edit = (item = null) => {
        setEditing(item);
        form.resetFields();
        form.setFieldsValue(item || { name: '', type: 'text', required: false, placeholder: '' });
        setEditorOpen(true);
    };
    const save = async (values) => {
        const name = String(values.name || '').trim();
        const code = slug(name);
        if (!code)
            return msg.error('Enter a field name.');
        if (library.some(field => field.code === code && field.id !== editing?.id))
            return msg.error('This field is already in the library.');
        if (values.type === 'select' && !values.lookupId)
            return msg.error('Choose a lookup list for this dropdown.');
        if (REGEX_FIELD_TYPES.has(values.type) && checkRegexDefinition(values.regex))
            return msg.error(checkRegexDefinition(values.regex));
        const next = { ...values, name, label: name, code, key: editing?.key || code.toLowerCase(), projectId, lookupId: values.type === 'select' ? values.lookupId : null };
        try {
            if (editing)
                await update('fieldLibrary', editing.id, next);
            else
                await add('fieldLibrary', next);
            setSearch('');
            setEditorOpen(false);
            msg.success('Field saved in library');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    return <aside className="form-palette field-library-sidebar">
    <Input value={search} onChange={event => setSearch(event.target.value)} prefix={<SearchOutlined />} placeholder="Search reusable fields" aria-label="Search field library" style={{ marginBottom: 10 }}/>
    <Button block type="default" icon={<PlusOutlined />} onClick={() => edit()} style={{ marginBottom: 14 }}>Add new field</Button>
    {palette && <><SmallTitle>BASIC</SmallTitle>{FIELD_TYPES.map(type => <button type="button" key={type.value} className="field-palette-btn" draggable onDragStart={e=>{e.dataTransfer.setData('application/x-workflow-field',JSON.stringify({label:type.label,type:type.value}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>onInsert({label:type.label,type:type.value})}><span className="reference-drag-handle">⠿</span>{type.label}</button>)}<SmallTitle>IDENTITY</SmallTitle>{[{label:'CNIC',type:'text',regex:'^[0-9]{13}$'},{label:'Mobile',type:'text',regex:IDENTITY_REGEX_PRESETS[2].value,regexMessage:IDENTITY_REGEX_PRESETS[2].message},{label:'Account number',type:'text',regex:IDENTITY_REGEX_PRESETS[3].value,regexMessage:IDENTITY_REGEX_PRESETS[3].message},{label:'IBAN',type:'text',regex:IDENTITY_REGEX_PRESETS[4].value,regexMessage:IDENTITY_REGEX_PRESETS[4].message},{label:'Card number',type:'text',regex:IDENTITY_REGEX_PRESETS[5].value,regexMessage:IDENTITY_REGEX_PRESETS[5].message},{label:'Email',type:'email',regex:IDENTITY_REGEX_PRESETS[6].value,regexMessage:IDENTITY_REGEX_PRESETS[6].message}].map(item=><button type="button" key={item.label} className="field-palette-btn" draggable onDragStart={e=>{e.dataTransfer.setData('application/x-workflow-field',JSON.stringify(item));e.dataTransfer.effectAllowed='copy';}} onClick={()=>onInsert(item)}><span className="reference-drag-handle">⠿</span>{item.label}</button>)}</>}
    <SmallTitle>FIELD LIBRARY</SmallTitle>
    {shown.map(item => <div key={item.id} className="library-sidebar-row">
      <button type="button" className="library-sidebar-insert" draggable onDragStart={e=>{e.dataTransfer.setData('application/x-workflow-field',JSON.stringify(item));e.dataTransfer.effectAllowed='copy';}} onClick={() => onInsert(item)} title={`Insert ${item.name} into the form`}>
        <strong>{item.name}</strong>
        <span className="helper-text">{item.type} · {item.code}</span>
      </button>
      <Space size={0}>
        <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Edit ${item.name} in library`} onClick={() => edit(item)}/>
        <Popconfirm title="Delete reusable field?" description="Forms that already use it will not change." onConfirm={() => remove('fieldLibrary', item.id)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${item.name} from library`}/>
        </Popconfirm>
      </Space>
    </div>)}
    {!shown.length && <div className="note-strip">{library.length ? 'No matching library fields.' : 'No library fields yet. Add one here, then insert it into the form.'}</div>}
    <p className="helper-text" style={{ marginTop: 15 }}>Select a library field to insert a copy. Edit its label directly on the form and open Properties for its settings.</p>

    <Modal title={editing ? 'Edit library field' : 'New library field'} open={editorOpen} onCancel={() => setEditorOpen(false)} onOk={() => form.submit()} okText="Save field" destroyOnClose>
      <Form layout="vertical" form={form} onFinish={save}>
        <Form.Item name="name" label="Library field name" rules={[{ required: true, whitespace: true }]}><Input placeholder="Customer number"/></Form.Item>
        <Form.Item shouldUpdate noStyle>{({ getFieldValue }) => <div style={{ marginBottom: 16 }}><label className="field-label">Auto-generated key</label><Input value={editing?.key || slug(getFieldValue('name')).toLowerCase()} readOnly/></div>}</Form.Item>
        <Form.Item name="type" label="Field type" rules={[{ required: true }]}><Select options={FIELD_TYPES}/></Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue('type') === 'select' ? <Form.Item name="lookupId" label="Lookup list" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={lookups}/></Form.Item> : null}</Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue("type") === "attachment" && <><Form.Item name="maxFiles" label="Maximum files" initialValue={1}><Select options={[1, 2, 3, 5, 10].map(n => ({ value: n, label: String(n) }))}/></Form.Item><Form.Item name="maxFileMB" label="Max MB per file" initialValue={5}><Select options={[2, 5, 10, 20].map(n => ({ value: n, label: String(n) }))}/></Form.Item><Form.Item name="allowedFileTypes" label="Accepted extensions" initialValue=".pdf,.png,.jpg,.jpeg,.doc,.docx"><Input /></Form.Item></>}</Form.Item>
        <Form.Item name="placeholder" label="Placeholder"><Input /></Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => REGEX_FIELD_TYPES.has(getFieldValue('type')) && <>
          <Form.Item label="Identity regex preset"><Select placeholder="Choose preset (optional)" options={IDENTITY_REGEX_PRESETS} onChange={value=>form.setFieldsValue({regex:value,regexMessage:IDENTITY_REGEX_PRESETS.find(p=>p.value===value)?.message || ''})}/></Form.Item><Form.Item name="regex" label="Regex pattern" extra="JavaScript pattern without enclosing / characters. Example: ^[0-9]{13}$ for a 13-digit CNIC."><Input placeholder="^[0-9]{13}$"/></Form.Item>
          <Form.Item name="regexMessage" label="Validation error message"><Input placeholder="Enter a valid value"/></Form.Item>
        </>}</Form.Item>
        <Form.Item name="required" label="Required" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
  </aside>;
}
