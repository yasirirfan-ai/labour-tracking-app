import { supabase } from './supabase';
import { logActivity } from './activityLogger';
import type { Task } from '../types';

export const performTaskAction = async (
    task: Task,
    action: 'start' | 'pause' | 'resume' | 'complete' | 'auto_pause' | 'auto_resume',
    reason?: string
) => {
    try {
        let updates: any = {};
        const now = new Date().toISOString();
        let eventType: any = null;

        // Calculate time since last update
        // We only add time if the task was 'active' or 'clocked_in'
        const isRunning = task.status === 'active' || task.status === 'clocked_in';
        const diff = isRunning && task.last_action_time
            ? Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000)
            : 0;

        updates.last_action_time = now;

        switch (action) {
            case 'start':
            case 'resume':
                updates.status = 'active';
                if (!task.start_time) updates.start_time = now;
                eventType = action === 'start' ? 'task_start' : 'task_resume';
                break;

            case 'pause': // Manual Pause
                updates.status = 'paused';
                updates.active_seconds = (task.active_seconds || 0) + diff;
                updates.reason = reason;
                eventType = 'task_pause';
                break;

            case 'auto_pause': // Pause due to Worker Break
                updates.status = 'break'; // We use 'break' status to indicate it was auto-paused by global break
                updates.active_seconds = (task.active_seconds || 0) + diff;
                updates.reason = reason || 'Worker on Break';
                eventType = 'task_pause'; // Log as pause
                break;

            case 'auto_resume': // Resume from Worker Break
                // Only resume if it was auto-paused (status === 'break')
                if (task.status !== 'break') return false;
                updates.status = 'active';
                eventType = 'task_resume';
                break;

            case 'complete':
                updates.status = 'completed';
                updates.active_seconds = (task.active_seconds || 0) + diff;
                updates.end_time = now;
                eventType = 'task_complete';
                break;
        }

        // 1. Update Task
        const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', task.id);
        if (error) throw error;

        // 2. Log Activity (if event type exists)
        if (eventType) {
            // Fetch PO Number for better logging
            let logDescription = task.description;
            try {
                if (task.mo_reference) {
                    const { data: mo } = await (supabase
                        .from('manufacturing_orders')
                        .select('po_number')
                        .eq('mo_number', task.mo_reference)
                        .maybeSingle() as any);

                    const poText = mo?.po_number ? `PO: ${mo.po_number}` : '';
                    // Format: "Operation (MO #1 • PO: 123)" or "Operation (MO #1)"
                    const extraInfo = [`MO #${task.mo_reference}`, poText].filter(Boolean).join(' • ');
                    logDescription = `${task.description} (${extraInfo})`;
                }
            } catch (err) {
                console.warn('Could not fetch PO number for log', err);
                logDescription = `${task.description} - ${task.mo_reference}`;
            }

            await logActivity(
                task.assigned_to_id,
                eventType,
                logDescription,
                reason || undefined,
                task.id
            );
        }

        return true;
    } catch (err) {
        console.error('Error performing task action:', err);
        return false;
    }
};

export const pauseAllActiveTasks = async (workerId: string, reason: string = 'Worker on Break') => {
    const { data: tasks } = await (supabase.from('tasks') as any).select('*')
        .eq('assigned_to_id', workerId)
        .eq('status', 'active');

    if (!tasks || tasks.length === 0) return;

    for (const task of tasks) {
        await performTaskAction(task, 'auto_pause', reason);
    }
};

export const resumeAllAutoPausedTasks = async (workerId: string) => {
    const { data: tasks } = await (supabase.from('tasks') as any).select('*')
        .eq('assigned_to_id', workerId)
        .eq('status', 'break'); // Only resume 'break' status (auto-paused)

    if (!tasks || tasks.length === 0) return;

    for (const task of tasks) {
        await performTaskAction(task, 'auto_resume');
    }
};

export const completeAllTasks = async (workerId: string) => {
    // Used when clocking out
    const { data: tasks } = await (supabase.from('tasks') as any).select('*')
        .eq('assigned_to_id', workerId)
        .neq('status', 'completed');

    if (!tasks) return;

    for (const task of tasks) {
        await performTaskAction(task, 'complete', 'Shift Ended');
    }
};

export const pauseAllTasksManual = async (workerId: string) => {
    // Used when clocking out (Option: Pause All)
    const { data: tasks } = await (supabase.from('tasks') as any).select('*')
        .eq('assigned_to_id', workerId)
        .neq('status', 'completed');

    if (!tasks) return;

    for (const task of tasks as any[]) {
        if (task.status === 'active' || task.status === 'break') {
            await performTaskAction(task, 'pause', 'Shift Ended');
            // Ensure last action time matches clock out if needed, though pause sets it to now. 
            // Ideally performTaskAction handles time. 
            // BUT, to be precise, we rely on performTaskAction using 'now'.
            // If we want exact sync with a passed 'now', we'd need to refactor performTaskAction to accept a timestamp.
            // For now, sequentially running this is close enough to "clock out time"
        }
    }
};
