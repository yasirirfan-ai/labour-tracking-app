import { createClient } from '@supabase/supabase-js';

// Server-side, tab-independent enforcement of the 8h45m daily cap.
//
// Why this exists: the original implementation (src/lib/shiftWatchdog.ts) runs entirely in the
// browser and sweeps ALL clocked-in workers from whichever tab happens to be open — a single
// forgotten/stale tab anywhere (a worker's own phone, an old admin browser) can silently keep
// enforcing an outdated threshold for every worker company-wide, with no way to tell which
// device is at fault. This endpoint performs the exact same check server-side instead, so it
// runs on a fixed schedule regardless of whether any browser has the app open at all.
//
// This is meant to be hit on a schedule by an external cron (e.g. cron-job.org), since Vercel's
// Hobby plan only supports once-a-day cron jobs, which is useless for a per-minute check.
//
// Mirrors src/lib/shiftWatchdog.ts, src/lib/shifts.ts (buildShiftsForWorker), src/lib/timezone.ts
// (pstDayStart/todayPST), and src/lib/taskService.ts (completeAllTasks/performTaskAction 'complete').
// If those change, mirror the change here too — kept as a separate, self-contained file
// (rather than importing from src/lib) so this serverless function's build doesn't depend on the
// Vite-bundled frontend's TypeScript module graph.

const WARNING_THRESHOLD_MS = (8 * 60 + 40) * 60 * 1000; // 8h40m
const AUTO_CLOCKOUT_THRESHOLD_MS = (8 * 60 + 45) * 60 * 1000; // 8h45m — see src/lib/shifts.ts DAILY_SHIFT_CAP_MS

