import { useEffect, useState } from 'react';
import { App as AntApp, Button, Checkbox, Input, Modal, Popconfirm, Select, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { usePlatform } from '../context/PlatformContext';
import { PageHeading, SmallTitle, PageEmpty } from '../components/UI';
import { DEFAULT_RCA_FIELDS } from '../utils/rcaFields';
import { slug } from '../utils/helpers';
import { duplicateRcaTemplate, rcaTemplateCode } from '../utils/rcaTemplateNames';
const types = { select: 'Dropdown', toggle: 'Yes / No', number: 'Numeric', text: 'Text', textarea: 'Long text', date: 'Date' };
export function RcaTemplatesPage() {
    const { db, add, update, remove, apiMode } = usePlatform(), msg = AntApp.useApp().message;
    const [selected, setSelected] = useState(null), [name, setName] = useState(''), [fields, setFields] = useState(null), [options, setOptions] = useState({});
    const [createOpen, setCreateOpen] = useState(false), [createName, setCreateName] = useState(''), [creating, setCreating] = useState(false);
    const template = db.rcaTemplates.find(t => t.id === selected) || db.rcaTemplates[0];
    useEffect(() => { setName(template?.name || ''); setFields(template ? structuredClone(template.fields || DEFAULT_RCA_FIELDS) : null); }, [template?.id]);
    const openCreateTemplate = () => { setCreateName(''); setCreateOpen(true); };
    const newTemplate = async () => {
        const proposed = createName.trim();
        if (!proposed)
            return msg.error('Enter an RCA template name.');
        if (!rcaTemplateCode(proposed))
            return msg.error('Template name must contain letters or numbers.');
        if (duplicateRcaTemplate(db.rcaTemplates, proposed))
            return msg.error('An RCA template with this name or code already exists. Choose a different name.');
        if (creating)
            return;
        setCreating(true);
        try {
            const row = await add('rcaTemplates', { name: proposed, code: rcaTemplateCode(proposed), description: 'Standard closure analysis', fields: structuredClone(DEFAULT_RCA_FIELDS) });
            setSelected(row.id);
            setCreateOpen(false);
            msg.success('Template created. Configure its fields below.');
        }
        catch (error) {
            msg.error(error.status === 409 ? 'An RCA template with this code already exists. Choose another name.' : error.message);
        }
        finally {
            setCreating(false);
        }
    };
    const patch = (key, values) => setFields(old => old.map(f => f.key === key ? { ...f, ...values } : f));
    const addOption = field => { const option = (options[field.key] || '').trim(); if (!option)
        return; const existing = field.options || []; if (existing.some(x => x.toLowerCase() === option.toLowerCase()))
        return msg.warning('Option already exists'); patch(field.key, { options: [...existing, option] }); setOptions(v => ({ ...v, [field.key]: '' })); };
    const addField = () => {
        const used = new Set((fields || []).map(f => f.key));
        let index = 1;
        while (used.has(`customField${index}`))
            index++;
        setFields(previous => [...(previous || []), { key: `customField${index}`, label: `New field ${index}`, description: '', type: 'select', required: false, options: [] }]);
    };
    const removeField = key => setFields(previous => (previous || []).filter(f => f.key !== key).map(f => f.parentKey === key ? { ...f, parentKey: null, parentValue: null } : f));
    const save = async () => {
        if (!template)
            return;
        if (!name.trim())
            return msg.error('Template name is required');
        if (!(fields || []).length)
            return msg.error('Add at least one RCA field.');
        if ((fields || []).some(f => !f.label?.trim() || !f.key?.trim()))
            return msg.error('Every RCA field needs a name and key.');
        if (new Set((fields || []).map(f => f.key.toLowerCase())).size !== fields.length)
            return msg.error('RCA field keys must be unique.');
        if (fields.some(f => f.parentKey && (!fields.some(p => p.key === f.parentKey) || f.parentKey === f.key)))
            return msg.error('Choose a valid parent field.');
        if (fields.some(f => f.type === 'select' && f.required && !(f.options || []).length))
            return msg.error('Required dropdown RCA fields need at least one option.');
        if (duplicateRcaTemplate(db.rcaTemplates, name, template.id))
            return msg.error('Another template already uses this name or generated code.');
        try {
            await update('rcaTemplates', template.id, { name, fields });
            msg.success('RCA template saved. New projects may select it on Basics. Existing cases keep their snapshot.');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    return <><PageHeading title="RCA Setup" description="Create reusable root-cause-analysis templates before onboarding projects. Projects select one template on Basics." actions={<Button icon={<PlusOutlined />} type="primary" onClick={openCreateTemplate}>New RCA template</Button>}/>
 <div className="case-type-layout"><aside className="case-type-sidebar"><SmallTitle>RCA TEMPLATES · {db.rcaTemplates.length}</SmallTitle><div className="side-list">{db.rcaTemplates.map(t => <button type="button" key={t.id} onClick={() => setSelected(t.id)} className={`side-list-item ${template?.id === t.id ? 'selected' : ''}`} style={{ width: '100%', border: 0, textAlign: 'left', cursor: 'pointer' }}><b>{t.name}</b><small>{t.code || slug(t.name)} · {(t.fields || []).length} fields</small></button>)}</div></aside>
 <main className="case-type-main">{!template ? <PageEmpty title="No RCA templates configured" description="Create the first RCA template. Its fields will be available for projects to select during onboarding." actionText="Create RCA template" onAction={openCreateTemplate}/> : <>
 <div className="case-type-toolbar"><div><h2>{name || 'New RCA template'}</h2><div className="helper-text">Reusable platform configuration · Changes apply to newly onboarded projects only</div></div><Space><Popconfirm title="Delete RCA template?" description="Existing cases keep their RCA snapshot." onConfirm={() => { remove('rcaTemplates', template.id); setSelected(null); }}><Button danger disabled={apiMode} title={apiMode ? "Template deletion is not available from the backend" : undefined} icon={<DeleteOutlined />}>Delete</Button></Popconfirm><Button type="primary" icon={<SaveOutlined />} onClick={save}>Save RCA template</Button></Space></div>
 <div className="case-type-section"><div className="two-column"><div><label className="field-label">Template name *</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Standard RCA"/></div><div><label className="field-label">Code · generated</label><Input readOnly value={template.code || rcaTemplateCode(name)}/></div></div></div>
 <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, marginBottom: 12 }}><Button onClick={addField} icon={<PlusOutlined />}>Add RCA field</Button></div><div className="rca-options-grid" style={{ marginTop: 18 }}>{(fields || []).map(field => <div className="rca-option-card" key={field.key}><div className="rca-card-heading"><div><Input size="small" aria-label="RCA field label" value={field.label} onChange={e => patch(field.key, { label: e.target.value })} style={{ maxWidth: 250, fontWeight: 600, marginBottom: 5 }}/><p className="helper-text" style={{ margin: 0 }}>{field.description}</p></div><Popconfirm title={`Remove ${field.label}?`} onConfirm={() => removeField(field.key)}><Button size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${field.label}`}/></Popconfirm></div><div className="rca-card-body">
   <div className="two-column" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
     <div><label className="field-label">Type</label><Select style={{ width: '100%' }} size="small" value={field.type} options={Object.entries(types).map(([value, label]) => ({ value, label }))} onChange={type => patch(field.key, { type, options: type === 'toggle' ? ['Yes', 'No'] : type === 'select' ? (field.options || []) : [] })}/></div>
     <div><label className="field-label">Field key</label><Input size="small" value={field.key} readOnly title="Stable key cannot change once a template field has been created"/></div>
   </div><Input size="small" placeholder="Description (optional)" value={field.description || ''} onChange={e => patch(field.key, { description: e.target.value })} style={{ marginBottom: 10 }}/>
   {field.type === 'select' ? <><div className="rca-chips">{(field.options || []).map(o => <Tag key={o} closable onClose={e => { e.preventDefault(); patch(field.key, { options: field.options.filter(x => x !== o) }); }}>{o}</Tag>)}</div><Space.Compact style={{ width: '100%' }}><Input placeholder="Add option..." value={options[field.key] || ''} onChange={e => setOptions(v => ({ ...v, [field.key]: e.target.value }))} onPressEnter={() => addOption(field)}/><Button type="primary" icon={<PlusOutlined />} onClick={() => addOption(field)}>Add</Button></Space.Compact></> : <div className="rca-disabled-preview">{field.type === 'toggle' ? 'Yes  /  No' : `${types[field.type] || 'Value'} input — no options`}</div>}<div style={{ marginTop: 10 }}><label className="field-label">Show only when (optional)</label><Select size="small" allowClear style={{ width: '100%' }} placeholder="Always visible" value={field.parentKey || undefined} onChange={parentKey => patch(field.key, { parentKey: parentKey || null, parentValue: null })} options={(fields || []).filter(f => f.key !== field.key && !f.parentKey).map(f => ({ value: f.key, label: f.label }))}/>
   {field.parentKey && <Input size="small" style={{ marginTop: 7 }} placeholder="Parent value (optional)" value={field.parentValue || ''} onChange={e => patch(field.key, { parentValue: e.target.value })}/>}</div><Checkbox style={{ marginTop: 10 }} checked={Boolean(field.required)} onChange={e => patch(field.key, { required: e.target.checked })}>Required at closure</Checkbox></div></div>)}</div>
 <div className="note-strip" style={{ marginTop: 18 }}>Add, edit or remove RCA fields, set each type and required flag, and maintain dependent dropdowns. The chosen template is copied into each project; historical case definitions are not overwritten.</div></>}</main></div>
 <Modal title="Create RCA template" open={createOpen} okText="Create template" confirmLoading={creating} okButtonProps={{ disabled: !createName.trim() }} onOk={newTemplate} onCancel={() => !creating && setCreateOpen(false)} destroyOnHidden>
   <label className="field-label" htmlFor="new-rca-template-name">Template name *</label>
   <Input id="new-rca-template-name" autoFocus maxLength={160} disabled={creating} value={createName} placeholder="e.g. ATM issue root cause analysis" onChange={event => setCreateName(event.target.value)} onPressEnter={newTemplate}/>
   <div className="helper-text" style={{ marginTop: 8 }}>Unique code: {rcaTemplateCode(createName) || '—'}</div>
 </Modal></>;
}
