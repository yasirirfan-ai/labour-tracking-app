import { supabase } from './supabase';
import { logActivity, updateUserStatus } from './activityLogger';
import { completeAllTasks } from './taskService';
import { buildShiftsForWorker } from './shifts';
import { todayPST, pstDayStart } from './timezone';
import type { ActivityLog } from '../types';

// Any open tab (Admin, Manager, or Worker Portal) that calls checkShiftOvertimes() sweeps
// ALL currently clocked-in workers — not just the current user — so the warning/auto-clockout
// fires as long as someone, anywhere, has the app open.
const WARNING_THRESHOLD_MS = (8 * 60 + 10) * 60 * 1000; // 8h10m
const AUTO_CLOCKOUT_THRESHOLD_MS = (8 * 60 + 15) * 60 * 1000; // 8h15m

let isRunning = false;

export const checkShiftOvertimes = async () => {
    if (isRunning) return; // don't overlap sweeps within the same tab
    isRunning = true;

    try {
        const { data: presentUsers, error: usersError } = await supabase
            .from('users')
            .select('id, name')
            .eq('role', 'employee')
            .eq('status', 'present');

        if (usersError || !presentUsers || presentUsers.length === 0) return;

        const now = Date.now();
        const startOfDayStr = pstDayStart(todayPST());

        for (const worker of presentUsers as { id: string; name: string }[]) {
            const { data: dailyLogs, error: logsError } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('worker_id', worker.id)
                .gte('timestamp', startOfDayStr)
                .order('timestamp', { ascending: true });

            if (logsError || !dailyLogs || dailyLogs.length === 0) continue;

            const shifts = buildShiftsForWorker(dailyLogs as ActivityLog[]);
            const openShift = shifts[shifts.length - 1];
            if (!openShift || openShift.clockOut !== null) continue; // status says present but no open shift found — leave alone

            let totalDurationMs = 0;
            for (const shift of shifts) {
                const clockInMs = new Date(shift.clockIn.timestamp).getTime();
                const clockOutMs = shift.clockOut ? new Date(shift.clockOut.timestamp).getTime() : now;
                totalDurationMs += (clockOutMs - clockInMs);
            }

            if (totalDurationMs >= AUTO_CLOCKOUT_THRESHOLD_MS) {
                await completeAllTasks(worker.id);
                await updateUserStatus(worker.id, 'offline', 'available');
                await logActivity(
                    worker.id,
                    'clock_out',
                    `Automatically clocked out — daily duration exceeded 8 hours 15 minutes`
                );
            } else if (totalDurationMs >= WARNING_THRESHOLD_MS) {
                const clockInMs = new Date(openShift.clockIn.timestamp).getTime();
                const alreadyWarned = (dailyLogs as ActivityLog[]).some(
                    (l) => l.event_type === 'overtime_warning' && new Date(l.timestamp).getTime() > clockInMs
                );
                if (!alreadyWarned) {
                    await logActivity(
                        worker.id,
                        'overtime_warning',
                        `${worker.name} has been clocked in for over 8 hours 10 minutes and will be automatically clocked out in 5 minutes if still active.`
                    );
                }
            }
        }
    } catch (err) {
        console.error('Shift watchdog error:', err);
    } finally {
        isRunning = false;
    }
};
