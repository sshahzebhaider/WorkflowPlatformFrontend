import { checkRegexDefinition, REGEX_FIELD_TYPES, IDENTITY_REGEX_PRESETS, matchFieldPattern } from '../utils/fieldValidation.js';
import { insertConnectedStep } from '../utils/workflowConnections.js';
import { useCallback, useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, Checkbox, Divider, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { ArrowLeftOutlined, BranchesOutlined, CheckOutlined, DeleteOutlined, EditOutlined, FormOutlined, PlusOutlined, SaveOutlined, SearchOutlined, UpOutlined, DownOutlined, UserOutlined, CheckOutlined as CheckNodeOutlined, PlayCircleFilled, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState, MarkerType } from '@xyflow/react';
import { usePlatform } from '../context/PlatformContext';
import { PageHeading, PageEmpty, Panel, Pill, SmallTitle, InfoRow } from '../components/UI';
import { FIELD_TYPES, NODE_TYPES } from '../data/seed';
import { uid, slug, sampleEdges, sampleNodes, availableLookups, niceDate } from '../utils/helpers';
import { lookupChoices, dependentFieldKeys } from '../utils/lookups';
import { FieldLibrary } from '../components/FieldLibrary';
import { FieldLibrarySidebar } from '../components/FieldLibrarySidebar';
import { AutoCode } from '../components/AutoCode';
import { AttachmentInput } from '../components/AttachmentInput';
const useProject = () => { const ctx = usePlatform(), { projectId } = useParams(); return { ...ctx, projectId, project: ctx.db.projects.find(p => p.id === projectId) }; };
export function FormsPage() {
    const { db, projectId, add, can } = useProject(), navigate = useNavigate(), msg = AntApp.useApp().message, [open, setOpen] = useState(false), [libraryOpen, setLibraryOpen] = useState(false), [form] = Form.useForm();
    const rows = db.forms.filter(f => f.projectId === projectId);
    const create = async (v) => { try {
        const newForm = await add('forms', { ...v, code: slug(v.name), projectId, status: 'Draft', version: 1, fields: [] });
        setOpen(false);
        navigate(`/project/${projectId}/forms/${newForm.id}`);
    }
    catch (error) {
        msg.error(error.message);
    } };
    return <><PageHeading title="Forms" description="Build reusable forms from fields and dropdowns. Attach any form to one or more workflow steps." actions={can('forms.manage', projectId) && <Space><Button onClick={() => setLibraryOpen(true)}>Field library</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Create form</Button></Space>}/><Panel padding={false}>{rows.length ? <Table rowKey="id" dataSource={rows} columns={[{ title: 'Form', render: (_, f) => <><b>{f.name}</b><span className="table-subtitle">{f.code} · {(f.fields || []).length} fields</span></> }, { title: 'Version', dataIndex: 'version', render: x => `v${x}` }, { title: 'Status', dataIndex: 'status', render: x => <Pill status={x}>{x}</Pill> }, { title: 'Last edited', dataIndex: 'updatedAt', render: niceDate }, { title: '', render: (_, f) => <Button type="link" disabled={!can('forms.manage', projectId)} onClick={() => navigate(`/project/${projectId}/forms/${f.id}`)}>Open designer</Button> }]}/> : <PageEmpty title="No forms yet" description="Create your first reusable form. One workflow can attach different forms to different steps." actionText={can('forms.manage', projectId) ? 'Create form' : undefined} onAction={can('forms.manage', projectId) ? () => setOpen(true) : undefined}/>}</Panel><Modal title="Create form" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose><Form form={form} layout="vertical" onFinish={create}><Form.Item name="name" label="Form name" rules={[{ required: true }]}><Input placeholder="Customer intake"/></Form.Item><AutoCode /><Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item></Form></Modal><FieldLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} projectId={projectId} project={db.projects.find(p => p.id === projectId)}/></>;
}
function DemoInput({ field, lookups, preview = false, value, onValueChange, parentValue }) {
    const placeholder = field.placeholder || field.label || 'Enter value';
    if (field.type === 'attachment')
        return <AttachmentInput field={field} value={value} onChange={onValueChange} readOnly={!preview}/>;
    if (field.type === 'textarea')
        return <Input.TextArea value={value ?? ''} disabled={!preview} rows={2} onChange={e => onValueChange(e.target.value)} placeholder={placeholder}/>;
    if (field.type === 'select') {
        const list = lookups.find(l => l.id === field.lookupId);
        const needsParent = Boolean(list?.parentListId), blocked = needsParent && !parentValue;
        return <Select style={{ width: '100%' }} value={value} onChange={onValueChange} disabled={!preview || blocked} placeholder={blocked ? 'Select parent dropdown first' : field.placeholder || 'Select an option'} options={lookupChoices(lookups, field.lookupId, parentValue)}/>;
    }
    if (field.type === 'checkbox')
        return <Checkbox disabled={!preview} checked={Boolean(value)} onChange={e => onValueChange(e.target.checked)}>{field.placeholder || 'Yes'}</Checkbox>;
    if (field.type === 'number')
        return <InputNumber style={{ width: '100%' }} value={value} disabled={!preview} onChange={onValueChange} placeholder={placeholder}/>;
    if (field.type === 'date')
        return <Input type="date" value={value ?? ''} disabled={!preview} onChange={e => onValueChange(e.target.value)}/>;
    return <Input type={field.type === 'email' ? 'email' : 'text'} value={value ?? ''} disabled={!preview} onChange={e => onValueChange(e.target.value)} placeholder={placeholder}/>;
}
export function FormDesigner() {
    const { db, update, project, projectId } = useProject();
    const { formId } = useParams(), nav = useNavigate(), msg = AntApp.useApp().message;
    const current = db.forms.find(f => f.id === formId && f.projectId === projectId);
    const [fields, setFields] = useState(() => current?.draftFields || current?.fields || []);
    const [selected, setSelected] = useState(() => fields[0]?.id || null);
    const [mode, setMode] = useState('design'), [inspectorTab, setInspectorTab] = useState('field'), [previewValues, setPreviewValues] = useState({});
    const lookups = availableLookups(db, project), field = fields.find(f => f.id === selected);
    if (!current)
        return <PageEmpty title="Form not found" description="Return to the form library." actionText="Form library" onAction={() => nav(`/project/${projectId}/forms`)}/>;
    const uniqueKey = (label, excludeId, savedKey) => {
        const base = String(savedKey || slug(label)).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'field';
        let key = base, index = 2;
        while (fields.some(f => f.id !== excludeId && f.key === key))
            key = `${base}_${index++}`;
        return key;
    };
    const patch = (id, properties) => setFields(previous => {
        const old = previous.find(item => item.id === id);
        return previous.map(item => item.id === id ? { ...item, ...properties } :
            properties.key && old?.key !== properties.key && item.parentFieldKey === old?.key ? { ...item, parentFieldKey: properties.key } : item);
    });
    const insertLibraryField = (template) => {
        const label = template.label || template.name;
        const newField = { id: uid(), label, key: uniqueKey(label, undefined, template.key || template.code), type: template.type || 'text', required: Boolean(template.required), placeholder: template.placeholder || '', lookupId: template.lookupId || null, parentFieldKey: null, libraryFieldId: template.id, maxFiles: template.maxFiles || 1, maxFileMB: template.maxFileMB || 5, allowedFileTypes: template.allowedFileTypes || '.pdf,.png,.jpg,.jpeg,.doc,.docx', regex: template.regex || '', regexMessage: template.regexMessage || '', section: field?.section || fields.at(-1)?.section || 'General', width: template.width || 1, helpText: template.helpText || '' };
        setFields(previous => [...previous, newField]);
        setSelected(newField.id);
        setMode('design');
        setInspectorTab('field');
        msg.success('Field inserted');
    };
    const editProperties = (id) => { setSelected(id); setInspectorTab(mode==='rules'?'rules':'field'); };
    const save = async (publish = false) => {
        if (publish && !fields.length)
            return msg.warning('Add at least one field before publishing');
        const unnamed = fields.find(f => !String(f.label || '').trim());
        if (unnamed)
            return msg.error('Every field needs a label. Edit the label directly on the form.');
        const missingLookup = fields.find(f => f.type === 'select' && !f.lookupId);
        if (publish && missingLookup)
            return msg.error(`Choose a lookup for ${missingLookup.label}`);
        const missingParent = fields.find(f => { const parentId = lookups.find(l => l.id === f.lookupId)?.parentListId; return f.type === 'select' && parentId && !fields.some(p => p.id !== f.id && p.key === f.parentFieldKey && p.type === 'select' && p.lookupId === parentId); });
        if (publish && missingParent)
            return msg.error(`Choose a parent dropdown for ${missingParent.label}`);
        const invalidRegex = fields.find(f => REGEX_FIELD_TYPES.has(f.type) && checkRegexDefinition(f.regex));
        if (invalidRegex)
            return msg.error(`${invalidRegex.label}: ${checkRegexDefinition(invalidRegex.regex)}`);
        const keys = fields.map(f => f.key);
        if (keys.some(k => !k || ['__proto__','constructor','prototype','api_response'].includes(k.toLowerCase())) || new Set(keys.map(k=>k.toLowerCase())).size !== keys.length)
            return msg.error('Field keys must be unique and nonempty');
        try {
            await update('forms', current.id, { fields, status: publish ? 'Published' : 'Draft', version: publish ? current.version + 1 : current.version, publishedAt: publish ? new Date().toISOString() : current.publishedAt });
            msg.success(publish ? 'Form published' : 'Form draft saved');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const move = (index, direction) => { const next = [...fields], target = index + direction; if (target < 0 || target >= next.length)
        return; [next[index], next[target]] = [next[target], next[index]]; setFields(next); };
    const deleteField = (f) => { setFields(previous => previous.filter(item => item.id !== f.id).map(item => item.parentFieldKey === f.key ? { ...item, parentFieldKey: null } : item)); if (selected === f.id) {
        setSelected(null);
    } };
    const sections = fields.reduce((groups, f, i) => {
        const title = f.section || 'General';
        if (groups.at(-1)?.title !== title) groups.push({ title, rows: [] });
        groups.at(-1).rows.push({ f, i });
        return groups;
    }, []);
    const dropPalette = event => {
        const raw=event.dataTransfer.getData('application/x-workflow-field');
        if(!raw || raw.length>4000) return false;
        event.preventDefault(); event.stopPropagation();
        try { const item=JSON.parse(raw); if(FIELD_TYPES.some(type=>type.value===item.type) && typeof item.label==='string' && item.label.length<=150) insertLibraryField((db.fieldLibrary || []).find(f=>f.id===item.id && f.projectId===projectId) || {label:item.label,type:item.type,regex:typeof item.regex==='string'?item.regex:'',regexMessage:typeof item.regexMessage==='string'?item.regexMessage:''}); }
        catch { /* Ignore unrelated malformed drag data. */ }
        return true;
    };
    const reorder = (id, target) => setFields(old => {
        const from = old.findIndex(f=>f.id===id), to=old.findIndex(f=>f.id===target);
        if (from<0 || to<0 || from===to) return old;
        const next=[...old], [moved]=next.splice(from,1);
        next.splice(to,0,{...moved,section:old[to].section || 'General'});
        return next;
    });
    return <div className="stack form-designer-reference">
   <div className="designer-toolbar"><Space><Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/project/${projectId}/forms`)}>Forms</Button><h2>{current.name}</h2><Pill status={current.status}>{`v${current.version} · ${current.status}`}</Pill></Space><Space><Button icon={<SaveOutlined />} onClick={() => save()}>Save draft</Button><Button type="primary" onClick={() => save(true)}>Publish v{current.version + 1}</Button></Space></div>
   <div className="form-designer-body field-library-layout reference-form-layout">
     <FieldLibrarySidebar project={project} projectId={projectId} onInsert={insertLibraryField} palette/>
     <div className="form-editor"><div className="form-preview" onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-workflow-field'))event.preventDefault();}} onDrop={dropPalette}>
       <div className="toolbar"><div><h3 style={{ margin: 0 }}>{current.name}</h3><span className="helper-text">{current.description || 'Reusable project form'}</span></div><Space.Compact><Button type={mode === 'design' ? 'primary' : 'default'} ghost={mode === 'design'} onClick={() => setMode('design')}>Design</Button><Button type={mode === 'preview' ? 'primary' : 'default'} ghost={mode === 'preview'} onClick={() => setMode('preview')}>Preview</Button><Button type={mode === 'rules' ? 'primary' : 'default'} ghost={mode === 'rules'} onClick={() => {setMode('rules');setInspectorTab('rules');}}>Rules</Button></Space.Compact></div>
       {mode === 'preview' && <div className="note-strip" style={{ marginBottom: 12 }}>Interactive preview. Values are not saved. <Button size="small" onClick={() => setPreviewValues({})}>Reset</Button></div>}
       {sections.map((section, index) => <div className="reference-form-section" key={`${section.title}-${index}`}>
         <div className="reference-form-section-heading"><span className="reference-section-number">{index+1}</span><strong>{section.title}</strong><span className="helper-text">This form only</span></div>
         <div className="reference-form-grid">{section.rows.map(({f,i}) => <div key={f.id} style={{ gridColumn: f.width === 2 ? '1 / -1' : undefined }} className={`form-field-row ${selected === f.id && mode !== 'preview' ? 'selected' : ''}`} onClick={() => mode !== 'preview' && editProperties(f.id)} draggable={mode==='design'} onDragStart={event=>{event.dataTransfer.setData('text/plain',f.id);event.dataTransfer.effectAllowed='move';}} onDragOver={event=>{if(mode==='design')event.preventDefault();}} onDrop={event=>{if(mode==='design'){event.preventDefault();if(!dropPalette(event))reorder(event.dataTransfer.getData('text/plain'),f.id);}}}>
           <div className="field-title-row">
             {mode === 'design' ? <><span className="reference-drag-handle" aria-hidden="true">⠿</span><Input size="small" className="canvas-field-label" value={f.label} aria-label="Field label" onClick={event => event.stopPropagation()} onChange={event => patch(f.id, { label: event.target.value })}/></> : <strong>{f.label} {f.required && <span style={{ color: '#dc2626' }}>*</span>}</strong>}
             {mode !== 'preview' && <Space size={0} onClick={event=>event.stopPropagation()}><Button type="text" size="small" aria-label="Move field up" disabled={i===0} icon={<UpOutlined/>} onClick={()=>move(i,-1)}/><Button type="text" size="small" aria-label="Move field down" disabled={i===fields.length-1} icon={<DownOutlined/>} onClick={()=>move(i,1)}/><Popconfirm title="Remove field from this form?" description="The reusable library field will remain." onConfirm={()=>deleteField(f)}><Button danger type="text" size="small" icon={<DeleteOutlined/>} aria-label={`Remove ${f.label} from form`}/></Popconfirm></Space>}
           </div>
           {mode==='preview' && <><DemoInput field={f} lookups={lookups} preview={!f.readOnly} value={previewValues[f.key]} parentValue={f.parentFieldKey ? previewValues[f.parentFieldKey] : undefined} onValueChange={value => setPreviewValues(previous => ({ ...previous, [f.key]: value, ...Object.fromEntries(dependentFieldKeys(fields, f.key).map(key => [key, undefined])) }))}/>{f.helpText && <div className="helper-text">{f.helpText}</div>}</>}
           <div className="helper-text">{FIELD_TYPES.find(x=>x.value===f.type)?.label || f.type}{f.required ? ' · required' : ''}{f.readOnly ? ' · read only' : ''}{f.lookupId ? ' · choice from list' : ''}{f.regex ? ' · pattern validation' : ''}{mode==='rules' && f.regex ? ` · ${f.regex}` : ''}{mode==='preview' && f.regex && previewValues[f.key] && !matchFieldPattern(f,previewValues[f.key]) ? <span style={{color:'#dc2626'}}> · {f.regexMessage || 'Invalid format'}</span> : null}</div>
         </div>)}</div>
       </div>)}
       {!fields.length && <div className="empty-view" style={{ border: '1px dashed #d5dbe5', borderRadius: 7, marginTop: 22 }}><strong>Add your first field</strong><p className="muted">Choose a field type or reusable field on the left.</p></div>}
     </div></div>
     <aside className="reference-form-inspector form-inspector" aria-label="Field properties">
     {field && <>
       <h3 style={{marginBottom:10}}>{field.label} <Tag>{field.type}</Tag></h3>
       <Tabs size="small" activeKey={inspectorTab} onChange={setInspectorTab} items={[{ key: 'field', label: 'Field' }, { key: 'lookup', label: 'Look up' }, { key: 'rules', label: 'Rules' }]}/>
       {inspectorTab === 'field' && <>
         <div className="inspector-field"><label>Label</label><Input value={field.label} onChange={e=>patch(field.id,{label:e.target.value})}/></div>
         <div className="inspector-field"><label>Field key</label><Input value={field.key} onChange={e=>patch(field.id,{key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}/><div className="helper-text">Name of the value in case data and reports. Changing an existing key affects future versions.</div></div>
         <div className="inspector-field"><label>Section</label><Input value={field.section || 'General'} onChange={e=>patch(field.id,{section:e.target.value})}/></div>
         <div className="inspector-field"><label>Help text</label><Input value={field.helpText || ''} onChange={e=>patch(field.id,{helpText:e.target.value})}/></div>
         <div className="inspector-field"><label>Width</label><Select style={{width:'100%'}} value={field.width===2?2:1} onChange={width=>patch(field.id,{width})} options={[{value:1,label:'One column'},{value:2,label:'Two columns (full width)'}]}/></div>
         <div className="inspector-field"><label>Field type</label><Select style={{ width: '100%' }} value={field.type} onChange={type => patch(field.id, { type, lookupId: type === 'select' ? field.lookupId : null, parentFieldKey: type === 'select' ? field.parentFieldKey : null })} options={FIELD_TYPES}/></div>
         <div className="inspector-field"><label>Placeholder</label><Input value={field.placeholder || ''} onChange={event => patch(field.id, { placeholder: event.target.value })}/></div>
         {field.type === 'attachment' && <><div className="inspector-field"><label>Maximum files</label><InputNumber min={1} max={10} style={{ width: '100%' }} value={field.maxFiles || 1} onChange={maxFiles => patch(field.id, { maxFiles })}/></div><div className="inspector-field"><label>Maximum size per file (MB)</label><InputNumber min={1} max={20} style={{ width: '100%' }} value={field.maxFileMB || 5} onChange={maxFileMB => patch(field.id, { maxFileMB })}/></div><div className="inspector-field"><label>Allowed extensions</label><Input value={field.allowedFileTypes || '.pdf,.png,.jpg,.jpeg,.doc,.docx'} onChange={e => patch(field.id, { allowedFileTypes: e.target.value })} placeholder=".pdf,.png,.jpg"/><div className="helper-text">File types separated by commas. Stored in this browser for the demo.</div></div></>}
       </>}
       {inspectorTab === 'lookup' && <>
         <div className="note-strip">Case-type data source responses populate matching intake field keys. Configure explicit response mappings in Data Connections.</div>
         {field.type === 'select' && <div className="inspector-field"><label>Lookup list</label><Select style={{ width: '100%' }} allowClear value={field.lookupId} onChange={lookupId => patch(field.id, { lookupId, parentFieldKey: null })} placeholder="Choose lookup list" options={lookups.map(list => ({ value: list.id, label: list.name }))}/><div className="helper-text">Managed under Lists</div></div>}
         {field.type === 'select' && lookups.find(list => list.id === field.lookupId)?.parentListId && <div className="inspector-field"><label>Parent dropdown field</label><Select style={{ width: '100%' }} placeholder="Choose parent field on this form" value={field.parentFieldKey} onChange={parentFieldKey => patch(field.id, { parentFieldKey })} options={fields.filter(other => other.id !== field.id && other.type === 'select' && other.lookupId === lookups.find(list => list.id === field.lookupId)?.parentListId).map(other => ({ value: other.key, label: other.label }))}/><div className="helper-text">Child dropdown options depend on this parent field's selection.</div></div>}
       </>}
       {inspectorTab === 'rules' && <><div className="inspector-field"><Checkbox checked={Boolean(field.required)} onChange={event => patch(field.id, { required: event.target.checked })}>Required field</Checkbox></div>
         {REGEX_FIELD_TYPES.has(field.type) && <><div className="inspector-field"><label>Regular expression (regex)</label><Select style={{width:'100%',marginBottom:8}} placeholder="Choose identity regex preset" value={IDENTITY_REGEX_PRESETS.find(p=>p.value===field.regex)?.value} options={IDENTITY_REGEX_PRESETS} onChange={value=>patch(field.id,{regex:value,regexMessage:IDENTITY_REGEX_PRESETS.find(p=>p.value===value)?.message || ''})}/><Input value={field.regex || ''} onChange={event => patch(field.id, { regex: event.target.value })} placeholder="^[0-9]{13}$"/><div className="helper-text">Enter a JavaScript regex pattern without enclosing slashes. Leave blank for no pattern.</div>{checkRegexDefinition(field.regex) && <div style={{ color: '#dc2626' }}>{checkRegexDefinition(field.regex)}</div>}</div><div className="inspector-field"><label>Error message</label><Input value={field.regexMessage || ''} onChange={event => patch(field.id, { regexMessage: event.target.value })} placeholder="Please enter a valid value"/></div></>}
         <div className="note-strip">Required and regex rules are validated when creating a case or completing a step form.</div></>}
       <Button danger type="link" icon={<DeleteOutlined/>} onClick={()=>deleteField(field)}>Remove field</Button>
       <div className="note-strip" style={{ marginTop: 18 }}>Save draft or publish to store changes. Other forms using the same library template are not modified.</div>
     </>}
     {!field && <div className="note-strip">Select a field to configure its properties.</div>}
     </aside>
   </div>
 </div>;
}
export function WorkflowsPage() {
    const { db, projectId, add, can } = useProject(), nav = useNavigate(), msg = AntApp.useApp().message, [open, setOpen] = useState(false), [form] = Form.useForm();
    const rows = db.workflows.filter(w => w.projectId === projectId);
    const create = async (v) => { try {
        const item = await add('workflows', { ...v, code: slug(v.name), projectId, status: 'Draft', version: 1, nodes: sampleNodes(), edges: sampleEdges() });
        setOpen(false);
        nav(`/project/${projectId}/workflows/${item.id}`);
    }
    catch (error) {
        msg.error(error.message);
    } };
    return <><PageHeading title="Workflows" description="Design project-specific process flows, attach forms to steps, and configure routing and actions." actions={can('workflows.manage', projectId) && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Create workflow</Button>}/><Panel padding={false}>{rows.length ? <Table rowKey="id" dataSource={rows} columns={[{ title: 'Workflow', render: (_, w) => <><b>{w.name}</b><div className="table-subtitle">{w.code} · {w.nodes?.length || 0} steps</div></> }, { title: 'Version', dataIndex: 'version', render: v => `v${v}` }, { title: 'Status', dataIndex: 'status', render: s => <Pill status={s}>{s}</Pill> }, { title: 'Last edited', dataIndex: 'updatedAt', render: niceDate }, { title: '', render: (_, w) => <Button type="link" disabled={!can('workflows.manage', projectId)} onClick={() => nav(`/project/${projectId}/workflows/${w.id}`)}>Open designer</Button> }]}/> : <PageEmpty title="No workflows yet" description="Create a workflow from scratch using the visual node editor." actionText={can('workflows.manage', projectId) ? 'Create workflow' : undefined} onAction={can('workflows.manage', projectId) ? () => setOpen(true) : undefined}/>}</Panel>
 <Modal title="New workflow" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose><Form form={form} layout="vertical" onFinish={create}><Form.Item name="name" label="Workflow name" rules={[{ required: true }]}><Input placeholder="Approval process"/></Form.Item><AutoCode /><Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item></Form></Modal></>;
}
const groupOrder = ['Flow', 'People', 'Logic', 'System'];
const labels = { start: 'Start', task: 'Human task', officerRouting: 'Officer routing', requestInfo: 'Request information', groupReview: 'Group review', decision: 'Decision', parallel: 'Parallel split', wait: 'Wait', dataSource: 'Data source', notify: 'Notification', end: 'End' };
function FlowNode({ data, selected }) {
    const kind = data.kind || 'task', isStart = kind === 'start', isEnd = kind === 'end';
    return <div className={`flow-card flow-${kind} ${selected ? 'selected' : ''}`}>
   {!isStart && <Handle type="target" position={Position.Left}/>}
   <span className="flow-node-icon">{isStart ? <PlayCircleFilled /> : isEnd ? <CheckNodeOutlined /> : <UserOutlined />}</span>
   <span className="flow-node-content"><strong className="flow-card-title">{data.label || labels[kind]}</strong>
     <span className="flow-type">{labels[kind]}{data.formIds?.length ? ` · ${data.formIds.length} form${data.formIds.length === 1 ? '' : 's'}` : ''}</span>
     {data.slaHours && <span className="flow-node-meta">{data.slaHours}h SLA</span>}
   </span>
   {!isEnd && <Handle type="source" position={Position.Right}/>}
 </div>;
}
const nodeTypes = { flowNode: FlowNode };
const HUMAN_ROLES = [{ value: 'unit_head', label: 'Unit Head' }, { value: 'team_lead', label: 'Team Lead' }, { value: 'team_member', label: 'Team Member / Officer' }];
function HumanStepProperties({ node, patchNode, teams, forms, project, calendar, deleteStep }) {
    const currentMode = node.data.assignmentMode || (node.data.routeViaHierarchy === false ? 'direct' : 'hierarchy');
    const formIds = node.data.formIds || [];
    return <div className="workflow-human-properties">
   <div className="inspector-field"><label>Step name</label><Input value={node.data.label || ''} onChange={event => patchNode({ label: event.target.value })} placeholder="New approval step"/></div>
   <div className="inspector-field"><label>Node type</label><Select style={{ width: '100%' }} value={node.data.kind} onChange={kind => patchNode({ kind })} options={[{ value: 'task', label: 'Human task' }, { value: 'officerRouting', label: 'Officer routing' }, { value: 'requestInfo', label: 'Request information' }]}/></div>
   <div className="inspector-field"><label>Responsible team</label><Select style={{ width: '100%' }} showSearch optionFilterProp="label" allowClear placeholder="Select the responsible team" value={node.data.teamId || undefined} onChange={teamId => patchNode({ teamId })} options={teams.map(team => ({ value: team.id, label: team.name }))}/></div>
   <div className="inspector-field"><label>Assigned role</label><Select style={{ width: '100%' }} value={node.data.assignedRole || 'team_lead'} onChange={assignedRole => patchNode({ assignedRole })} options={HUMAN_ROLES}/></div>
   <div className="inspector-field"><label>SLA hours</label><InputNumber min={1} style={{ width: '100%' }} value={node.data.slaHours || project?.slaHours || 24} onChange={slaHours => patchNode({ slaHours })}/><div className="helper-text">Calendar: {calendar?.name || 'Not assigned'}</div></div>
   <div className="inspector-field"><label>Escalate to role</label><Select style={{ width: '100%' }} value={node.data.escalateToRole || 'unit_head'} onChange={escalateToRole => patchNode({ escalateToRole })} options={HUMAN_ROLES}/><div className="helper-text">Recorded for future automated SLA escalation; no emails are sent in the frontend prototype.</div></div>
   <div className="inspector-field"><label>Assignment mode</label><Select style={{ width: '100%' }} value={currentMode} onChange={assignmentMode => patchNode({ assignmentMode, routeViaHierarchy: assignmentMode === 'hierarchy' })} options={[{ value: 'roleQueue', label: 'Role queue' }, { value: 'direct', label: 'Direct to team member' }, { value: 'hierarchy', label: 'Unit Head → Team Lead → Officer' }]}/><div className="helper-text">Role queue starts with the selected role. Direct assigns an officer; hierarchy uses manager handoffs.</div></div>
   <div className="inspector-field"><label>Attached form (optional)</label><Select style={{ width: '100%' }} allowClear value={formIds[0] || undefined} placeholder="— No form (use inline fields) —" onChange={formId => patchNode({ formIds: formId ? [formId] : [] })} options={forms.filter(form => form.status === 'Published').map(form => ({ value: form.id, label: form.name }))}/><div className="helper-text">Only published forms appear here.</div></div>
   <div className="inspector-field"><Checkbox checked={Boolean(node.data.requireForm)} disabled={!formIds.length} onChange={event => patchNode({ requireForm: event.target.checked })}>Require form before completion</Checkbox></div>
   <div className="workflow-notification-setting"><div><strong>Email notification</strong><div className="helper-text">Notify the assigned user when work reaches this step. Delivery requires the future backend.</div></div><Switch size="small" checked={Boolean(node.data.emailNotification)} onChange={emailNotification => patchNode({ emailNotification })}/></div>
   <Button block danger className="workflow-delete-step" onClick={deleteStep}>Delete node</Button>
 </div>;
}
export function WorkflowDesigner() {
    const { db, update, project, projectId } = useProject(), { workflowId } = useParams(), nav = useNavigate(), msg = AntApp.useApp().message;
    const workflow = db.workflows.find(w => w.id === workflowId && w.projectId === projectId);
    const [nodes, setNodes, onNodesChange] = useNodesState(workflow?.draftNodes || workflow?.nodes || []), [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.draftEdges || workflow?.edges || []), [selected, setSelected] = useState('review'), [inspector, setInspector] = useState('general'), [paletteFilter, setPaletteFilter] = useState(''), [advancedSteps, setAdvancedSteps] = useState(false), [workflowName, setWorkflowName] = useState(workflow?.name || ''), [testOpen, setTestOpen] = useState(false), [testForm] = Form.useForm();
    const node = nodes.find(x => x.id === selected);
    const forms = db.forms.filter(f => f.projectId === projectId), teams = db.teams.filter(t => t.projectId === projectId), sources = db.dataSources.filter(s => project?.dataSourceIds?.includes(s.id));
    const patchNode = (patch) => setNodes(old => old.map(x => x.id === selected ? { ...x, data: { ...x.data, ...patch } } : x));
    const addNode = (kind) => {
        if (kind === 'start' && nodes.some(n => n.data.kind === 'start'))
            return msg.warning('This workflow already has a Start node');
        const id = uid();
        const newNode = { id, type: 'flowNode', position: { x: 0, y: 0 }, data: { label: labels[kind], kind, formIds: [], teamId: null, teamIds: [], ...(kind === 'parallel' ? { parallelMode: 'split' } : {}), ...(kind === 'task' ? { assignmentMode: 'hierarchy', assignedRole: 'team_lead', escalateToRole: 'unit_head', slaHours: project?.slaHours || 24, emailNotification: false } : {}) } };
        const connected = insertConnectedStep(nodes, edges, selected, newNode, uid);
        setNodes(connected.nodes);
        setEdges(connected.edges);
        setSelected(id);
        setInspector('general');
        msg.success('Step added and connected automatically');
    };
    const onConnect = useCallback(connection => setEdges(existing => addEdge({ ...connection, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, existing)), [setEdges]);
    const validate = () => { const starts = nodes.filter(n => n.data.kind === 'start'), ends = nodes.filter(n => n.data.kind === 'end'); if (starts.length !== 1 || !ends.length)
        return 'Include exactly one Start and at least one End.'; if (edges.some(e => !nodes.find(n => n.id === e.source) || !nodes.find(n => n.id === e.target)))
        return 'One or more edges point to missing nodes.'; const seen = new Set(), queue = [starts[0].id]; while (queue.length) {
        const v = queue.shift();
        if (seen.has(v))
            continue;
        seen.add(v);
        edges.filter(e => e.source === v).forEach(e => queue.push(e.target));
    } if (!ends.some(n => seen.has(n.id)))
        return 'Connect Start to an End using workflow edges.'; if (nodes.some(n => !seen.has(n.id)))
        return 'Some steps are unreachable from Start. Connect or remove them.'; if (nodes.some(n => n.data.kind === 'decision' && edges.filter(e => e.source === n.id).length < 2))
        return 'Each Decision requires at least two outgoing branches (Yes and No).'; if (nodes.some(n => ['task', 'officerRouting', 'requestInfo'].includes(n.data.kind) && !n.data.teamId))
        return 'Assign a team to every human task.'; if (nodes.some(n => n.data.kind === 'groupReview' && !(n.data.teamIds || []).length))
        return 'Select teams for every Group Review step.'; if (nodes.some(n => n.data.kind === 'decision' && ['Yes', 'No'].some(label => !edges.some(e => e.source === n.id && String(e.data?.outcome || e.label || '').toLowerCase() === label.toLowerCase()))))
        return 'Each Decision must have both Yes and No labeled outgoing edges.'; if (nodes.some(n => n.data.requireForm && !(n.data.formIds || []).length))
        return 'Required step forms must be attached.'; if (nodes.some(n => n.data.kind === 'parallel' && (!['split', 'join'].includes(n.data.parallelMode) || (n.data.parallelMode === 'split' ? edges.filter(e => e.source === n.id).length < 2 : edges.filter(e => e.target === n.id).length < 2 || edges.filter(e => e.source === n.id).length !== 1))))
        return 'Parallel split needs at least two branches; join needs two incoming and exactly one outgoing path.'; if (nodes.some(n => n.data.kind === 'notify' && !n.data.templateId))
        return 'Choose a template for every Notification step.'; if (nodes.some(n => n.data.kind === 'dataSource' && (!n.data.dataSourceId || !n.data.operationCode || !sources.find(src => src.id === n.data.dataSourceId)?.operations?.some(o => o.code === n.data.operationCode))))
        return 'Each data source step must use an allowed source and a configured operation.'; return null; };
    const save = async (publish) => { const error = validate(); if (publish && error)
        return msg.error(error); try {
        await update('workflows', workflowId, { name: workflowName.trim() || workflow.name, nodes, edges, status: publish ? 'Published' : 'Draft', version: publish ? workflow.version + 1 : workflow.version, publishedAt: publish ? new Date().toISOString() : workflow.publishedAt });
        msg.success(publish ? 'Workflow definition published' : 'Workflow draft saved');
    }
    catch (error) {
        msg.error(error.message);
    } };
    if (!workflow)
        return <PageEmpty title="Workflow not found" description="Open it from your workflow library." actionText="Workflows" onAction={() => nav(`/project/${projectId}/workflows`)}/>;
    return <div className="stack"><div className="designer-toolbar"><Space><Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/project/${projectId}/workflows`)}>Workflows</Button><h2>{workflow.name}</h2><Pill status={workflow.status}>{`v${workflow.version} · ${workflow.status}`}</Pill></Space><Space><Button onClick={() => { const error = validate(); error ? msg.error(error) : msg.success(`Graph valid · ${nodes.length} steps`); }} icon={<CheckOutlined />}>Validate</Button><Button onClick={() => save(false)} icon={<SaveOutlined />}>Save draft</Button><Button type="primary" onClick={() => save(true)}>Publish v{workflow.version + 1}</Button></Space></div><div className="workflow-details"><div><label className="field-label">Workflow name</label><Input value={workflowName} onChange={e => setWorkflowName(e.target.value)} placeholder="Enter workflow name"/></div><div><label className="field-label">Project</label><Input value={project?.name || ''} readOnly/></div><div><label className="field-label">Used by case types</label><div className="workflow-usedby">{db.caseTypes.filter(t => t.projectId === projectId && (t.workflowId === workflowId || t.publishedConfig?.workflowId === workflowId)).map(t => <Tag key={t.id}>{t.name}</Tag>)}{!db.caseTypes.some(t => t.projectId === projectId && (t.workflowId === workflowId || t.publishedConfig?.workflowId === workflowId)) && <span className="helper-text">Attach this workflow in Case Type Setup</span>}</div></div></div><div className="designer-body workflow-reference-layout"><aside className="designer-palette"><SmallTitle>ADD STEPS</SmallTitle><Input placeholder="Search steps" prefix={<SearchOutlined />} value={paletteFilter} onChange={e => setPaletteFilter(e.target.value)}/><div className="workflow-step-library">{NODE_TYPES.filter(n => (advancedSteps ? true : ['task', 'end'].includes(n.value)) && n.value !== 'start' && n.label.toLowerCase().includes(paletteFilter.toLowerCase())).map(n => <button className="workflow-step-tile" key={n.value} type="button" onClick={() => addNode(n.value)}><span className={`workflow-step-tile-icon ${n.value === 'end' ? 'finish' : 'person'}`}>{n.value === 'end' ? <CheckNodeOutlined /> : <UserOutlined />}</span><strong>{n.value === 'task' ? 'Human Task' : n.value === 'end' ? 'End State' : n.label}</strong><span className="helper-text">{n.value === 'task' ? 'Assign to a team or person' : n.value === 'end' ? 'Resolved / rejected / closed' : n.group}</span></button>)}</div><Button type="link" onClick={() => setAdvancedSteps(value => !value)} className="workflow-advanced-toggle">{advancedSteps ? 'Show primary steps' : 'Show more step types'}</Button><div className="note-strip" style={{ marginTop: 18 }}>Select a step and add another; the connections are created automatically. You can still adjust links manually.</div></aside><div className="designer-canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} onNodeClick={(_, n) => { setSelected(n.id); setInspector('general'); }} fitView fitViewOptions={{ padding: .22 }} defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }} proOptions={{ hideAttribution: true }}><Background color="#cdd5e0" gap={16} size={1}/><Controls /></ReactFlow><div className="workflow-canvas-label">WORKFLOW CANVAS · {nodes.length} steps</div></div><aside className="designer-inspector">{node ? <><div className="helper-text" style={{ fontWeight: 700, letterSpacing: 1 }}>STEP · {labels[node.data.kind]?.toUpperCase()}</div><h3 style={{ fontFamily: 'Outfit', fontSize: 19, margin: '6px 0 10px' }}>{node.data.label}</h3>{['task', 'officerRouting', 'requestInfo'].includes(node.data.kind) ?
                <HumanStepProperties node={node} patchNode={patchNode} teams={teams} forms={forms} project={project} calendar={db.calendars.find(calendar => calendar.id === project?.calendarId)} deleteStep={() => { setNodes(old => old.filter(item => item.id !== selected)); setEdges(old => old.filter(edge => edge.source !== selected && edge.target !== selected)); setSelected(null); }}/>
                : <><Tabs size="small" activeKey={inspector} onChange={setInspector} items={['general', 'form', 'actions', 'sla'].map(k => ({ key: k, label: k[0].toUpperCase() + k.slice(1) }))}/>
 {inspector === 'general' && <><div className="inspector-field"><label>Step label</label><Input value={node.data.label} onChange={e => patchNode({ label: e.target.value })}/></div><div className="inspector-field"><label>Step type</label><Input disabled value={labels[node.data.kind]}/></div>{['task', 'officerRouting', 'requestInfo'].includes(node.data.kind) && <div className="inspector-field"><label>Send this step to team</label><Select style={{ width: '100%' }} allowClear placeholder="Choose team" value={node.data.teamId} onChange={teamId => patchNode({ teamId })} options={teams.map(t => ({ value: t.id, label: t.name }))}/></div>}{node.data.kind === 'groupReview' && <div className="inspector-field"><label>Send reviews to teams</label><Select mode="multiple" style={{ width: '100%' }} placeholder="Choose reviewing teams" value={node.data.teamIds || []} onChange={teamIds => patchNode({ teamIds })} options={teams.map(t => ({ value: t.id, label: t.name }))}/><div className="helper-text">Each team receives its own review path.</div></div>}{['task', 'officerRouting', 'requestInfo', 'groupReview'].includes(node.data.kind) && <div className="inspector-field"><Checkbox checked={node.data.routeViaHierarchy !== false} onChange={e => patchNode({ routeViaHierarchy: e.target.checked })}>Route through Unit Head → Team Lead → Officer</Checkbox><div className="helper-text">The selected workflow team determines who receives the case. If a level is not configured, the next available level receives it.</div></div>}{node.data.kind === 'dataSource' && <><div className="inspector-field"><label>Data source</label><Select value={node.data.dataSourceId} onChange={dataSourceId => patchNode({ dataSourceId, operationCode: null })} options={sources.map(s => ({ value: s.id, label: s.name }))} style={{ width: '100%' }}/></div><div className="inspector-field"><label>Operation</label><Select style={{ width: '100%' }} value={node.data.operationCode} onChange={operationCode => patchNode({ operationCode })} options={(sources.find(s => s.id === node.data.dataSourceId)?.operations || []).map(o => ({ value: o.code, label: o.name }))}/></div></>}{node.data.kind === 'parallel' && <div className="inspector-field"><label>Parallel behavior</label><Select style={{ width: '100%' }} value={node.data.parallelMode || 'split'} onChange={parallelMode => patchNode({ parallelMode })} options={[{ value: 'split', label: 'Split — start all connected branches' }, { value: 'join', label: 'Join — wait for all incoming branches' }]}/><div className="helper-text">Use one Split and one Join. The Join continues only after every incoming path finishes.</div></div>}{node.data.kind === 'notify' && <><div className="inspector-field"><label>Notification template</label><Select style={{ width: '100%' }} value={node.data.templateId} onChange={templateId => patchNode({ templateId })} options={(db.notifications || []).filter(n => n.projectId === projectId && n.templateId).map(n => ({ value: n.templateId, label: n.name }))} placeholder="Choose an active template"/></div><div className="helper-text">Sends to the case creator unless a recipient user is configured. The next step begins when the delivery provider accepts the message.</div></>}
 {node.data.kind === 'wait' && <div className="inspector-field"><label>Delay (minutes)</label><InputNumber min={1} value={node.data.delayMinutes || 60} onChange={delayMinutes => patchNode({ delayMinutes })}/></div>}
 {node.data.kind === 'decision' && <><SmallTitle>BRANCHING RULE</SmallTitle><div className="inspector-field"><label>Compare case field</label><Input placeholder="e.g. amount / title" value={node.data.conditionField || ''} onChange={e => patchNode({ conditionField: e.target.value })}/><div className="helper-text">Use a field key from the intake form, or 'title'.</div></div><div className="inspector-field"><label>Operator</label><Select value={node.data.conditionOperator || 'equals'} onChange={conditionOperator => patchNode({ conditionOperator })} style={{ width: '100%' }} options={[{ value: 'equals', label: 'Equals' }, { value: 'notEquals', label: 'Does not equal' }, { value: 'contains', label: 'Contains' }, { value: 'greaterThan', label: 'Greater than' }, { value: 'isEmpty', label: 'Is empty' }, { value: 'notEmpty', label: 'Is not empty' }]}/></div><div className="inspector-field"><label>Compare with</label><Input value={node.data.conditionValue || ''} onChange={e => patchNode({ conditionValue: e.target.value })}/></div><div className="note-strip">Connect two outgoing branches, then mark them Yes and No below. The demo case engine evaluates this condition from intake values.</div></>}{edges.filter(e => e.source === node.id).length > 0 && <><SmallTitle>OUTGOING TRANSITIONS</SmallTitle>{edges.filter(e => e.source === node.id).map(e => <div key={e.id} className="inspector-field"><label>To {nodes.find(n => n.id === e.target)?.data?.label || e.target}</label><Select style={{ width: '100%' }} value={e.data?.outcome || e.label || undefined} allowClear placeholder="Default route" onChange={outcome => setEdges(old => old.map(x => x.id === e.id ? { ...x, label: outcome || undefined, data: { ...x.data, outcome: outcome || undefined } } : x))} options={(node.data.kind === 'decision' ? ['Yes', 'No'] : ['Complete', 'Approve', 'Reject', 'Return', 'Forward', 'Request information']).map(label => ({ value: label, label }))}/></div>)}</>}
 {node.data.kind !== 'start' && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => { setNodes(s => s.filter(n => n.id !== selected)); setEdges(s => s.filter(e => e.source !== selected && e.target !== selected)); setSelected(null); }}>Delete step</Button>}</>}
 {inspector === 'form' && <><SmallTitle>FORMS ON THIS STEP</SmallTitle><Select mode="multiple" value={node.data.formIds || []} onChange={formIds => patchNode({ formIds })} style={{ width: '100%' }} placeholder="Attach reusable forms" options={forms.map(f => ({ value: f.id, label: `${f.name} · ${f.status}` }))}/><div className="helper-text" style={{ marginTop: 9 }}>Different nodes can use different forms. Multiple forms may be assigned to one step.</div><Divider /><Checkbox checked={Boolean(node.data.requireForm)} onChange={e => patchNode({ requireForm: e.target.checked })}>Require forms before task completion</Checkbox></>}
 {inspector === 'actions' && <><SmallTitle>AVAILABLE ACTIONS</SmallTitle><Select mode="multiple" value={node.data.actions || ['Complete']} onChange={actions => patchNode({ actions })} style={{ width: '100%' }} options={['Complete', 'Approve', 'Reject', 'Return', 'Forward', 'Request information'].map(s => ({ value: s, label: s }))}/><div className="note-strip" style={{ marginTop: 17 }}>Actions can be completed in the demo case workspace. The local simulator follows labeled transitions; a real backend must enforce them.</div></>}
 {inspector === 'sla' && <><SmallTitle>STEP SLA</SmallTitle><div className="inspector-field"><label>Working hours</label><InputNumber min={1} style={{ width: '100%' }} value={node.data.slaHours || project?.slaHours || 24} onChange={slaHours => patchNode({ slaHours })}/></div><InfoRow label="Calendar" value={db.calendars.find(c => c.id === project?.calendarId)?.name || 'Not assigned'}/></>}
 </>}</> : <PageEmpty title="Select a workflow step" description="Click a node to configure its forms, team, actions and SLA."/>}<div className="note-strip" style={{ marginTop: 22 }}>Publish a valid graph, attach it to a case type, and submit a case to test real team-task handoffs in the browser simulation. REST calls run through the development-only allowlisted proxy; notifications and timers remain simulated.</div></aside></div></div>;
}
