import { patternRule } from '../utils/fieldValidation.js';
import { Alert, Checkbox, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import { AttachmentInput } from './AttachmentInput';
import { LIVE_API } from '../services/liveApi';
import { attachmentSummary } from '../services/attachmentStore';
import { requiredFieldRules } from '../utils/fieldRules.js';
import { availableLookups } from '../utils/helpers';
import { lookupChoices, dependentFieldKeys } from '../utils/lookups';
function Control({ field, options, disabled, readOnly, value, onChange, checked, stageContext }) {
    if (field.type === 'attachment')
        return <AttachmentInput field={field} stageContext={stageContext} value={value} onChange={onChange} disabled={disabled} readOnly={readOnly}/>;
    if (field.type === 'textarea')
        return <Input.TextArea rows={3} placeholder={field.placeholder} disabled={readOnly} value={value} onChange={onChange}/>;
    if (field.type === 'number')
        return <InputNumber style={{ width: '100%' }} disabled={readOnly} value={value} onChange={onChange}/>;
    if (field.type === 'date')
        return <DatePicker style={{ width: '100%' }} disabled={readOnly} value={typeof value === 'string' ? dayjs(value) : value} onChange={onChange}/>;
    if (field.type === 'checkbox')
        return <Checkbox checked={checked} onChange={onChange} disabled={readOnly}>{field.placeholder || field.label}</Checkbox>;
    if (field.type === 'select')
        return <Select disabled={readOnly || disabled} value={value} onChange={onChange} placeholder={disabled ? 'Select parent option first' : field.placeholder || 'Choose an option'} options={options}/>;
    return <Input type={field.type === 'email' ? 'email' : 'text'} placeholder={field.placeholder || field.label} disabled={readOnly} value={value} onChange={onChange}/>;
}
/** Forms are version-pinned on a case, so their fields don't change when an admin edits the original. */
export function CaseFields({ fields = [], db, project, form, base = ['fields'], readOnly = false, stageContext = null, recordSelection = null }) {
    // Watch the exact nested group; don't overwrite user-entered values when a field re-renders.
    const values = Form.useWatch(base, form) || {};
    const lookups = availableLookups(db, project);
    return <>{fields.filter(field => field?.key).map(field => {
            const list = lookups.find(l => l.id === field.lookupId);
            const parentFieldKey = field.parentFieldKey || fields.find(f => f.type === 'select' && f.lookupId === list?.parentListId)?.key;
            const parent = parentFieldKey ? values[parentFieldKey] : undefined;
            const missingParent = field.type === 'select' && Boolean(list?.parentListId) && !parentFieldKey;
            const waitingForParent = field.type === 'select' && Boolean(list?.parentListId) && !parent;
            // Attachment validation must only apply to REQUIRED attachment fields.
            // Optional fields and read-only values should never get an attachment rule.
            const requiredRules = requiredFieldRules(field, readOnly);
            const regexRule = readOnly ? null : patternRule(field);
            const rules = [...requiredRules, ...(regexRule ? [regexRule] : [])];
            const linked = recordSelection?.keys.includes(field.key);
            const selectedValue = linked ? recordSelection.values[recordSelection.index]?.[field.key] : undefined;
            const hasSelectedValue = selectedValue !== undefined && selectedValue !== null && selectedValue !== '';
            return <div key={field.id || field.key}>
      {linked && <div style={{ marginBottom: 8 }}><label className="field-label">{field.label}</label><Select style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={readOnly || field.readOnly} value={recordSelection.index} onChange={recordSelection.onChange} options={recordSelection.values.map((row,index)=>({value:index,label:row[field.key] === undefined || row[field.key] === null || row[field.key] === '' ? '—' : fieldDisplayValue(field,row[field.key],db,project)}))}/></div>}
      {missingParent && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={`${field.label}: parent dropdown not configured`} description="Ask a project admin to add and link the parent lookup field in the form designer."/>}
      <Form.Item hidden={linked && hasSelectedValue} name={[...base, field.key]} label={field.type === 'checkbox' ? null : field.label} valuePropName={field.type === 'checkbox' ? 'checked' : 'value'} rules={rules} validateTrigger={['onChange', 'onBlur']}>
        <Control field={field} stageContext={stageContext} readOnly={readOnly || field.readOnly} disabled={waitingForParent} options={field.type === 'select' ? lookupChoices(lookups, field.lookupId, parent) : []}/>
      </Form.Item>
    </div>;
        })}</>;
}
export function resetDependentFields(changed, fields, form, baseKey = 'fields', db = null, project = null) {
    const lookups = db ? availableLookups(db, project) : [];
    const linked = fields.map(field => {
        if (field.parentFieldKey || !field.lookupId)
            return field;
        const childList = lookups.find(l => l.id === field.lookupId);
        const parentField = fields.find(f => f.type === 'select' && f.lookupId === childList?.parentListId);
        return parentField ? { ...field, parentFieldKey: parentField.key } : field;
    });
    const affected = new Set(Object.keys(changed[baseKey] || {}).flatMap(key => dependentFieldKeys(linked, key)));
    if (affected.size)
        form.setFieldsValue({ [baseKey]: Object.fromEntries([...affected].map(key => [key, undefined])) });
}
export function fieldDisplayValue(field, value, db, project) {
    if (value === null || value === undefined || value === '')
        return '—';
    if (field.type === 'attachment')
        return attachmentSummary(value);
    if (field.type === 'checkbox')
        return value ? 'Yes' : 'No';
    if (field.type === 'date')
        return typeof value === 'string' ? value : dayjs(value).format('DD MMM YYYY');
    if (field.type === 'select') {
        const list = availableLookups(db, project).find(l => l.id === field.lookupId);
        return list?.items?.find(i => i.id === value || i.code === value)?.label || String(value);
    }
    return String(value);
}
