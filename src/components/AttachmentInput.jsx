import { useRef, useState } from 'react';
import { App as AntApp, Button, Space } from 'antd';
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { LIVE_API, upload as uploadToApi } from '../services/liveApi';
import { allowedExtensions, attachmentRefs, downloadAttachment, formatFileSize, saveAttachment, validateFile } from '../services/attachmentStore';
/** Ant Design Form.Item value/onChange compatible. Stores files in IndexedDB, not localStorage. */
export function AttachmentInput({ value, onChange, field = {}, disabled = false, readOnly = false, stageContext = null }) {
    const refs = attachmentRefs(value);
    const [uploading, setUploading] = useState(false);
    const picker = useRef(null);
    const msg = AntApp.useApp().message;
    const maxFiles = Math.max(1, Math.min(10, Number(field.maxFiles) || 1));
    const addFiles = async (event) => {
        const files = [...(event.target.files || [])];
        event.target.value = '';
        if (!files.length)
            return;
        setUploading(true);
        const next = [...refs];
        try {
            for (const file of files) {
                const problem = validateFile(file, field, next.length);
                if (problem) {
                    msg.error(`${file.name}: ${problem}`);
                    continue;
                }
                try {
                    if (LIVE_API && stageContext) {
                        const result = await uploadToApi(`/projects/${stageContext.projectId}/case-types/${stageContext.caseTypeId}/attachments/stage`, { fieldKey: field.key }, file);
                        next.push({ id: String(result.stageId), name: result.fileName, size: result.size, storage: 'staged', scanStatus: result.scanStatus });
                    }
                    else
                        next.push(await saveAttachment(file));
                }
                catch (error) {
                    msg.error(`${file.name}: ${error.message}`);
                }
            }
            if (next.length !== refs.length)
                onChange?.(next);
        }
        finally {
            setUploading(false);
        }
    };
    const download = async (item) => {
        try {
            if (item.storage === 'staged') {
                msg.info('This file is staged securely; download is available after case creation.');
                return;
            }
            await downloadAttachment(item);
        }
        catch (error) {
            msg.error(error.message);
        }
    };
    return <div className="case-attachments">
    {refs.map(item => <div className="attachment-chip" key={item.id}>
      <PaperClipOutlined />
      <span className="attachment-filename" title={item.name}>{item.name}<small>{formatFileSize(item.size)}</small></span>
      <Space size={0}>
        <Button type="text" size="small" icon={<DownloadOutlined />} aria-label={`Download ${item.name}`} onClick={() => download(item)}/>
        {!readOnly && !disabled && <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${item.name}`} onClick={() => onChange?.(refs.filter(ref => ref.id !== item.id))}/>}
      </Space>
    </div>)}
    {!readOnly && !disabled && refs.length < maxFiles && <>
      <input ref={picker} type="file" hidden multiple={maxFiles > 1} accept={allowedExtensions(field.allowedFileTypes).join(',')} onChange={addFiles} aria-label="Select attachments"/>
      <Button icon={<UploadOutlined />} loading={uploading} onClick={() => picker.current?.click()}>{refs.length ? 'Add another file' : 'Attach file'}</Button>
      <div className="helper-text" style={{ marginTop: 6 }}>Up to {maxFiles} file{maxFiles > 1 ? 's' : ''} · {field.maxFileMB || 5} MB each · {allowedExtensions(field.allowedFileTypes).join(', ')}</div>
    </>}
    {readOnly && !refs.length && <span className="muted">No attachment</span>}
  </div>;
}
/** Read-only viewer used in case workspace and audit drawer. */
export function AttachmentValue({ value }) {
    return <AttachmentInput value={value} readOnly/>;
}