// --- Ported from src/lib/shifts.ts: buildShiftsForWorker ---
function buildShiftsForWorker(workerLogsSorted) {
    const shifts = [];
    const openByBucket = new Map();
    const bucketKey = (log) => log.related_task_id || 'none';

    for (const log of workerLogsSorted) {
        if (log.event_type === 'clock_in') {
            if (openByBucket.size > 0) continue;
            const key = bucketKey(log);
            if (!openByBucket.has(key)) openByBucket.set(key, log);
        } else if (log.event_type === 'clock_out') {
            const key = bucketKey(log);
            const openIn = openByBucket.get(key);
            if (openIn) {
                shifts.push({ clockIn: openIn, clockOut: log });
                openByBucket.delete(key);
            } else if (log.related_task_id === null && openByBucket.size > 0) {
                const openKeys = Array.from(openByBucket.keys());
                const latestKey = openKeys[openKeys.length - 1];
                if (latestKey) {
                    const latestIn = openByBucket.get(latestKey);
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
}

// --- Ported from src/lib/timezone.ts: todayPST / pstDayStart ---
function todayPST() {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(new Date());
}

function pstDayStart(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(utcDate);
    const partVal = (type) => parseInt(parts.find(p => p.type === type).value);
    const tzDate = new Date(Date.UTC(
        partVal('year'), partVal('month') - 1, partVal('day'),
        partVal('hour') === 24 ? 0 : partVal('hour'), partVal('minute'), partVal('second')
    ));
    const offsetMs = utcDate.getTime() - tzDate.getTime();
    return new Date(utcDate.getTime() + offsetMs).toISOString();
}

// --- Ported from src/lib/taskService.ts: performTaskAction('complete') + completeAllTasks ---
async function completeAllTasks(supabase, workerId, asOfDate) {
    const { data: tasks } = await supabase.from('tasks').select('*').eq('assigned_to_id', workerId).neq('status', 'completed');
    if (!tasks) return;

    const nowMs = asOfDate.getTime();
    const nowIso = asOfDate.toISOString();

    for (const task of tasks) {
        const isRunning = task.status === 'active' || task.status === 'clocked_in';
        const diff = isRunning && task.last_action_time
            ? Math.floor((nowMs - new Date(task.last_action_time).getTime()) / 1000)
            : 0;

        const updates = {
            status: 'completed',
            active_seconds: (task.active_seconds || 0) + diff,
            end_time: nowIso,
            last_action_time: nowIso
        };

        await supabase.from('tasks').update(updates).eq('id', task.id);

        await supabase.from('activity_logs').insert({
            worker_id: task.assigned_to_id,
            event_type: 'task_complete',
            description: task.description,
            details: 'Shift Ended',
            related_task_id: task.id,
            timestamp: nowIso
        });
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Cron-Secret, Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const providedSecret = req.headers['x-cron-secret'] || req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
        return res.status(500).json({ error: 'Server misconfigured: CRON_SECRET is not set' });
    }
    if (!providedSecret || providedSecret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({ error: 'Server misconfigured: missing Supabase URL or service role key' });
        }
        const supabase = createClient(supabaseUrl, serviceKey);

        const { data: presentUsers, error: usersError } = await supabase
            .from('users')
            .select('id, name')
            .eq('role', 'employee')
            .eq('status', 'present');

        if (usersError) throw usersError;

        const summary = { checked: presentUsers?.length || 0, warned: [], clockedOut: [] };
        if (!presentUsers || presentUsers.length === 0) {
            return res.status(200).json(summary);
        }

        const now = Date.now();
        const startOfDayStr = pstDayStart(todayPST());

        for (const worker of presentUsers) {
            const { data: dailyLogs, error: logsError } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('worker_id', worker.id)
                .gte('timestamp', startOfDayStr)
                .order('timestamp', { ascending: true });

            if (logsError || !dailyLogs || dailyLogs.length === 0) continue;

            const shifts = buildShiftsForWorker(dailyLogs);
            const openShift = shifts[shifts.length - 1];
            if (!openShift || openShift.clockOut !== null) continue; // status says present but no open shift found — leave alone

            let totalDurationMs = 0;
            for (const shift of shifts) {
                const clockInMs = new Date(shift.clockIn.timestamp).getTime();
                const clockOutMs = shift.clockOut ? new Date(shift.clockOut.timestamp).getTime() : now;
                totalDurationMs += (clockOutMs - clockInMs);
            }

            if (totalDurationMs >= AUTO_CLOCKOUT_THRESHOLD_MS) {
                // Backdate to the exact instant the cap was crossed, same reasoning as the
                // client-side watchdog — see src/lib/shiftWatchdog.ts.
                const openClockInMs = new Date(openShift.clockIn.timestamp).getTime();
                const priorShiftsMs = totalDurationMs - (now - openClockInMs);
                const capMs = openClockInMs + (AUTO_CLOCKOUT_THRESHOLD_MS - priorShiftsMs);
                const capDate = new Date(capMs);
                const capIso = capDate.toISOString();

                await completeAllTasks(supabase, worker.id, capDate);
                await supabase.from('users').update({
                    status: 'offline',
                    availability: 'available',
                    last_status_change: capIso
                }).eq('id', worker.id);
                await supabase.from('activity_logs').insert({
                    worker_id: worker.id,
                    event_type: 'clock_out',
                    description: 'Automatically clocked out — daily duration exceeded 8 hours 45 minutes',
                    timestamp: capIso
                });

                summary.clockedOut.push(worker.name);
            } else if (totalDurationMs >= WARNING_THRESHOLD_MS) {
                const clockInMs = new Date(openShift.clockIn.timestamp).getTime();
                const alreadyWarned = dailyLogs.some(
                    (l) => l.event_type === 'overtime_warning' && new Date(l.timestamp).getTime() > clockInMs
                );
                if (!alreadyWarned) {
                    await supabase.from('activity_logs').insert({
                        worker_id: worker.id,
                        event_type: 'overtime_warning',
                        description: `${worker.name} has been clocked in for over 8 hours 40 minutes and will be automatically clocked out in 5 minutes if still active.`,
                        timestamp: new Date().toISOString()
                    });
                    summary.warned.push(worker.name);
                }
            }
        }

        return res.status(200).json(summary);
    } catch (error) {
        console.error('[check-shift-overtimes] Error:', error);
        return res.status(500).json({ error: 'Server Error', details: error.message });
    }
}
