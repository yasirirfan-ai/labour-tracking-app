import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sortManufacturingOrders } from '../utils/moSorting';
import { useAuth } from '../context/AuthContext';
import { logActivity } from '../lib/activityLogger';
import { useTranslation } from 'react-i18next';

export const ControlTablePage: React.FC = () => {
    const { t } = useTranslation();
    const { user: currentUser } = useAuth();
    const [tasks, setTasks] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [mos, setMos] = useState<any[]>([]);
    const [operations, setOperations] = useState<any[]>([]);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    // isLoading removed as unused

    // Filters
    const [search, setSearch] = useState('');
    const [workerFilter, setWorkerFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Columns Visibility Filter
    const [showColumnFilter, setShowColumnFilter] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState({
        mo: false, // Default hidden
        operation: false, // Default hidden
        startTime: false, // Default hidden
        lastAction: false, // Default hidden
        status: false // Default hidden
    });

    const toggleColumn = (col: keyof typeof visibleColumns) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };



    // State for viewing break details in right-side drawer
    const [breakDetailTask, setBreakDetailTask] = useState<any>(null);
    const [isEditBreaksOpen, setIsEditBreaksOpen] = useState(false);

    // Edited breaks in modal
    const [editBreaks, setEditBreaks] = useState<any[]>([]);

    // Custom Premium Alert/Confirm Dialog State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: (() => void) | null;
        isAlert?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null
    });

    const showCustomConfirm = (message: string, onConfirm: () => void, title = 'Confirm Action') => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            onConfirm,
            isAlert: false
        });
    };

    const showCustomAlert = (message: string, title = 'Alert') => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            onConfirm: null,
            isAlert: true
        });
    };

    // Edit Modal State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        created_at: '',
        start_time: '',
        end_time: '',
        last_action_time: '',
        status: '',
        active_hours: 0,
        active_minutes: 0,
        hourly_rate: 0
    });

    // Create Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        worker_id: '',
        mo_reference: '',
        description: '', // Operation name
        created_at: '', // Clock In
        start_time: '',
        end_time: '',
        last_action_time: '',
        status: 'pending',
        active_hours: 0,
        active_minutes: 0,
        hourly_rate: 0
    });

    const [activeChip, setActiveChip] = useState('Today'); // Move useState to top level
    const [createTab, setCreateTab] = useState<'clockInOut' | 'startLastAction'>('clockInOut');

    // Auto-calculate duration for Manual Entry
    useEffect(() => {
        // Clock In/Out tab: calculate from created_at (clock in) -> end_time (clock out)
        // Start/Last Action tab: calculate from start_time -> end_time || last_action_time
        let startVal = '';
        let endVal = '';

        if (createForm.created_at && createForm.end_time) {
            // Clock In/Out tab scenario
            startVal = createForm.created_at;
            endVal = createForm.end_time;
        } else if (createForm.start_time && (createForm.end_time || createForm.last_action_time)) {
            startVal = createForm.start_time;
            endVal = createForm.end_time || createForm.last_action_time;
        }

        if (startVal && endVal) {
            const start = new Date(startVal);
            const end = new Date(endVal);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMs = end.getTime() - start.getTime();
                const totalMinutes = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                setCreateForm(prev => {
                    if (prev.active_hours === hours && prev.active_minutes === minutes) return prev;
                    return { ...prev, active_hours: hours, active_minutes: minutes };
                });
            }
        }
    }, [createForm.created_at, createForm.start_time, createForm.end_time, createForm.last_action_time]);

    // Auto-calculate duration for Edit Entry
    useEffect(() => {
        if (editForm.start_time && (editForm.end_time || editForm.last_action_time)) {
            const start = new Date(editForm.start_time);
            // Use end_time, fallback to last_action_time
            const end = new Date(editForm.end_time || editForm.last_action_time);

            // Calculate if valid dates
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMs = end.getTime() - start.getTime();
                // If negative (End < Start), treat as 0 duration
                const totalMinutes = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;

                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;

                setEditForm(prev => {
                    // Only update if values are different to avoid potential loops
                    if (prev.active_hours === hours && prev.active_minutes === minutes) return prev;
                    return {
                        ...prev,
                        active_hours: hours,
                        active_minutes: minutes
                    };
                });
            }
        }
    }, [editForm.start_time, editForm.end_time, editForm.last_action_time]);

    // Sync hourly rate when worker is selected in create modal
    useEffect(() => {
        if (createForm.worker_id) {
            const emp = employees.find(e => e.id === createForm.worker_id);
            if (emp) {
                setCreateForm(prev => ({ ...prev, hourly_rate: emp.hourly_rate || 0 }));
            }
        }
    }, [createForm.worker_id, employees]);


    const fetchData = async () => {
        try {
            const { data: taskData } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }) as { data: any[] };
            const { data: empData } = await supabase.from('users').select('*').eq('role', 'employee') as { data: any[] };
            const { data: moData } = await supabase.from('manufacturing_orders').select('*').order('created_at', { ascending: false });
            const { data: opData } = await supabase.from('operations').select('*').order('sort_order', { ascending: true });
            const { data: logsData } = await supabase.from('activity_logs').select('*').order('timestamp', { ascending: false }) as { data: any[] };

            if (logsData) {
                setActivityLogs(logsData);
            }
            if (taskData && empData && logsData) {
                const richTasks = taskData.map((t: any) => {
                    const emp = empData.find(e => e.id === t.assigned_to_id);
                    return { ...t, worker_name: emp?.name || 'Unknown', worker_id_str: emp?.worker_id || '-', worker_avatar: emp?.name?.[0] || '?' };
                });

                const virtualTasks: any[] = [];
                empData.forEach((emp: any) => {
                    const workerLogs = logsData
                        .filter((l: any) => l.worker_id === emp.id)
                        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                    const clockIns = workerLogs.filter((l: any) => l.event_type === 'clock_in');
                    clockIns.forEach((ci: any) => {
                        const ciTime = new Date(ci.timestamp).getTime();
                        const nextClockOut = workerLogs.find((l: any) => 
                            l.event_type === 'clock_out' && new Date(l.timestamp).getTime() > ciTime
                        );
                        const coTime = nextClockOut ? new Date(nextClockOut.timestamp).getTime() : Infinity;

                        const hasTasksInShift = richTasks.some((t: any) => {
                            if (t.assigned_to_id !== emp.id) return false;
                            const taskTime = new Date(t.created_at || t.start_time).getTime();
                            return taskTime >= ciTime - 60000 && taskTime <= coTime + 60000;
                        });

                        if (!hasTasksInShift) {
                            virtualTasks.push({
                                id: `virtual_${emp.id}_${ci.timestamp}`,
                                assigned_to_id: emp.id,
                                mo_reference: '',
                                description: 'Clocked In (No active task)',
                                status: nextClockOut ? 'completed' : 'clocked_in',
                                active_seconds: 0,
                                created_at: ci.timestamp,
                                start_time: null,
                                end_time: nextClockOut ? nextClockOut.timestamp : null,
                                hourly_rate: emp.hourly_rate || 0,
                                break_seconds: 0,
                                manual: false,
                                reason: nextClockOut ? 'Shift Completed' : 'Shift Active',
                                worker_name: emp.name || 'Unknown',
                                worker_id_str: emp.worker_id || '-',
                                worker_avatar: emp.name?.[0] || '?',
                                is_virtual: true
                            });
                        }
                    });
                });

                const combinedTasks = [...richTasks, ...virtualTasks];
                setTasks(combinedTasks);
                setEmployees(empData);
            }
            if (moData) {
                const sortedMos = sortManufacturingOrders(moData as any[]);
                setMos(sortedMos);
            }
            if (opData) setOperations(opData.map((o: any) => o.name));

        } catch (err) {
            console.error('Error fetching table data:', err);
        } finally {
            // Loading state removed
        }
    };

    const formatCurrentTime = (task: any) => {
        let total = task.active_seconds || 0;
        if (task.status === 'active' && task.last_action_time) {
            const diff = Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000);
            if (diff > 0) total += diff;
        }
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
    };

    const getWorkerShiftTimesForDate = (workerId: string, taskDateIso: string) => {
        if (!taskDateIso || !activityLogs || activityLogs.length === 0) {
            return { clockIn: null, clockOut: null };
        }
        const taskTime = new Date(taskDateIso).getTime();
        const workerLogs = activityLogs.filter(l => l.worker_id === workerId);
        
        // Find a shift where taskTime falls within [clockIn - 60s, clockOut + 60s]
        const clockIns = workerLogs.filter(l => l.event_type === 'clock_in');
        for (const ci of clockIns) {
            const ciTime = new Date(ci.timestamp).getTime();
            const nextClockOut = workerLogs.find(l => 
                l.event_type === 'clock_out' && new Date(l.timestamp).getTime() > ciTime
            );
            const coTime = nextClockOut ? new Date(nextClockOut.timestamp).getTime() : Infinity;
            
            if (taskTime >= ciTime - 60000 && taskTime <= coTime + 60000) {
                return {
                    clockIn: ci.timestamp,
                    clockOut: nextClockOut ? nextClockOut.timestamp : null
                };
            }
        }
        
        return { clockIn: null, clockOut: null };
    };

    const formatTimeOnly = (isoString: string) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase();
    };

    const formatDateTime = (isoString: string) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        return d.toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).toUpperCase();
    };

    const getStatusLabel = (status: string) => {
        const s = status?.toLowerCase();
        if (s === 'active') return <span className="status-badge badge-green" style={{ fontSize: '0.7rem' }}>{t('table.statusLabels.timerRunning')}</span>;
        if (s === 'clocked_in') return <span className="status-badge badge-blue" style={{ fontSize: '0.7rem' }}>{t('table.statusLabels.clockedIn')}</span>;
        if (s === 'break') return <span className="status-badge badge-yellow" style={{ fontSize: '0.7rem' }}>{t('table.statusLabels.onBreak')}</span>;
        if (s === 'completed') return <span className="status-badge badge-gray" style={{ fontSize: '0.7rem' }}>{t('table.statusLabels.completed')}</span>;
        return <span className="status-badge badge-gray" style={{ fontSize: '0.7rem' }}>{t('table.statusLabels.pending')}</span>;
    };

    const getBreaksForShift = (workerId: string, task: any) => {
        if (!activityLogs || activityLogs.length === 0) return [];
        
        const taskTimeIso = task.created_at || task.start_time || task.end_time;
        const { clockIn, clockOut } = getWorkerShiftTimesForDate(workerId, taskTimeIso);
        const shiftStart = clockIn ? new Date(clockIn).getTime() : new Date(taskTimeIso).getTime();
        const shiftEnd = clockOut ? new Date(clockOut).getTime() : (task.end_time ? new Date(task.end_time).getTime() : Infinity);

        const workerLogs = activityLogs
            .filter(l => l.worker_id === workerId)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
        const allBreaks: any[] = [];
        let activeBreak: any = null;

        workerLogs.forEach(log => {
            if (log.event_type === 'break_start') {
                if (!activeBreak) {
                    activeBreak = {
                        id: log.id,
                        start_time: log.timestamp,
                        end_time: null,
                        reason: log.description || 'Rest Break'
                    };
                }
            } else if (log.event_type === 'break_end') {
                if (activeBreak) {
                    activeBreak.end_time = log.timestamp;
                    const duration = Math.floor((new Date(log.timestamp).getTime() - new Date(activeBreak.start_time).getTime()) / 1000);
                    activeBreak.duration_seconds = Math.max(0, duration);
                    allBreaks.push(activeBreak);
                    activeBreak = null;
                }
            }
        });

        if (activeBreak) {
            const end = clockOut ? new Date(clockOut).getTime() : new Date().getTime();
            const duration = Math.floor((end - new Date(activeBreak.start_time).getTime()) / 1000);
            activeBreak.duration_seconds = Math.max(0, duration);
            allBreaks.push(activeBreak);
        }
        
        return allBreaks.filter(b => {
            const bStart = new Date(b.start_time).getTime();
            return bStart >= shiftStart - 60000 && bStart <= shiftEnd + 60000;
        });
    };

    const formatToInputDateTime = (isoString: string | null) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => n < 10 ? '0' + n : n;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const handleAddBreakRow = () => {
        const defaultStart = editForm.start_time || editForm.created_at || (editingTask && (editingTask.start_time || editingTask.created_at)) || new Date().toISOString().substring(0, 16);
        const startMs = new Date(defaultStart).getTime();
        const defaultEnd = new Date(startMs + 15 * 60 * 1000).toISOString().substring(0, 16);

        setEditBreaks(prev => [
            ...prev,
            {
                id: null,
                start_time: formatToInputDateTime(new Date(defaultStart).toISOString()),
                end_time: formatToInputDateTime(new Date(defaultEnd).toISOString()),
                reason: 'Rest Break',
                duration_seconds: 900
            }
        ]);
    };

    const handleRemoveBreakRow = (index: number) => {
        setEditBreaks(prev => prev.filter((_, i) => i !== index));
    };

    const handleBreakChange = (index: number, key: string, value: any) => {
        setEditBreaks(prev => prev.map((b, i) => {
            if (i !== index) return b;
            const updated = { ...b, [key]: value };
            if (updated.start_time && updated.end_time) {
                const s = new Date(updated.start_time).getTime();
                const e = new Date(updated.end_time).getTime();
                if (!isNaN(s) && !isNaN(e) && e >= s) {
                    updated.duration_seconds = Math.floor((e - s) / 1000);
                }
            }
            return updated;
        }));
    };

    const handleEditClick = (task: any) => {
        setEditingTask(task);

        // Convert seconds to H:M
        const totalSec = task.active_seconds || 0;
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);

        const taskBreaks = getBreaksForShift(task.assigned_to_id, task);
        const mappedBreaks = taskBreaks.map((b: any) => ({
            ...b,
            start_time: b.start_time ? formatToInputDateTime(b.start_time) : '',
            end_time: b.end_time ? formatToInputDateTime(b.end_time) : ''
        }));
        setEditBreaks(mappedBreaks);

        setEditForm({
            created_at: task.created_at ? task.created_at.substring(0, 16) : '',
            start_time: task.start_time ? task.start_time.substring(0, 16) : '',
            end_time: task.end_time ? task.end_time.substring(0, 16) : '',
            last_action_time: task.last_action_time ? task.last_action_time.substring(0, 16) : '',
            status: task.status,
            active_hours: h,
            active_minutes: m,
            hourly_rate: task.hourly_rate || 0
        });
        setIsEditOpen(true);
    };

    const handleUpdateBreaksOnly = async () => {
        if (!editingTask) return;

        try {
            // Delete old break logs matching the shift time range
            const taskTime = editingTask.created_at || editingTask.start_time;
            const { clockIn, clockOut } = getWorkerShiftTimesForDate(editingTask.assigned_to_id, taskTime);
            const shiftStart = clockIn || taskTime;
            const shiftEnd = clockOut || editingTask.end_time || new Date().toISOString();

            await (supabase.from('activity_logs') as any)
                .delete()
                .eq('worker_id', editingTask.assigned_to_id)
                .in('event_type', ['break_start', 'break_end'])
                .gte('timestamp', new Date(shiftStart).toISOString())
                .lte('timestamp', new Date(shiftEnd).toISOString());

            // Insert new break logs
            if (editBreaks.length > 0) {
                const logsToInsert: any[] = [];
                editBreaks.forEach(b => {
                    if (b.start_time) {
                        logsToInsert.push({
                            worker_id: editingTask.assigned_to_id,
                            event_type: 'break_start',
                            related_task_id: editingTask.is_virtual ? null : editingTask.id,
                            description: b.reason || 'Rest Break',
                            timestamp: new Date(b.start_time).toISOString()
                        });
                    }
                    if (b.end_time) {
                        logsToInsert.push({
                            worker_id: editingTask.assigned_to_id,
                            event_type: 'break_end',
                            related_task_id: editingTask.is_virtual ? null : editingTask.id,
                            description: 'Returned from Break',
                            timestamp: new Date(b.end_time).toISOString()
                        });
                    }
                });

                if (logsToInsert.length > 0) {
                    const { error: insertError } = await (supabase.from('activity_logs') as any).insert(logsToInsert);
                    if (insertError) throw insertError;
                }
            }

            await fetchData();
            
            // Refresh breakDetailTask state to reflect changes in the drawer
            if (editingTask.is_virtual) {
                setBreakDetailTask({
                    ...editingTask
                });
            } else {
                const { data: updatedTasks } = await (supabase.from('tasks') as any).select('*').eq('id', editingTask.id);
                if (updatedTasks && updatedTasks[0]) {
                    const emp = employees.find(e => e.id === updatedTasks[0].assigned_to_id);
                    setBreakDetailTask({
                        ...updatedTasks[0],
                        worker_name: emp?.name || 'Unknown',
                        worker_id_str: emp?.worker_id || '-',
                        worker_avatar: emp?.name?.[0] || '?'
                    });
                } else {
                    setBreakDetailTask(null);
                }
            }

            setIsEditBreaksOpen(false);
        } catch (err) {
            console.error('Error updating breaks:', err);
            alert('Failed to update breaks.');
        }
    };

    const handleUpdateTask = async () => {
        if (!editingTask) return;

        if (editingTask.is_virtual) {
            try {
                const { clockIn, clockOut } = getWorkerShiftTimesForDate(editingTask.assigned_to_id, editingTask.created_at);
                
                // 1. Update clock_in log:
                if (clockIn && editForm.created_at) {
                    const newClockInIso = new Date(editForm.created_at).toISOString();
                    await (supabase.from('activity_logs') as any)
                        .update({ timestamp: newClockInIso })
                        .eq('worker_id', editingTask.assigned_to_id)
                        .eq('event_type', 'clock_in')
                        .eq('timestamp', clockIn);
                }
                
                // 2. Update clock_out log:
                if (editForm.end_time) {
                    const newClockOutIso = new Date(editForm.end_time).toISOString();
                    if (clockOut) {
                        await (supabase.from('activity_logs') as any)
                            .update({ timestamp: newClockOutIso })
                            .eq('worker_id', editingTask.assigned_to_id)
                            .eq('event_type', 'clock_out')
                            .eq('timestamp', clockOut);
                    } else {
                        await (supabase.from('activity_logs') as any).insert({
                            worker_id: editingTask.assigned_to_id,
                            event_type: 'clock_out',
                            description: 'Worker clocked out via admin',
                            timestamp: newClockOutIso
                        });
                    }
                } else if (clockOut) {
                    await (supabase.from('activity_logs') as any)
                        .delete()
                        .eq('worker_id', editingTask.assigned_to_id)
                        .eq('event_type', 'clock_out')
                        .eq('timestamp', clockOut);
                }

                // 3. Update breaks (delete old, insert new):
                const prevStart = clockIn || editingTask.created_at;
                const prevEnd = clockOut || editingTask.end_time || new Date().toISOString();

                await (supabase.from('activity_logs') as any)
                    .delete()
                    .eq('worker_id', editingTask.assigned_to_id)
                    .in('event_type', ['break_start', 'break_end'])
                    .gte('timestamp', new Date(prevStart).toISOString())
                    .lte('timestamp', new Date(prevEnd).toISOString());

                if (editBreaks.length > 0) {
                    const logsToInsert: any[] = [];
                    editBreaks.forEach(b => {
                        if (b.start_time) {
                            logsToInsert.push({
                                worker_id: editingTask.assigned_to_id,
                                event_type: 'break_start',
                                description: b.reason || 'Rest Break',
                                timestamp: new Date(b.start_time).toISOString()
                            });
                        }
                        if (b.end_time) {
                            logsToInsert.push({
                                worker_id: editingTask.assigned_to_id,
                                event_type: 'break_end',
                                description: 'Break ended',
                                timestamp: new Date(b.end_time).toISOString()
                            });
                        }
                    });
                    if (logsToInsert.length > 0) {
                        const { error: breakErr } = await (supabase.from('activity_logs') as any).insert(logsToInsert);
                        if (breakErr) throw breakErr;
                    }
                }

                setIsEditOpen(false);
                fetchData();
            } catch (err: any) {
                showCustomAlert('Error updating shift logs: ' + err.message);
            }
            return;
        }

        // Check if worker is on break when setting to active
        if (editForm.status === 'active') {
            const worker = employees.find(e => e.id === editingTask.assigned_to_id);
            if (worker && worker.availability === 'break') {
                showCustomAlert(t('matrix.cannotActionBreak', { action: 'start', name: worker.name }));
                return;
            }
        }

        // Calculate active_seconds logic:
        // Prioritize actual time difference if start and end are provided
        // Otherwise fallback to manual duration inputs
        let totalSeconds = 0;
        if (editForm.start_time && editForm.end_time) {
            const start = new Date(editForm.start_time).getTime();
            const end = new Date(editForm.end_time).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                totalSeconds = Math.floor((end - start) / 1000);
            } else {
                // Fallback if invalid range
                totalSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
            }
        } else {
            // No end time, trust the manual duration
            totalSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
        }

        // Calculate total break seconds
        const totalBreakSeconds = editBreaks.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);

        // Prepare updates
        const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');
        const updates: any = {
            status: editForm.status,
            active_seconds: totalSeconds,
            break_seconds: totalBreakSeconds,
            total_duration_seconds: totalSeconds + totalBreakSeconds,
            created_at: editForm.created_at ? new Date(editForm.created_at).toISOString() : editingTask.created_at,
            start_time: editForm.start_time ? new Date(editForm.start_time).toISOString() : null,
            last_action_time: editForm.last_action_time ? new Date(editForm.last_action_time).toISOString() : editingTask.last_action_time,
            hourly_rate: editForm.hourly_rate,
            reason: `Updated by ${auditName}` // Use existing reason field
        };

        // If end_time is provided, force status to completed so it saves correctly
        if (editForm.end_time) {
            updates.end_time = new Date(editForm.end_time).toISOString();
            // If last action time wasn't manually set, sync it with end time
            if (!editForm.last_action_time) {
                updates.last_action_time = updates.end_time;
            }
            updates.status = 'completed';
        } else if (editForm.status !== 'completed') {
            updates.end_time = null; // Clear end time if not completed
        }

        try {
            const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', editingTask.id);
            if (error) throw error;

            // Delete old break logs matching the shift time range
            const taskTime = editingTask.created_at || editingTask.start_time;
            const { clockIn, clockOut } = getWorkerShiftTimesForDate(editingTask.assigned_to_id, taskTime);
            const shiftStart = clockIn || taskTime;
            const shiftEnd = clockOut || editingTask.end_time || new Date().toISOString();

            await (supabase.from('activity_logs') as any)
                .delete()
                .eq('worker_id', editingTask.assigned_to_id)
                .in('event_type', ['break_start', 'break_end'])
                .gte('timestamp', new Date(shiftStart).toISOString())
                .lte('timestamp', new Date(shiftEnd).toISOString());

            // Insert new break logs
            if (editBreaks.length > 0) {
                const logsToInsert: any[] = [];
                editBreaks.forEach(b => {
                    if (b.start_time) {
                        logsToInsert.push({
                            worker_id: editingTask.assigned_to_id,
                            event_type: 'break_start',
                            related_task_id: editingTask.id,
                            description: b.reason || 'Rest Break',
                            timestamp: new Date(b.start_time).toISOString()
                        });
                    }
                    if (b.end_time) {
                        logsToInsert.push({
                            worker_id: editingTask.assigned_to_id,
                            event_type: 'break_end',
                            related_task_id: editingTask.id,
                            description: 'Break ended',
                            timestamp: new Date(b.end_time).toISOString()
                        });
                    }
                });
                if (logsToInsert.length > 0) {
                    const { error: breakErr } = await (supabase.from('activity_logs') as any).insert(logsToInsert);
                    if (breakErr) throw breakErr;
                }
            }

            // Audit Log
            if (currentUser) {
                const auditName = currentUser.username === 'admin@gmail.com' ? 'System Admin' : (currentUser.name || currentUser.username || 'Manager');
                await logActivity(
                    editingTask.assigned_to_id,
                    'task_start', // or appropriate event type
                    `Manual update by ${auditName}`, // Embed name directly in description
                    `Status: ${updates.status}, Task ID: ${editingTask.id}`,
                    editingTask.id,
                    currentUser.id,
                    auditName
                );
            }

            setIsEditOpen(false);
            fetchData();
        } catch (e: any) {
            showCustomAlert(t('table.errorUpdating') + ': ' + e.message);
        }
    };

    const handleDeleteTask = async (id: string) => {
        const performDelete = async () => {
            if (id.startsWith('virtual_')) {
                try {
                    const parts = id.split('_');
                    const workerId = parts[1];
                    const ciTimestamp = parts.slice(2).join('_');
                    
                    const { clockIn, clockOut } = getWorkerShiftTimesForDate(workerId, ciTimestamp);
                    const shiftStart = clockIn || ciTimestamp;
                    const shiftEnd = clockOut || new Date().toISOString();
                    
                    await (supabase.from('activity_logs') as any)
                        .delete()
                        .eq('worker_id', workerId)
                        .gte('timestamp', new Date(shiftStart).toISOString())
                        .lte('timestamp', new Date(shiftEnd).toISOString());
                    
                    fetchData();
                } catch (err: any) {
                    showCustomAlert('Error deleting shift: ' + err.message);
                }
            } else {
                try {
                    const { error } = await supabase.from('tasks').delete().eq('id', id);
                    if (error) throw error;
                    fetchData();
                } catch (err: any) {
                    showCustomAlert(t('table.errorDeleting') + ': ' + err.message);
                }
            }
        };

        if (id.startsWith('virtual_')) {
            showCustomConfirm(
                'Are you sure you want to delete this shift record? This will delete the clock-in/out logs and breaks.',
                performDelete,
                'Delete Shift Record'
            );
        } else {
            showCustomConfirm(
                t('table.deleteConfirm'),
                performDelete,
                'Delete Task'
            );
        }
    };

    const handleCreateClick = () => {
        setCreateTab('clockInOut');
        setCreateForm({
            worker_id: '',
            mo_reference: '',
            description: '',
            // Use local time for default
            created_at: (() => {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                return now.toISOString().slice(0, 16);
            })(),
            start_time: '', // intentionally blank — Tab 1 copies created_at on save
            end_time: '',
            last_action_time: '',
            status: 'pending',
            active_hours: 0,
            active_minutes: 0,
            hourly_rate: 0
        });
        setIsCreateOpen(true);
    };

    const handleCreateTask = async () => {
        // Tab 1 (Clock In/Out): only Worker is required
        // Tab 2 (Start/Last Action): Worker, MO, and Operation are all required
        if (!createForm.worker_id) {
            showCustomAlert(t('table.modals.worker') + ' is required.');
            return;
        }
        if (createTab === 'startLastAction' && (!createForm.mo_reference || !createForm.description)) {
            showCustomAlert(t('table.modals.validationError'));
            return;
        }

        const emp = employees.find(e => e.id === createForm.worker_id);

        if (createForm.status === 'active' && emp?.availability === 'break') {
            showCustomAlert(t('matrix.cannotActionBreak', { action: 'start', name: emp.name }));
            return;
        }

        // For Tab 1, start_time is not shown — use created_at (clock-in) so the entry
        // is dated correctly in both the Control Table and Reports filters.
        const effectiveStartTime = createForm.start_time || createForm.created_at;

        // Calculate duration: prefer actual clock difference, fall back to manual hours/min
        let totalSeconds = 0;
        if (effectiveStartTime && createForm.end_time) {
            const start = new Date(effectiveStartTime).getTime();
            const end = new Date(createForm.end_time).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                totalSeconds = Math.floor((end - start) / 1000);
            } else {
                totalSeconds = (parseInt(String(createForm.active_hours)) * 3600) + (parseInt(String(createForm.active_minutes)) * 60);
            }
        } else {
            totalSeconds = (parseInt(String(createForm.active_hours)) * 3600) + (parseInt(String(createForm.active_minutes)) * 60);
        }

        // For Tab 2 (Start/Last Action), created_at defaults to "now" (form open time).
        // Override it with start_time so Clock In column and date filters show the correct work date.
        const effectiveCreatedAt = createTab === 'startLastAction' && createForm.start_time
            ? createForm.start_time
            : (createForm.created_at || new Date().toISOString());

        const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');
        const newTask: any = {
            assigned_to_id: createForm.worker_id,
            mo_reference: createForm.mo_reference,
            description: createForm.description,
            status: createForm.status,
            active_seconds: totalSeconds,
            created_at: new Date(effectiveCreatedAt).toISOString(),
            start_time: effectiveStartTime ? new Date(effectiveStartTime).toISOString() : null,
            last_action_time: createForm.last_action_time ? new Date(createForm.last_action_time).toISOString() : null,
            hourly_rate: createForm.hourly_rate,
            break_seconds: 0,
            manual: true,
            reason: `Created by ${auditName}`
        };

        if (createForm.end_time) {
            newTask.end_time = new Date(createForm.end_time).toISOString();
            if (!createForm.last_action_time) {
                newTask.last_action_time = newTask.end_time;
            }
            newTask.status = 'completed';
        } else if (effectiveStartTime && !createForm.last_action_time) {
            newTask.last_action_time = newTask.start_time;
        }

        try {
            const { data: createdTask, error } = await (supabase.from('tasks') as any).insert(newTask).select().single();
            if (error) throw error;

            // Audit Log
            if (currentUser && createdTask) {
                const auditName = currentUser.username === 'admin@gmail.com' ? 'System Admin' : (currentUser.name || currentUser.username || 'Manager');
                await logActivity(
                    newTask.assigned_to_id,
                    'clock_in',
                    `Manual entry by ${auditName}`, // Embed name directly in description
                    `MO: ${newTask.mo_reference}, Task ID: ${createdTask.id}`,
                    createdTask.id,
                    currentUser.id,
                    auditName
                );
            }

            setIsCreateOpen(false);
            fetchData();
        } catch (e: any) {
            showCustomAlert(t('table.errorCreating') + ': ' + e.message);
        }
    };

    // Returns the UTC Date corresponding to midnight (start) or 23:59:59.999 (end)
    // of a YYYY-MM-DD date in America/Los_Angeles (PST/PDT), handles DST automatically.
    const getPSTBound = (dateStr: string, endOfDay: boolean): Date => {
        const date = new Date(dateStr + (endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'));
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hour12: false
        });
        
        const parts = formatter.formatToParts(date);
        const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
        
        const y = getPart('year');
        const m = getPart('month');
        const d = getPart('day');
        const hr = getPart('hour');
        const min = getPart('minute');
        const sec = getPart('second');
        
        const pstTimestamp = Date.UTC(y, m - 1, d, hr === 24 ? 0 : hr, min, sec);
        const diff = date.getTime() - pstTimestamp;
        
        return new Date(date.getTime() + diff);
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = (t.mo_reference || '').toLowerCase().includes(search.toLowerCase()) ||
            (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
            (t.worker_name || '').toLowerCase().includes(search.toLowerCase());

        const matchesWorker = workerFilter === 'all' || t.worker_name === workerFilter;

        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'timer running' && t.status === 'active') ||
            (statusFilter === 'on break' && t.status === 'break') ||
            (statusFilter === 'clocked in' && t.status === 'clocked_in') ||
            (statusFilter === 'completed' && t.status === 'completed') ||
            (statusFilter === 'pending' && t.status === 'pending');

        let matchesDate = true;
        // Filter by created_at (Clock In) — this is the date shown in the Clock In column.
        // After Tab 2 fix, created_at = start_time for all manual entries, so this is always correct.
        const taskDate = new Date(t.created_at || t.start_time);
        if (startDate && taskDate < getPSTBound(startDate, false)) matchesDate = false;
        if (endDate && taskDate > getPSTBound(endDate, true)) matchesDate = false;

        const { clockIn } = getWorkerShiftTimesForDate(t.assigned_to_id, t.created_at || t.start_time);
        if (!clockIn && !t.manual) return false;

        return matchesSearch && matchesWorker && matchesStatus && matchesDate;
    }).sort((a, b) => {
        const dateA = a.created_at || a.start_time || '';
        const dateB = b.created_at || b.start_time || '';
        return dateB.localeCompare(dateA); // newest first
    });

    // if (isLoading) return <div className="loading-screen">Loading Table...</div>;




    const applyDateFilter = (filterType: string) => {
        const now = new Date();
        // Always derive the current date in PST so chips like "Today" are correct
        // regardless of what UTC says (e.g. PST midnight = UTC 08:00 the same day).
        const pstDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // "YYYY-MM-DD"
        const [year, month, day] = pstDateStr.split('-').map(Number);
        const pstToDateStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        let start = '';
        let end = '';

        if (filterType === 'Today') {
            start = end = pstDateStr;
        } else if (filterType === 'This Week') {
            const dowStr = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' });
            const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowStr);
            start = pstToDateStr(new Date(year, month - 1, day - dow));
            end = pstToDateStr(new Date(year, month - 1, day - dow + 6));
        } else if (filterType === 'Last Week') {
            const dowStr = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' });
            const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowStr);
            start = pstToDateStr(new Date(year, month - 1, day - dow - 7));
            end = pstToDateStr(new Date(year, month - 1, day - dow - 1));
        } else if (filterType === 'This Month') {
            start = `${year}-${String(month).padStart(2, '0')}-01`;
            end = pstToDateStr(new Date(year, month, 0)); // last day of current month
        } else if (filterType === 'Last Month') {
            const lm = month === 1 ? 12 : month - 1;
            const ly = month === 1 ? year - 1 : year;
            start = `${ly}-${String(lm).padStart(2, '0')}-01`;
            end = pstToDateStr(new Date(ly, lm, 0)); // last day of last month
        }
        // 'All' leaves start/end as ''

        setStartDate(start);
        setEndDate(end);
        setActiveChip(filterType);
    };

    const resetFilters = () => {
        setSearch('');
        setWorkerFilter('all');
        setStatusFilter('all');
        applyDateFilter('All'); // Changed to 'All'
    };

    useEffect(() => {
        // Initial date filter application
        applyDateFilter('All'); // Changed to 'All'

        fetchData();
        const interval = setInterval(() => {
            setTasks(prev => [...prev]);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title">{t('table.title')}</h1>
                    <p className="page-subtitle">{t('table.subtitle')}</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreateClick} style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>
                    <i className="fa-solid fa-plus" style={{ marginRight: '8px' }}></i> {t('table.manualEntry')}
                </button>
            </div>

            {/* Search Filter Bar (Restored Inline Styles) */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                    <input
                        type="text"
                        placeholder={t('table.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.25rem', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--bg-body)', color: 'var(--text-main)' }}
                    />
                </div>

                <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--bg-body)', color: 'var(--text-main)' }}>
                    <option value="all">{t('table.allWorkers')}</option>
                    {employees.filter(e => e.active !== false).map(e => <option key={e.id} value={e.name} style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}>{e.name}</option>)}
                </select>

                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--bg-body)', color: 'var(--text-main)' }}>
                    <option value="all">{t('table.allStatuses')}</option>
                    <option value="timer running">{t('table.statusLabels.timerRunning')}</option>
                    <option value="clocked in">{t('table.statusLabels.clockedIn')}</option>
                    <option value="on break">{t('table.statusLabels.onBreak')}</option>
                    <option value="completed">{t('table.statusLabels.completed')}</option>
                    <option value="pending">{t('table.statusLabels.pending')}</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-body)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('table.from')}</span>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setActiveChip(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-body)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('table.to')}</span>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setActiveChip(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-main)' }} />
                </div>

                <button className="btn btn-secondary" onClick={resetFilters} style={{ background: 'var(--bg-body)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {t('table.reset')}
                </button>

                <div style={{ position: 'relative' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => setShowColumnFilter(prev => !prev)} 
                        style={{ background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                    >
                        <i className="fa-solid fa-sliders"></i>
                        Columns Filter
                    </button>
                    {showColumnFilter && (
                        <div style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            marginTop: '0.5rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                            padding: '1rem',
                            zIndex: 100,
                            minWidth: '220px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem'
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Toggle Columns
                            </div>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                                <input type="checkbox" checked={visibleColumns.mo} onChange={() => toggleColumn('mo')} />
                                MO Reference
                            </label>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                                <input type="checkbox" checked={visibleColumns.operation} onChange={() => toggleColumn('operation')} />
                                Operation (Description)
                            </label>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                                <input type="checkbox" checked={visibleColumns.startTime} onChange={() => toggleColumn('startTime')} />
                                Start Time
                            </label>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                                <input type="checkbox" checked={visibleColumns.lastAction} onChange={() => toggleColumn('lastAction')} />
                                Last Action
                            </label>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                                <input type="checkbox" checked={visibleColumns.status} onChange={() => toggleColumn('status')} />
                                Status
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* Date Filter Chips Row - BELOW Search Bar */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', paddingLeft: '0.25rem' }}>
                {['All', 'Today', 'This Week', 'Last Week', 'This Month', 'Last Month'].map(label => {
                    const isActive = activeChip === label;
                    return (
                        <button
                            key={label}
                            onClick={() => applyDateFilter(label)}
                            className={`chip-btn ${isActive ? 'active' : ''}`}
                            style={{
                                padding: '0.5rem 1.25rem',
                                borderRadius: '50px',
                                border: isActive ? 'none' : '1px solid #E2E8F0',
                                background: isActive ? 'var(--primary)' : 'white',
                                color: isActive ? 'white' : '#64748B',
                                fontSize: '0.85rem',
                                fontWeight: isActive ? 600 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: isActive ? '0 4px 6px -1px rgba(30, 41, 59, 0.2)' : 'none'
                            }}
                        >
                            {t(`table.chips.${label.toLowerCase().replace(' ', '')}`)}
                        </button>
                    );
                })}
            </div>

            <div className="table-responsive-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-body)', borderBottom: '2px solid var(--border)' }}>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)', background: 'var(--bg-body)' }}>{t('table.columns.workerId')}</th>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)', left: '100px', background: 'var(--bg-body)' }}>{t('table.columns.name')}</th>
                            {visibleColumns.mo && <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.mo')}</th>}
                            {visibleColumns.operation && <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.operation')}</th>}
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.clockIn')}</th>
                            {visibleColumns.startTime && <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.startTime')}</th>}
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.clockOut')}</th>
                            {visibleColumns.lastAction && <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.lastAction')}</th>}
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.duration')}</th>
                            {visibleColumns.status && <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.status')}</th>}
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-main)' }}>Audit Record</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }}>{t('table.columns.edit')}</th>
                        </tr>
                    </thead>
                    <tbody style={{ background: 'var(--bg-card)' }}>
                        {filteredTasks.map(task => (
                            <React.Fragment key={task.id}>
                                <tr 
                                    onClick={() => setBreakDetailTask(task)}
                                    style={{ 
                                        borderBottom: '1px solid var(--border)', 
                                        background: 'var(--bg-card)', 
                                        color: 'var(--text-main)',
                                        cursor: 'pointer'
                                    }}
                                    className="table-row-clickable"
                                >
                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)', fontFamily: `'JetBrains Mono', monospace`, background: 'var(--bg-card)' }}>{task.worker_id_str}</td>
                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', left: '100px', background: 'var(--bg-card)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '32px', height: '32px', background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem' }}>
                                            {task.worker_avatar}
                                        </div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{task.worker_name}</span>
                                    </div>
                                </td>
                                {visibleColumns.mo && (
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                                        <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>{task.mo_reference}</span>
                                    </td>
                                )}
                                {visibleColumns.operation && <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{task.description}</td>}
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                                    {(() => {
                                        const taskTime = task.created_at || task.start_time;
                                        const { clockIn } = getWorkerShiftTimesForDate(task.assigned_to_id, taskTime);
                                        return clockIn ? formatDateTime(clockIn) : (taskTime ? formatDateTime(taskTime) : '-');
                                    })()}
                                </td>
                                {visibleColumns.startTime && (
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {formatTimeOnly(task.start_time)}
                                    </td>
                                )}
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                                     {(() => {
                                         const { clockOut } = getWorkerShiftTimesForDate(task.assigned_to_id, task.created_at || task.start_time);
                                         if (clockOut) return formatDateTime(clockOut);
                                         return 'Still Clocked In';
                                     })()}
                                 </td>
                                {visibleColumns.lastAction && (
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {formatTimeOnly(task.last_action_time)}
                                    </td>
                                )}
                                <td style={{ padding: '0.75rem 1rem' }}>
                                     <span style={{ fontFamily: `'JetBrains Mono', monospace`, color: 'var(--text-main)', fontWeight: 600 }}>
                                         {(() => {
                                             const { clockIn, clockOut } = getWorkerShiftTimesForDate(task.assigned_to_id, task.created_at || task.start_time);
                                             if (clockIn) {
                                                 const start = new Date(clockIn).getTime();
                                                 const end = clockOut ? new Date(clockOut).getTime() : new Date().getTime();
                                                 let totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
                                                 
                                                 const breaks = getBreaksForShift(task.assigned_to_id, task);
                                                 const totalBreakSeconds = breaks.reduce((sum, b) => sum + b.duration_seconds, 0);
                                                 totalSeconds = Math.max(0, totalSeconds - totalBreakSeconds);
 
                                                 const h = Math.floor(totalSeconds / 3600);
                                                 const m = Math.floor((totalSeconds % 3600) / 60);
                                                 const s = totalSeconds % 60;
                                                 return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
                                             }
                                             return formatCurrentTime(task);
                                         })()}
                                     </span>
                                 </td>
                                {visibleColumns.status && <td style={{ padding: '0.75rem 1rem' }}>{getStatusLabel(task.status)}</td>}
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {(() => {
                                        if (task.reason && task.reason.includes('by ')) {
                                            const name = task.reason.split('by ')[1];
                                            const type = (task.reason.toLowerCase().includes('create') || task.manual) ? 'Manual Creation' : 'Manual Update';
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>By: {name}</span>
                                                    <span style={{ fontSize: '0.7rem' }}>{type}</span>
                                                </div>
                                            );
                                        }

                                        const logs = activityLogs.filter(l => l.related_task_id === task.id);
                                        const log = logs[0];

                                        if (log) {
                                            const description = log.description || '';
                                            const hasManager = description.includes('by ');
                                            const name = hasManager ? description.split('by ')[1] : (log.performed_by_name || 'Manager');

                                            if (name) {
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>By: {name}</span>
                                                        <span style={{ fontSize: '0.7rem' }}>{description}</span>
                                                    </div>
                                                );
                                            }
                                        }
                                        return <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Worker action</span>;
                                    })()}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleEditClick(task); }}
                                            className="icon-btn"
                                            title={t('table.columns.edit')}
                                            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                        >
                                            <i className="fa-solid fa-pen-to-square"></i>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                            className="icon-btn delete"
                                            title={t('common.delete')}
                                            style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                        >
                                            <i className="fa-regular fa-trash-can"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {/* Inline breaks row removed in favor of right-side sliding drawer details */}
                        </React.Fragment>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* Break History Drawer (Slides out from right) */}
            {breakDetailTask && (
                <>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(100%); }
                            to { transform: translateX(0); }
                        }
                    `}</style>
                    {/* Backdrop */}
                    <div 
                        onClick={() => setBreakDetailTask(null)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100vw',
                            height: '100vh',
                            background: 'rgba(0, 0, 0, 0.4)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 2999,
                            transition: 'opacity 0.2s'
                        }}
                    />
                    {/* Drawer */}
                    <div 
                        style={{
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            width: 'min(450px, 100%)',
                            height: '100vh',
                            background: 'white',
                            boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.15)',
                            zIndex: 3000,
                            display: 'flex',
                            flexDirection: 'column',
                            animation: 'slideIn 0.25s ease-out',
                            borderLeft: '1px solid var(--border)'
                        }}
                    >
                        {/* Header */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Shift Break Breakdown
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {breakDetailTask.worker_name} ({breakDetailTask.worker_id_str})
                                </p>
                            </div>
                            <button 
                                onClick={() => setBreakDetailTask(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Summary Card */}
                            <div style={{ background: 'var(--bg-body)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Shift Status</span>
                                    <span className="status-badge" style={{ display: 'inline-block' }}>
                                        {getStatusLabel(breakDetailTask.status)}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Total Break Time</span>
                                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#D97706', fontFamily: `'JetBrains Mono', monospace` }}>
                                        {(() => {
                                            const breaks = getBreaksForShift(breakDetailTask.assigned_to_id, breakDetailTask);
                                            const totalBreakSeconds = breaks.reduce((sum, b) => sum + b.duration_seconds, 0);
                                            const bh = Math.floor(totalBreakSeconds / 3600);
                                            const bm = Math.floor((totalBreakSeconds % 3600) / 60);
                                            const bs = totalBreakSeconds % 60;
                                            return [bh, bm, bs].map(v => v < 10 ? "0" + v : v).join(":");
                                        })()}
                                    </span>
                                </div>
                            </div>

                            {/* Break Logs */}
                            <div>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Break Timeline ({getBreaksForShift(breakDetailTask.assigned_to_id, breakDetailTask).length})
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {(() => {
                                        const breaks = getBreaksForShift(breakDetailTask.assigned_to_id, breakDetailTask);
                                        if (breaks.length === 0) {
                                            return (
                                                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', background: 'var(--bg-body)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                                                    <i className="fa-solid fa-mug-hot" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block', color: 'var(--text-muted)' }}></i>
                                                    No breaks recorded for this shift.
                                                </div>
                                            );
                                        }
                                        return breaks.map((b: any, idx: number) => (
                                            <div 
                                                key={b.id || idx}
                                                style={{
                                                    background: 'white',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '8px',
                                                    padding: '0.75rem 1rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }} />
                                                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                                                            {b.reason || 'Rest Break'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '12px' }}>
                                                        {formatTimeOnly(b.start_time)} - {b.end_time ? formatTimeOnly(b.end_time) : 'Active'}
                                                    </div>
                                                </div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: `'JetBrains Mono', monospace`, background: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', color: '#B45309' }}>
                                                    {(() => {
                                                        const bh = Math.floor(b.duration_seconds / 3600);
                                                        const bm = Math.floor((b.duration_seconds % 3600) / 60);
                                                        const bs = b.duration_seconds % 60;
                                                        return [bh, bm, bs].map(v => v < 10 ? "0" + v : v).join(":");
                                                    })()}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => {
                                    setEditingTask(breakDetailTask);
                                    const breaks = getBreaksForShift(breakDetailTask.assigned_to_id, breakDetailTask);
                                    setEditBreaks(breaks.map((b: any) => ({
                                        ...b,
                                        start_time: b.start_time ? formatToInputDateTime(b.start_time) : '',
                                        end_time: b.end_time ? formatToInputDateTime(b.end_time) : ''
                                    })));
                                    setIsEditBreaksOpen(true);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '0.6rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#F59E0B',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <i className="fa-solid fa-pen-to-square"></i>
                                Edit Breaks Only
                            </button>
                            <button
                                onClick={() => setBreakDetailTask(null)}
                                style={{
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '6px',
                                    border: '1.5px solid var(--border)',
                                    background: 'white',
                                    color: 'var(--text-muted)',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Edit Breaks Modal (Dedicated to only editing breaks) */}
            {isEditBreaksOpen && editingTask && (
                <>
                    {/* Backdrop */}
                    <div 
                        onClick={() => setIsEditBreaksOpen(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100vw',
                            height: '100vh',
                            background: 'rgba(0, 0, 0, 0.4)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 3001,
                            transition: 'opacity 0.2s'
                        }}
                    />
                    {/* Modal */}
                    <div style={{
                        position: 'fixed',
                        left: '50%',
                        top: '50%',
                        transform: `translate(-50%, -50%)`,
                        width: 'min(650px, 95%)',
                        height: 'auto',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        borderRadius: '12px',
                        zIndex: 3002,
                        background: 'white',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Edit Breaks Only
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {editingTask.worker_name} • {editingTask.description}
                                </p>
                            </div>
                            <button 
                                onClick={() => setIsEditBreaksOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <label style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>Shift Break Logs</label>
                                <button 
                                    type="button"
                                    className="btn btn-secondary" 
                                    onClick={handleAddBreakRow}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
                                >
                                    <i className="fa-solid fa-plus"></i> Add Break
                                </button>
                            </div>
                            
                            {editBreaks.length === 0 ? (
                                <div style={{ fontSize: '0.85rem', color: '#94A3B8', padding: '1.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #E2E8F0', fontStyle: 'italic', marginBottom: '1.5rem' }}>
                                    No breaks recorded for this shift. Click "Add Break" to insert one.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem', marginBottom: '1.5rem' }}>
                                    {editBreaks.map((b, index) => (
                                        <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#F8FAFC', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ flex: 2 }}>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', fontWeight: 600, marginBottom: '2px' }}>Start Time</span>
                                                <input 
                                                    type="datetime-local" 
                                                    value={b.start_time} 
                                                    onChange={e => handleBreakChange(index, 'start_time', e.target.value)} 
                                                    style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                />
                                            </div>
                                            <div style={{ flex: 2 }}>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', fontWeight: 600, marginBottom: '2px' }}>End Time</span>
                                                <input 
                                                    type="datetime-local" 
                                                    value={b.end_time} 
                                                    onChange={e => handleBreakChange(index, 'end_time', e.target.value)} 
                                                    style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                />
                                            </div>
                                            <div style={{ flex: 2 }}>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', fontWeight: 600, marginBottom: '2px' }}>Reason</span>
                                                <input 
                                                    type="text" 
                                                    value={b.reason} 
                                                    onChange={e => handleBreakChange(index, 'reason', e.target.value)} 
                                                    placeholder="e.g. Lunch Break"
                                                    style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                />
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveBreakRow(index)} 
                                                style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.5rem 0.25rem 0', alignSelf: 'center' }}
                                                title="Delete Break"
                                            >
                                                <i className="fa-regular fa-trash-can"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setIsEditBreaksOpen(false)} 
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    className="btn btn-primary" 
                                    onClick={handleUpdateBreaksOnly} 
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Save Breaks Only
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Edit Modal (Compact) */}
            <div className={`offcanvas ${isEditOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: 'min(700px, 95%)', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                borderRadius: '12px', opacity: isEditOpen ? 1 : 0,
                pointerEvents: isEditOpen ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3001, background: 'white', position: 'fixed',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '1.5rem 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="offcanvas-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t('table.modals.editTitle')}</h3>
                    <button className="close-btn" onClick={() => setIsEditOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="offcanvas-body" style={{ padding: '0 1.5rem 1.5rem' }}>
                    {editingTask && (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ background: '#F8FAFC', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{t('table.modals.worker')}</div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{editingTask.worker_name}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{t('table.modals.task')}</div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{editingTask.description}</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.clockIn')}</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.created_at}
                                        onChange={e => setEditForm(prev => ({ ...prev, created_at: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.startTime')}</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.start_time}
                                        onChange={e => setEditForm(prev => ({ ...prev, start_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.clockOut')}</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.end_time}
                                        onChange={e => setEditForm(prev => ({ ...prev, end_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.lastAction')}</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.last_action_time}
                                        onChange={e => setEditForm(prev => ({ ...prev, last_action_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.duration')}</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            value={editForm.active_hours}
                                            onChange={e => setEditForm(prev => ({ ...prev, active_hours: parseInt(e.target.value) || 0 }))}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{t('table.modals.hours')}</span>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            value={editForm.active_minutes}
                                            onChange={e => setEditForm(prev => ({ ...prev, active_minutes: parseInt(e.target.value) || 0 }))}
                                            max="59"
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{t('table.modals.minutes')}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.hourlyRate')}</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={editForm.hourly_rate}
                                        onChange={e => setEditForm(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.status')}</label>
                                    <select
                                        value={editForm.status}
                                        onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    >
                                        <option value="pending">{t('table.statusLabels.pending')}</option>
                                        <option value="clocked_in">{t('table.statusLabels.clockedIn')}</option>
                                        <option value="active">{t('table.statusLabels.timerRunning')}</option>
                                        <option value="break">{t('table.statusLabels.onBreak')}</option>
                                        <option value="completed">{t('table.statusLabels.completed')}</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>Itemized Breaks</label>
                                    <button 
                                        type="button"
                                        className="btn btn-secondary" 
                                        onClick={handleAddBreakRow}
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
                                    >
                                        <i className="fa-solid fa-plus"></i> Add Break
                                    </button>
                                </div>
                                
                                {editBreaks.length === 0 ? (
                                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', padding: '0.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: '6px', fontStyle: 'italic' }}>
                                        No breaks recorded for this shift.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                        {editBreaks.map((b, index) => (
                                            <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#F8FAFC', padding: '0.5rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ flex: 2 }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', fontWeight: 600 }}>Start Time</span>
                                                    <input 
                                                        type="datetime-local" 
                                                        value={b.start_time} 
                                                        onChange={e => handleBreakChange(index, 'start_time', e.target.value)} 
                                                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                    />
                                                </div>
                                                <div style={{ flex: 2 }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', fontWeight: 600 }}>End Time</span>
                                                    <input 
                                                        type="datetime-local" 
                                                        value={b.end_time} 
                                                        onChange={e => handleBreakChange(index, 'end_time', e.target.value)} 
                                                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                    />
                                                </div>
                                                <div style={{ flex: 2 }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', fontWeight: 600 }}>Reason</span>
                                                    <input 
                                                        type="text" 
                                                        value={b.reason} 
                                                        onChange={e => handleBreakChange(index, 'reason', e.target.value)} 
                                                        placeholder="Lunch, etc."
                                                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                    />
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={() => handleRemoveBreakRow(index)} 
                                                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.5rem 0.25rem 0', alignSelf: 'center' }}
                                                    title="Delete Break"
                                                >
                                                    <i className="fa-regular fa-trash-can"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setIsEditOpen(false)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>{t('table.modals.cancel')}</button>
                                <button className="btn btn-primary" onClick={handleUpdateTask} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>{t('table.modals.update')}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div >

            {/* Create Manual Entry Modal */}
            <div className={`offcanvas ${isCreateOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: 'min(700px, 95%)', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                borderRadius: '12px', opacity: isCreateOpen ? 1 : 0,
                pointerEvents: isCreateOpen ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3001, background: 'white', position: 'fixed',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div className="offcanvas-header" style={{ padding: '1.5rem 1.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="offcanvas-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t('table.modals.manualTitle')}</h3>
                    <button className="close-btn" onClick={() => setIsCreateOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Tab Switcher */}
                <div style={{ padding: '1rem 1.5rem 0', display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setCreateTab('clockInOut')}
                        style={{
                            flex: 1, padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.2s',
                            background: createTab === 'clockInOut' ? 'var(--primary)' : '#F1F5F9',
                            color: createTab === 'clockInOut' ? 'white' : '#64748B',
                            border: createTab === 'clockInOut' ? 'none' : '1px solid #E2E8F0'
                        }}
                    >
                        <i className="fa-regular fa-clock" style={{ marginRight: '6px' }}></i>
                        {t('table.modals.clockIn')} / {t('table.modals.clockOut')}
                    </button>
                    <button
                        onClick={() => setCreateTab('startLastAction')}
                        style={{
                            flex: 1, padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.2s',
                            background: createTab === 'startLastAction' ? 'var(--primary)' : '#F1F5F9',
                            color: createTab === 'startLastAction' ? 'white' : '#64748B',
                            border: createTab === 'startLastAction' ? 'none' : '1px solid #E2E8F0'
                        }}
                    >
                        <i className="fa-solid fa-rotate" style={{ marginRight: '6px' }}></i>
                        {t('table.modals.startTime')} / {t('table.modals.lastAction')}
                    </button>
                </div>

                <div className="offcanvas-body" style={{ padding: '1rem 1.5rem 1.5rem' }}>

                    {/* ── TAB 1: Clock In / Clock Out ── */}
                    {createTab === 'clockInOut' && (
                        <div style={{ display: 'grid', gap: '1rem' }}>

                            {/* Worker */}
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.worker')}</label>
                                <select
                                    value={createForm.worker_id}
                                    onChange={e => setCreateForm(prev => ({ ...prev, worker_id: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                >
                                    <option value="">{t('table.modals.selectWorker')}</option>
                                    {employees.filter(e => e.active !== false).map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Clock In & Clock Out */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.clockIn')}</label>
                                    <input
                                        type="datetime-local"
                                        value={createForm.created_at}
                                        onChange={e => setCreateForm(prev => ({ ...prev, created_at: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.clockOut')}</label>
                                    <input
                                        type="datetime-local"
                                        value={createForm.end_time}
                                        onChange={e => setCreateForm(prev => ({ ...prev, end_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>

                            {/* Total Duration — read-only, auto-calculated */}
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>
                                    {t('table.modals.duration')}
                                    <span style={{ fontWeight: 400, fontSize: '0.78rem', color: '#94A3B8', marginLeft: '6px' }}>(auto-calculated)</span>
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', background: '#F8FAFC', borderRadius: '6px', border: '1.5px solid #E2E8F0' }}>
                                    <i className="fa-regular fa-hourglass" style={{ color: '#94A3B8' }}></i>
                                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', fontFamily: `'JetBrains Mono', monospace` }}>
                                        {String(createForm.active_hours).padStart(2, '0')}h {String(createForm.active_minutes).padStart(2, '0')}m
                                    </span>
                                </div>
                            </div>

                            {/* Hourly Rate */}
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.hourlyRate')}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={createForm.hourly_rate}
                                    onChange={e => setCreateForm(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)} style={{ padding: '0.6rem 1.25rem' }}>{t('table.modals.cancel')}</button>
                                <button className="btn btn-primary" onClick={handleCreateTask} style={{ padding: '0.6rem 1.25rem' }}>{t('table.modals.create')}</button>
                            </div>
                        </div>
                    )}

                    {/* ── TAB 2: Start Time / Last Action ── */}
                    {createTab === 'startLastAction' && (
                        <div style={{ display: 'grid', gap: '1rem' }}>

                            {/* Worker */}
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.worker')}</label>
                                <select
                                    value={createForm.worker_id}
                                    onChange={e => setCreateForm(prev => ({ ...prev, worker_id: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                >
                                    <option value="">{t('table.modals.selectWorker')}</option>
                                    {employees.filter(e => e.active !== false).map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* MO & Operation */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.columns.mo')}</label>
                                    <select
                                        value={createForm.mo_reference}
                                        onChange={e => setCreateForm(prev => ({ ...prev, mo_reference: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                    >
                                        <option value="">{t('table.modals.selectMo')}</option>
                                        {mos.map(m => (
                                            <option key={m.id} value={m.mo_number}>{m.mo_number} - {m.product_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.columns.operation')}</label>
                                    <select
                                        value={createForm.description}
                                        onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                    >
                                        <option value="">{t('table.modals.selectOp')}</option>
                                        {operations.map(op => (
                                            <option key={op} value={op}>{op}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.status')}</label>
                                <select
                                    value={createForm.status}
                                    onChange={e => setCreateForm(prev => ({ ...prev, status: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                >
                                    <option value="pending">{t('table.statusLabels.pending')}</option>
                                    <option value="clocked_in">{t('table.statusLabels.clockedIn')}</option>
                                    <option value="active">{t('table.statusLabels.timerRunning')}</option>
                                    <option value="break">{t('table.statusLabels.onBreak')}</option>
                                    <option value="completed">{t('table.statusLabels.completed')}</option>
                                </select>
                            </div>

                            {/* Start Time & Last Action */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.startTime')}</label>
                                    <input
                                        type="datetime-local"
                                        value={createForm.start_time}
                                        onChange={e => setCreateForm(prev => ({ ...prev, start_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.modals.lastAction')}</label>
                                    <input
                                        type="datetime-local"
                                        value={createForm.last_action_time}
                                        onChange={e => setCreateForm(prev => ({ ...prev, last_action_time: e.target.value }))}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)} style={{ padding: '0.6rem 1.25rem' }}>{t('table.modals.cancel')}</button>
                                <button className="btn btn-primary" onClick={handleCreateTask} style={{ padding: '0.6rem 1.25rem' }}>{t('table.modals.create')}</button>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {isCreateOpen && <div className="overlay active" style={{ zIndex: 3000 }} onClick={() => setIsCreateOpen(false)}></div>}

            {isEditOpen && <div className="overlay active" style={{ zIndex: 3000 }} onClick={() => setIsEditOpen(false)}></div>}

            {/* Custom Premium Alert/Confirm Dialog */}
            {confirmModal.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                }}>
                    <div style={{
                        background: 'var(--bg-card)',
                        color: 'var(--text-main)',
                        padding: '2rem',
                        borderRadius: '16px',
                        width: 'min(440px, 90%)',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.15)',
                        border: '1px solid var(--border)',
                    }}>
                        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className={confirmModal.isAlert ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-question"} style={{ color: confirmModal.isAlert ? 'var(--primary)' : '#EF4444' }}></i>
                            {confirmModal.title}
                        </h3>
                        <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {confirmModal.message}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            {!confirmModal.isAlert && (
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                                    style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, background: 'var(--bg-body)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                                >
                                    Cancel
                                </button>
                            )}
                            <button 
                                className="btn btn-primary" 
                                onClick={() => {
                                    if (confirmModal.onConfirm) confirmModal.onConfirm();
                                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                }}
                                style={{ 
                                    padding: '0.6rem 1.5rem', 
                                    fontSize: '0.85rem', 
                                    fontWeight: 600, 
                                    background: confirmModal.isAlert ? 'var(--primary)' : '#EF4444', 
                                    border: 'none',
                                    color: 'white',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.15)'
                                }}
                            >
                                {confirmModal.isAlert ? 'OK' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
