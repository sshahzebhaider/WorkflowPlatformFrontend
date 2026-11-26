/** Coerce browser route identifiers to SQL BIGINT-derived JS numbers in API mode.
 * Browser-only demo routes keep their original string identifiers.
 * IDs above Number.MAX_SAFE_INTEGER cannot be represented losslessly in JS;
 * the live SQL schema uses monotonically allocated values far below that limit.
 */
export function normalizeRouteParams(params, apiMode) {
    if (!apiMode)
        return params;
    return Object.fromEntries(Object.entries(params).map(([key, value]) => {
        if (!key.endsWith('Id') || typeof value !== 'string' || !/^[0-9]+$/.test(value))
            return [key, value];
        const number = Number(value);
        return [key, Number.isSafeInteger(number) ? number : value];
    }));
}
