import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sortManufacturingOrders } from '../utils/moSorting';
import { useAuth } from '../context/AuthContext';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { buildShiftsForWorker, buildBreaksForWorker, getElapsedMsForLogs, classifyBreakType, DAILY_SHIFT_CAP_MS, DAILY_SHIFT_CAP_LABEL } from '../lib/shifts';
import { useTranslation } from 'react-i18next';
import { parsePSTToUTC, pstDayStart, pstDayEnd, todayPST } from '../lib/timezone';

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
        hourly_rate: 0,
        mo_reference: '',
        description: ''
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
                    const emp = empData.find((e: any) => e.id === t.assigned_to_id);
                    let active_seconds = t.active_seconds;
                    let status = t.status;
                    let end_time = t.end_time;
                    let last_action_time = t.last_action_time;

                    if (t.manual) {
                        const taskLogs = logsData.filter((l: any) => l.related_task_id === t.id);
                        const clockInLog = taskLogs.find((l: any) => l.event_type === 'clock_in');
                        let clockOutLog = taskLogs.find((l: any) => l.event_type === 'clock_out');

                        if (!clockOutLog) {
                            const shiftOut = getWorkerShiftTimesForDate(t.assigned_to_id, clockInLog ? clockInLog.timestamp : t.created_at || t.start_time, logsData, empData).clockOut;
                            if (shiftOut) {
                                clockOutLog = { timestamp: shiftOut } as any;
                            }
                        }

                        if (clockInLog) {
                            const start = new Date(clockInLog.timestamp).getTime();
                            const end = clockOutLog ? new Date(clockOutLog.timestamp).getTime() : new Date().getTime();

                            const breaks = buildBreaksForWorker(logsData.filter((l: any) => l.worker_id === t.assigned_to_id));
                            const shiftBreaks = breaks.filter((b) => {
                                return b.startMs >= start && b.startMs <= end;
                            });

                            // Only unpaid breaks reduce payable active_seconds — paid breaks
                            // (coffee/short rest/restroom) count as part of the shift.
                            let breakSec = 0;
                            shiftBreaks.forEach((b) => {
                                if (b.type !== 'unpaid') return;
                                if (b.endMs !== null) {
                                    breakSec += Math.floor((b.endMs - b.startMs) / 1000);
                                } else if (emp?.status === 'present' && emp?.availability === 'break') {
                                    breakSec += Math.floor((new Date().getTime() - b.startMs) / 1000);
                                }
                            });

                            active_seconds = Math.max(0, Math.floor((end - start) / 1000) - breakSec);

                            if (clockOutLog) {
                                status = 'completed';
                                end_time = clockOutLog.timestamp;
                            } else {
                                status = 'active';
                                last_action_time = new Date().toISOString();
                            }
                        }
                    }

                    return {
                        ...t,
                        active_seconds,
                        status,
                        end_time,
                        last_action_time,
                        worker_name: emp?.name || 'Unknown',
                        worker_id_str: emp?.worker_id || '-',
                        worker_avatar: emp?.name?.[0] || '?'
                    };
                });

                const virtualTasks: any[] = [];
                empData.forEach((emp: any) => {
                    const workerLogs = logsData
                        .filter((l: any) => l.worker_id === emp.id)
                        // A Manual Entry's own clock_in/clock_out logs are tagged with related_task_id
                        // (they exist only to keep shift-pairing correct). Exclude them here so their
                        // duration — already counted via the task's own active_seconds — isn't summed
                        // a second time into this virtual shift.
                        .filter((l: any) => !((l.event_type === 'clock_in' || l.event_type === 'clock_out') && l.related_task_id))
                        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                    const shifts = buildShiftsForWorker(workerLogs);

                    // Group shifts by local date (PST)
                    const shiftsByDay = new Map<string, typeof shifts>();
                    shifts.forEach((shift) => {
                        const dateStr = new Date(shift.clockIn.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                        if (!shiftsByDay.has(dateStr)) {
                            shiftsByDay.set(dateStr, []);
                        }
                        shiftsByDay.get(dateStr)!.push(shift);
                    });

                    shiftsByDay.forEach((dayShifts, dateStr) => {
                        const firstShift = dayShifts[0];
                        const lastShift = dayShifts[dayShifts.length - 1];

                        const clockInTime = firstShift.clockIn.timestamp;
                        const isPresent = emp.status === 'present';
                        const clockOutTime = lastShift.clockOut
                            ? lastShift.clockOut.timestamp
                            : (isPresent ? null : (emp.last_status_change || firstShift.clockIn.timestamp));

                        // Calculate total active seconds (excluding breaks) for all shifts on this day
                        let totalActiveSeconds = 0;
                        const breaks = buildBreaksForWorker(workerLogs);
                        let totalBreakSeconds = 0; // Just for reference, but active_seconds is what matters

                        dayShifts.forEach((s) => {
                            const shiftStart = new Date(s.clockIn.timestamp).getTime();
                            const shiftEnd = s.clockOut
                                ? new Date(s.clockOut.timestamp).getTime()
                                : (isPresent ? new Date().getTime() : new Date(emp.last_status_change || s.clockIn.timestamp).getTime());

                            let shiftActiveMs = shiftEnd - shiftStart;

                            // totalBreakSeconds tracks ALL break time taken (informational). Only
                            // unpaid breaks reduce shiftActiveMs — paid breaks stay payable.
                            breaks.forEach(b => {
                                const breakEnd = b.endMs ?? (isPresent ? new Date().getTime() : new Date(emp.last_status_change || b.startMs).getTime());
                                const clippedStart = Math.max(b.startMs, shiftStart);
                                const clippedEnd = Math.min(breakEnd, shiftEnd);
                                if (clippedEnd > clippedStart) {
                                    totalBreakSeconds += Math.max(0, Math.floor((clippedEnd - clippedStart) / 1000));
                                    if (b.type === 'unpaid') {
                                        shiftActiveMs -= (clippedEnd - clippedStart);
                                    }
                                }
                            });

                            totalActiveSeconds += Math.max(0, Math.floor(shiftActiveMs / 1000));
                        });

                        // Audit Record: Find the last audit description or manager action of the day
                        let auditRecord = 'Worker action';
                        for (let i = dayShifts.length - 1; i >= 0; i--) {
                            const s = dayShifts[i];
                            if (s.clockOut && s.clockOut.description && s.clockOut.description.includes('by ')) {
                                auditRecord = s.clockOut.description;
                                break;
                            }
                            if (s.clockIn.description && s.clockIn.description.includes('by ')) {
                                auditRecord = s.clockIn.description;
                                break;
                            }
                        }

                        virtualTasks.push({
                            id: `virtual_${emp.id}_${dateStr}`, // Consolidate ID by day
                            assigned_to_id: emp.id,
                            mo_reference: '',
                            description: 'Clocked In (No active task)',
                            status: clockOutTime ? 'completed' : 'clocked_in',
                            active_seconds: totalActiveSeconds,
                            created_at: clockInTime,
                            start_time: null,
                            end_time: clockOutTime,
                            hourly_rate: emp.hourly_rate || 0,
                            break_seconds: totalBreakSeconds,
                            manual: false,
                            reason: clockOutTime ? 'Shift Completed' : 'Shift Active',
                            worker_name: emp.name || 'Unknown',
                            worker_id_str: emp.worker_id || '-',
                            worker_avatar: emp.name?.[0] || '?',
                            is_virtual: true,
                            clock_in_time: clockInTime,
                            clock_out_time: clockOutTime,
                            audit_record: auditRecord,
                            open_break_start: breaks.find(b => b.endMs === null)?.startMs
                                ? new Date(breaks.find(b => b.endMs === null)!.startMs).toISOString()
                                : null
                        });
                    });
                });

                // Group everything (richTasks + virtualTasks) by worker_id and dateStr
                const consolidatedMap = new Map<string, any[]>();

                // Add all database tasks
                richTasks.forEach((t: any) => {
                    const taskDate = new Date(t.created_at || t.start_time || new Date());
                    const dateStr = taskDate.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                    const key = `${t.assigned_to_id}_${dateStr}`;
                    if (!consolidatedMap.has(key)) {
                        consolidatedMap.set(key, []);
                    }
                    consolidatedMap.get(key)!.push({ ...t, is_db_task: true });
                });

                // Add virtual shifts for worker+day combos that have NO DB tasks, OR where every
                // DB task present is a Manual Entry. For a real (non-manual) tracked task, the
                // activity logs that generated the virtual shift belong to that task — adding both
                // would double-count active_seconds (e.g. 8.5h task + 8.5h virtual = 17h shown), so
                // that case still stays suppressed exactly as before. A Manual Entry is different:
                // its own clock_in/clock_out logs were already excluded above (related_task_id), so
                // what's left here is time NOT covered by any task and safe to add on top — this is
                // what lets a Manual Entry's hours combine with an existing same-day shift instead
                // of silently replacing it.
                virtualTasks.forEach((v: any) => {
                    const key = `${v.assigned_to_id}_${v.id.split('_')[2]}`;
                    const dbTasksForDay = (consolidatedMap.get(key) || []).filter((item: any) => item.is_db_task);
                    const hasDbTask = dbTasksForDay.length > 0;
                    const allDbTasksAreManual = hasDbTask && dbTasksForDay.every((item: any) => item.manual);
                    if (!hasDbTask || allDbTasksAreManual) {
                        if (!consolidatedMap.has(key)) {
                            consolidatedMap.set(key, []);
                        }
                        consolidatedMap.get(key)!.push({ ...v, is_virtual_shift: true });
                    }
                });

                const consolidatedRows: any[] = [];
                consolidatedMap.forEach((items, key) => {
                    const [workerId, dateStr] = key.split('_');
                    const emp = empData.find((e: any) => e.id === workerId);
                    if (!emp) return;

                    // Sort items by start time
                    const sortedItems = items.sort((a, b) => {
                        const timeA = new Date(a.clock_in_time || a.start_time || a.created_at).getTime();
                        const timeB = new Date(b.clock_in_time || b.start_time || b.created_at).getTime();
                        return timeA - timeB;
                    });

                    const firstItem = sortedItems[0];
                    const lastItem = sortedItems[sortedItems.length - 1];

                    const clockInTime = firstItem.clock_in_time || firstItem.start_time || firstItem.created_at;

                    const isPresent = emp.status === 'present';
                    let clockOutTime: string | null = null;
                    const latestHasClockOut = lastItem.clock_out_time || lastItem.end_time;

                    if (latestHasClockOut) {
                        clockOutTime = latestHasClockOut;
                    } else if (isPresent) {
                        clockOutTime = null;
                    } else {
                        clockOutTime = emp.last_status_change || clockInTime;
                    }

                    // Sum active seconds and break seconds
                    let totalActiveSeconds = 0;
                    let totalBreakSeconds = 0;

                    items.forEach((item) => {
                        totalBreakSeconds += item.break_seconds || 0;
                        totalActiveSeconds += item.active_seconds || 0;
                    });

                    // Consolidate status — a day that already has its own clock-out (closed shift)
                    // must stay 'completed' regardless of what the worker is doing right now on a
                    // later day. Only the currently-open day (no clock-out yet) should reflect the
                    // worker's live present/on-break state.
                    const isOnBreak = emp.availability === 'break';
                    let status = 'completed';
                    if (!latestHasClockOut && isPresent) {
                        status = isOnBreak ? 'break' : 'clocked_in';
                    }

                    // Consolidate MO and descriptions
                    const mos = Array.from(new Set(items.map(item => item.mo_reference).filter(Boolean))).join(', ');
                    const descriptions = Array.from(new Set(items.map(item => item.description).filter(Boolean))).join(', ');

                    // Consolidate Audit Record
                    let auditRecord = 'Worker action';
                    for (let i = items.length - 1; i >= 0; i--) {
                        const item = items[i];
                        if (item.audit_record && item.audit_record.includes('by ')) {
                            auditRecord = item.audit_record;
                            break;
                        }
                        if (item.reason && item.reason.includes('by ')) {
                            auditRecord = item.reason;
                            break;
                        }
                    }

                    const openBreakStartItem = items.find(item => item.open_break_start);
                    const openBreakStart = openBreakStartItem ? openBreakStartItem.open_break_start : null;

                    consolidatedRows.push({
                        id: `virtual_${workerId}_${dateStr}`, // virtual prefix for edit/delete
                        assigned_to_id: workerId,
                        mo_reference: mos,
                        description: descriptions || 'Work Shift',
                        status: status,
                        active_seconds: totalActiveSeconds,
                        created_at: clockInTime,
                        start_time: clockInTime,
                        end_time: clockOutTime,
                        hourly_rate: emp.hourly_rate || 0,
                        break_seconds: totalBreakSeconds,
                        manual: items.some(item => item.manual),
                        reason: auditRecord,
                        worker_name: emp.name || 'Unknown',
                        worker_id_str: emp.worker_id || '-',
                        worker_avatar: emp.name?.[0] || '?',
                        is_virtual: true,
                        clock_in_time: clockInTime,
                        clock_out_time: clockOutTime,
                        audit_record: auditRecord,
                        open_break_start: openBreakStart
                    });
                });

                setTasks(consolidatedRows);
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
            const endToUse = task.end_time ? new Date(task.end_time).getTime() : new Date().getTime();
            const diff = Math.floor((endToUse - new Date(task.last_action_time).getTime()) / 1000);
            if (diff > 0) total += diff;
        }
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
    };

    // logsOverride/employeesOverride let callers inside fetchData() pass the just-fetched
    // logsData/empData directly. Without this, calls made from the polling setInterval (which
    // captured fetchData once on mount, per its `[]` deps) would keep reading the activityLogs/
    // employees *state* as it was on that very first render (i.e. still empty) forever, since
    // that interval closure never gets recreated. That made this helper permanently return
    // { clockIn: null, clockOut: null } for every call made from within fetchData, which in turn
    // made manual-entry tasks whose clock-out log isn't tagged to them look perpetually "active"
    // with a duration that grows every poll instead of settling once the shift actually ended.
    const getWorkerShiftTimesForDate = (workerId: string, taskDateIso: string, logsOverride?: any[], employeesOverride?: any[]) => {
        const logs = logsOverride || activityLogs;
        const emps = employeesOverride || employees;
        if (!taskDateIso || !logs || logs.length === 0) {
            return { clockIn: null, clockOut: null };
        }
        const taskTime = new Date(taskDateIso).getTime();
        const workerLogs = logs
            .filter(l => l.worker_id === workerId)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Find a shift where taskTime falls within [clockIn - 60s, clockOut + 60s]
        const shifts = buildShiftsForWorker(workerLogs);
        for (const shift of shifts) {
            const ciTime = new Date(shift.clockIn.timestamp).getTime();

            // Look up worker status to resolve open shifts for offline workers
            const emp = emps.find(e => e.id === workerId);
            const isCurrentlyPresent = emp?.status === 'present';

            const coTime = shift.clockOut
                ? new Date(shift.clockOut.timestamp).getTime()
                : (isCurrentlyPresent ? Infinity : new Date(emp?.last_status_change || shift.clockIn.timestamp).getTime());

            if (taskTime >= ciTime - 60000 && taskTime <= coTime + 60000) {
                return {
                    clockIn: shift.clockIn.timestamp,
                    clockOut: shift.clockOut
                        ? shift.clockOut.timestamp
                        : (isCurrentlyPresent ? null : (emp?.last_status_change || shift.clockIn.timestamp))
                };
            }
        }

        return { clockIn: null, clockOut: null };
    };

    const formatTimeOnly = (isoString: string) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).toUpperCase();
    };

    const formatDateTime = (isoString: string) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
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

        let isDailyVirtual = false;
        let targetDateStr = '';
        if (task.id && String(task.id).startsWith('virtual_')) {
            isDailyVirtual = true;
            const parts = String(task.id).split('_');
            targetDateStr = parts.slice(2).join('_');
        }

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
                        reason: log.description || 'Rest Break',
                        type: classifyBreakType(log.description)
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
            const emp = employees.find(e => e.id === workerId);
            const isCurrentlyPresent = emp?.status === 'present';
            const end = isCurrentlyPresent ? new Date().getTime() : new Date(emp?.last_status_change || activeBreak.start_time).getTime();
            const duration = Math.floor((end - new Date(activeBreak.start_time).getTime()) / 1000);
            activeBreak.duration_seconds = Math.max(0, duration);
            allBreaks.push(activeBreak);
        }

        if (isDailyVirtual) {
            return allBreaks.filter(b => {
                const bDateStr = new Date(b.start_time).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                return bDateStr === targetDateStr;
            });
        }

        const taskTimeIso = task.created_at || task.start_time || task.end_time;
        const { clockIn, clockOut } = getWorkerShiftTimesForDate(workerId, taskTimeIso);
        const shiftStart = clockIn ? new Date(clockIn).getTime() : new Date(taskTimeIso).getTime();
        const shiftEnd = clockOut ? new Date(clockOut).getTime() : (task.end_time ? new Date(task.end_time).getTime() : Infinity);

        return allBreaks.filter(b => {
            const bStart = new Date(b.start_time).getTime();
            return bStart >= shiftStart - 60000 && bStart <= shiftEnd + 60000;
        });
    };

    const formatToInputDateTime = (isoString: string | null) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';

        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(d);
        const getVal = (type: string) => parts.find(p => p.type === type)!.value;

        const y = getVal('year');
        const m = getVal('month');
        const day = getVal('day');
        let h = getVal('hour');
        if (h === '24') h = '00';
        const min = getVal('minute');

        return `${y}-${m}-${day}T${h}:${min}`;
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
            start_time: (task.is_virtual || !task.start_time) ? '' : task.start_time.substring(0, 16),
            end_time: task.end_time ? task.end_time.substring(0, 16) : '',
            last_action_time: task.last_action_time ? task.last_action_time.substring(0, 16) : '',
            status: task.status,
            active_hours: h,
            active_minutes: m,
            hourly_rate: task.hourly_rate || 0,
            mo_reference: task.mo_reference || '',
            description: task.description || ''
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

            // Defensive daily-cap check, validated before any writes happen. The shift's own
            // clock-in/out span (gross elapsed time) doesn't change from editing breaks — only
            // the paid/unpaid split within it does — so this is really a backstop against
            // re-saving over a pre-existing entry that was already above the cap, not something
            // this edit itself could newly cause.
            if (!editingTask.is_virtual) {
                const grossMs = new Date(shiftEnd).getTime() - new Date(shiftStart).getTime();
                if (grossMs > DAILY_SHIFT_CAP_MS) {
                    showCustomAlert(`This entry's total duration exceeds the ${DAILY_SHIFT_CAP_LABEL} daily limit. Please shorten it.`);
                    return;
                }
            }

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
                            timestamp: parsePSTToUTC(b.start_time).toISOString()
                        });
                    }
                    if (b.end_time) {
                        logsToInsert.push({
                            worker_id: editingTask.assigned_to_id,
                            event_type: 'break_end',
                            related_task_id: editingTask.is_virtual ? null : editingTask.id,
                            description: 'Returned from Break',
                            timestamp: parsePSTToUTC(b.end_time).toISOString()
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
                // break_seconds stays the TOTAL (paid + unpaid) for display/audit purposes.
                // active_seconds — the payable figure — is recomputed from the shift's fixed
                // gross span minus only the unpaid portion, so paid breaks (coffee/short
                // rest/restroom) stay counted as payable time instead of being deducted.
                const newBreakSeconds = editBreaks.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
                const newUnpaidBreakSeconds = editBreaks
                    .filter(b => classifyBreakType(b.reason) === 'unpaid')
                    .reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
                const grossSeconds = Math.max(0, Math.floor((new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()) / 1000));
                const newActiveSeconds = Math.max(0, grossSeconds - newUnpaidBreakSeconds);
                const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');

                await (supabase.from('tasks') as any)
                    .update({
                        break_seconds: newBreakSeconds,
                        active_seconds: newActiveSeconds,
                        reason: `Breaks updated by ${auditName}`
                    })
                    .eq('id', editingTask.id);

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

    // Enforces "one task entry per worker per day": looks up whether the worker already has a
    // task row on the given PST day (optionally excluding a specific task id, e.g. the one
    // currently being edited/moved). Returns the row if found, else null.
    const findWorkerTaskForDay = async (workerId: string, dateStr: string, excludeTaskId?: string) => {
        const { data } = await supabase.from('tasks').select('*').eq('assigned_to_id', workerId) as { data: any[] | null };
        const match = (data || []).find((t: any) => {
            if (excludeTaskId && t.id === excludeTaskId) return false;
            const tDate = new Date(t.created_at || t.start_time).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
            return tDate === dateStr;
        });
        return match || null;
    };

    const handleUpdateTask = async () => {
        if (!editingTask) return;

        if (editingTask.is_virtual) {
            try {
                const parts = editingTask.id.split('_');
                const workerId = parts[1];
                const dateStr = parts.slice(2).join('_');

                // 1. Calculate active seconds from the edit form (similar to regular task edit)
                let totalSeconds = 0;
                if (editForm.start_time && editForm.end_time) {
                    const start = parsePSTToUTC(editForm.start_time).getTime();
                    const end = parsePSTToUTC(editForm.end_time).getTime();
                    if (!isNaN(start) && !isNaN(end) && end >= start) {
                        totalSeconds = Math.floor((end - start) / 1000);
                    } else {
                        totalSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
                    }
                } else {
                    totalSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
                }

                // Hard daily cap: this day's total (break time included) can never exceed 8h45m,
                // whether it's a live shift or an admin editing it after the fact.
                if (totalSeconds > DAILY_SHIFT_CAP_MS / 1000) {
                    showCustomAlert(`This day's duration exceeds the ${DAILY_SHIFT_CAP_LABEL} daily limit. Please shorten it.`);
                    return;
                }

                // 2. Fetch all tasks for this worker to see if there are manual tasks on this day
                const { data: dbTasks, error: tasksErr } = await supabase
                    .from('tasks')
                    .select('*')
                    .eq('assigned_to_id', workerId);

                if (tasksErr) throw tasksErr;

                // Find tasks on this date
                const dayTasks = (dbTasks || [] as any[]).filter((t: any) => {
                    const tDate = new Date(t.created_at || t.start_time).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                    return tDate === dateStr;
                });

                // Unpaid breaks reduce active/payable time — without this, an edited-in unpaid
                // break would sit alongside the shift instead of being deducted from its
                // duration. Paid breaks (coffee/short rest/restroom) stay counted as payable
                // time, so only the unpaid portion is subtracted from netActiveSeconds.
                const totalBreakSecondsForEdit = editBreaks.reduce((sum: number, b: any) => sum + (b.duration_seconds || 0), 0);
                const unpaidBreakSecondsForEdit = editBreaks
                    .filter((b: any) => classifyBreakType(b.reason) === 'unpaid')
                    .reduce((sum: number, b: any) => sum + (b.duration_seconds || 0), 0);
                const netActiveSeconds = Math.max(0, totalSeconds - unpaidBreakSecondsForEdit);

                if (dayTasks.length > 0) {
                    // One entry per worker per day: update only that single task, not every row
                    // in dayTasks — looping and writing the same totals onto each one would
                    // duplicate the day's duration N times over the next time it's summed. If
                    // legacy data somehow has more than one task for this day, only the first
                    // is updated here; it isn't split across the rest.
                    const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');
                    const t = (dayTasks as any[])[0];

                    const taskUpdates: any = {
                        active_seconds: netActiveSeconds,
                        break_seconds: totalBreakSecondsForEdit,
                        mo_reference: editForm.mo_reference,
                        description: editForm.description,
                        hourly_rate: editForm.hourly_rate,
                        status: editForm.end_time ? 'completed' : editForm.status,
                        reason: `Updated by ${auditName}`
                    };
                    if (editForm.created_at) taskUpdates.created_at = parsePSTToUTC(editForm.created_at).toISOString();
                    if (editForm.start_time) taskUpdates.start_time = parsePSTToUTC(editForm.start_time).toISOString();
                    if (editForm.end_time) {
                        taskUpdates.end_time = parsePSTToUTC(editForm.end_time).toISOString();
                        taskUpdates.last_action_time = taskUpdates.end_time;
                    } else {
                        taskUpdates.end_time = null;
                        if (editForm.last_action_time) taskUpdates.last_action_time = parsePSTToUTC(editForm.last_action_time).toISOString();
                    }

                    await (supabase.from('tasks') as any)
                        .update(taskUpdates)
                        .eq('id', t.id);
                }

                // 3. Update activity logs (clock-in, clock-out, breaks)
                const { data: logs, error: logsErr } = await supabase
                    .from('activity_logs')
                    .select('*')
                    .eq('worker_id', workerId);

                if (logsErr) throw logsErr;

                const sortedLogs = (logs || [] as any[]).sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                const shifts = buildShiftsForWorker(sortedLogs) as any[];
                const dayShifts = shifts.filter((s: any) => {
                    const sDate = new Date(s.clockIn.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                    return sDate === dateStr;
                });

                if (dayShifts.length > 0) {
                    const firstShift = dayShifts[0];
                    const lastShift = dayShifts[dayShifts.length - 1];

                    // One entry per worker per day: this edit collapses the day to a single
                    // clock-in/clock-out pair (first shift's start, last shift's end). Any shift
                    // strictly in between is removed rather than left unedited and orphaned.
                    const middleShifts = dayShifts.slice(1, -1);
                    for (const mid of middleShifts) {
                        await (supabase.from('activity_logs') as any).delete().eq('id', mid.clockIn.id);
                        if (mid.clockOut) {
                            await (supabase.from('activity_logs') as any).delete().eq('id', mid.clockOut.id);
                        }
                    }

                    const clockIn = firstShift.clockIn.timestamp;
                    const clockOut = lastShift.clockOut ? lastShift.clockOut.timestamp : null;

                    // Update clock_in log:
                    if (clockIn && editForm.created_at) {
                        const newClockInIso = parsePSTToUTC(editForm.created_at).toISOString();
                        await (supabase.from('activity_logs') as any)
                            .update({ timestamp: newClockInIso })
                            .eq('worker_id', workerId)
                            .eq('event_type', 'clock_in')
                            .eq('timestamp', clockIn);
                    }

                    // Update clock_out log:
                    if (editForm.end_time) {
                        const newClockOutIso = parsePSTToUTC(editForm.end_time).toISOString();
                        if (clockOut) {
                            await (supabase.from('activity_logs') as any)
                                .update({ timestamp: newClockOutIso })
                                .eq('worker_id', workerId)
                                .eq('event_type', 'clock_out')
                                .eq('timestamp', clockOut);
                        } else {
                            await (supabase.from('activity_logs') as any).insert({
                                worker_id: workerId,
                                event_type: 'clock_out',
                                description: 'Worker clocked out via admin',
                                timestamp: newClockOutIso
                            });
                        }
                    } else if (clockOut) {
                        await (supabase.from('activity_logs') as any)
                            .delete()
                            .eq('worker_id', workerId)
                            .eq('event_type', 'clock_out')
                            .eq('timestamp', clockOut);
                    }

                    // Update breaks (delete old of that day, insert new):
                    const prevStart = clockIn || editingTask.created_at;
                    const prevEnd = clockOut || editingTask.end_time || new Date().toISOString();

                    await (supabase.from('activity_logs') as any)
                        .delete()
                        .eq('worker_id', workerId)
                        .in('event_type', ['break_start', 'break_end'])
                        .gte('timestamp', new Date(prevStart).toISOString())
                        .lte('timestamp', new Date(prevEnd).toISOString());

                    if (editBreaks.length > 0) {
                        const logsToInsert: any[] = [];
                        editBreaks.forEach(b => {
                            if (b.start_time) {
                                logsToInsert.push({
                                    worker_id: workerId,
                                    event_type: 'break_start',
                                    related_task_id: (dayTasks[0] as any)?.id,
                                    description: b.reason || 'Rest Break',
                                    timestamp: parsePSTToUTC(b.start_time).toISOString()
                                });
                            }
                            if (b.end_time) {
                                logsToInsert.push({
                                    worker_id: workerId,
                                    event_type: 'break_end',
                                    related_task_id: (dayTasks[0] as any)?.id,
                                    description: 'Break ended',
                                    timestamp: parsePSTToUTC(b.end_time).toISOString()
                                });
                            }
                        });
                        if (logsToInsert.length > 0) {
                            const { error: breakErr } = await (supabase.from('activity_logs') as any).insert(logsToInsert);
                            if (breakErr) throw breakErr;
                        }
                    }
                } else if (dayTasks.length > 0) {
                    // If they have manual tasks but NO shift logs in activity_logs, let's create a clock_in and clock_out log
                    // to keep the activity logs in sync!
                    const clockInIso = editForm.created_at ? parsePSTToUTC(editForm.created_at).toISOString() : new Date((dayTasks[0] as any).created_at).toISOString();
                    const clockOutIso = editForm.end_time ? parsePSTToUTC(editForm.end_time).toISOString() : null;

                    const logsToInsert = [{
                        worker_id: workerId,
                        event_type: 'clock_in',
                        description: `Clocked In by System Admin (Manual Entry)`,
                        timestamp: clockInIso
                    }];

                    if (clockOutIso) {
                        logsToInsert.push({
                            worker_id: workerId,
                            event_type: 'clock_out',
                            description: `Clocked Out by System Admin (Manual Entry)`,
                            timestamp: clockOutIso
                        });
                    }

                    await (supabase.from('activity_logs') as any).insert(logsToInsert);

                    if (editBreaks.length > 0) {
                        const breaksToInsert: any[] = [];
                        editBreaks.forEach(b => {
                            if (b.start_time) {
                                breaksToInsert.push({
                                    worker_id: workerId,
                                    event_type: 'break_start',
                                    related_task_id: (dayTasks[0] as any)?.id,
                                    description: b.reason || 'Rest Break',
                                    timestamp: parsePSTToUTC(b.start_time).toISOString()
                                });
                            }
                            if (b.end_time) {
                                breaksToInsert.push({
                                    worker_id: workerId,
                                    event_type: 'break_end',
                                    related_task_id: (dayTasks[0] as any)?.id,
                                    description: 'Break ended',
                                    timestamp: parsePSTToUTC(b.end_time).toISOString()
                                });
                            }
                        });
                        await (supabase.from('activity_logs') as any).insert(breaksToInsert);
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

        // totalBreakSeconds (all breaks) is stored for display/audit. Only unpaid breaks reduce
        // payable time — paid breaks (coffee/short rest/restroom) stay inside netSeconds, so
        // gross = netSeconds + unpaidBreakSeconds, not netSeconds + totalBreakSeconds.
        const totalBreakSeconds = editBreaks.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
        const unpaidBreakSeconds = editBreaks
            .filter(b => classifyBreakType(b.reason) === 'unpaid')
            .reduce((sum, b) => sum + (b.duration_seconds || 0), 0);

        // Calculate active_seconds logic:
        let netSeconds = 0;
        let grossSeconds = 0;
        if (editForm.start_time && editForm.end_time) {
            const start = parsePSTToUTC(editForm.start_time).getTime();
            const end = parsePSTToUTC(editForm.end_time).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                grossSeconds = Math.floor((end - start) / 1000);
                netSeconds = Math.max(0, grossSeconds - unpaidBreakSeconds);
            } else {
                netSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
                grossSeconds = netSeconds + unpaidBreakSeconds;
            }
        } else {
            netSeconds = (parseInt(String(editForm.active_hours)) * 3600) + (parseInt(String(editForm.active_minutes)) * 60);
            grossSeconds = netSeconds + unpaidBreakSeconds;
        }

        // Hard daily cap: total elapsed time (break time included) can never exceed 8h45m.
        if (grossSeconds > DAILY_SHIFT_CAP_MS / 1000) {
            showCustomAlert(`This entry's duration exceeds the ${DAILY_SHIFT_CAP_LABEL} daily limit. Please shorten it.`);
            return;
        }

        // Prepare updates
        const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');
        const updates: any = {
            status: editForm.status,
            active_seconds: netSeconds,
            break_seconds: totalBreakSeconds,
            total_duration_seconds: grossSeconds,
            created_at: editForm.created_at ? parsePSTToUTC(editForm.created_at).toISOString() : editingTask.created_at,
            start_time: editForm.start_time ? parsePSTToUTC(editForm.start_time).toISOString() : null,
            last_action_time: editForm.last_action_time ? parsePSTToUTC(editForm.last_action_time).toISOString() : editingTask.last_action_time,
            hourly_rate: editForm.hourly_rate,
            reason: `Updated by ${auditName}` // Use existing reason field
        };

        // If end_time is provided, force status to completed so it saves correctly
        if (editForm.end_time) {
            updates.end_time = parsePSTToUTC(editForm.end_time).toISOString();
            // If last action time wasn't manually set, sync it with end time
            if (!editForm.last_action_time) {
                updates.last_action_time = updates.end_time;
            }
            updates.status = 'completed';
        } else if (editForm.status !== 'completed') {
            updates.end_time = null; // Clear end time if not completed
        }

        try {
            // One entry per worker per day: if this edit moves the entry onto a day the worker
            // already has a different entry for, merge into that existing entry instead of
            // saving this one in place — which would leave two rows for the same day.
            const workerId = editingTask.assigned_to_id;
            const targetDateStr = new Date(updates.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
            const collisionTask = await findWorkerTaskForDay(workerId, targetDateStr, editingTask.id);

            if (collisionTask && !collisionTask.manual) {
                showCustomAlert('This worker already has a live-tracked entry for that day. Please edit that entry directly instead.');
                return;
            }

            const targetTaskId = collisionTask ? collisionTask.id : editingTask.id;

            const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', targetTaskId);
            if (error) throw error;

            if (collisionTask) {
                // The edited entry has been merged into collisionTask — remove the row it used
                // to live in so the day doesn't end up with two entries.
                await (supabase.from('tasks') as any).delete().eq('id', editingTask.id);
                await (supabase.from('activity_logs') as any)
                    .delete()
                    .eq('related_task_id', editingTask.id)
                    .in('event_type', ['clock_in', 'clock_out']);
            }

            // Sync activity_logs for clock_in / clock_out if they exist
            // Sync clock_in if we changed start_time/created_at
            const newClockIn = updates.start_time || updates.created_at;
            if (newClockIn) {
                const { data: inLogs } = await (supabase.from('activity_logs') as any)
                    .select('*')
                    .eq('worker_id', workerId)
                    .eq('event_type', 'clock_in')
                    .eq('related_task_id', targetTaskId);

                if (inLogs && inLogs.length > 0) {
                    await (supabase.from('activity_logs') as any)
                        .update({ timestamp: newClockIn, description: `Clocked In manually updated by ${auditName}` })
                        .eq('id', inLogs[0].id);
                } else if (collisionTask) {
                    // Merged in from a different task id — its own clock_in log won't be found
                    // under targetTaskId, so create one instead of silently dropping the sync.
                    await logActivity(workerId, 'clock_in', `Manual entry by ${auditName} (merged)`, updates.reason, targetTaskId, newClockIn);
                }
            }

            // Sync clock_out
            if (updates.end_time) {
                const { data: outLogs } = await (supabase.from('activity_logs') as any)
                    .select('*')
                    .eq('worker_id', workerId)
                    .eq('event_type', 'clock_out')
                    .eq('related_task_id', targetTaskId);

                if (outLogs && outLogs.length > 0) {
                    await (supabase.from('activity_logs') as any)
                        .update({ timestamp: updates.end_time, description: `Clocked Out manually updated by ${auditName}` })
                        .eq('id', outLogs[0].id);
                } else if (editingTask.manual || collisionTask) { // For manual tasks, we must ensure a clock_out exists if they just added an end time
                    await logActivity(
                        workerId,
                        'clock_out',
                        updates.reason,
                        `Clocked Out by ${auditName} (Manual Entry)`,
                        targetTaskId,
                        updates.end_time
                    );
                }
            } else {
                // If end_time is removed, delete the clock_out log
                await (supabase.from('activity_logs') as any)
                    .delete()
                    .eq('worker_id', workerId)
                    .eq('event_type', 'clock_out')
                    .eq('related_task_id', targetTaskId);
            }

            // Delete old break logs matching the shift time range
            const taskTime = editingTask.created_at || editingTask.start_time;
            const { clockIn, clockOut } = getWorkerShiftTimesForDate(workerId, taskTime);
            const shiftStart = clockIn || taskTime;
            const shiftEnd = clockOut || editingTask.end_time || new Date().toISOString();

            await (supabase.from('activity_logs') as any)
                .delete()
                .eq('worker_id', workerId)
                .in('event_type', ['break_start', 'break_end'])
                .gte('timestamp', new Date(shiftStart).toISOString())
                .lte('timestamp', new Date(shiftEnd).toISOString());

            // Insert new break logs
            if (editBreaks.length > 0) {
                const logsToInsert: any[] = [];
                editBreaks.forEach(b => {
                    if (b.start_time) {
                        logsToInsert.push({
                            worker_id: workerId,
                            event_type: 'break_start',
                            related_task_id: targetTaskId,
                            description: b.reason || 'Rest Break',
                            timestamp: parsePSTToUTC(b.start_time).toISOString()
                        });
                    }
                    if (b.end_time) {
                        logsToInsert.push({
                            worker_id: workerId,
                            event_type: 'break_end',
                            related_task_id: targetTaskId,
                            description: 'Break ended',
                            timestamp: parsePSTToUTC(b.end_time).toISOString()
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
                    workerId,
                    'task_start', // or appropriate event type
                    `Manual update by ${auditName}`, // Embed name directly in description
                    `Status: ${updates.status}, Task ID: ${targetTaskId}`,
                    targetTaskId
                );
            }

            setIsEditOpen(false);
            fetchData();
        } catch (e: any) {
            showCustomAlert(t('table.errorUpdating') + ': ' + e.message);
        }
    };

    const handleDeleteTask = async (id: string) => {
        // Find the task to check its status
        const taskToDelete = tasks.find(t => t.id === id);
        if (taskToDelete) {
            const isOngoingVirtual = taskToDelete.is_virtual && !taskToDelete.clock_out_time;
            const isOngoingMO = !taskToDelete.is_virtual && (taskToDelete.status === 'active' || taskToDelete.status === 'break' || taskToDelete.status === 'paused');

            if (isOngoingVirtual || isOngoingMO) {
                showCustomAlert('Please clock out the worker before deleting an ongoing entry.');
                return;
            }
        }

        const performDelete = async () => {
            if (id.startsWith('virtual_')) {
                try {
                    const parts = id.split('_');
                    const workerId = parts[1];
                    const dateStr = parts.slice(2).join('_');

                    // 1. Delete activity logs of that day
                    const { data: logsToDelete } = await supabase
                        .from('activity_logs')
                        .select('id, timestamp')
                        .eq('worker_id', workerId);

                    if (logsToDelete) {
                        const idsToDelete = (logsToDelete as any[]).filter((l: any) => {
                            const logDate = new Date(l.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                            return logDate === dateStr;
                        }).map((l: any) => l.id);

                        if (idsToDelete.length > 0) {
                            await supabase
                                .from('activity_logs')
                                .delete()
                                .in('id', idsToDelete);
                        }
                    }

                    // 2. Delete database tasks of that day
                    const { data: tasksToDelete } = await supabase
                        .from('tasks')
                        .select('id, created_at, start_time')
                        .eq('assigned_to_id', workerId);

                    if (tasksToDelete) {
                        const taskIds = (tasksToDelete as any[]).filter((t: any) => {
                            const tDate = new Date(t.created_at || t.start_time).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                            return tDate === dateStr;
                        }).map((t: any) => t.id);

                        if (taskIds.length > 0) {
                            await supabase
                                .from('tasks')
                                .delete()
                                .in('id', taskIds);
                        }
                    }

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
            // Use Pacific time for default
            created_at: formatToInputDateTime(new Date().toISOString()),
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
            const start = parsePSTToUTC(effectiveStartTime).getTime();
            const end = parsePSTToUTC(createForm.end_time).getTime();
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                totalSeconds = Math.floor((end - start) / 1000);
            } else {
                totalSeconds = (parseInt(String(createForm.active_hours)) * 3600) + (parseInt(String(createForm.active_minutes)) * 60);
            }
        } else {
            totalSeconds = (parseInt(String(createForm.active_hours)) * 3600) + (parseInt(String(createForm.active_minutes)) * 60);
        }

        // Hard daily cap: a manual entry can never itself span more than 8h45m (break time
        // included), the same ceiling live clock-in/out is held to. No admin/manager override.
        if (totalSeconds > DAILY_SHIFT_CAP_MS / 1000) {
            showCustomAlert(`This entry's duration exceeds the ${DAILY_SHIFT_CAP_LABEL} daily limit. Please shorten it.`);
            return;
        }

        // effectiveStartTime is already PST wall-clock text (from the form input), so its date
        // portion is the PST day directly — no conversion needed.
        const entryDateStr = (effectiveStartTime || '').slice(0, 10) || todayPST();

        // For Tab 2 (Start/Last Action), created_at defaults to "now" (form open time).
        // Override it with start_time so Clock In column and date filters show the correct work date.
        const effectiveCreatedAt = createTab === 'startLastAction' && createForm.start_time
            ? createForm.start_time
            : (createForm.created_at || new Date().toISOString());

        const auditName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');

        const taskFields: any = {
            mo_reference: createForm.mo_reference,
            description: createForm.description,
            status: createForm.end_time ? 'completed' : createForm.status,
            active_seconds: totalSeconds,
            created_at: parsePSTToUTC(effectiveCreatedAt).toISOString(),
            start_time: effectiveStartTime ? parsePSTToUTC(effectiveStartTime).toISOString() : null,
            last_action_time: createForm.last_action_time ? parsePSTToUTC(createForm.last_action_time).toISOString() : null,
            hourly_rate: createForm.hourly_rate
        };

        if (createForm.end_time) {
            taskFields.end_time = parsePSTToUTC(createForm.end_time).toISOString();
            if (!createForm.last_action_time) {
                taskFields.last_action_time = taskFields.end_time;
            }
        } else if (effectiveStartTime && !createForm.last_action_time) {
            taskFields.last_action_time = taskFields.start_time;
        }

        try {
            // One entry per worker per day: if this worker already has a task row on this PST
            // day, merge into it instead of inserting a second one for the same day.
            const existingTask = await findWorkerTaskForDay(createForm.worker_id, entryDateStr);

            if (existingTask) {
                if (!existingTask.manual) {
                    showCustomAlert('This worker already has a live-tracked entry for this day. Please edit that entry directly instead of creating a new one.');
                    return;
                }

                await (supabase.from('tasks') as any)
                    .update({
                        ...taskFields,
                        break_seconds: existingTask.break_seconds || 0,
                        reason: `Updated by ${auditName} (merged manual entry)`
                    })
                    .eq('id', existingTask.id);

                // Replace this entry's own clock_in/clock_out logs with the merged-in times —
                // avoids stacking a second clock_in on the same task, which would break
                // shift-pairing for everything after it.
                await (supabase.from('activity_logs') as any)
                    .delete()
                    .eq('related_task_id', existingTask.id)
                    .in('event_type', ['clock_in', 'clock_out']);

                const details = `MO: ${taskFields.mo_reference}, Task ID: ${existingTask.id}`;
                await logActivity(
                    createForm.worker_id,
                    'clock_in',
                    `Manual entry by ${auditName}`,
                    details,
                    existingTask.id,
                    taskFields.start_time || taskFields.created_at
                );

                if (taskFields.end_time) {
                    await logActivity(
                        createForm.worker_id,
                        'clock_out',
                        `Manual entry by ${auditName}`,
                        details,
                        existingTask.id,
                        taskFields.end_time
                    );
                } else {
                    await updateUserStatus(createForm.worker_id, 'present', 'available');
                }

                setIsCreateOpen(false);
                fetchData();
                return;
            }

            // No existing task row for this day, but the worker may already have live clock-in
            // activity accruing (e.g. clocked in via the portal, hasn't started a task yet) —
            // that time isn't reflected in any task row, so the single-entry check above alone
            // wouldn't catch a new entry that, combined with it, exceeds the daily cap.
            const { data: dayLogs } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('worker_id', createForm.worker_id)
                .gte('timestamp', pstDayStart(entryDateStr))
                .lte('timestamp', pstDayEnd(entryDateStr));
            const alreadyElapsedMs = getElapsedMsForLogs((dayLogs || []) as any[]);
            if (alreadyElapsedMs + totalSeconds * 1000 > DAILY_SHIFT_CAP_MS) {
                showCustomAlert(`Combined with this worker's existing activity today, this entry would exceed the ${DAILY_SHIFT_CAP_LABEL} daily limit.`);
                return;
            }

            const newTask: any = {
                ...taskFields,
                assigned_to_id: createForm.worker_id,
                break_seconds: 0,
                manual: true,
                reason: `Created by ${auditName}`
            };

            const { data: createdTask, error } = await (supabase.from('tasks') as any).insert(newTask).select().single();
            if (error) throw error;

            // Audit Log — must mirror the real clock-in/out flow: a clock_in needs a matching
            // clock_out (when the entry is a completed, backdated shift) or a live status update
            // (when it's meant to leave the worker actively clocked in right now). Leaving a
            // clock_in permanently unclosed breaks shift-pairing for every entry that comes after it.
            if (currentUser && createdTask) {
                const details = `MO: ${newTask.mo_reference}, Task ID: ${createdTask.id}`;

                await logActivity(
                    newTask.assigned_to_id,
                    'clock_in',
                    `Manual entry by ${auditName}`,
                    details,
                    createdTask.id,
                    newTask.start_time || newTask.created_at
                );

                if (newTask.end_time) {
                    // Completed, backdated entry — close the shift so it pairs correctly.
                    await logActivity(
                        newTask.assigned_to_id,
                        'clock_out',
                        `Manual entry by ${auditName}`,
                        details,
                        createdTask.id,
                        newTask.end_time
                    );
                } else {
                    // Open-ended entry — the worker is now live clocked-in, same as a real clock-in.
                    await updateUserStatus(newTask.assigned_to_id, 'present', 'available');
                }
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

        // Timer to force re-renders for active durations/counters
        const timeInterval = setInterval(() => {
            setTasks(prev => [...prev]);
        }, 1000);

        // Database polling to sync actions taken by workers in real-time
        const dataInterval = setInterval(() => {
            fetchData();
        }, 5000);

        return () => {
            clearInterval(timeInterval);
            clearInterval(dataInterval);
        };
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
                                            if (task.is_virtual) return formatDateTime(task.clock_in_time);
                                            if (task.manual) return formatDateTime(task.start_time || task.created_at);
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
                                            if (task.is_virtual) {
                                                return task.clock_out_time ? formatDateTime(task.clock_out_time) : 'Still Clocked In';
                                            }
                                            if (task.manual) {
                                                return task.end_time ? formatDateTime(task.end_time) : (task.status === 'completed' ? '-' : 'Still Clocked In');
                                            }
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
                                                if (task.is_virtual) {
                                                    let seconds = task.active_seconds;
                                                    if (!task.clock_out_time) {
                                                        const totalSec = Math.max(0, Math.floor((new Date().getTime() - new Date(task.clock_in_time).getTime()) / 1000));
                                                        // getBreaksForShift already live-computes a currently-open break's duration
                                                        // against "now", so filtering it for unpaid covers both closed breaks and
                                                        // an in-progress one — only unpaid time reduces payable duration.
                                                        const breaks = getBreaksForShift(task.assigned_to_id, task);
                                                        const unpaidBreakSec = breaks.filter(b => b.type === 'unpaid').reduce((sum, b) => sum + b.duration_seconds, 0);
                                                        seconds = Math.max(0, totalSec - unpaidBreakSec);
                                                    }
                                                    const h = Math.floor(seconds / 3600);
                                                    const m = Math.floor((seconds % 3600) / 60);
                                                    const s = seconds % 60;
                                                    return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
                                                }
                                                if (task.manual) {
                                                    return formatCurrentTime(task);
                                                }
                                                const { clockIn, clockOut } = getWorkerShiftTimesForDate(task.assigned_to_id, task.created_at || task.start_time);
                                                if (clockIn) {
                                                    const start = new Date(clockIn).getTime();
                                                    const end = clockOut ? new Date(clockOut).getTime() : new Date().getTime();
                                                    let totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

                                                    const breaks = getBreaksForShift(task.assigned_to_id, task);
                                                    const unpaidBreakSeconds = breaks.filter(b => b.type === 'unpaid').reduce((sum, b) => sum + b.duration_seconds, 0);
                                                    totalSeconds = Math.max(0, totalSeconds - unpaidBreakSeconds);

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
                                            if (task.is_virtual) {
                                                if (task.audit_record && task.audit_record.includes('by ')) {
                                                    const name = task.audit_record.split('by ')[1];
                                                    const actionText = task.audit_record;
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>By: {name}</span>
                                                            <span style={{ fontSize: '0.7rem' }}>{actionText}</span>
                                                        </div>
                                                    );
                                                }
                                                return <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Worker action</span>;
                                            }
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

                            {editingTask.manual && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.columns.mo')}</label>
                                        <select
                                            value={editForm.mo_reference}
                                            onChange={e => setEditForm(prev => ({ ...prev, mo_reference: e.target.value }))}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                        >
                                            <option value="">Select MO</option>
                                            {mos.map(mo => (
                                                <option key={mo.id} value={mo.mo_reference}>{mo.mo_reference}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#475569', fontSize: '0.85rem' }}>{t('table.columns.operation')}</label>
                                        <select
                                            value={editForm.description}
                                            onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '0.9rem', background: 'white' }}
                                        >
                                            <option value="">Select Operation</option>
                                            {operations.map((op, idx) => (
                                                <option key={idx} value={op}>{op}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

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
                                            onChange={e => setEditForm(prev => ({ ...prev, active_minutes: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))}
                                            min="0"
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
