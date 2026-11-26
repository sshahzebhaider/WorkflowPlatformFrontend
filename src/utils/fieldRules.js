import { attachmentRefs } from '../services/attachmentStore.js';
/** Return Ant Design Form.Item required rules for a single, editable form field.
 * Keep form validation type-specific; optional values must not gain a file rule.
 */
export function requiredFieldRules(field = {}, readOnly = false) {
    if (readOnly || field.readOnly || !field.required)
        return [];
    const label = field.label || field.key || 'This field';
    if (field.type === 'attachment') {
        return [{
                validator: (_, value) => attachmentRefs(value).length > 0
                    ? Promise.resolve()
                    : Promise.reject(new Error(`${label} requires an attachment`)),
            }];
    }
    if (field.type === 'checkbox') {
        return [{
                validator: (_, value) => value === true
                    ? Promise.resolve()
                    : Promise.reject(new Error(`${label} must be checked`)),
            }];
    }
    return [{ required: true, message: `${label} is required` }];
}
