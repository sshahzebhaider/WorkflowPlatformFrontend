import { useMemo, useState } from 'react';
import { App as AntApp, Alert, Button, Checkbox, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag } from 'antd';
import { PlusOutlined, ExperimentOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePlatform } from '../context/PlatformContext';
import { PageHeading, Panel, PageEmpty, SmallTitle } from '../components/UI';
import { AutoCode } from '../components/AutoCode';
import { slug, uid } from '../utils/helpers';
import { callDataSource } from '../services/dataOperations';
import { DataSourceResponse } from '../components/DataSourceResponse';
import { operationInputDefinitions, operationInputs, prepareMappedRequest, requestLocations, requestTypes, validateOperationContract } from '../utils/dataSourceContract.js';
import { operationTestEndpoint } from '../utils/dataSourceTestScope.js';
const blankOperation = () => ({ id: uid(), name: '', code: '', method: 'GET', path: '/', requestTemplate: '', requestParameters: [], headers: {}, responseMappings: [] });
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export function DataSourcesPage() {
    const { db, add, update, apiMode, api, isPlatformAdmin, refresh } = usePlatform(), msg = AntApp.useApp().message;
    const [selectedId, setSelectedId] = useState(null), [open, setOpen] = useState(false), [editing, setEditing] = useState(null), [opDrawer, setOpDrawer] = useState(false), [operation, setOperation] = useState(blankOperation), [testTab, setTestTab] = useState('config'), [testInputs, setTestInputs] = useState({}), [testResult, setTestResult] = useState(null), [headersText, setHeadersText] = useState('{}'), [running, setRunning] = useState(false), [testProjectId, setTestProjectId] = useState(null), [sourceForm] = Form.useForm();
    const source = db.dataSources.find(s => s.id === selectedId) || db.dataSources[0];
    const sourceName = source?.name || 'Data source';
    const useJsonPlaceholder = async () => { try {
        const existing = db.dataSources.find(item => item.code === 'JSONPLACEHOLDER');
        if (existing) {
            setSelectedId(existing.id);
            msg.info('JSONPlaceholder example selected. Choose Get user → Configure / test');
            return;
        }
        const created = await add('dataSources', { name: 'JSONPlaceholder', kind: 'REST', baseUrl: 'https://jsonplaceholder.typicode.com/', description: 'Public sample API, intended for testing with non-sensitive data only.', operations: [{ id: uid(), name: 'Get user', code: 'GET_USER', method: 'GET', path: '/users/{{userId}}', requestTemplate: '', requestParameters: [{ id: uid(), name: 'userId', location: 'path', key: 'userId', type: 'number', required: true }], headers: {}, responseMappings: [{ id: uid(), path: 'name', fieldKey: 'customer_name', destination: 'intake' }, { id: uid(), path: 'email', fieldKey: 'customer_email', destination: 'intake' }, { id: uid(), path: 'address.city', fieldKey: 'city', destination: 'context' }] }, { id: uid(), name: 'Get post', code: 'GET_POST', method: 'GET', path: '/posts/{{postId}}', requestTemplate: '', requestParameters: [{ id: uid(), name: 'postId', location: 'path', key: 'postId', type: 'number', required: true }], headers: {}, responseMappings: [{ id: uid(), path: 'title', fieldKey: 'post_title', destination: 'context' }] }] });
        setSelectedId(created.id);
        msg.success(apiMode ? 'JSONPlaceholder added. Save an operation, then test it here before approving it for projects.' : 'JSONPlaceholder added. Open Get user → Configure / test and use userId 1.');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const show = (row = null) => { setEditing(row); sourceForm.resetFields(); sourceForm.setFieldsValue({ ...row, authenticationScheme: row?.authenticationScheme || 'None', secretAlias: '', kind: 'REST' }); setOpen(true); };
    const saveSource = async (v) => {
        try {
            if (!/^https?:\/\//i.test(v.baseUrl || ''))
                throw Error('Use an HTTP or HTTPS base URL. Nonstandard destinations require server approval.');
            const scheme = v.authenticationScheme || 'None';
            const alias = (v.secretAlias || '').trim().toUpperCase();
            const schemeChanged = !!editing && scheme !== (editing.authenticationScheme || 'None');
            if (scheme !== 'None' && (alias || !editing?.credentialConfigured || schemeChanged) && !/^[A-Z][A-Z0-9_]{0,99}$/.test(alias))
                throw Error('Enter a server secret alias using uppercase letters, numbers or underscores.');
            const credentialSecretRef = scheme === 'None' ? (editing?.credentialConfigured ? '__CLEAR__' : undefined) : alias ? `${scheme === 'Bearer' ? 'BEARER' : 'APIKEY'}:${alias}` : undefined;
            const { secretAlias, authenticationScheme, ...values } = v;
            const data = { ...values, authenticationScheme: scheme, credentialConfigured: scheme !== 'None',
                ...(credentialSecretRef !== undefined ? { credentialSecretRef } : {}) };
            if (editing) {
                await update('dataSources', editing.id, data);
            }
            else {
                const created = await add('dataSources', { ...data, operations: [] });
                setSelectedId(created.id);
            }
            setOpen(false);
            msg.success('Data source saved');
        }
        catch (error) {
            msg.error(error.message || 'Could not save the data source');
        }
    };
    const approveHost = async (approved) => {
        try {
            if (!isPlatformAdmin)
                throw Error('Platform Admin access is required.');
            await api.post(`/data-sources/${source.id}/host-approval`, { approved });
            await refresh();
            msg.success(approved ? 'Host approved for this data source' : 'Host approval revoked');
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    const showOperation = (row = null) => {
        const next = row ? structuredClone(row) : blankOperation();
        setOperation({ ...next, requestTemplate: typeof next.requestTemplate === 'string' ? next.requestTemplate : JSON.stringify(next.requestTemplate && Object.keys(next.requestTemplate).length ? next.requestTemplate : {}, null, 2).replace(/^\{\}$/, '') });
        setHeadersText(JSON.stringify(row?.headers || {}, null, 2));
        setOpDrawer(true);
        setTestResult(null);
        const samples = {};
        for (const param of operationInputDefinitions(next))
            samples[param.name] = param.defaultValue ?? (/id$/i.test(param.name) ? 1 : '');
        setTestInputs(samples);
        setTestProjectId(null);
        setTestTab('config');
    };
    const patch = (key, value) => setOperation(o => ({ ...o, [key]: value }));
    const patchParameter = (id, key, value) => patch('requestParameters', (operation.requestParameters || []).map(p => p.id === id ? { ...p, [key]: value } : p));
    const addParameter = () => patch('requestParameters', [...(operation.requestParameters || []), { id: uid(), name: '', location: 'query', key: '', type: 'string', required: true }]);
    const parseHeaders = () => {
        const headers = JSON.parse(headersText || '{}');
        if (!headers || typeof headers !== 'object' || Array.isArray(headers))
            throw Error('Headers must be a JSON object.');
        for (const [key, value] of Object.entries(headers))
            if (!/^(x-[a-z0-9-]+|accept)$/i.test(key) || typeof value !== 'string')
                throw Error(`Header '${key}' is not supported. Only static X-* and Accept headers are allowed.`);
        return headers;
    };
    const normalizedOperation = () => {
        const headers = parseHeaders();
        const requestTemplate = operation.requestTemplate?.trim() ? JSON.parse(operation.requestTemplate) : {};
        const normalized = { ...operation, headers, requestTemplate, code: slug(operation.name), responseMappings: (operation.responseMappings || []).map(m => ({ ...m, path: String(m.path || "").trim(), fieldKey: String(m.fieldKey || "").trim() })) };
        validateOperationContract(normalized);
        return normalized;
    };
    const persist = async () => {
        try {
            if (!source)
                throw Error('Select a data source.');
            const normalized = normalizedOperation();
            const items = source.operations || [];
            if (items.some(o => o.id !== operation.id && o.code === normalized.code))
                throw Error('Operation name is already used.');
            const saved = await update('dataSources', source.id, { operations: [...items.filter(o => o.id !== operation.id), normalized] });
            const persisted = saved?.operations?.find(o => o.code === normalized.code || o.id === normalized.id);
            setOperation({ ...normalized, id: persisted?.id ?? normalized.id, requestTemplate: operation.requestTemplate });
            msg.success('Operation saved. Case Types can select it; request inputs will be collected before intake.');
        }
        catch (error) {
            msg.error(error.message || 'Could not save the operation');
        }
    };
    const removeOperation = async () => { try {
        await update('dataSources', source.id, { operations: (source.operations || []).filter(o => o.id !== operation.id) });
        setOpDrawer(false);
        msg.success('Operation removed');
    }
    catch (error) {
        msg.error(error.message);
    } };
    const addMapping = () => patch('responseMappings', [...(operation.responseMappings || []), { id: uid(), path: '', fieldKey: '', destination: 'context' }]);
    const patchMapping = (id, key, value) => patch('responseMappings', (operation.responseMappings || []).map(m => m.id === id ? { ...m, [key]: value } : m));
    const inputDefs = operationInputDefinitions(operation);
    const testRequest = () => { try {
        return { request: prepareMappedRequest(normalizedOperation(), testInputs) };
    }
    catch (error) {
        return { error: error.message };
    } };
    const runTest = async () => {
        setTestResult(null);
        setRunning(true);
        try {
            if (apiMode && !source?.hostApproved)
                throw Error('Platform Admin must approve this source URL under Host security first.');
            const normalized = normalizedOperation();
            const { request } = testRequest();
            if (!request)
                throw Error(testRequest().error);
            let result;
            if (apiMode) {
                const persisted = source?.operations?.find(item => item.id === operation.id);
                if (!persisted?.id)
                    throw Error('Save the operation before testing.');
                const keys = ['method', 'path', 'requestTemplate', 'headers', 'responseMappings', 'requestParameters'];
                if (keys.some(key => JSON.stringify(persisted[key] ?? null) !== JSON.stringify(normalized[key] ?? null)))
                    throw Error('Save the updated operation before testing.');
                const projects = db.projects.filter(p => p.dataSourceIds?.includes(source.id));
                const project = projects.find(p => String(p.id) === String(testProjectId)) || (!isPlatformAdmin && projects.length === 1 ? projects[0] : null);
                if (!isPlatformAdmin && !project)
                    throw Error('A project administrator can test only data sources approved for their project. Approve it under Project → Data sources first.');
                // Platform-level connection tests do not grant project access. A project-scoped
                // test still follows its existing approval and authorization rules.
                result = await api.post(operationTestEndpoint(persisted.id, project?.id, isPlatformAdmin), { inputs: testInputs });
            }
            else
                result = await callDataSource(source, normalized, testInputs);
            setTestResult({ ok: true, ...result, request });
            msg.success(`API returned HTTP ${result.status}`);
        }
        catch (error) {
            setTestResult({ ok: false, error: error.message });
            msg.error(error.message);
        }
        finally {
            setRunning(false);
        }
    };
    return <><PageHeading title="Data connections" description="Register approved REST APIs, define path/query/body inputs, test with sample values, and preview them as dynamic field/value pairs." actions={<Space><Button onClick={useJsonPlaceholder} icon={<ExperimentOutlined />}>Add JSONPlaceholder example</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => show()}>New data source</Button></Space>}/>
 <div className="case-type-layout"><aside className="case-type-sidebar"><div className="toolbar"><SmallTitle>DATA SOURCES</SmallTitle><Button type="link" onClick={() => show()}>+ New</Button></div><div className="side-list">{db.dataSources.map(s => <button type="button" key={s.id} className={`side-list-item ${source?.id === s.id ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)} style={{ width: '100%', border: 0, textAlign: 'left', cursor: 'pointer' }}><strong>{s.name}</strong><small>{s.code} · {s.kind}</small></button>)}</div></aside>
 <main className="case-type-main">{source ? <><div className="case-type-toolbar"><div><h2>{source.name}</h2><div className="helper-text">{source.kind} · {source.code}</div></div><Space><Button onClick={() => show(source)}>Edit source</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => showOperation()}>Add operation</Button></Space></div><section className="case-type-section"><div className="two-column"><div><SmallTitle>BASE URL</SmallTitle><div style={{ overflowWrap: 'anywhere' }}>{source.baseUrl || 'Not configured'}</div></div><div><SmallTitle>PROJECTS USING</SmallTitle>{db.projects.filter(p => p.dataSourceIds?.includes(source.id)).length}</div>
 <div><SmallTitle>HOST SECURITY</SmallTitle>
 <Tag color={source.hostApproved ? 'green' : 'gold'}>{source.hostApproved ? 'Approved' : 'Approval needed'}</Tag>
 {apiMode && isPlatformAdmin && <Popconfirm title={source.hostApproved ? 'Revoke external host access?' : 'Approve external host?'} description="Review the saved URL and ensure it belongs to a trusted provider. DNS/IP safety is rechecked on every call." onConfirm={() => approveHost(!source.hostApproved)}>
 <Button size="small">{source.hostApproved ? 'Revoke approval' : 'Approve host'}</Button></Popconfirm>}
 </div></div></section>
 <section className="case-type-section"><SmallTitle>OPERATIONS · {(source.operations || []).length}</SmallTitle><Table rowKey="id" size="small" dataSource={source.operations || []} pagination={false} columns={[{ title: 'Operation', render: (_, o) => <><b>{o.name}</b><div className="helper-text">{o.code}</div></> }, { title: 'Method', dataIndex: 'method', render: s => <Tag>{s}</Tag> }, { title: 'Path', dataIndex: 'path' }, { title: 'Fields mapped', render: (_, o) => (o.responseMappings || []).length }, { title: '', render: (_, o) => <Button type="link" onClick={() => showOperation(o)}>Configure / test</Button> }]}/></section><></></> : <PageEmpty title="No data sources yet" description="Register a source and configure its operations before associating it with a project."/>}</main></div>
 <Modal title={editing ? 'Edit data source' : 'New data source'} open={open} onCancel={() => setOpen(false)} onOk={() => sourceForm.submit()} destroyOnClose><Form form={sourceForm} layout="vertical" onFinish={saveSource}><Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item><AutoCode /><Form.Item name="kind" label="Type" rules={[{ required: true }]}><Select options={[{ value: 'REST', label: 'REST API' }]}/></Form.Item><Form.Item label="Base URL" name="baseUrl" rules={[{ required: true }]}><Input placeholder="https://api.example.com/v1/"/></Form.Item><Form.Item label="Authentication" name="authenticationScheme"><Select options={[{ value: 'None', label: 'None (public API)' }, { value: 'Bearer', label: 'Bearer token (server secret)' }, { value: 'ApiKey', label: 'X-API-Key (server secret)' }]}/></Form.Item>
 <Form.Item noStyle shouldUpdate={(before, after) => before.authenticationScheme !== after.authenticationScheme}>{({ getFieldValue }) => getFieldValue('authenticationScheme') !== 'None' && <Form.Item name="secretAlias" label="Server secret alias (not the token)" extra="Create Integration__Secrets__ALIAS on the API host. Leave blank when editing to keep the existing credential, if the scheme is unchanged."><Input placeholder="CRM_API_TOKEN" autoComplete="off"/></Form.Item>}</Form.Item>
 <Form.Item label="Description" name="description"><Input.TextArea rows={2}/></Form.Item></Form></Modal>
 <Drawer width={Math.min(790, typeof window !== 'undefined' ? window.innerWidth - 16 : 790)} title={`${operation.id && (source?.operations || []).some(o => o.id === operation.id) ? 'Configure' : 'New'} operation · ${sourceName}`} open={opDrawer} onClose={() => setOpDrawer(false)} extra={<Space><Button icon={<SaveOutlined />} type="primary" onClick={persist}>Save operation</Button><Button onClick={() => setOpDrawer(false)}>Close</Button></Space>} destroyOnClose>
 <Tabs activeKey={testTab} onChange={setTestTab} items={[{ key: 'config', label: 'Request & response setup' }, { key: 'test', label: 'Test operation' }]}/>
 {testTab === 'config' ? <div className="stack">
 <div className="two-column"><div><label className="field-label">Operation name *</label><Input value={operation.name} onChange={e => patch('name', e.target.value)} placeholder="Get customer details"/></div><div><label className="field-label">Code · generated</label><Input readOnly value={slug(operation.name)}/></div></div>
 <div className="two-column" style={{ gridTemplateColumns: '150px 1fr' }}><div><label className="field-label">HTTP method</label><Select style={{ width: '100%' }} value={operation.method} onChange={value => patch('method', value)} options={methods.map(value => ({ value, label: value }))}/></div><div><label className="field-label">Relative API path</label><Input value={operation.path} onChange={e => patch('path', e.target.value)} placeholder="/customers/{{customerId}}"/></div></div>
 <section className="case-type-section"><div className="toolbar"><div><SmallTitle>REQUEST INPUTS</SmallTitle><p className="helper-text">Declare values the external API expects. These appear as field mappings in Case Type → More settings and as labeled inputs in Test operation.</p></div><Button icon={<PlusOutlined />} onClick={addParameter}>Add input</Button></div>
 {(operation.requestParameters || []).map((p, index) => <div key={p.id || index} style={{ padding: '12px 0', borderBottom: '1px solid var(--ant-color-border-secondary, #eee)' }}>
 <div className="two-column"><div><label className="field-label">Input name</label><Input placeholder="customerId" value={p.name} onChange={e => patchParameter(p.id, 'name', e.target.value)}/></div><div><label className="field-label">Sent in</label><Select style={{ width: '100%' }} value={p.location} onChange={v => patchParameter(p.id, 'location', v)} options={requestLocations.map(value => ({ value, label: ({ path: 'URL path', query: 'Query parameter', body: 'JSON body', header: 'HTTP header' })[value] }))}/></div>
 <div><label className="field-label">Request key / JSON path</label><Input value={p.key} onChange={e => patchParameter(p.id, 'key', e.target.value)} placeholder={p.location === 'body' ? 'customer.cnic' : p.location === 'header' ? 'X-Channel' : p.location === 'query' ? 'customer_id' : 'customerId'}/></div>
 <div><label className="field-label">Value type</label><Select style={{ width: '100%' }} value={p.type || 'string'} onChange={v => patchParameter(p.id, 'type', v)} options={requestTypes.map(value => ({ value, label: value }))}/></div>
 <div><label className="field-label">Default value (optional)</label><Input value={p.defaultValue ?? ''} onChange={e => patchParameter(p.id, 'defaultValue', e.target.value)} placeholder="No default"/></div>
 <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', paddingBottom: 5 }}><Checkbox checked={p.required !== false} onChange={e => patchParameter(p.id, 'required', e.target.checked)}>Required</Checkbox><Button danger icon={<DeleteOutlined />} onClick={() => patch('requestParameters', (operation.requestParameters || []).filter(x => x.id !== p.id))}>Remove</Button></div></div></div>)}
 {inputDefs.filter(p => p.implicit).length > 0 && <></>}
 {!inputDefs.length && <div className="helper-text">This operation has no dynamic inputs. Add one for query string or JSON body values, or type a placeholder into the URL path.</div>}
 </section>
 <div><label className="field-label">JSON body template (optional, advanced)</label><Input.TextArea rows={4} value={operation.requestTemplate} onChange={e => patch('requestTemplate', e.target.value)} disabled={operation.method === 'GET'} placeholder={'{"customer":{"cnic":"{{cnic}}"}}'}/><p className="helper-text">For POST/PUT/PATCH, body inputs above create JSON automatically (including nested keys). A template can provide fixed fields or legacy placeholders. Mapped body inputs override template properties with their typed values.</p></div>
 <div><label className="field-label">Fixed non-secret headers (JSON)</label><Input.TextArea rows={2} value={headersText} onChange={e => setHeadersText(e.target.value)} placeholder={'{"X-Channel":"PORTAL"}'}/><p className="helper-text">Authorization secrets must stay on the server, not in this setup.</p></div>
 <section className="case-type-section"><div className="toolbar"><SmallTitle>RESPONSE FIELD MAPPING</SmallTitle><Button icon={<PlusOutlined />} onClick={addMapping}>Add mapping</Button></div>
 <div className="helper-text" style={{ marginBottom: 8 }}>Optional: select JSON response paths to keep as named case values. The published case stores these values in case context; submitted answers are not overwritten.</div>
 {(operation.responseMappings || []).map(mapping => <div key={mapping.id} className="mapping-row"><Input placeholder="Response path, e.g. data.name" value={mapping.path} onChange={e => patchMapping(mapping.id, 'path', e.target.value)}/><Select style={{ minWidth: 140 }} value={mapping.destination} onChange={value => patchMapping(mapping.id, 'destination', value)} options={[{ value: 'context', label: 'Case context' }, { value: 'intake', label: 'Intake-related (case context)' }, { value: 'classification', label: 'Classification-related (case context)' }]}/><Input placeholder="Saved field key" value={mapping.fieldKey} onChange={e => patchMapping(mapping.id, 'fieldKey', e.target.value)}/><Button danger icon={<DeleteOutlined />} onClick={() => patch('responseMappings', (operation.responseMappings || []).filter(m => m.id !== mapping.id))}/></div>)}
 </section>
 {(source?.operations || []).some(o => o.id === operation.id) && <Popconfirm title="Delete operation?" onConfirm={removeOperation}><Button danger icon={<DeleteOutlined />} disabled={apiMode} title={apiMode ? 'Deletion requires deactivation in the backend.' : undefined}>Remove operation</Button></Popconfirm>}
 </div> : <div className="stack">
 <Alert type="warning" showIcon message="Real API request" description="Tests call the approved external API. POST/PUT/PATCH/DELETE may change external data; use sandbox credentials and test records."/>
 {apiMode && <div><label className="field-label">{isPlatformAdmin ? 'Test context (optional)' : 'Authorized project *'}</label><Select style={{ width: '100%' }} placeholder={isPlatformAdmin ? 'Platform connection test — no project approval needed' : 'Choose an approved project'} value={testProjectId} allowClear={isPlatformAdmin} onChange={setTestProjectId} options={db.projects.filter(p => p.dataSourceIds?.some(id => String(id) === String(source?.id))).map(p => ({ value: p.id, label: p.name }))}/>{isPlatformAdmin && <p className="helper-text">Leave empty to test the connection as Platform Admin. Select an approved project to test the project-specific execution path. Testing alone does not approve a source for any project.</p>}</div>}
 <SmallTitle>TEST INPUT VALUES</SmallTitle>
 {inputDefs.map(param => <div key={param.name}><label className="field-label">{param.name} {param.required !== false && (param.defaultValue === undefined || param.defaultValue === null || param.defaultValue === '') ? '*' : ''} <span className="helper-text">· {param.location || 'URL/template'} · {param.key || param.name} ({param.type || 'string'})</span></label>
 <Input value={testInputs[param.name] ?? ''} placeholder={param.defaultValue != null ? `Default: ${param.defaultValue}` : `Enter ${param.name}`} onChange={e => setTestInputs(prev => ({ ...prev, [param.name]: e.target.value }))}/></div>)}
 {!inputDefs.length && <div className="helper-text">No inputs required. This test will call the configured operation without parameters.</div>}
 <div><SmallTitle>REQUEST PREVIEW</SmallTitle>{(() => { const preview = testRequest(); return preview.error ? <Alert type="warning" message={preview.error}/> : <pre className="json-preview">{JSON.stringify(preview.request, null, 2)}</pre>; })()}</div>
 <Button type="primary" icon={<ExperimentOutlined />} loading={running} onClick={runTest}>Send API test request</Button>
 {testResult && <><Alert type={testResult.ok ? 'success' : 'error'} showIcon message={testResult.ok ? `HTTP ${testResult.status} · Response received` : 'API test failed'} description={testResult.error}/>{testResult.ok && <><DataSourceResponse title="DYNAMIC RESPONSE · FIELD / VALUE" data={testResult.mapped && Object.keys(testResult.mapped).length ? testResult.mapped : testResult.body}/><SmallTitle>RAW RESPONSE (TEST ONLY)</SmallTitle><pre className="json-preview">{JSON.stringify(testResult.body, null, 2)}</pre><SmallTitle>CONFIGURED RESPONSE MAPPINGS</SmallTitle><pre className="json-preview">{JSON.stringify(testResult.mapped, null, 2)}</pre></>}</>}
 </div>}

 </Drawer></>;
}
