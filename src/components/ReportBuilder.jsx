import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { saveCSV, slug } from '../utils/helpers';
// Local preview mirrors the columns exposed by the project-scoped SQL reporting API.
const demoSources = [
    { key: 'cases', label: 'Cases', columns: ['caseId', 'reference', 'title', 'status', 'priority', 'createdAt', 'dueAt', 'closedAt'].map(key => ({ key, label: key })) },
    { key: 'caseEvents', label: 'Case logs / events', adminOnly: true, columns: ['eventId', 'reference', 'eventType', 'message', 'actorUserId', 'occurredAt', 'detailsJson'].map(key => ({ key, label: key })) },
    { key: 'auditEvents', label: 'Project audit logs', adminOnly: true, columns: ['auditId', 'entityType', 'entityId', 'actionCode', 'actorUserId', 'occurredAt', 'detailsJson'].map(key => ({ key, label: key })) },
    { key: 'tasks', label: 'Tasks', columns: ['taskId', 'reference', 'status', 'routingStage', 'assignedTo', 'teamId', 'createdAt', 'dueAt', 'completedAt', 'actionCode'].map(key => ({ key, label: key })) },
    { key: 'tatBreaches', label: 'Case TAT breaches', adminOnly: true, columns: ['caseId', 'reference', 'dueAtUtc', 'breachedAtUtc'].map(key => ({ key, label: key })) },
    { key: 'caseTypes', label: 'Case types', columns: ['caseTypeId', 'code', 'name', 'isActive', 'updatedAt'].map(key => ({ key, label: key })) },
    { key: 'teams', label: 'Teams', columns: ['teamId', 'code', 'name', 'isActive', 'createdAt'].map(key => ({ key, label: key })) },
    { key: 'projectStatus', label: 'Project status history', adminOnly: true, columns: ['statusChangeId', 'fromStatus', 'toStatus', 'description', 'changedBy', 'changedAt'].map(key => ({ key, label: key })) },
    { key: 'project', label: 'Project information', columns: ['projectId', 'code', 'name', 'status', 'calendarId', 'defaultSlaMinutes', 'createdAt'].map(key => ({ key, label: key })) }
];
function makeDemoRows(source, db, projectId) {
    const cases = (db.cases || []).filter(c => String(c.projectId) === String(projectId));
    switch (source) {
        case 'cases': return cases.map(c => ({ caseId: c.id, reference: c.reference, title: c.title, status: c.status, priority: c.priority, createdAt: c.createdAt, dueAt: c.dueAt, closedAt: c.closedAt }));
        case 'caseEvents': return cases.flatMap(c => (c.runtime?.events || []).map(e => ({ eventId: e.id, reference: c.reference, eventType: e.kind, message: e.message, actorUserId: e.actorId, occurredAt: e.at, detailsJson: JSON.stringify(e) })));
        case 'auditEvents': return (db.audits || []).filter(a => String(a.projectId) === String(projectId)).map(a => ({ auditId: a.id, entityType: a.entity, entityId: a.entityId, actionCode: a.action, actorUserId: a.actorId, occurredAt: a.date, detailsJson: JSON.stringify(a) }));
        case 'tasks': return cases.flatMap(c => (c.runtime?.tasks || []).map(t => ({ taskId: t.id, reference: c.reference, status: t.status, routingStage: t.routingStage, assignedTo: t.assignedTo, teamId: t.teamId, createdAt: t.createdAt, dueAt: t.dueAt, completedAt: t.completedAt, actionCode: t.action })));
        case 'caseTypes': return (db.caseTypes || []).filter(t => String(t.projectId) === String(projectId)).map(t => ({ caseTypeId: t.id, code: t.code, name: t.name, isActive: t.active, updatedAt: t.updatedAt }));
        case 'teams': return (db.teams || []).filter(t => String(t.projectId) === String(projectId)).map(t => ({ teamId: t.id, code: t.code, name: t.name, isActive: t.active, createdAt: t.createdAt }));
        case 'project': return (db.projects || []).filter(p => String(p.id) === String(projectId)).map(p => ({ projectId: p.id, code: p.code, name: p.name, status: p.status, calendarId: p.calendarId, defaultSlaMinutes: (p.slaHours || 24) * 60, createdAt: p.createdAt }));
        default: return [];
    }
}
const safeCell = v => {
    const text = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
};
const dateOf = row => row.occurredAt || row.createdAt || row.changedAt || row.updatedAt;
export function ReportBuilder({ db, project, projectId, apiMode, api, canSetup }) {
    const [catalog, setCatalog] = useState(demoSources), [source, setSource] = useState('cases'), [selected, setSelected] = useState([]), [dateRange, setDateRange] = useState(null), [search, setSearch] = useState(''), [rows, setRows] = useState([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [loading, setLoading] = useState(false), [error, setError] = useState(''), [generated, setGenerated] = useState(false), [savedViews, setSavedViews] = useState([]), [reportName, setReportName] = useState(''), [saving, setSaving] = useState(false);
    useEffect(() => {
        let active = true;
        setSource('cases');
        setSelected([]);
        setRows([]);
        setGenerated(false);
        setError('');
        setSavedViews([]);
        if (!apiMode)
            return;
        // Catalog/query and saved definitions are separate backend routes. Missing saved
        // definitions must not prevent the report builder from generating reports.
        setCatalog([]);
        Promise.allSettled([
            api.get(`/projects/${projectId}/reports/catalog`),
            api.get(`/projects/${projectId}/reports/definitions`)
        ]).then(([catalogResult, definitionResult]) => {
            if (!active)
                return;
            if (catalogResult.status === 'fulfilled') {
                setCatalog(Array.isArray(catalogResult.value) ? catalogResult.value : []);
            }
            else {
                const message = catalogResult.reason?.message || 'Could not load reporting catalog.';
                setError(catalogResult.reason?.status === 404 || /404|not found/i.test(message)
                    ? 'Reporting API is missing on the running .NET backend. Deploy ReportingEndpoints.cs, ConfigurationEndpoints.cs and Program.cs, then rebuild and restart the API.'
                    : message);
            }
            if (definitionResult.status === 'fulfilled')
                setSavedViews(definitionResult.value || []);
            else if (catalogResult.status === 'fulfilled')
                setError(`Saved report definitions unavailable: ${definitionResult.reason?.message || 'Backend endpoint failed'}. Reports can still be generated.`);
        });
        return () => { active = false; };
    }, [projectId, apiMode, api]);
    const current = catalog.find(s => s.key === source) || catalog[0] || demoSources[0];
    const reportUnavailable = apiMode && !catalog.length;
    const keys = selected.length ? selected : current.columns.slice(0, 7).map(c => c.key);
    const generate = async (nextPage = 1) => {
        setLoading(true);
        setError('');
        try {
            const from = dateRange?.[0]?.startOf('day')?.toISOString();
            const to = dateRange?.[1]?.endOf('day')?.toISOString();
            let results, amount;
            if (apiMode) {
                const params = new URLSearchParams({ source: current.key, columns: keys.join(','), page: String(nextPage), pageSize: '50' });
                if (from)
                    params.set('fromUtc', from);
                if (to)
                    params.set('toUtc', to);
                if (search.trim())
                    params.set('search', search.trim());
                const response = await api.get(`/projects/${projectId}/reports/query?${params}`);
                results = response.rows || [];
                amount = Number(response.total || 0);
            }
            else {
                const all = makeDemoRows(current.key, db, projectId).filter(row => {
                    const date = dateOf(row);
                    if (from && date && new Date(date) < new Date(from))
                        return false;
                    if (to && date && new Date(date) > new Date(to))
                        return false;
                    return !search || Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()));
                });
                amount = all.length;
                results = all.slice((nextPage - 1) * 50, nextPage * 50);
            }
            setRows(results);
            setTotal(amount);
            setPage(nextPage);
            setGenerated(true);
        }
        catch (e) {
            setRows([]);
            setTotal(0);
            setError(e.message || 'Report could not be generated.');
        }
        finally {
            setLoading(false);
        }
    };
    const saveDefinition = async () => {
        if (!apiMode)
            return setError('Saved report definitions require the SQL-backed API.');
        if (!canSetup)
            return setError('Project Administrator permission is required to save report definitions.');
        if (!reportName.trim())
            return setError('Enter a report name before saving.');
        setSaving(true);
        setError('');
        try {
            await api.post(`/projects/${projectId}/reports/definitions`, { name: reportName.trim(), code: slug(reportName), configJson: { source: current.key, columns: keys, search,
                    fromUtc: dateRange?.[0]?.startOf('day')?.toISOString() || null, toUtc: dateRange?.[1]?.endOf('day')?.toISOString() || null } });
            setSavedViews(await api.get(`/projects/${projectId}/reports/definitions`));
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setSaving(false);
        }
    };
    const loadDefinition = id => {
        const view = savedViews.find(v => String(v.id) === String(id));
        if (!view)
            return;
        try {
            const config = typeof view.configJson === 'string' ? JSON.parse(view.configJson) : view.configJson;
            if (!catalog.some(c => c.key === config.source))
                throw Error('Saved report source is unavailable.');
            setSource(config.source);
            setSelected((config.columns || []).filter(k => catalog.find(c => c.key === config.source)?.columns?.some(f => f.key === k)));
            setSearch(config.search || '');
            setDateRange(config.fromUtc && config.toUtc ? [dayjs(config.fromUtc), dayjs(config.toUtc)] : null);
            setReportName(view.name);
            setGenerated(false);
            setRows([]);
        }
        catch (e) {
            setError(e.message);
        }
    };
    const columns = keys.map(key => ({ title: current.columns.find(f => f.key === key)?.label || key, dataIndex: key, key,
        ellipsis: true, render: v => v == null ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v) }));
    return <div className="case-type-section" style={{ marginTop: 22 }}>
  <h3 style={{ margin: '0 0 6px' }}>Report builder · project records and logs</h3>
  <p className="helper-text">Choose a dataset and its columns. Results are read from this project only. Audit and case-event details require project-admin access.</p>
  {error && <Alert type="error" showIcon message={error} closable onClose={() => setError('')} style={{ marginBottom: 12 }}/>}
  <div className="two-column" style={{ marginBottom: 14 }}>
   <div><label className="field-label">Dataset</label><Select style={{ width: '100%' }} value={current.key} options={catalog.map(s => ({ value: s.key, label: s.label + (s.adminOnly ? ' · admin' : '') }))} onChange={v => { setSource(v); setSelected([]); setGenerated(false); setRows([]); }}/></div>
   <div><label className="field-label">Columns to include</label><Select mode="multiple" maxTagCount="responsive" style={{ width: '100%' }} value={keys} options={current.columns.map(c => ({ value: c.key, label: c.label }))} onChange={setSelected}/></div>
   <div><label className="field-label">Date range (optional)</label><DatePicker.RangePicker style={{ width: '100%' }} value={dateRange} onChange={setDateRange}/></div>
   <div><label className="field-label">Search (optional)</label><Input value={search} onChange={e => setSearch(e.target.value)} onPressEnter={() => generate(1)} placeholder="Reference, event, action or name" maxLength={200}/></div>
  </div>
  <Space wrap style={{ marginBottom: 14 }}>
   <Button type="primary" loading={loading} disabled={reportUnavailable} onClick={() => generate(1)}>Generate report</Button>
   <Button disabled={!generated || !rows.length} onClick={() => saveCSV(`${project?.code || 'project'}-${source}-page-${page}.csv`, keys, rows.map(r => Object.fromEntries(keys.map(k => [k, safeCell(r[k])]))))}>Export current page CSV</Button>
   {generated && <Typography.Text type="secondary">{total} matching record(s) · up to 50 per page</Typography.Text>}
  </Space>
  {generated && <Table rowKey={(row, i) => `${source}-${page}-${i}`} size="small" scroll={{ x: 'max-content' }} loading={loading} columns={columns} dataSource={rows} pagination={{ current: page, total, pageSize: 50, showSizeChanger: false, onChange: p => generate(p) }}/>}
  <div className="two-column" style={{ marginTop: 20 }}>
    <div><label className="field-label">Save report definition (Project Admin)</label><Space.Compact style={{ width: '100%' }}><Input value={reportName} onChange={e => setReportName(e.target.value)} maxLength={200} placeholder="Report name"/><Button disabled={!canSetup} loading={saving} onClick={saveDefinition}>Save</Button></Space.Compact></div>
    <div><label className="field-label">Load saved report</label><Select allowClear style={{ width: '100%' }} placeholder="Select a saved report" options={savedViews.map(v => ({ value: v.id, label: v.name }))} onChange={loadDefinition}/></div>
  </div>
  <p className="helper-text" style={{ marginTop: 14 }}>CSV exports only the currently loaded page. For very large reports use filtered date ranges and successive pages. Raw audit details may contain sensitive data; restrict report access accordingly.</p>
 </div>;
}
