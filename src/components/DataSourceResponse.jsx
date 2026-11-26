import { Select, Table, Typography } from 'antd';
import { responseFieldPairs, mappedResponseFieldPairs, responseRecordRows } from '../utils/dataResponsePairs';
/** Read-only, layout-consistent presentation of a verified API response. */
export function DataSourceResponse({ data, fields, title = 'Data received from source', recordSelection = null }) {
    const linked = recordSelection?.records?.length > 1;
    const rows = linked ? responseRecordRows(recordSelection.records) : Array.isArray(fields) ? mappedResponseFieldPairs(fields) : responseFieldPairs(data);
    return <div className="case-intake-panel" style={{ margin: '18px 0' }}>
    <div className="small-title">{title}</div>
    <Table size="small" rowKey={row => row.path} bordered pagination={rows.length > 12 ? { pageSize: 12, showSizeChanger: false } : false} dataSource={rows} locale={{ emptyText: 'The API returned no displayable fields.' }} columns={[
            { title: 'Field', dataIndex: 'path', width: '46%', render: value => <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>{value}</Typography.Text> },
            { title: 'Value', dataIndex: 'value', render: (value,row) => linked ? <Select aria-label={row.path} style={{ width: '100%' }} showSearch optionFilterProp="label" value={recordSelection.index} onChange={recordSelection.onChange} options={row.options}/> : <Typography.Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(value ?? '—')}</Typography.Text> }
        ]}/>
  </div>;
}
