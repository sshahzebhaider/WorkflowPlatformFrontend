import { slug } from './helpers.js';
/** Match SQL's 24-character code normalization and include an uncommitted typed team. */
export function prepareInitialTeams(teams = [], pending = '') {
    const names = [...teams, ...(pending.trim() ? [pending.trim()] : [])].map(name => String(name).trim());
    const codes = names.map(name => slug(name).replace(/_$/, ''));
    if (codes.some(code => !code) || new Set(codes).size !== codes.length)
        throw new Error('Initial team names must be valid and unique');
    if (names.length > 30 || names.some(name => name.length > 160))
        throw new Error('Use at most 30 initial teams, each up to 160 characters');
    return names;
}
