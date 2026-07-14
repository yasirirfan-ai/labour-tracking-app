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
            const { data: logsData } = await supabase.from('activity_logs').select('*').order('timestamp', { ascending: false });

            if (taskData && empData) {
                const nonPendingTasks = taskData.filter((t: any) => t.status !== 'pending');
                const richTasks = nonPendingTasks.map((t: any) => {
                    const emp = empData.find(e => e.id === t.assigned_to_id);
                    return { ...t, worker_name: emp?.name || 'Unknown', worker_id_str: emp?.worker_id || '-', worker_avatar: emp?.name?.[0] || '?' };
                });
                setTasks(richTasks);
                setEmployees(empData);
            }
            if (moData) {
                const sortedMos = sortManufacturingOrders(moData as any[]);
                setMos(sortedMos);
            }
            if (opData) setOperations(opData.map((o: any) => o.name));

            if (logsData) {
                setActivityLogs(logsData);
            }

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
        
        // Find the clock_in log that is closest to but BEFORE (or equal to) the task's timestamp
        const clockInLogsBeforeTask = workerLogs
            .filter(l => l.event_type === 'clock_in' && new Date(l.timestamp).getTime() <= taskTime)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
        const clockInLog = clockInLogsBeforeTask[0];
        
        if (!clockInLog) {
            // Fallback to the first clock_in of the same calendar day if no log precedes the task timestamp
            const taskDateStr = new Date(taskDateIso).toDateString();
            const sameDayClockIn = workerLogs.find(l => 
                l.event_type === 'clock_in' && 
                new Date(l.timestamp).toDateString() === taskDateStr
            );
            return {
                clockIn: sameDayClockIn ? sameDayClockIn.timestamp : null,
                clockOut: null
            };
        }
        
        const clockInTime = new Date(clockInLog.timestamp).getTime();
        
        // Find the earliest clock_out log AFTER that clock_in log
        const clockOutLogsAfterClockIn = workerLogs
            .filter(l => l.event_type === 'clock_out' && new Date(l.timestamp).getTime() >= clockInTime)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
        const clockOutLog = clockOutLogsAfterClockIn[0];
        
        return {
            clockIn: clockInLog.timestamp,
            clockOut: clockOutLog ? clockOutLog.timestamp : null
        };
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

    const handleEditClick = (task: any) => {
        setEditingTask(task);

        // Convert seconds to H:M
        const totalSec = task.active_seconds || 0;
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);

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

    const handleUpdateTask = async () => {
        if (!editingTask) return;

        // Check if worker is on break when setting to active
        if (editForm.status === 'active') {
            const worker = employees.find(e => e.id === editingTask.assigned_to_id);
            if (worker && worker.availability === 'break') {
                alert(t('matrix.cannotActionBreak', { action: 'start', name: worker.name }));
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

        // Prepare updates
        const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');
        const updates: any = {
            status: editForm.status,
            active_seconds: totalSeconds,
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
            alert(t('table.errorUpdating') + ': ' + e.message);
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm(t('table.deleteConfirm'))) return;
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert(t('table.errorDeleting') + ': ' + err.message);
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
            alert(t('table.modals.worker') + ' is required.');
            return;
        }
        if (createTab === 'startLastAction' && (!createForm.mo_reference || !createForm.description)) {
            alert(t('table.modals.validationError'));
            return;
        }

        const emp = employees.find(e => e.id === createForm.worker_id);

        if (createForm.status === 'active' && emp?.availability === 'break') {
            alert(t('matrix.cannotActionBreak', { action: 'start', name: emp.name }));
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
            alert(t('table.errorCreating') + ': ' + e.message);
        }
    };

    // Returns the UTC Date corresponding to midnight (start) or 23:59:59.999 (end)
    // of a YYYY-MM-DD date in America/Los_Angeles (PST/PDT), handles DST automatically.
    const getPSTBound = (dateStr: string, endOfDay: boolean): Date => {
        const timeStr = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
        const utcDate = new Date(dateStr + timeStr);
        const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC' });
        const laStr = utcDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const offsetMs = new Date(utcStr).getTime() - new Date(laStr).getTime();
        return new Date(utcDate.getTime() + offsetMs);
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
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}></i>
                    <input
                        type="text"
                        placeholder={t('table.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.25rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                    />
                </div>

                <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', background: 'white' }}>
                    <option value="all">{t('table.allWorkers')}</option>
                    {employees.filter(e => e.active !== false).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>

                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', background: 'white' }}>
                    <option value="all">{t('table.allStatuses')}</option>
                    <option value="timer running">{t('table.statusLabels.timerRunning')}</option>
                    <option value="clocked in">{t('table.statusLabels.clockedIn')}</option>
                    <option value="on break">{t('table.statusLabels.onBreak')}</option>
                    <option value="completed">{t('table.statusLabels.completed')}</option>
                    <option value="pending">{t('table.statusLabels.pending')}</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F8FAFC', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>{t('table.from')}</span>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setActiveChip(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: '#475569' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F8FAFC', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>{t('table.to')}</span>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setActiveChip(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: '#475569' }} />
                </div>

                <button className="btn btn-secondary" onClick={resetFilters} style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
                    {t('table.reset')}
                </button>
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
                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.workerId')}</th>
                            <th className="sticky-column" style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569', left: '100px' }}>{t('table.columns.name')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.mo')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.operation')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.clockIn')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.startTime')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.clockOut')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.lastAction')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.duration')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{t('table.columns.status')}</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Audit Record</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#475569' }}>{t('table.columns.edit')}</th>
                        </tr>
                    </thead>
                    <tbody style={{ background: 'white' }}>
                        {filteredTasks.map(task => (
                            <tr key={task.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#64748B', fontFamily: `'JetBrains Mono', monospace` }}>{task.worker_id_str}</td>
                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', left: '100px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '32px', height: '32px', background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem' }}>
                                            {task.worker_avatar}
                                        </div>
                                        <span style={{ fontWeight: 600, color: '#1E293B' }}>{task.worker_name}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>{task.mo_reference}</span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{task.description}</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                    {(() => {
                                        const { clockIn } = getWorkerShiftTimesForDate(task.assigned_to_id, task.created_at);
                                        return clockIn ? formatDateTime(clockIn) : formatDateTime(task.created_at);
                                    })()}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                    {formatTimeOnly(task.start_time)}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                    {(() => {
                                        const { clockIn, clockOut } = getWorkerShiftTimesForDate(task.assigned_to_id, task.created_at);
                                        if (clockOut) {
                                            return formatDateTime(clockOut);
                                        }
                                        if (clockIn || task.status !== 'completed') {
                                            return <span style={{ color: '#16A34A', fontWeight: 600 }}>Still Clocked In</span>;
                                        }
                                        return task.end_time ? formatDateTime(task.end_time) : '-';
                                    })()}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.85rem', fontWeight: 500 }}>
                                    {formatTimeOnly(task.last_action_time)}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontFamily: `'JetBrains Mono', monospace`, color: '#334155', fontWeight: 600 }}>
                                            {formatCurrentTime(task)}
                                        </span>
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>{getStatusLabel(task.status)}</td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#64748B' }}>
                                    {(() => {
                                        // 1. Check Task.reason (Most reliable direct audit)
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

                                        // 2. Fallback to Activity Logs extraction
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
                                        return <span style={{ fontStyle: 'italic', color: '#94A3B8' }}>Worker action</span>;
                                    })()}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={() => handleEditClick(task)}
                                        className="icon-btn"
                                        title={t('table.columns.edit')}
                                        style={{ color: '#475569', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                    >
                                        <i className="fa-solid fa-pen-to-square"></i>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="icon-btn delete"
                                        title={t('common.delete')}
                                        style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                    >
                                        <i className="fa-regular fa-trash-can"></i>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

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
        </>
    );
};
