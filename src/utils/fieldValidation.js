/** Optional JavaScript regular-expression rules for text-based form fields. */
export const REGEX_FIELD_TYPES = new Set(['text', 'textarea', 'email']);
export function checkRegexDefinition(pattern) {
    if (!pattern?.trim())
        return null;
    if (pattern.length > 256)
        return 'The regex cannot exceed 256 characters.';
    try {
        new RegExp(pattern);
        return null;
    }
    catch (error) {
        return `Invalid regular expression: ${error.message}`;
    }
}
export function matchFieldPattern(field, value) {
    if (!REGEX_FIELD_TYPES.has(field?.type) || !field?.regex?.trim() || value === '' || value == null)
        return true;
    if (checkRegexDefinition(field.regex))
        return false;
    return new RegExp(field.regex).test(String(value));
}
export function patternRule(field) {
    if (!REGEX_FIELD_TYPES.has(field?.type) || !field?.regex?.trim())
        return null;
    return {
        validator: (_, value) => matchFieldPattern(field, value)
            ? Promise.resolve()
            : Promise.reject(new Error(field.regexMessage?.trim() || `${field.label} has an invalid format`))
    };
}

// Format presets, not identity verification. Account/card lengths are configurable.
export const IDENTITY_REGEX_PRESETS = [
    {label:'CNIC (13 digits)', value:'^[0-9]{13}$', message:'Enter a 13-digit CNIC'},
    {label:'CNIC (with dashes)', value:'^[0-9]{5}-[0-9]{7}-[0-9]$', message:'Enter CNIC as 12345-1234567-1'},
    {label:'Pakistan mobile', value:'^(?:03[0-9]{9}|[+]923[0-9]{9})$', message:'Enter a valid Pakistan mobile number'},
    {label:'Account number (digits, 1–34)', value:'^[0-9]{1,34}$', message:'Enter the account number in digits'},
    {label:'Pakistan IBAN (24 characters)', value:'^PK[0-9]{2}[A-Za-z]{4}[A-Za-z0-9]{16}$', message:'Enter a Pakistan IBAN without spaces'},
    {label:'Card number (13–19 digits)', value:'^[0-9]{13,19}$', message:'Enter a 13–19 digit card number'},
    {label:'Email', value:'^[^\\s@]+@[^\\s@]+[.][^\\s@]+$', message:'Enter a valid email address'},
];
