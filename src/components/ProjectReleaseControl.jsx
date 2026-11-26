import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { usePlatform } from '../context/PlatformContext';
import { canPromoteRelease, releaseAction, releaseLabel } from '../utils/projectRelease';
import { value } from '../services/apiModels';
const { Text } = Typography;
/** Existing project pages and modal, no additional navigation or release wizard. */
export function ProjectReleaseControl({ project, compact = false }) {
    const { apiMode, api, refresh, isPlatformAdmin, canSetup, db, changeProjectStatus } = usePlatform();
    const msg = AntApp.useApp().message;
    const [open, setOpen] = useState(false);
    const [record, setRecord] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notes, setNotes] = useState('');
    const projectId = project?.id;
    const allowed = Boolean(projectId && (isPlatformAdmin || canSetup(projectId)));
    useEffect(() => {
        if (!open || !allowed)
            return undefined;
        if (!apiMode) {
            setRecord({ release: { stage: project?.status || 'UAT' }, history: (db.projectStatusHistory || [])
                    .filter(h => h.projectId === projectId).slice().reverse() });
            setLoading(false);
            return undefined;
        }
        let active = true;
        setLoading(true);
        setError('');
        setRecord(null);
        api.get(`/projects/${projectId}/release`).then(data => {
            if (active)
                setRecord(data);
        }).catch(e => { if (active)
            setError(e.message); })
            .finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; };
    }, [open, projectId, allowed, apiMode, api, project?.status, db.projectStatusHistory]);
    if (!allowed)
        return null;
    const details = record?.release;
    const stage = value(details, 'stage', project?.status || 'UAT');
    const action = releaseAction(stage);
    const permitted = canPromoteRelease(stage, isPlatformAdmin, allowed);
    const history = (record?.history || []).map(h => ({
        id: value(h, 'statusChangeId', value(h, 'id')),
        from: value(h, 'fromStatus'), to: value(h, 'toStatus'),
        by: value(h, 'actorName'), at: value(h, 'changedAt'),
        notes: value(h, 'description')
    }));
    async function submit() {
        const destination = action.target;
        if (!destination || !permitted)
            return;
        try {
            setBusy(true);
            setError('');
            if (apiMode) {
                await api.post(`/projects/${projectId}/release/promote`, {
                    targetStage: destination, expectedStatus: stage, notes: notes.trim() || null
                });
                await refresh();
            }
            else {
                changeProjectStatus(projectId, destination, notes);
            }
            msg.success(`Project status changed to ${destination}`);
            setOpen(false);
            setRecord(null);
            setNotes('');
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    }
    return <>
    <Button type={compact ? 'link' : 'default'} size={compact ? 'small' : 'middle'} onClick={() => { setError(''); setNotes(''); setOpen(true); }}>
      {compact ? 'Change status / history' : 'Manage status'}
    </Button>
    <Modal title={`Project status · ${project.name}`} open={open} width={690} onCancel={() => { if (!busy)
        setOpen(false); }} footer={null} destroyOnHidden>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 14 }}/>}
      {loading ? <Text type="secondary">Loading project status…</Text> : details && <div className="stack">
        <Space wrap>
          <Text strong>Current project status</Text>
          <Tag color={stage === 'Live' ? 'green' : 'blue'}>{releaseLabel(stage)}</Tag>
        </Space>
        <div className="note-strip">
          Projects begin in QA / UAT. Status changes affect the actual project status in SQL
          and appear in Project Overview and the Projects list. This does not copy data to another database.
        </div>
        {permitted ? <div>
          <label className="field-label">Description (optional)</label>
          <Input.TextArea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder="Optional reason or comments"/>
          <Button type="primary" onClick={submit} loading={busy} style={{ marginTop: 12 }}>
            {action.label}
          </Button>
        </div> : <div className="helper-text">Read-only</div>}
        <div>
          <Text strong>Status history</Text>
          <Table size="small" style={{ marginTop: 9 }} rowKey="id" dataSource={history} pagination={{ pageSize: 5 }} columns={[
                { title: 'Change', render: (_, r) => `${releaseLabel(r.from) || 'Created'} → ${releaseLabel(r.to)}` },
                { title: 'Changed by', dataIndex: 'by' },
                { title: 'When', dataIndex: 'at', render: d => d ? new Date(d).toLocaleString() : '—' },
                { title: 'Description', dataIndex: 'notes', render: x => x || '—', ellipsis: true }
            ]}/>
        </div>
      </div>}
    </Modal>
  </>;
}
