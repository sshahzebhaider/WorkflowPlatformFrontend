import { uid } from '../utils/helpers.js';
/** Local demo attachment storage. The case/form JSON stores metadata only; blobs live in IndexedDB.
 * A real backend must replace this with authenticated uploads and durable document storage.
 */
const DATABASE = 'workflow-platform-attachments-v1';
const STORE = 'files';
export const DEFAULT_FILE_TYPES = '.pdf,.png,.jpg,.jpeg,.doc,.docx';
export function allowedExtensions(config = DEFAULT_FILE_TYPES) {
    const items = String(config || DEFAULT_FILE_TYPES).toLowerCase().split(/[\s,;]+/)
        .map(item => item.trim().replace(/^\*\./, '.').replace(/^(?!\.)/, '.'))
        .filter(item => /^\.[a-z0-9]{1,12}$/.test(item));
    return [...new Set(items.length ? items : DEFAULT_FILE_TYPES.split(','))];
}
export function validateFile(file, field = {}, existingCount = 0) {
    const maxFiles = Math.max(1, Math.min(10, Number(field.maxFiles) || 1));
    const maxMB = Math.max(1, Math.min(20, Number(field.maxFileMB) || 5));
    if (existingCount >= maxFiles)
        return `Only ${maxFiles} attachment${maxFiles === 1 ? '' : 's'} allowed`;
    if (!file || !file.name)
        return 'Choose a file';
    if (!allowedExtensions(field.allowedFileTypes).some(ext => file.name.toLowerCase().endsWith(ext)))
        return `Accepted file types: ${allowedExtensions(field.allowedFileTypes).join(', ')}`;
    if (file.size <= 0)
        return 'This file is empty';
    if (file.size > maxMB * 1024 * 1024)
        return `Each attachment must be ${maxMB} MB or smaller`;
    return null;
}
export function attachmentRefs(value) {
    return (Array.isArray(value) ? value : value ? [value] : []).filter(item => item && typeof item.id === 'string' && typeof item.name === 'string');
}
export function attachmentSummary(value) {
    const items = attachmentRefs(value);
    return items.length ? items.map(f => f.name).join(', ') : '—';
}
export function formatFileSize(bytes = 0) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function openDB() {
    return new Promise((resolve, reject) => {
        if (!globalThis.indexedDB)
            return reject(new Error('Browser attachment storage is unavailable'));
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE))
                db.createObjectStore(STORE, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Attachment storage could not be opened'));
    });
}
async function transaction(mode, operation) {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = operation(tx.objectStore(STORE));
            let result;
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error || new Error('Attachment operation failed'));
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error || new Error('Attachment transaction failed'));
            tx.onabort = () => reject(tx.error || new Error('Attachment transaction aborted'));
        });
    }
    finally {
        db.close();
    }
}
export async function saveAttachment(file) {
    const id = uid();
    const meta = { id, name: file.name, size: file.size, type: file.type || '', storedAt: new Date().toISOString(), storage: 'indexeddb' };
    await transaction('readwrite', store => store.put({ id, file }));
    return meta;
}
export async function getAttachment(id) {
    const entry = await transaction('readonly', store => store.get(id));
    if (!entry?.file)
        throw new Error('File is not on this browser. Uploads will become shared when the backend is connected.');
    return entry.file;
}
export async function downloadAttachment(meta) {
    const file = await getAttachment(meta.id);
    const url = URL.createObjectURL(file);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = meta.name || 'attachment';
        link.style.display = 'none';
        document.body.append(link);
        link.click();
        link.remove();
    }
    finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
