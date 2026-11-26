import { Button, Empty, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { initials } from '../utils/helpers';
export function PageHeading({ title, description, actions }) { return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>; }
export function Panel({ title, extra, children, className = '', padding = true }) { return <section className={`panel ${className}`}><>{title && <div className="panel-heading"><strong>{title}</strong>{extra}</div>}</>{padding ? <div className="panel-content">{children}</div> : children}</section>; }
export function Pill({ children, status = 'neutral' }) { return <span className={`pill pill-${String(status).toLowerCase().replace(/\s/g, '')}`}>{children}</span>; }
export function AvatarMark({ name, color }) { return <span className="avatar-mark" style={{ background: color || '#111827' }}>{initials(name)}</span>; }
export function PageEmpty({ title = 'Nothing here yet', description = 'Create your first record to get started.', actionText, onAction }) { return <div className="empty-view"><Empty description={<><strong className="empty-title">{title}</strong><span className="empty-description">{description}</span></>}/>{actionText && <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>{actionText}</Button>}</div>; }
export function StatCard({ label, value, detail, icon, color }) { return <div className="stat-card"><span className="stat-label">{label}</span><div className="stat-value-line"><b>{value}</b><span className="stat-icon" style={{ color: color || '#DC2626' }}>{icon}</span></div><span className="stat-detail">{detail}</span></div>; }
export function SmallTitle({ children, extra }) { return <div className="small-title"><span>{children}</span>{extra}</div>; }
export function InfoRow({ label, value }) { return <div className="info-row"><span>{label}</span><strong>{value || '—'}</strong></div>; }
export function ScopeTag({ scope }) { return <Tag color={scope === 'global' ? 'blue' : 'default'}>{scope === 'global' ? 'Global' : 'Project'}</Tag>; }
