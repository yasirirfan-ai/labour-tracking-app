import { supabase } from './supabase';
import type { ActivityLog } from '../types';

export const logActivity = async (
    workerId: string,
    eventType: ActivityLog['event_type'],
    description: string,
    details?: string,
    taskId?: string,
    timestamp?: string
) => {
    try {
        const { error } = await (supabase.from('activity_logs') as any).insert({
            worker_id: workerId,
            event_type: eventType,
            description,
            details,
            related_task_id: taskId,
            timestamp: timestamp || new Date().toISOString()
        });
        if (error) throw error;
    } catch (err) {
        console.error('Failed to log activity:', err);
        // Best effort - don't crash app if logging fails, but maybe alert?
    }
};

// Closes a worker's currently-open break (if any) before they get clocked out — by any path:
// self-service portal, admin/manager action, or the system's own auto-clockout. Without this, a
// worker clocked out while still "on break" leaves an unclosed break_start behind. The pairing
// logic in buildShiftsForWorker/buildBreaksForWorker then attaches the NEXT break_end it sees —
// which could be days later, for an unrelated break entirely — to that orphaned start, producing
// a break duration spanning that whole gap and corrupting every day's numbers in between (this
// happened for real: see the Felipe Acevedo incident this fixes the root cause of).
export const endOpenBreakIfOnBreak = async (workerId: string, asOf?: Date) => {
    try {
        const { data: user } = await (supabase.from('users') as any).select('availability').eq('id', workerId).single();
        if (user?.availability === 'break') {
            await logActivity(
                workerId,
                'break_end',
                'Break ended automatically (worker clocked out)',
                undefined,
                undefined,
                asOf ? asOf.toISOString() : undefined
            );
        }
    } catch (err) {
        console.error('Failed to close open break on clock-out:', err);
    }
};

export const updateUserStatus = async (
    workerId: string,
    status: 'offline' | 'present',
    availability: 'available' | 'break',
    // Optional override for "now", same purpose as performTaskAction's asOf — keeps
    // last_status_change consistent with a backdated clock-out instead of showing a later time
    // than the activity log / task records it's meant to correspond to.
    asOf?: Date
) => {
    try {
        const { error } = await (supabase.from('users') as any).update({
            status,
            availability,
            last_status_change: (asOf || new Date()).toISOString()
        }).eq('id', workerId);

        if (error) throw error;
    } catch (err) {
        console.error('Failed to update user status:', err);
    }
};
