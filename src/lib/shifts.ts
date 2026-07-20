import type { ActivityLog } from '../types';

export interface Shift {
    clockIn: ActivityLog;
    clockOut: ActivityLog | null;
}

// Walks a worker's activity logs (already sorted chronologically) and pairs each clock_in with
// the clock_out that actually closes it. Pairing is bucketed by related_task_id: a Manual Entry's
// clock_in/clock_out (tagged with the task it belongs to) only ever pairs with its own matching
// event, and a real clock-in/out (untagged) only pairs with other untagged events. Without this,
// an unrelated clock_out landing chronologically between a Manual Entry's clock_in and its own
// clock_out would incorrectly close the wrong shift early — e.g. a quick admin clock-out test
// performed while a Manual Entry's clock_in was still technically "open".
// A clock_in seen while its bucket already has one open is treated as a duplicate (e.g. a
// double-submitted Clock In) and ignored, so one real shift never gets split into multiple entries
// that all point at the same clock_out. Any buckets still open at the end are returned as open
// shifts (clockOut: null) — the worker is still on that shift, even if it started on a previous
// calendar day. The result stays sorted by clock_in time, same as the old single-bucket behavior,
// so callers that assume chronological order (e.g. "the last shift is the current one") still work.
export const buildShiftsForWorker = (workerLogsSorted: ActivityLog[]): Shift[] => {
    const shifts: Shift[] = [];
    const openByBucket = new Map<string, ActivityLog>();
    const bucketKey = (log: ActivityLog) => log.related_task_id || 'none';

    for (const log of workerLogsSorted) {
        if (log.event_type === 'clock_in') {
            const key = bucketKey(log);
            if (!openByBucket.has(key)) openByBucket.set(key, log);
        } else if (log.event_type === 'clock_out') {
            const key = bucketKey(log);
            const openIn = openByBucket.get(key);
            if (openIn) {
                shifts.push({ clockIn: openIn, clockOut: log });
                openByBucket.delete(key);
            }
        }
    }

    openByBucket.forEach((openIn) => {
        shifts.push({ clockIn: openIn, clockOut: null });
    });

    shifts.sort((a, b) => new Date(a.clockIn.timestamp).getTime() - new Date(b.clockIn.timestamp).getTime());

    return shifts;
};

export interface BreakRange {
    startMs: number;
    endMs: number | null;
}

// Same pairing approach for break_start/break_end. A trailing break_start with no break_end yet
// is returned with endMs: null — the worker is still on break.
export const buildBreaksForWorker = (workerLogsSorted: ActivityLog[]): BreakRange[] => {
    const breaks: BreakRange[] = [];
    let openStart: number | null = null;
    for (const log of workerLogsSorted) {
        const t = new Date(log.timestamp).getTime();
        if (log.event_type === 'break_start') {
            if (openStart === null) openStart = t;
        } else if (log.event_type === 'break_end') {
            if (openStart !== null) {
                breaks.push({ startMs: openStart, endMs: t });
                openStart = null;
            }
        }
    }
    if (openStart !== null) breaks.push({ startMs: openStart, endMs: null });
    return breaks;
};
