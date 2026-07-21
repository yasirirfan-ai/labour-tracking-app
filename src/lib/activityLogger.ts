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
