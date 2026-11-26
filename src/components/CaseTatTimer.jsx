import { useEffect, useState } from 'react';
import { ClockCircleOutlined } from '@ant-design/icons';
import { Popover, Tag } from 'antd';
import { formatTatDuration, tatState } from '../utils/tatTimer.js';
import './CaseTatTimer.css';
const labels = {
    running: ['Time remaining', 'On track', 'green'],
    breached: ['Overdue by', 'TAT breached', 'red'],
    completed: ['Timer stopped', 'Completed', 'default'],
    'completed-late': ['Timer stopped', 'Completed after TAT', 'red'],
    unconfigured: ['Timer unavailable', 'Due date missing', 'orange']
};
/** One countdown for cases and tasks. Never resets on reload; uses persisted SQL dueAt. */
export function CaseTatTimer({ dueAt, closedAt, status, calendarName, targetHours, title = 'Case TAT / SLA', compact = false, mini = false, tatMode = 'working' }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const latest = tatState({ dueAt, closedAt, status });
        if (latest.kind !== 'running' && latest.kind !== 'breached')
            return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [dueAt, closedAt, status]);
    const state = tatState({ dueAt, closedAt, status, nowMs: now });
    const [caption, badge, color] = labels[state.kind];
    const dueLabel = state.due ? state.due.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
    const timerText = state.kind === 'running' || state.kind === 'breached' ? formatTatDuration(state.deltaMs) : state.kind === 'unconfigured' ? 'Not set' : 'Stopped';
    const hoursLabel = String(tatMode).toLowerCase() === 'elapsed' ? 'calendar hours' : 'working hours';
    if (mini)
        return <Popover trigger="click" placement="bottomRight" title={title} content={<div className="case-tat-popover">
    <div><span>Status</span><b>{badge}</b></div>
    <div><span>Due date</span><b>{dueLabel || 'Not configured'}</b></div>
    {Number(targetHours) > 0 && <div><span>TAT target</span><b>{targetHours} {hoursLabel}</b></div>}
    {calendarName && String(tatMode).toLowerCase() !== 'elapsed' && <div><span>Business calendar</span><b>{calendarName}</b></div>}
    <p>{state.kind === 'unconfigured' ? 'No case due date is saved. Check Case Type TAT and calendar setup.' :
                    'Countdown shows real elapsed time to the stored case deadline; the deadline itself follows the configured TAT mode.'}</p>
  </div>}>
    <button type="button" className={`case-tat-mini ${state.kind}`} aria-label={`${title}: ${badge}. ${caption}: ${timerText}. Due ${dueLabel || 'not scheduled'}. Click for details.`}>
      <span className="case-tat-mini-label"><ClockCircleOutlined /> Case timer <span className="case-tat-mini-status">{badge}</span></span>
      <strong className="case-tat-mini-count">{timerText}</strong>
      <span className="case-tat-mini-due">Due: {dueLabel || 'Not scheduled'} · Details</span>
    </button>
  </Popover>;
    return <section className={`case-tat-clock ${compact ? 'compact' : ''} ${state.kind === 'breached' ? 'overdue' : ''}`} role="status" aria-label={`${title}: ${badge}`}>
    <div className="case-tat-heading"><span><ClockCircleOutlined /> {title}</span><Tag color={color}>{badge}</Tag></div>
    <div className="case-tat-main"><div><span className="case-tat-subtitle">{caption}</span>
      <strong className="case-tat-value" aria-live="off">{state.kind === 'running' || state.kind === 'breached' ? formatTatDuration(state.deltaMs) : state.kind === 'unconfigured' ? '—' : state.deltaMs != null ? `+${formatTatDuration(state.deltaMs)}` : 'Stopped'}</strong></div>
      <div className="case-tat-details">
        <span>Due: <b>{dueLabel || 'Not scheduled'}</b></span>
        {Number(targetHours) > 0 && <span>Target: <b>{targetHours} working hours</b></span>}
        {calendarName && <span>Calendar: <b>{calendarName}</b></span>}
      </div>
    </div>
    {!compact && <div className="case-tat-footnote">{state.kind === 'unconfigured' ? 'This case has no persisted due date. Check its published TAT and assigned project calendar.' :
                'Live countdown to the business-calendar-adjusted deadline. The countdown shows actual time until due, including non-working hours.'}</div>}
  </section>;
}
