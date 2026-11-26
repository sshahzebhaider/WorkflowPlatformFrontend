import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, CheckOutlined, EyeOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNumericParams as useParams } from '../utils/useNumericParams';
import { usePlatform } from '../context/PlatformContext';
import { PageHeading, Panel, PageEmpty, SmallTitle, InfoRow } from '../components/UI';
import { AutoCode } from '../components/AutoCode';
import { CaseFields } from '../components/CaseFields';
import { caseTypeLookupFields } from '../utils/caseTypeLookups';
import { availableLookups, slug, uid } from '../utils/helpers';
import { validateLookupItemRows, lookupItemsFromRows } from '../utils/lookupItemEditor.js';
import { operationInputDefinitions } from '../utils/lodgementIntegration.js';
const empty = { name: '', description: '', tatMode: 'working', formId: null, workflowId: null, lookupListIds: [], requiredLookupIds: [], lockedValues: {}, defaultLookupValues: {}, lodgementIntegration: null, status: 'Draft', version: 0 };
const editDraft = t => ({ ...structuredClone(t), ...(t.draftConfig || {}) });
const fieldsOf = (db, project, draft) => caseTypeLookupFields(db, project, draft || {});
export function CaseTypesPage() {
    const { projectId } = useParams(), { db, add, update } = usePlatform(), message = AntApp.useApp().message;
    const project = db.projects.find(p => p.id === projectId), term = project?.terms?.case || 'Case';
    const types = db.caseTypes.filter(t => t.projectId === projectId), forms = db.forms.filter(f => f.projectId === projectId), workflows = db.workflows.filter(w => w.projectId === projectId), lookups = availableLookups(db, project);
    const [lookupModal, setLookupModal] = useState(false), [newLookupName, setNewLookupName] = useState(''), [newLookupRows, setNewLookupRows] = useState(() => [{ key: uid(), label: '', parentItemIds: [] }]), [newLookupParent, setNewLookupParent] = useState(null), [lookupBusy, setLookupBusy] = useState(false);
    const [selectedId, setSelectedId] = useState(null), [draft, setDraft] = useState(null), [dirty, setDirty] = useState(false), [preview, setPreview] = useState(false), [search, setSearch] = useState(''), [previewForm] = Form.useForm();
    const selected = types.find(t => t.id === selectedId) || types[0];
    useEffect(() => { if (selected) {
        setSelectedId(selected.id);
        setDraft(editDraft(selected));
        setDirty(false);
    }
    else if (!draft?.isNew)
        setDraft(null); }, [selected?.id, projectId]);
    const choose = t => { setSelectedId(t.id); setDraft(editDraft(t)); setDirty(false); };
    const newType = () => { setSelectedId(null); setDraft({ ...structuredClone(empty), isNew: true }); setDirty(false); };
    const patch = changes => { setDraft(d => ({ ...d, ...changes })); setDirty(true); };
    const save = async (publish = false) => {
        if (!draft?.name?.trim())
            return message.error(`${term} type name is required`);
        const code = slug(draft.name);
        if (types.some(t => t.code === code && t.id !== draft.id))
            return message.error('A type with this name already exists');
        if (publish && (!draft.formId || !draft.workflowId))
            return message.error('Select an intake form and workflow before publishing');
        if (publish && forms.find(f => f.id === draft.formId)?.status !== 'Published')
            return message.error('Publish the intake form before publishing the case type.');
        if (publish && workflows.find(w => w.id === draft.workflowId)?.status !== 'Published')
            return message.error('Publish the attached workflow first');
        const ds = draft.lodgementIntegration;
        // Case Type selects ONLY the approved source and operation. API inputs are
        // collected separately before intake at the New Case screen.
        if (publish && ds?.operationId) {
            const source = db.dataSources.find(s => project?.dataSourceIds?.includes(s.id) && s.operations?.some(o => o.id === ds.operationId));
            if (!source)
                return message.error('Choose an approved data source and operation.');
        }
        const tatHours = Number(draft.slaHours ?? project?.slaHours ?? 24);
        if (!Number.isSafeInteger(tatHours) || tatHours < 1 || tatHours > 8760)
            return message.error('TAT must be between 1 and 8,760 hours.');
        const tatMode = draft.tatMode || 'working';
        if (!['working', 'elapsed'].includes(tatMode))
            return message.error('Select Working Hours or Calendar Hours.');
        const version = publish ? Math.max(0, draft.version || 0) + 1 : draft.version || 0;
        const payload = { ...draft, slaHours: tatHours, tatMode, lodgementIntegration: draft.lodgementIntegration?.operationId ? { operationId: draft.lodgementIntegration.operationId } : null, code, status: publish ? 'Published' : draft.status || 'Draft', version, isNew: undefined,
            _publishNow: publish, publishedConfig: publish ? { slaHours: tatHours, tatMode, formId: draft.formId, workflowId: draft.workflowId, lookupListIds: draft.lookupListIds || [], requiredLookupIds: draft.requiredLookupIds || [], lockedValues: draft.lockedValues || {}, defaultLookupValues: draft.defaultLookupValues || {}, lodgementIntegration: draft.lodgementIntegration?.operationId ? { operationId: draft.lodgementIntegration.operationId } : null, subjectField: draft.subjectField || null, formVersion: forms.find(f => f.id === draft.formId)?.version || 1, workflowVersion: workflows.find(w => w.id === draft.workflowId)?.version || 1, formSnapshot: structuredClone(forms.find(f => f.id === draft.formId)), workflowSnapshot: structuredClone(workflows.find(w => w.id === draft.workflowId)) } : draft.publishedConfig };
        try {
            if (draft.isNew) {
                const row = await add('caseTypes', { ...payload, projectId });
                setSelectedId(row.id);
                setDraft(row);
            }
            else {
                await update('caseTypes', draft.id, payload);
                setDraft(payload);
            }
            setDirty(false);
            message.success(publish ? `${term} type v${version} published` : 'Draft saved');
        }
        catch (error) {
            message.error(error.message);
        }
    };
    const classFields = useMemo(() => fieldsOf(db, project, draft), [db, project, draft]);
    const intake = forms.find(f => f.id === draft?.formId);
    const workflow = workflows.find(w => w.id === draft?.workflowId);
    const options = (draft?.lookupListIds || []).map(id => lookups.find(l => l.id === id)).filter(Boolean);
    // Do not construct either tab until the selected Case Type draft has loaded.
    // React evaluates JSX assigned to variables even when it is not rendered.
    const formTab = draft ? <div className="stack">
  <section className="case-type-section"><SmallTitle><span className="section-step-number">1</span> BASICS</SmallTitle><div className="two-column"><div><label className="field-label">Name *</label><Input value={draft?.name || ''} onChange={e => patch({ name: e.target.value })} placeholder={`e.g. ATM / CDM ${term}`}/></div><div><label className="field-label">Code · generated</label><Input readOnly value={slug(draft?.name || '')}/></div></div></section>
  <section className="case-type-section"><SmallTitle><span className="section-step-number">2</span> INTAKE FORM AND WORKFLOW</SmallTitle><div className="two-column"><div><label className="field-label">Intake form *</label><Select allowClear style={{ width: '100%' }} value={draft?.formId} onChange={formId => patch({ formId })} options={forms.map(f => ({ value: f.id, label: `${f.name} · ${f.status}` }))}/></div><div><label className="field-label">Form version</label><Input readOnly value={intake ? `v${intake.version || 1} · pinned on case` : 'Select form first'}/><div className="helper-text">Submitted records retain the version they started with</div></div><div><label className="field-label">Workflow *</label><Select allowClear style={{ width: '100%' }} value={draft?.workflowId} onChange={workflowId => patch({ workflowId })} options={workflows.map(w => ({ value: w.id, label: `${w.name} · ${w.status}` }))}/></div><div><label className="field-label">Workflow version</label><Input readOnly value={workflow ? `v${workflow.version || 1} · ${workflow.status}` : 'Select workflow first'}/></div></div>{intake && <Space wrap style={{ marginTop: 10 }}>{(intake.fields || []).slice(0, 7).map(f => <Tag key={f.id || f.key}>{f.label}</Tag>)}</Space>}</section>
  <section className="case-type-section"><SmallTitle><span className="section-step-number">3</span> DATA SOURCE AT CASE LODGEMENT</SmallTitle>
    <div style={{ marginTop: 20 }}><SmallTitle>DATA SOURCE ON CASE LODGEMENT (OPTIONAL)</SmallTitle>
    <div className="helper-text" style={{ marginBottom: 10 }}>Optional: choose an approved REST operation. When a user starts a new case, the operation inputs appear before the intake form. The response is shown read-only as field/value pairs.</div>
    <div className="two-column"><div><label className="field-label">Data source</label>
    <Select allowClear style={{ width: '100%' }} value={draft.lodgementSourceId || db.dataSources.find(s => s.operations?.some(o => o.id === draft.lodgementIntegration?.operationId))?.id} onChange={lodgementSourceId => patch({ lodgementSourceId, lodgementIntegration: null })} options={db.dataSources.filter(s => project?.dataSourceIds?.includes(s.id) && s.operations?.length).map(s => ({ value: s.id, label: s.name }))} placeholder="None (do not call a data source)"/></div><div><label className="field-label">Operation</label>
    <Select allowClear style={{ width: '100%' }} value={draft.lodgementIntegration?.operationId} onChange={operationId => patch({ lodgementIntegration: operationId ? { operationId } : null })} options={db.dataSources.filter(s => project?.dataSourceIds?.includes(s.id) && s.id === (draft.lodgementSourceId || db.dataSources.find(q => q.operations?.some(o => o.id === draft.lodgementIntegration?.operationId))?.id)).flatMap(s => (s.operations || []).map(o => ({ value: o.id, label: o.name })))} placeholder="Select an approved operation"/></div></div>
    {(() => {
            const operation = db.dataSources.flatMap(s => s.operations || []).find(o => o.id === draft.lodgementIntegration?.operationId);
            const inputs = operationInputDefinitions(operation);
            return operation && <></>;
        })()}</div>
    </section>

 </div> : null;
    const openLookupModal = () => { setNewLookupName(''); setNewLookupParent(null); setNewLookupRows([{ key: uid(), label: '', parentItemIds: [] }]); setLookupModal(true); };
    const optionsTab = draft ? <div className="stack">
  <section className="case-type-section"><SmallTitle><span className="section-step-number">4</span> CLASSIFICATION DROPDOWNS</SmallTitle><div className="helper-text" style={{ marginBottom: 10 }}>Choose reusable lists from Lookup Manager or create a project-specific list here. Parent and child dropdowns follow the Lookup Manager configuration.</div><Button size="small" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={openLookupModal}>Create dropdown list</Button><Select mode="multiple" style={{ width: '100%' }} value={draft?.lookupListIds || []} onChange={lookupListIds => patch({ lookupListIds, requiredLookupIds: (draft?.requiredLookupIds || []).filter(id => lookupListIds.includes(id)) })} options={lookups.map(l => ({ value: l.id, label: l.name }))} placeholder="Product, Category, Subcategory, Channel..."/><div style={{ marginTop: 13 }}><label className="field-label">Required dropdowns</label><Select mode="multiple" style={{ width: '100%' }} value={draft?.requiredLookupIds || []} onChange={requiredLookupIds => patch({ requiredLookupIds })} options={options.map(l => ({ value: l.id, label: l.name }))}/></div></section>
  <section className="case-type-section"><SmallTitle><span className="section-step-number">5</span> DROPDOWN DEFAULTS (OPTIONAL)</SmallTitle>
 <div className="helper-text" style={{ marginBottom: 12 }}>Choose an optional default value for each configured classification dropdown. Values come from Lookup Manager, and users can change the preselected value while lodging a case.</div>
 <div className="two-column">{classFields.map(f => {
            const list = lookups.find(l => l.id === f.lookupId);
            return <div key={f.key}><label className="field-label">{f.label}</label>
 <Select allowClear style={{ width: '100%' }} value={draft?.defaultLookupValues?.[f.key]} onChange={value => patch({ defaultLookupValues: { ...(draft?.defaultLookupValues || {}), [f.key]: value } })} options={(list?.items || []).filter(i => i.active !== false).map(i => ({ value: i.id, label: i.label }))} placeholder="No default · let user choose"/></div>;
        })}</div>
 </section>
 </div> : null;
    const updateLookupRow = (key, changes) => setNewLookupRows(rows => rows.map(row => row.key === key ? { ...row, ...changes } : row));
    const createLookup = async () => {
        if (!newLookupName.trim())
            return message.error('Enter a dropdown list name.');
        const parentList = lookups.find(l => l.id === newLookupParent) || null;
        if (newLookupParent && !parentList)
            return message.error('Selected parent lookup is unavailable.');
        const validationError = validateLookupItemRows(newLookupRows, parentList);
        if (validationError)
            return message.error(validationError);
        const listCode = slug(newLookupName);
        if (lookups.some(l => l.code === listCode && l.projectId === projectId))
            return message.error('A list with this name already exists in the project.');
        setLookupBusy(true);
        try {
            const items = lookupItemsFromRows(newLookupRows);
            const list = await add('lookups', { projectId, scope: 'project', name: newLookupName.trim(), parentListId: newLookupParent || null, items });
            // A dependent dropdown needs its parent available on the intake form too.
            patch({ lookupListIds: [...new Set([...(draft.lookupListIds || []), ...(newLookupParent ? [newLookupParent] : []), list.id])] });
            setLookupModal(false);
            setNewLookupName('');
            setNewLookupRows([{ key: uid(), label: '', parentItemIds: [] }]);
            setNewLookupParent(null);
            message.success('Dropdown list created in Lookup Manager and assigned to this Case Type.');
        }
        catch (error) {
            message.error(error.message);
        }
        finally {
            setLookupBusy(false);
        }
    };
    return <><PageHeading title={`${term} types`} description={`Configure the case type, forms, workflow, data lookup, dropdowns and configurable TAT on one screen.`}/><div className="case-type-layout">
  <aside className="case-type-sidebar"><div className="toolbar" style={{ marginBottom: 14 }}><SmallTitle>{String(project?.terms?.cases || 'Case').toUpperCase()} TYPES</SmallTitle><Button type="link" onClick={newType} icon={<PlusOutlined />}>New type</Button></div><Input.Search placeholder="Filter" value={search} onChange={e => setSearch(e.target.value)}/><div className="side-list">{types.filter(t => t.name.toLowerCase().includes(search.toLowerCase())).map(t => <button type="button" key={t.id} className={`side-list-item ${selected?.id === t.id && !draft?.isNew ? 'selected' : ''}`} onClick={() => choose(t)} style={{ width: '100%', border: 0, textAlign: 'left', cursor: 'pointer' }}><strong>{t.name}</strong><small>{t.status || 'Draft'} · v{t.version || 0}</small></button>)}</div>{selected && !draft?.isNew && <div className="case-type-usedby"><SmallTitle>USED BY</SmallTitle><InfoRow label={`Open ${(project?.terms?.cases || 'cases').toLowerCase()}`} value={db.cases.filter(c => c.projectId === projectId && c.typeId === selected.id && c.status !== 'Closed').length}/><InfoRow label={`On v${selected.version || 0}`} value={db.cases.filter(c => c.projectId === projectId && c.typeId === selected.id && c.caseTypeSnapshot?.version === (selected.version || 0)).length}/><div className="note-strip" style={{ marginTop: 10 }}>Publishing a new version affects future cases only. Existing cases keep their original form and workflow snapshots.</div></div>}</aside>
  <main className="case-type-main">{!draft ? <PageEmpty title="No type selected" description="Create a new type for this project" actionText="New type" onAction={newType}/> : <><div className="case-type-toolbar"><div><h2>{draft.name || `New ${term.toLowerCase()} type`}</h2><div className="helper-text">{draft.status || 'Draft'} · v{draft.version || 0}{dirty ? ' · Unsaved changes' : ''} <Tag color={dirty ? 'gold' : 'blue'}>{dirty ? 'Draft has changes' : 'Saved'}</Tag></div></div><Space><Button icon={<EyeOutlined />} onClick={() => setPreview(true)}>Preview form</Button><Button icon={<SaveOutlined />} onClick={() => save(false)}>Save draft</Button><Button type="primary" onClick={() => save(true)}>Publish v{(draft.version || 0) + 1}</Button></Space></div>
    {formTab}
    {optionsTab}
    <section className="case-type-section"><SmallTitle><span className="section-step-number">6</span> TAT / SLA &amp; OTHER SETTINGS</SmallTitle>
      <div className="two-column">
        <div><label className="field-label">Case TAT (hours) *</label>
          <Input type="number" min={1} max={8760} step={1} value={draft.slaHours ?? project?.slaHours ?? 24} onChange={e => patch({ slaHours: e.target.value === '' ? null : Number(e.target.value) })}/>
          <div className="helper-text">Starts when the case is created. The calculation follows the selected TAT mode.</div>
        </div>
        <div><label className="field-label">TAT calculation mode *</label>
          <Select style={{ width: '100%' }} value={draft.tatMode || 'working'} onChange={tatMode => patch({ tatMode })} options={[{ value: 'working', label: 'Working Hours — project calendar' }, { value: 'elapsed', label: 'Calendar Hours — 24×7 elapsed time' }]}/>
          <div className="helper-text">Working Hours excludes non-working intervals and holidays. Calendar Hours counts every hour, including weekends and holidays.</div>
        </div>
        <div><label className="field-label">Business calendar</label>
          <Input readOnly value={db.calendars.find(c => c.id === project?.calendarId)?.name || 'No project calendar assigned'}/>
          <div className="helper-text">{(draft.tatMode || 'working') === 'working' ? "Used to calculate this case type's working-hour deadline. Change it under Project → SLA & calendar." : 'Calendar Hours ignores working schedules and holidays.'}</div>
        </div>
        <div><label className="field-label">Description</label><Input.TextArea value={draft.description || ''} rows={3} onChange={e => patch({ description: e.target.value })}/></div>
        <div><label className="field-label">Duplicate subject matching (optional)</label><Select allowClear style={{ width: '100%' }} value={draft.subjectField} onChange={subjectField => patch({ subjectField })} options={intake?.fields?.map(f => ({ value: f.key, label: f.label })) || []} placeholder="Select intake field"/><Checkbox style={{ marginTop: 12 }} checked={Boolean(draft.allowDuplicate)} onChange={e => patch({ allowDuplicate: e.target.checked })}>Allow duplicate values</Checkbox></div>
      </div>
      <></>
    </section>
    <Modal title="Create dropdown for this Case Type" open={lookupModal} onCancel={() => setLookupModal(false)} onOk={createLookup} confirmLoading={lookupBusy} okText="Create and add" destroyOnHidden width={800}>
      <div className="stack">
        <div><label className="field-label">List name *</label><Input maxLength={160} value={newLookupName} onChange={e => setNewLookupName(e.target.value)} placeholder="e.g. City or Branch"/></div>
        <div><label className="field-label">Parent lookup (optional)</label>
          <Select allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} value={newLookupParent} onChange={id => { setNewLookupParent(id ?? null); setNewLookupRows(rows => rows.map(r => ({ ...r, parentItemIds: [] }))); }} options={lookups.filter(l => l.active !== false).map(l => ({ value: l.id, label: l.name }))} placeholder="Standalone dropdown"/>
          <div className="helper-text">Select a parent list to link each new item to one or more of its options.</div>
        </div>
        <div>
          <div className="toolbar" style={{ marginBottom: 9 }}><label className="field-label" style={{ marginBottom: 0 }}>Dropdown items *</label>
            <Button size="small" icon={<PlusOutlined />} disabled={newLookupRows.length >= 200} onClick={() => setNewLookupRows(rows => [...rows, { key: uid(), label: '', parentItemIds: [] }])}>Add item</Button></div>
          <Table size="small" pagination={false} rowKey="key" dataSource={newLookupRows} scroll={{ x: 580 }} columns={[
                { title: '#', width: 45, render: (_, row, index) => index + 1 },
                { title: 'Item name', render: (_, row) => <Input aria-label="Item name" maxLength={240} value={row.label} onChange={e => updateLookupRow(row.key, { label: e.target.value })} placeholder="e.g. Karachi"/> },
                ...(newLookupParent ? [{ title: `Parent items · ${lookups.find(l => l.id === newLookupParent)?.name || ''}`,
                        render: (_, row) => <Select mode="multiple" showSearch optionFilterProp="label" maxTagCount="responsive" style={{ width: '100%', minWidth: 220 }} value={row.parentItemIds} onChange={ids => updateLookupRow(row.key, { parentItemIds: ids })} options={(lookups.find(l => l.id === newLookupParent)?.items || []).filter(i => i.active !== false).map(i => ({ value: String(i.id), label: i.label }))} placeholder="Select one or more parents"/> }] : []),
                { title: '', width: 48, render: (_, row) => <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove item" onClick={() => setNewLookupRows(rows => rows.filter(r => r.key !== row.key))}/> }
            ]}/>
          <div className="helper-text" style={{ marginTop: 8 }}>{newLookupRows.length} item(s) · Add each option as a separate row.</div>
        </div>
        <></>
      </div>
    </Modal>
    <Modal open={preview} width={710} title={`Intake preview · ${intake?.name || 'No form selected'}`} onCancel={() => setPreview(false)} footer={<Button onClick={() => setPreview(false)}>Close</Button>}>{intake?.fields?.length ? <Form form={previewForm} layout="vertical"><CaseFields fields={intake.fields} db={db} project={project} form={previewForm}/></Form> : <div className="helper-text">Select an intake form.</div>}</Modal></>}</main></div></>;
}
