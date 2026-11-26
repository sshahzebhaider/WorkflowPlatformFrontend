import { parseStructuredResponse } from '../utils/dataResponsePairs.js';
import { prepareMappedRequest } from '../utils/dataSourceContract.js';
/** Runtime value lookup used by response mappings. No arbitrary code evaluation. */
export function valueAtPath(object, path) {
    const parts=String(path || '').trim().replace(/^\$(?=\.|\[)/,'').replace(/\[(\d+)\]/g,'.$1').replace(/^\./,'').split('.');
    if(parts.length>32 || parts.some(p=>!p || ['__proto__','constructor','prototype'].includes(p))) return undefined;
    let current=object;
    for(const part of parts) {
        current=parseStructuredResponse(current);
        if(!current || typeof current!=='object') return undefined;
        if(Array.isArray(current)) { if(!/^\d+$/.test(part) || Number(part)>=current.length) return undefined; current=current[Number(part)]; continue; }
        const keys=Object.keys(current);
        const matches=keys.includes(part)?[part]:keys.filter(k=>k.toLowerCase()===part.toLowerCase());
        if(matches.length!==1)return undefined;
        current=current[matches[0]];
    }
    return current;
}
export function interpolate(template, context = {}) {
    if (typeof template !== 'string')
        return template;
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => String(valueAtPath(context, path) ?? ''));
}
export function prepareOperation(operation, context = {}, includeHeaders = false) {
    const vals = { ...context };
    // Support existing mock workflow context references, e.g. {{fields.cnic}}.
    for (const [kind, obj] of Object.entries(context))
        if (obj && typeof obj === 'object' && !Array.isArray(obj))
            for (const [key, value] of Object.entries(obj))
                vals[`${kind}.${key}`] = value;
    const prepared = prepareMappedRequest(operation, vals);
    return includeHeaders ? prepared : { method: prepared.method, path: prepared.path, body: prepared.body };
}
export function mapOperationResponse(operation, response) {
    const mapped = {};
    const classification = {};
    const intake = {};
    for (const entry of operation.responseMappings || []) {
        const key=String(entry.fieldKey || '').trim();
        if (!entry.path || !/^[a-z0-9_]{1,100}$/i.test(key) || ['__proto__','constructor','prototype','api_response'].includes(key.toLowerCase()))
            continue;
        const value = valueAtPath(response, entry.path);
        if (value === undefined)
            continue;
        const dest = entry.destination === 'classification' ? classification : entry.destination === 'intake' ? intake : mapped;
        dest[key] = value;
    }
    return { context: mapped, classification, intake };
}
// Mock lodgement only: keep regular workflow/test mapping unchanged.
export function lodgementRecordPayloads(operation, response) {
    const mappings = operation.responseMappings || [];
    const normalize = path => String(path || '').trim().replace(/^\$(?=\.|\[)/,'').replace(/\[(\d+)\]/g,'.$1').replace(/^\./,'');
    if(mappings.length) {
        const indexed = mappings.map(m => { const path=normalize(m.path); return { path, index: /(?:^|\.)(\d+)(?=\.|$)/.exec(path) }; }).filter(m=>m.index);
        if(!indexed.length) return [];
        const prefix = indexed[0].path.slice(0,indexed[0].index.index);
        if(indexed.some(m=>m.path.slice(0,m.index.index).toLowerCase()!==prefix.toLowerCase())) throw Error('Map fields from one response record array for case lodgement.');
        const rows = parseStructuredResponse(prefix ? valueAtPath(response,prefix.replace(/\.$/,'')) : response);
        if(!Array.isArray(rows) || rows.length<1 || !rows.every(row=>row && typeof row==='object' && !Array.isArray(row))) return [];
        if(rows.length>25) throw Error('The lookup returned more than 25 records. Refine the search inputs.');
        return rows.map((_,index)=> {
            const projected=mapOperationResponse({...operation,responseMappings:mappings.map(m=>({ ...m, path:normalize(m.path).replace(/(^|\.)(\d+)(?=\.|$)/,(_,separator)=>separator+index) }))},response);
            return {...projected.context,...projected.intake,...projected.classification};
        });
    }
    const arrays=[];
    const walk=(value,depth=0)=>{
        if(depth>8||arrays.length>1)return;
        value=parseStructuredResponse(value);
        if(Array.isArray(value)&&value.length&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row))) arrays.push(value);
        else if(value&&typeof value==='object'&&!Array.isArray(value)) Object.values(value).forEach(v=>walk(v,depth+1));
    };
    walk(response);
    if(arrays.length!==1||arrays[0].length<1)return [];
    if(arrays[0].length>25)throw Error('The lookup returned more than 25 records. Refine the search inputs.');
    return arrays[0];
}
export async function callDataSource(source, operation, context = {}, signal) {
    if (!source || !operation)
        throw Error('Select a data source and operation');
    if (source.kind !== 'REST')
        throw Error('Live execution is supported for REST operations only');
    const request = prepareOperation(operation, context, true);
    const response = await fetch('/api/dev-data-source', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ sourceCode: source.code, baseUrl: source.baseUrl, operation: request, headers: request.headers })
    });
    let payload;
    try {
        payload = await response.json();
    }
    catch {
        throw Error(`Connector returned an invalid response (HTTP ${response.status})`);
    }
    if (!response.ok || !payload.ok)
        throw Error(payload.error || `HTTP ${payload.status || response.status} from data source`);
    return { status: payload.status, body: payload.body, mapped: mapOperationResponse(operation, payload.body) };
}
