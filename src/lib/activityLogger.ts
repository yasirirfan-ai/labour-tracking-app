import { supabase } from './supabase';
import type { ActivityLog } from '../types';

export const logActivity = async (
    workerId: string,
    eventType: ActivityLog['event_type'],
    description: string,
    details?: string,
    taskId?: string
) => {
    try {
        const { error } = await (supabase.from('activity_logs') as any).insert({
            worker_id: workerId,
            event_type: eventType,
            description,
            details,
            related_task_id: taskId,
            timestamp: new Date().toISOString()
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
    availability: 'available' | 'break'
) => {
    try {
        const { error } = await (supabase.from('users') as any).update({
            status,
            availability,
            last_status_change: new Date().toISOString()
        }).eq('id', workerId);

        if (error) throw error;
    } catch (err) {
        console.error('Failed to update user status:', err);
    }
};
