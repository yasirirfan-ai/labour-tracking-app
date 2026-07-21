import type { ActivityLog } from '../types';

// Single source of truth for the daily shift ceiling: no worker may accrue more than this in one
// calendar day, whether live-tracked (clock in/out) or entered manually by an admin/manager. Break
// time counts toward it — it is wall-clock time from clock-in to clock-out, not payable time.
export const DAILY_SHIFT_CAP_MS = (8 * 60 + 45) * 60 * 1000; // 8h45m
export const DAILY_SHIFT_CAP_LABEL = '8 hours 45 minutes';

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
            if (openByBucket.size > 0) {
                // A worker cannot be physically clocked in twice simultaneously.
                // If a manual entry was left open but the worker's status got out of sync,
                // they might click "Clock In" on the portal. We ignore the redundant clock_in
                // so their shift continues until their next actual clock_out.
                continue;
            }
            const key = bucketKey(log);
            if (!openByBucket.has(key)) openByBucket.set(key, log);
        } else if (log.event_type === 'clock_out') {
            const key = bucketKey(log);
            const openIn = openByBucket.get(key);
            if (openIn) {
                shifts.push({ clockIn: openIn, clockOut: log });
                openByBucket.delete(key);
            } else if (log.related_task_id === null && openByBucket.size > 0) {
                // If a normal clock_out comes from the Worker Portal but the worker was
                // clocked in via an open-ended manual entry, the bucket keys won't match.
                // We fallback to closing the most recently opened shift.
                const openKeys = Array.from(openByBucket.keys());
                const latestKey = openKeys[openKeys.length - 1];
                if (latestKey) {
                    const latestIn = openByBucket.get(latestKey)!;
                    shifts.push({ clockIn: latestIn, clockOut: log });
                    openByBucket.delete(latestKey);
                }
            }
        }
    }

    openByBucket.forEach((openIn) => {
        shifts.push({ clockIn: openIn, clockOut: null });
    });

    shifts.sort((a, b) => new Date(a.clockIn.timestamp).getTime() - new Date(b.clockIn.timestamp).getTime());

    return shifts;
};

// Sums wall-clock elapsed time (clock-in to clock-out, break time included) across every shift
// found in the given logs. Pass a worker's logs already scoped to a single PST day to get that
// day's total against DAILY_SHIFT_CAP_MS. An open (still clocked-in) shift counts up to "now".
export const getElapsedMsForLogs = (workerLogs: ActivityLog[]): number => {
    const sorted = [...workerLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const shifts = buildShiftsForWorker(sorted);
    const now = Date.now();
    let totalMs = 0;
    for (const shift of shifts) {
        const clockInMs = new Date(shift.clockIn.timestamp).getTime();
        const clockOutMs = shift.clockOut ? new Date(shift.clockOut.timestamp).getTime() : now;
        totalMs += Math.max(0, clockOutMs - clockInMs);
    }
    return totalMs;
};

export interface BreakRange {
    startMs: number;
    endMs: number | null;
    type: 'paid' | 'unpaid';
}

// Coffee/short-rest/restroom breaks are paid — they count as payable shift time and are never
// subtracted from it. Everything else (lunch, personal errand, or any other free-text reason,
// since break reasons aren't a constrained enum in the UI) is unpaid and IS subtracted. This is
// the single source of truth for that classification — every duration calculation that subtracts
// break time from a shift/task's payable total must route through this (or the `type` field it
// produces on BreakRange) rather than re-deriving its own paid/unpaid rule.
export const classifyBreakType = (description: string | null | undefined): 'paid' | 'unpaid' => {
    const desc = (description || '').toLowerCase();
    if (desc.includes('coffee') || desc.includes('short rest') || desc.includes('restroom')) {
        return 'paid';
    }
    return 'unpaid';
};

// Same pairing approach for break_start/break_end. A trailing break_start with no break_end yet
// is returned with endMs: null — the worker is still on break.
export const buildBreaksForWorker = (workerLogsSorted: ActivityLog[]): BreakRange[] => {
    const breaks: BreakRange[] = [];
    let openStart: number | null = null;
    let openType: 'paid' | 'unpaid' = 'unpaid';

    for (const log of workerLogsSorted) {
        const t = new Date(log.timestamp).getTime();
        if (log.event_type === 'break_start') {
            if (openStart === null) {
                openStart = t;
                openType = classifyBreakType(log.description);
            }
        } else if (log.event_type === 'break_end') {
            if (openStart !== null) {
                breaks.push({ startMs: openStart, endMs: t, type: openType });
                openStart = null;
            }
        }
    }
    if (openStart !== null) breaks.push({ startMs: openStart, endMs: null, type: openType });
    return breaks;
};
