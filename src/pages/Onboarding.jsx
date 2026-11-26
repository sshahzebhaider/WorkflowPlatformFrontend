import { useEffect, useState } from 'react';
import { App as AntApp, Alert, Button, Checkbox, Input, InputNumber, Select, Space, Switch } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { PageHeading, Panel, SmallTitle, InfoRow } from '../components/UI';
import { usePlatform } from '../context/PlatformContext';
import { TERM_KEYS, TEMPLATES, defaultTerms } from '../data/seed';
import { slug } from '../utils/helpers';
import { prepareInitialTeams } from '../utils/onboardingTeams.js';
import { DEFAULT_RCA_FIELDS } from '../utils/rcaFields.js';
const DRAFT_KEY = 'workflow-platform-jsx-onboard-draft';
const steps = ['Basics', 'Template', 'Words', 'Teams and people', 'Data sources', 'Calendar and SLA', 'Review and go live'];
const blank = () => ({ name: '', code: '', description: '', owner: '', ownerId: null, adminIds: [], templateKey: 'blank', terms: { ...defaultTerms }, teams: [], dataSourceIds: [], calendarId: null, slaHours: 24, rcaConfig: { enabled: false, requiredOnClose: false, reasonLookupId: null, formId: null, fields: structuredClone(DEFAULT_RCA_FIELDS) } });
function fromStorage() { try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || blank();
}
catch {
    return blank();
} }
export function OnboardProject() {
    const { db, createProject, add, apiMode } = usePlatform(), nav = useNavigate(), msg = AntApp.useApp().message;
    const [values, setValues] = useState(() => { const v = fromStorage(); return { ...v, templateKey: TEMPLATES.some(t => t.key === v.templateKey) ? v.templateKey : 'blank', rcaConfig: { ...blank().rcaConfig, ...(v.rcaConfig || {}) } }; }), [step, setStep] = useState(0);
    const set = (key, val) => setValues(s => ({ ...s, [key]: val }));
    const setTerm = (key, val) => setValues(s => ({ ...s, terms: { ...s.terms, [key]: val } }));
    const setRca = (key, val) => setValues(s => ({ ...s, rcaConfig: { ...s.rcaConfig, [key]: val } }));
    const [teamInput, setTeamInput] = useState('');
    const advance = () => {
        if (step === 0 && (!values.name.trim() || !values.code.trim()))
            return msg.error('Project name and code are required');
        if (step === 0 && db.projects.some(p => p.code.toUpperCase() === slug(values.code)))
            return msg.error('Project code already exists');
        if (step === 0 && values.rcaConfig?.enabled && !db.rcaTemplates.some(t => t.id === values.rcaConfig.templateId))
            return msg.error('Select an RCA template from Platform → RCA Setup');
        if (step === 3 && !values.adminIds.length)
            return msg.error('Assign at least one project administrator');
        // Include a typed name even if the user presses Next rather than Add.
        let nextValues = values;
        if (step === 3) {
            try { nextValues = { ...values, teams: prepareInitialTeams(values.teams, teamInput) }; }
            catch (error) { return msg.error(error.message); }
            setValues(nextValues);
            setTeamInput('');
        }
        if (step === 5 && !values.calendarId)
            return msg.error('Select a business calendar before onboarding');
        if (step < 6) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(nextValues));
            setStep(n => n + 1);
        }
    };
    const goLive = async () => { try {
        const p = await createProject({ ...values, code: slug(values.code) });
        if (!apiMode)
            await Promise.all(values.teams.filter(x => x.trim()).map(name => add('teams', { projectId: p.id, name, members: [], leadId: values.adminIds[0] })));
        localStorage.removeItem(DRAFT_KEY);
        if (p.onboardingWarning) msg.warning(p.onboardingWarning);
        else msg.success(`${p.name} created`);
        nav(`/project/${p.id}`);
    }
    catch (err) {
        msg.error(err.message);
    } };
    return <><PageHeading title="Onboard a project" description="A new project is configuration, not code. Pick a template, name it, connect shared resources and go live."/><div className="onboard-layout"><div className="stack"><Panel className="wizard-steps"><SmallTitle>{values.code || 'NEW PROJECT'}</SmallTitle>{steps.map((s, i) => <div key={s} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} onClick={() => i < step && setStep(i)}><span className="wizard-number">{i < step ? <CheckOutlined /> : i + 1}</span>{s}</div>)}</Panel><Panel><SmallTitle>PROJECT SUMMARY</SmallTitle><InfoRow label="Name" value={values.name}/><InfoRow label="Owner" value={values.owner}/><InfoRow label="Admins" value={`${values.adminIds.length} selected`}/><InfoRow label="Template" value={TEMPLATES.find(t => t.key === values.templateKey)?.name}/><InfoRow label="Calendar" value={db.calendars.find(c => c.id === values.calendarId)?.name}/></Panel></div>
 <div><Panel><div className="small-title" style={{ marginBottom: 19 }}><span><span style={{ background: '#dc2626', color: '#fff', padding: '4px 8px', borderRadius: 4, marginRight: 9 }}>{step + 1}</span>{steps[step]}</span><span className="helper-text" style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>Step {step + 1} of 7</span></div><div className="wizard-form">
 {step === 0 && <div className="stack"><div><label className="field-label">Project name *</label><Input value={values.name} onChange={e => setValues(s => ({ ...s, name: e.target.value, code: slug(e.target.value) }))} placeholder="e.g. People Services"/></div><div><label className="field-label">Project code *</label><Input value={values.code} readOnly placeholder="HR"/><span className="helper-text">Automatically generated from the project name</span></div><div><label className="field-label">Description</label><Input.TextArea rows={3} value={values.description} onChange={e => set('description', e.target.value)} placeholder="What will your team manage?"/></div>  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}><SmallTitle>ROOT CAUSE ANALYSIS</SmallTitle><div className="info-row"><div><strong>Does this project require RCA to close a case?</strong><div className="helper-text">Choose a configured platform RCA template, or leave this off.</div></div><Switch checked={Boolean(values.rcaConfig?.enabled)} onChange={checked => setValues(s => ({ ...s, rcaConfig: { ...s.rcaConfig, enabled: checked, requiredOnClose: checked } }))}/></div>{values.rcaConfig?.enabled && <div style={{ marginTop: 12 }}><label className="field-label">RCA template *</label><Select style={{ width: '100%' }} value={values.rcaConfig?.templateId || undefined} onChange={templateId => setRca('templateId', templateId)} placeholder="Select preconfigured RCA template" options={db.rcaTemplates.map(t => ({ value: t.id, label: t.name }))}/>{!db.rcaTemplates.length && <Alert type="warning" style={{ marginTop: 8 }} message="No RCA templates yet" description="Go to Platform → RCA Setup and create a template first. Your onboarding draft can be saved."/>}</div>}</div><div><label className="field-label">Project owner</label><Select showSearch allowClear optionFilterProp="label" style={{ width: '100%' }} placeholder="Select a user from the directory" value={values.ownerId || db.users.find(u => u.name === values.owner)?.id || undefined} onChange={ownerId => setValues(previous => ({ ...previous, ownerId: ownerId || null, owner: db.users.find(u => u.id === ownerId)?.name || '' }))} options={db.users.filter(user => user.active !== false && user.directoryStatus !== 'resigned').map(user => ({ value: user.id, label: `${user.name} · ${user.username}` }))}/><div className="helper-text">Select a registered directory user. The user's ID is saved with the project.</div></div></div>}
 {step === 1 && <><div className="template-grid">{TEMPLATES.map(t => <button type="button" className={`template-tile ${values.templateKey === t.key ? 'active' : ''}`} key={t.key} onClick={() => set('templateKey', t.key)}><h3><span style={{ color: '#dc2626', marginRight: 8 }}>{values.templateKey === t.key ? '●' : '○'}</span>{t.name}</h3><p>{t.desc}</p><div style={{ marginTop: 13 }}><span className="meta-tag">{t.key === 'blank' ? 'No workflow' : 'Workflow draft'}</span></div></button>)}</div><div className="note-strip" style={{ marginTop: 18 }}>{values.templateKey === 'blank' ? 'No workflow draft will be created. You can design a workflow later.' : 'A workflow draft is created with the selected number of human steps, plus Start and End. Configure teams and forms before publishing.'}</div></>}
 {step === 2 && <><p className="muted">Name things your way. These labels appear throughout the selected project's screens.</p><div className="three-column">{TERM_KEYS.map(t => <div key={t.key}><label className="field-label">{t.label}</label><Input value={values.terms[t.key] || ''} onChange={e => setTerm(t.key, e.target.value)} placeholder={t.example}/></div>)}</div><div className="note-strip" style={{ marginTop: 17 }}>Terminology changes are display labels, not database schema or API field names.</div></>}
 {step === 3 && <div className="stack"><div><label className="field-label">Project administrators *</label><Select mode="multiple" style={{ width: '100%' }} value={values.adminIds} onChange={v => set('adminIds', v)} options={db.users.filter(u => !u.platformAdmin).map(u => ({ value: u.id, label: `${u.name} · ${u.username}` }))}/><div className="helper-text" style={{ marginTop: 7 }}>Administrators can manage forms, workflows, teams, reports and project settings.</div></div><div><label className="field-label">Create initial teams (optional)</label><Space.Compact style={{ width: '100%' }}><Input placeholder="e.g. Review team" value={teamInput} onChange={e => setTeamInput(e.target.value)} onPressEnter={() => { if (teamInput.trim())
        set('teams', [...values.teams, teamInput.trim()]); setTeamInput(''); }}/><Button onClick={() => { if (teamInput.trim())
        set('teams', [...values.teams, teamInput.trim()]); setTeamInput(''); }} icon={<PlusOutlined />}>Add</Button></Space.Compact><div style={{ marginTop: 12, display: 'flex', gap: 7, flexWrap: 'wrap' }}>{values.teams.map((t, i) => <span key={i} className="selected-chip">{t} <a onClick={() => set('teams', values.teams.filter((_, j) => j !== i))}>×</a></span>)}</div></div><></></div>}
 {step === 4 && <div className="stack"><div><label className="field-label">Allowed data sources</label><Select mode="multiple" placeholder="Select registered integrations" style={{ width: '100%' }} value={values.dataSourceIds} onChange={v => set('dataSourceIds', v)} options={db.dataSources.map(s => ({ value: s.id, label: s.name }))}/>{!db.dataSources.length && <div className="helper-text">No data sources registered. You can add them later under Platform → Data connections.</div>}</div><div className="note-strip">Only selected data sources become available in this project's workflow editor. Global lookups remain reusable across the platform.</div></div>}
 {step === 5 && <div className="stack"><div><label className="field-label">Business calendar *</label><Select placeholder="Choose a platform calendar" style={{ width: '100%' }} value={values.calendarId} onChange={v => set('calendarId', v)} options={db.calendars.map(c => ({ value: c.id, label: `${c.name} (${c.timezone})` }))}/>{!db.calendars.length && <Alert style={{ marginTop: 10 }} showIcon type="warning" message="Create a platform business calendar first" description="Go to Platform → Calendars, create one, then return to this wizard. Your draft can be saved."/>}</div><div><label className="field-label">Default SLA target (working hours)</label><InputNumber style={{ width: 180 }} min={1} max={2000} value={values.slaHours} onChange={v => set('slaHours', v)}/></div><div className="note-strip">Working schedules and holidays come from your selected business calendar. Full SLA enforcement requires a backend service; this frontend stores your configuration.</div>
        </div>}
 {step === 6 && <><p>Review all settings before making this project available to its administrators.</p><div className="two-column" style={{ gridTemplateColumns: '1fr 1fr' }}><div><InfoRow label="Project" value={`${values.name} (${slug(values.code)})`}/><InfoRow label="Template" value={TEMPLATES.find(t => t.key === values.templateKey)?.name}/><InfoRow label="Owner" value={values.owner}/><InfoRow label="Project admins" value={values.adminIds.map(id => db.users.find(u => u.id === id)?.name).join(', ')}/></div><div><InfoRow label="Calendar" value={db.calendars.find(c => c.id === values.calendarId)?.name}/><InfoRow label="Default SLA" value={`${values.slaHours} working hours`}/><InfoRow label="Data sources" value={values.dataSourceIds.length}/><InfoRow label="Teams" value={values.teams.length}/><InfoRow label="RCA required for closure" value={values.rcaConfig?.enabled && values.rcaConfig?.requiredOnClose ? 'Yes' : 'No'}/></div></div><div className="note-strip" style={{ marginTop: 18 }}>{apiMode ? 'Go live creates the project and configuration in SQL Server.' : 'Go live saves this project to the local preview.'}</div></>}
 </div></Panel><div className="wizard-controls"><Space><Button disabled={step === 0} icon={<ArrowLeftOutlined />} onClick={() => setStep(s => Math.max(0, s - 1))}>Back</Button><Button onClick={() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)); msg.success('Draft saved in this browser'); }}>Save draft</Button><span className="helper-text">Saved locally · not live yet</span></Space>{step === 6 ? <Button type="primary" onClick={goLive}>Go live <CheckOutlined /></Button> : <Button type="primary" onClick={advance}>Continue <ArrowRightOutlined /></Button>}</div></div></div></>;
}
