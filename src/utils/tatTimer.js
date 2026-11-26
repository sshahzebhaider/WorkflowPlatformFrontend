/**
 * TAT display helpers. SQL owns production due dates: never recalculate them in the browser.
 * SQL Server DATETIME2 values are UTC but its JSON serializer often omits `Z`.
 */
export function parseTatDate(input) {
    if (!input)
        return null;
    if (input instanceof Date)
        return Number.isFinite(input.getTime()) ? input : null;
    if (typeof input === 'number') {
        const date = new Date(input);
        return Number.isFinite(date.getTime()) ? date : null;
    }
    const raw = String(input).trim();
    if (!raw)
        return null;
    // SQL DATETIME2 has no timezone. All workflow dates are written with SYSUTCDATETIME().
    const sqlUtc = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?$/.test(raw);
    const date = new Date(sqlUtc ? `${raw.replace(' ', 'T')}Z` : raw);
    return Number.isFinite(date.getTime()) ? date : null;
}
export function formatTatDuration(ms) {
    const total = Math.max(0, Math.ceil(Math.abs(ms) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor(total % 86400 / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    return `${days ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
export function tatState({ dueAt, closedAt, status, nowMs = Date.now() }) {
    const due = parseTatDate(dueAt);
    if (!due)
        return { kind: 'unconfigured', due: null, deltaMs: null };
    const terminal = ['closed', 'resolved', 'cancelled', 'canceled', 'rejected', 'archived'].includes(String(status || '').toLowerCase());
    const closed = parseTatDate(closedAt);
    if (closed || terminal) {
        return { kind: closed && closed.getTime() > due.getTime() ? 'completed-late' : 'completed',
            due, deltaMs: closed ? closed.getTime() - due.getTime() : null };
    }
    const deltaMs = due.getTime() - nowMs;
    return { kind: deltaMs <= 0 ? 'breached' : 'running', due, deltaMs: Math.abs(deltaMs) };
}
/** Demo-only calendar calculator. Production uses calendar.usp_CalculateBusinessDueAt. */
export function calculateDemoTatDueAt(startAt, workingHours, calendar) {
    const start = parseTatDate(startAt);
    const hours = Number(workingHours);
    if (!start || !calendar || !Number.isFinite(hours) || hours <= 0)
        return null;
    const days = calendar.workingDays;
    if (!Array.isArray(days) || !days.length)
        return null;
    const [sh, sm] = String(calendar.startTime || '09:00').split(':').map(Number);
    const [eh, em] = String(calendar.endTime || '17:00').split(':').map(Number);
    const begin = sh * 60 + sm, end = eh * 60 + em;
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end > 1440 || begin >= end)
        return null;
    const tz = calendar.timezone || 'UTC';
    let formatter;
    try {
        formatter = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        formatter.format(start);
    }
    catch {
        return null;
    }
    const parts = ms => Object.fromEntries(formatter.formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    const toUtc = (y, m, d, minutes) => {
        const desired = Date.UTC(y, m - 1, d, 0, minutes);
        let guess = desired;
        for (let i = 0; i < 4; i++) {
            const p = parts(new Date(guess));
            const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
            const correction = desired - local;
            if (!correction)
                break;
            guess += correction;
        }
        return guess;
    };
    const first = parts(start);
    let day = Date.UTC(first.year, first.month - 1, first.day);
    let cursor = start.getTime(), remaining = hours * 3600000;
    for (let i = 0; i < 6000 && remaining > 0; i++, day += 86400000) {
        const d = new Date(day), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dt = d.getUTCDate();
        if (!days.includes(d.getUTCDay()))
            continue;
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(dt).padStart(2, '0')}`;
        if ((calendar.holidays || []).some(h => iso >= String(h.startDate || '').slice(0, 10) && iso <= String(h.endDate || '').slice(0, 10)))
            continue;
        const open = toUtc(y, m, dt, begin), close = toUtc(y, m, dt, end);
        const windowStart = Math.max(cursor, open);
        if (close <= windowStart)
            continue;
        const used = Math.min(remaining, close - windowStart);
        remaining -= used;
        if (remaining <= 0)
            return new Date(windowStart + used).toISOString();
        cursor = close;
    }
    return null;
}
