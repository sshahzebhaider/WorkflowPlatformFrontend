import { availableLookups } from './helpers.js';
// Match only unambiguous field keys, never labels, attachment IDs or arbitrary objects.
export function matchingIntakeValues(fields, payload, db, project) {
    const result = Object.create(null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return result;
    const fieldsByKey = new Set((fields||[]).map(f=>f.key));
    const lists=availableLookups(db || {}, project);
    const deferred=[];
    for (const field of fields || []) {
        if (!field.key || ['attachment','api_response'].includes(field.type) || ['__proto__','constructor','prototype','api_response'].includes(field.key.toLowerCase())) continue;
        const normalize=key=>key.replace(/[^A-Za-z]/g,'').toLowerCase();
        const same=key=>key.toLowerCase()===field.key.toLowerCase();
        let entries=Object.entries(payload).filter(([key])=>same(key));
        if (!entries.length) {
            const walk=(obj,depth=0,match=same)=>{
                if(depth>8 || !obj || typeof obj!=='object' || Array.isArray(obj) || entries.length>1) return;
                for(const [key,v] of Object.entries(obj)) {if(match(key)) entries.push([key,v]); if(v && typeof v==='object') walk(v,depth+1,match);}
            };
            walk(payload);
            if(!entries.length && normalize(field.key) && [...fieldsByKey].filter(key=>normalize(key)===normalize(field.key)).length===1) walk(payload,0,key=>normalize(key)===normalize(field.key));
        }
        if(entries.length!==1) continue;
        const v=entries[0][1];
        if(v==null || !['string','number','boolean'].includes(typeof v)) continue;
        if(field.type==='number') { if(String(v).trim() && typeof v!=='boolean' && Number.isFinite(Number(v))) result[field.key]=Number(v); }
        else if(field.type==='checkbox') { if(typeof v==='boolean') result[field.key]=v; else if(['true','false'].includes(String(v).toLowerCase())) result[field.key]=String(v).toLowerCase()==='true'; }
        else if(field.type==='date') { const date=String(v).match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0]; if(date && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date) result[field.key]=date; }
        else if(field.type==='select') {
            const list=lists.find(l=>l.id===field.lookupId);
            const options=(list?.items||[]).filter(i=>i.active!==false && (String(i.id)===String(v) || String(i.code).toLowerCase()===String(v).toLowerCase() || String(i.label).toLowerCase()===String(v).toLowerCase()));
            if(options.length===1 && !list.parentListId) result[field.key]=options[0].code;
            else if(options.length===1 && list.parentListId && field.parentFieldKey && fieldsByKey.has(field.parentFieldKey)) deferred.push({field,list,item:options[0]});
        } else result[field.key]=String(v);
    }
    // Only fill child options after the matched parent is known and its configured item link is valid.
    for(let i=0;i<deferred.length;i++) for(const {field,list,item} of deferred) {
        const parent=lists.find(l=>l.id===list.parentListId)?.items?.find(p=>p.active!==false && p.code===result[field.parentFieldKey]);
        const links=Array.isArray(item.parentItemIds) ? item.parentItemIds : item.parentItemId!=null ? [item.parentItemId] : [];
        if(parent && links.some(id=>String(id)===String(parent.id))) result[field.key]=item.code;
    }
    return {...result};
}
