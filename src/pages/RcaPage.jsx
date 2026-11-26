import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, Checkbox, Form, Input, InputNumber, Popconfirm, Select, Space, Switch, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { PageHeading, Panel, SmallTitle } from '../components/UI';
import { usePlatform } from '../context/PlatformContext';
import { DEFAULT_RCA_FIELDS, rcaFieldsOf } from '../utils/rcaFields';
const defaults = { enabled: false, requiredOnClose: false };
export function RcaPage() {
    const { projectId } = useParams(), { db, update } = usePlatform(), msg = AntApp.useApp().message;
    const project = db.projects.find(p => p.id === projectId);
    const config = { ...defaults, ...(project?.rcaConfig || {}) };
    const [fields, setFields] = useState(() => structuredClone(rcaFieldsOf(config)));
    const [settings, setSettings] = useState(() => ({ ...config }));
    const [newOptions, setNewOptions] = useState({});
    const templates = db.rcaTemplates || [];
    const chooseTemplate = id => { const chosen = templates.find(t => t.id === id); if (!chosen)
        return; setSettings(prev => ({ ...prev, enabled: true, requiredOnClose: true, templateId: id, templateName: chosen.name })); setFields(structuredClone(chosen.fields || DEFAULT_RCA_FIELDS)); };
    useEffect(() => { setFields(structuredClone(rcaFieldsOf(project?.rcaConfig))); setSettings({ ...defaults, ...(project?.rcaConfig || {}) }); }, [projectId]);
    const save = async () => { try {
        await update('projects', projectId, { rcaConfig: { ...settings, fields } });
        msg.success('RCA setup saved for this project');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const patchField = (key, changes) => setFields(rows => rows.map(f => f.key === key ? { ...f, ...changes } : f));
    const addOption = key => { const option = (newOptions[key] || '').trim(); if (!option)
        return; const target = fields.find(f => f.key === key); if ((target.options || []).some(x => x.toLowerCase() === option.toLowerCase()))
        return msg.warning('This option already exists'); patchField(key, { options: [...(target.options || []), option] }); setNewOptions(old => ({ ...old, [key]: '' })); };
    const types = { select: 'Dropdown', toggle: 'Yes / No', number: 'Numeric', text: 'Text', textarea: 'Long text', date: 'Date' };
    return <>
    <PageHeading title="RCA Setup" description={`Configure the RCA fields used when closing a ${String(project?.terms?.case || 'case').toLowerCase()}. Each project has its own settings.`} actions={<Button type="primary" icon={<SaveOutlined />} onClick={save}>Save RCA setup</Button>}/>
    <Panel><div style={{ marginBottom: 15 }}><label className="field-label">RCA template</label><Select style={{ width: '100%', maxWidth: 480 }} value={settings.templateId || undefined} onChange={chooseTemplate} placeholder="Choose a platform RCA template" options={templates.map(t => ({ value: t.id, label: t.name }))}/><div className="helper-text">Templates are created under Platform → RCA Setup. Project-specific changes can be saved below.</div></div><div className="two-column" style={{ gridTemplateColumns: '1fr 1fr' }}><div className="info-row"><div><b>Enable RCA for this project</b><p className="helper-text">Record the root cause after a workflow finishes.</p></div><Switch checked={Boolean(settings.enabled)} onChange={enabled => setSettings(s => ({ ...s, enabled, requiredOnClose: enabled ? s.requiredOnClose : false }))}/></div><div className="info-row"><div><b>RCA required before closure</b><p className="helper-text">Cases stay Pending RCA until the RCA form is submitted.</p></div><Switch disabled={!settings.enabled} checked={Boolean(settings.requiredOnClose)} onChange={requiredOnClose => setSettings(s => ({ ...s, requiredOnClose }))}/></div></div>

    </Panel>
    <div className="rca-options-grid" style={{ marginTop: 18 }}>{fields.map(field => <div className="rca-option-card" key={field.key}>
      <div className="rca-card-heading"><div><strong>{field.label}</strong><p className="helper-text" style={{ marginBottom: 0 }}>{field.description || 'RCA field'}</p></div><Tag color={field.type === 'toggle' ? 'green' : field.type === 'number' ? 'gold' : 'blue'}>{types[field.type] || field.type}</Tag></div>
      <div className="rca-card-body">{field.type === 'select' ? <><div className="rca-chips">{field.options?.map(option => <Tag key={option} closable onClose={e => { e.preventDefault(); patchField(field.key, { options: field.options.filter(x => x !== option) }); }}>{option}</Tag>)}</div><Space.Compact style={{ width: '100%' }}><Input value={newOptions[field.key] || ''} onChange={e => setNewOptions(s => ({ ...s, [field.key]: e.target.value }))} onPressEnter={() => addOption(field.key)} placeholder="Add option..."/><Button type="primary" icon={<PlusOutlined />} onClick={() => addOption(field.key)}>Add</Button></Space.Compact></> : <div className="rca-disabled-preview">{field.type === 'toggle' ? 'Yes    /    No' : `${types[field.type] || 'Value'} input — no options`}</div>}
        {field.parentKey && <div className="helper-text" style={{ marginTop: 9 }}>Unlocked when {fields.find(f => f.key === field.parentKey)?.label || field.parentKey}{field.parentValue ? ` = ${field.parentValue}` : ' is selected'}</div>}
        <Checkbox style={{ marginTop: 11 }} checked={Boolean(field.required)} onChange={e => patchField(field.key, { required: e.target.checked })}>Required at closure</Checkbox>
      </div>
    </div>)}</div>
    <div className="note-strip" style={{ marginTop: 18 }}>RCA options are project-specific and used dynamically on the case-closure form. Toggle and numeric fields have no configurable option list. Changes are saved when you click “Save RCA setup”.</div>
  </>;
}
