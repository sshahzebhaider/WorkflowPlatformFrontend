/** A holiday may be one day (legacy `date`) or an inclusive date range. */
export const dateKey = value => String(value || '').slice(0, 10);
export function holidayBounds(holiday) {
    const start = dateKey(holiday.startDate || holiday.date);
    const end = dateKey(holiday.endDate || holiday.date || holiday.startDate);
    return { start, end };
}
export function holidaysOn(holidays = [], date) {
    const key = dateKey(date);
    return holidays.filter(holiday => {
        const { start, end } = holidayBounds(holiday);
        return start <= key && key <= end;
    });
}
export function holidayDayCount(holidays = []) {
    const dates = new Set();
    for (const holiday of holidays) {
        const { start, end } = holidayBounds(holiday);
        const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b < a)
            continue;
        for (let d = a; d <= b && d - a <= 366 * 86400000; d += 86400000)
            dates.add(new Date(d).toISOString().slice(0, 10));
    }
    return dates.size;
}
export function addHolidayRange(holidays = [], holiday) {
    const { start, end } = holidayBounds(holiday);
    if (!start || !end || end < start)
        throw new Error('Choose a valid start and end date.');
    const length = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
    if (!Number.isFinite(length) || length > 366)
        throw new Error('A holiday range must be between 1 and 366 days.');
    if (holidays.some(h => {
        const bounds = holidayBounds(h);
        return start <= bounds.end && end >= bounds.start;
    }))
        throw new Error('This range overlaps an existing holiday. Remove or adjust the existing dates first.');
    return [...holidays, { ...holiday, startDate: start, endDate: end, date: start }];
}
/** Remove one day from a range, retaining the remaining days as one or two ranges. */
export function removeHolidayDate(holidays = [], holidayId, date, makeId) {
    const key = dateKey(date);
    return holidays.flatMap(holiday => {
        if (holiday.id !== holidayId)
            return [holiday];
        const { start, end } = holidayBounds(holiday);
        if (key < start || key > end)
            return [holiday];
        if (start === end)
            return [];
        const before = new Date(Date.parse(`${key}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
        const after = new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
        return [
            ...(start < key ? [{ ...holiday, startDate: start, endDate: before, date: start }] : []),
            ...(key < end ? [{ ...holiday, id: makeId(), startDate: after, endDate: end, date: after }] : []),
        ];
    });
}
