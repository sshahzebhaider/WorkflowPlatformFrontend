/** Project-scoped, user-editable RCA field definitions. These are template defaults, not a fixed case schema. */
export const DEFAULT_RCA_FIELDS = [
    { key: 'faulter', label: 'Faulter', description: 'Who is responsible for the case?', type: 'select', required: true, options: ['Customer', 'Bank'] },
    { key: 'faulterWorkgroup', label: 'Faulter Workgroup', description: 'Available when Faulter is Bank.', type: 'select', parentKey: 'faulter', parentValue: 'Bank', options: ['Operations', 'IT', 'Credit', 'Compliance', 'Branch Network', 'Digital'] },
    { key: 'faulterSubWorkgroup', label: 'Faulter Sub-Workgroup', description: 'Available after selecting a workgroup.', type: 'select', parentKey: 'faulterWorkgroup', options: ['Front Office', 'Back Office', 'Support', 'Risk', 'Level 1', 'Level 2'] },
    { key: 'rootCauseReason', label: 'Root Cause Reason', description: 'Reason used when resolving a case.', type: 'select', required: true, options: ['System Error / Downtime', 'Staff Error / Negligence', 'Policy / Process Gap', 'Fraud / Unauthorized Access', 'Incorrect Fee Application', 'Wrong Instructions Provided', 'Customer Error', 'Fraudulent Claim'] },
    { key: 'financialReversal', label: 'Financial Reversal', description: 'Does this resolution require financial reversal?', type: 'toggle', options: ['Yes', 'No'] },
    { key: 'financialReversalType', label: 'Financial Reversal Type', description: 'Available when Financial Reversal is Yes.', type: 'select', parentKey: 'financialReversal', parentValue: 'Yes', options: ['Fee Reversal', 'Transaction Reversal', 'Interest Reversal', 'Penalty Waiver'] },
    { key: 'amount', label: 'Amount', description: 'Amount in the project currency.', type: 'number', min: 0 },
    { key: 'sbpDisposalStatus', label: 'SBP Disposal Status', description: 'Regulatory closure status.', type: 'select', options: ['Resolved in Favor of Customer', 'Resolved in Favor of Bank', 'Partially Resolved', 'Withdrawn', 'Closed'] },
    { key: 'modeOfClosure', label: 'Mode of Closure', description: 'How closure information will be delivered.', type: 'select', options: ['SMS', 'Email', 'PDF Letter'] }
];
export const rcaFieldsOf = config => Array.isArray(config?.fields) ? config.fields : DEFAULT_RCA_FIELDS;
export function isRcaFieldVisible(field, values = {}) {
    if (!field.parentKey)
        return true;
    const selected = values[field.parentKey];
    return selected !== undefined && selected !== null && String(selected) !== '' && (!field.parentValue || String(selected) === String(field.parentValue));
}
export function rcaValidationError(fields, values = {}) {
    for (const field of fields) {
        if (!isRcaFieldVisible(field, values))
            continue;
        if (field.required && (values[field.key] === undefined || values[field.key] === null || values[field.key] === ''))
            return `${field.label} is required`;
        if (field.type === 'select' && values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== '' && !field.options?.includes(values[field.key]))
            return `Invalid option for ${field.label}`;
        if (field.type === 'date' && values[field.key] && !/^\d{4}-\d{2}-\d{2}$/.test(String(values[field.key])))
            return `Invalid date for ${field.label}`;
        if (field.type === 'number' && values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== '' && (!Number.isFinite(Number(values[field.key])) || Number(values[field.key]) < (field.min ?? 0)))
            return `Invalid number for ${field.label}`;
    }
    return null;
}
