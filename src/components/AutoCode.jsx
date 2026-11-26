import { Form, Input } from 'antd';
import { slug } from '../utils/helpers';
export function AutoCode({ label = 'Code', nameKey = 'name' }) { return <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => <div style={{ marginBottom: 18 }}><label className="field-label">{label}</label><Input readOnly value={slug(getFieldValue(nameKey))} placeholder="Generated from name"/><div className="helper-text">Automatically generated from the name; internal record IDs remain stable.</div></div>}</Form.Item>; }
