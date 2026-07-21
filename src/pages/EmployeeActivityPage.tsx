import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, ActivityLog } from '../types';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { pauseAllActiveTasks, resumeAllAutoPausedTasks, completeAllTasks, pauseAllTasksManual } from '../lib/taskService';
import { todayPST, pstDayStart, pstDayEnd, formatTimePST } from '../lib/timezone';
import { buildShiftsForWorker, buildBreaksForWorker, getElapsedMsForLogs, DAILY_SHIFT_CAP_MS, DAILY_SHIFT_CAP_LABEL } from '../lib/shifts';
import { useAuth } from '../context/AuthContext';

const formatDuration = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.round(totalSeconds % 60);
    if (h > 0) {
        return `${h}h ${m}m ${s}s`;
    }
    return `${m}m ${s}s`;
};

export const EmployeeActivityPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const managerName = currentUser?.username === 'admin@gmail.com' ? 'System Admin' : (currentUser?.name || currentUser?.username || 'Manager');

    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    // Unlike `logs` (scoped to the selected date, for the Activity Log timeline), this holds a
    // worker's full log history so stats can correctly account for shifts that started on a
    // previous calendar day and are still open (e.g. an overnight shift).
    const [allLogs, setAllLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
    const [filterDate, setFilterDate] = useState(todayPST()); // Default today in PST
    const [logPage, setLogPage] = useState(1);

    // Clock Out Modal State
    const [showClockOutModal, setShowClockOutModal] = useState(false);
    const [clockOutWorkerId, setClockOutWorkerId] = useState<string | null>(null);
    const [breakModalWorker, setBreakModalWorker] = useState<User | null>(null);
    const [breakReasonText, setBreakReasonText] = useState('');
    const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [filterDate]);

    const fetchData = async () => {
        try {
            // 1. Fetch Users
            const { data: userData } = await supabase.from('users').select('*').eq('role', 'employee').eq('active', true).order('name');
            if (userData) setUsers(userData as User[]);

            // 2. Fetch full log history — needed so stats can see a shift's clock_in even when
            // it happened on a previous calendar day (e.g. an overnight shift still in progress).
            const { data: logData } = await supabase.from('activity_logs')
                .select('*')
                .order('timestamp', { ascending: false }); // Descending for timeline flow

            if (logData) {
                const allLogsData = logData as ActivityLog[];
                setAllLogs(allLogsData);

                // Timeline table stays scoped to the selected date — PST boundaries.
                // pstDayStart("2026-07-15") → "2026-07-15T08:00:00.000Z" (midnight PST)
                // pstDayEnd("2026-07-15")   → "2026-07-16T07:59:59.999Z" (end of PST day)
                const startOfDay = new Date(pstDayStart(filterDate)).getTime();
                const endOfDay = new Date(pstDayEnd(filterDate)).getTime();
                setLogs(allLogsData.filter(l => {
                    const t = new Date(l.timestamp).getTime();
                    return t >= startOfDay && t <= endOfDay;
                }));
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClockIn = async (workerId: string) => {
        if (busyWorkerId) return;
        setBusyWorkerId(workerId);
        try {
            // Hard daily cap: once a worker has accrued 8h45m today (break time included), no
            // one — including a manager — can clock them back in. Re-fetch fresh logs rather
            // than trusting allLogs, since it's only polled every 5s.
            const { data: freshLogs } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('worker_id', workerId)
                .gte('timestamp', pstDayStart(todayPST()))
                .lte('timestamp', pstDayEnd(todayPST()));

            const elapsedMs = getElapsedMsForLogs((freshLogs || []) as ActivityLog[]);
            if (elapsedMs >= DAILY_SHIFT_CAP_MS) {
                alert(`This worker has already reached the ${DAILY_SHIFT_CAP_LABEL} daily limit and cannot clock in again today.`);
                return;
            }

            await logActivity(workerId, 'clock_in', `Clocked In by ${managerName}`);
            await updateUserStatus(workerId, 'present', 'available');
            await fetchData();
        } finally {
            setBusyWorkerId(null);
        }
    };

    const handleClockOutRequest = (workerId: string) => {
        setClockOutWorkerId(workerId);
        setShowClockOutModal(true);
    };

    const confirmClockOut = async (action: 'complete_all' | 'pause_all') => {
        if (!clockOutWorkerId || busyWorkerId) return;
        setBusyWorkerId(clockOutWorkerId);
        try {
            if (action === 'complete_all') {
                await completeAllTasks(clockOutWorkerId);
            } else {
                await pauseAllTasksManual(clockOutWorkerId);
            }

            await logActivity(clockOutWorkerId, 'clock_out', `Clocked Out by ${managerName}`);
            await updateUserStatus(clockOutWorkerId, 'offline', 'available'); // Reset to available for next shift

            // Wait a moment for triggers/updates
            setTimeout(() => {
                fetchData();
            }, 500);

            setShowClockOutModal(false);
            setClockOutWorkerId(null);
        } finally {
            setBusyWorkerId(null);
        }
    };

    const toggleBreak = async (worker: User, reason: string = 'Break') => {
        if (busyWorkerId) return;

        // Validation: Block break starting if worker is not clocked in
        if (worker.status !== 'present' && worker.availability !== 'break') {
            alert(`Cannot place ${worker.name} on break because they are not clocked in.`);
            return;
        }

        setBusyWorkerId(worker.id);
        try {
            if (worker.availability === 'break') {
                // End Break -> Resume
                await logActivity(worker.id, 'break_end', `Returned from Break (ended by ${managerName})`);
                await updateUserStatus(worker.id, 'present', 'available');
                await resumeAllAutoPausedTasks(worker.id);
            } else {
                // Start Break -> Pause
                const finalReason = reason || 'Break';
                await logActivity(worker.id, 'break_start', `${finalReason} (started by ${managerName})`);
                await updateUserStatus(worker.id, 'present', 'break');
                await pauseAllActiveTasks(worker.id, finalReason);
            }
            await fetchData();
        } finally {
            setBusyWorkerId(null);
        }
    };

    // Derived Timelines
    // Display-only: a Manual Entry writes a paired clock_in + clock_out (sharing the same
    // related_task_id) so shift-pairing/duration math stays correct — see ControlTablePage's
    // handleCreateTask. That math is untouched here; this only collapses the pair into one
    // readable "Manual entry created for Xh Ym by <name>" row for this table.
    const getWorkerTimeline = (workerId: string) => {
        const dayLogs = logs
            .filter(l => l.worker_id === workerId)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const consumedIds = new Set<string>();
        const result: any[] = [];

        dayLogs.forEach((log) => {
            if (consumedIds.has(log.id)) return;

            if (log.event_type === 'clock_in' && log.related_task_id) {
                const matchingOut = allLogs.find(
                    (l) => l.worker_id === workerId
                        && l.event_type === 'clock_out'
                        && l.related_task_id === log.related_task_id
                        && !consumedIds.has(l.id)
                );

                if (matchingOut) {
                    consumedIds.add(log.id);
                    consumedIds.add(matchingOut.id);

                    const durationSeconds = Math.max(0, (new Date(matchingOut.timestamp).getTime() - new Date(log.timestamp).getTime()) / 1000);
                    const hours = Math.floor(durationSeconds / 3600);
                    const minutes = Math.round((durationSeconds % 3600) / 60);
                    const durationLabel = hours > 0
                        ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
                        : `${minutes}m`;
                    const createdBy = (log.description || '').replace(/^Manual entry by /, '').trim() || 'Admin';

                    result.push({
                        ...log,
                        id: `manual-${log.id}`,
                        event_type: 'manual_entry',
                        description: `Manual entry created for ${durationLabel} by ${createdBy}`,
                    });
                    return;
                }
            }

            result.push(log);
        });

        return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    };

    // removed unused getWorkerStats


    // FETCH TASKS for Stats
    const [rawTasks, setRawTasks] = useState<any[]>([]);
    useEffect(() => {
        const fetchTasks = async () => {
            const { data } = await supabase.from('tasks').select('*');
            if (data) setRawTasks(data);
        };
        fetchTasks();
    }, []);

    const calculateStats = (workerId: string) => {
        // --- 1. Calculate Shift Duration (Payable Hours) ---
        // Formula: (Time On Shift within the selected day) - (Time On Break within the selected day).
        // Uses the worker's full log history (not just the selected day) so a shift that started
        // on a previous calendar day and is still open still contributes its portion of today,
        // instead of showing 0 just because its clock_in falls outside today's window.

        const dayStart = new Date(pstDayStart(filterDate)).getTime();
        const dayEnd = new Date(pstDayEnd(filterDate)).getTime();
        const now = new Date().getTime();

        const userLogs = allLogs
            .filter(l => l.worker_id === workerId)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const shifts = buildShiftsForWorker(userLogs);
        const breaks = buildBreaksForWorker(userLogs);

        let totalShiftTime = 0;
        let unpaidBreakTime = 0;
        let paidBreakTime = 0;

        const worker = users.find(u => u.id === workerId);
        const isClockedIn = worker?.status === 'present';
        const isOnBreak = worker?.availability === 'break';

        shifts.forEach(shift => {
            const shiftStart = new Date(shift.clockIn.timestamp).getTime();
            const shiftEnd = shift.clockOut 
                ? new Date(shift.clockOut.timestamp).getTime() 
                : (isClockedIn ? now : shiftStart);

            const clippedStart = Math.max(shiftStart, dayStart);
            const clippedEnd = Math.min(shiftEnd, dayEnd, now);
            if (clippedEnd > clippedStart) totalShiftTime += (clippedEnd - clippedStart);
        });

        breaks.forEach(b => {
            const breakEnd = b.endMs ?? (isOnBreak ? now : b.startMs);
            const clippedStart = Math.max(b.startMs, dayStart);
            const clippedEnd = Math.min(breakEnd, dayEnd, now);
            if (clippedEnd > clippedStart) {
                if (b.type === 'unpaid') {
                    unpaidBreakTime += (clippedEnd - clippedStart);
                } else {
                    paidBreakTime += (clippedEnd - clippedStart);
                }
            }
        });

        // Net Payable Time = Total Time 'On Clock' - Total Time 'On Unpaid Break'
        // Ensure non-negative
        const netPayableTime = Math.max(0, totalShiftTime - unpaidBreakTime);

        // --- 2. Calculate Task Active Time (Productivity) ---
        // Sum of all active_seconds from tasks assigned to this user. Manual Entries are
        // excluded — their clock_in/clock_out pair is already counted above as Shift Duration,
        // so including them here too would double-count the same hours in both stats.
        const userTasks = rawTasks.filter(t => t.assigned_to_id === workerId && !t.manual);
        const taskActiveSec = userTasks.reduce((acc, t) => acc + (t.active_seconds || 0), 0);

        // worker is already defined above

        return {
            shift_duration: netPayableTime / 1000,
            unpaid_break_duration: unpaidBreakTime / 1000,
            paid_break_duration: paidBreakTime / 1000,
            task_duration: taskActiveSec, // Just for reference if needed
            earned: (netPayableTime / 1000 / 3600) * (worker?.hourly_rate || 0)
        };
    };

    if (isLoading) return <div className="loading-screen"><div className="loading-spinner"></div><span>Loading Activity...</span></div>;

    return (
        <div style={{ paddingBottom: '200px' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Employee Activity</h1>
                    <p className="page-subtitle">Manage worker presence, breaks, and view daily logs.</p>
                </div>
                <div>
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {users.map(worker => {
                    const stats = calculateStats(worker.id);
                    const isExpanded = expandedWorkerId === worker.id;
                    const timeline = getWorkerTimeline(worker.id);
                    const isClockedIn = worker.status === 'present';
                    const isOnBreak = worker.availability === 'break';

                    return (
                        <div key={worker.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            {/* Card Header */}
                            <div style={{ padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', background: isClockedIn ? '#fff' : '#F8FAFC' }}>
                                <div onClick={() => { setLogPage(1); setExpandedWorkerId(isExpanded ? null : worker.id); }} style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', flex: 1, minWidth: '200px' }}>
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        background: isClockedIn ? (isOnBreak ? '#F59E0B' : '#10B981') : '#CBD5E1',
                                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700
                                    }}>
                                        {worker.name[0]}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>{worker.name}</div>
                                        <div style={{ fontSize: '0.85rem', color: isClockedIn ? (isOnBreak ? '#D97706' : '#16A34A') : '#64748B', fontWeight: 600 }}>
                                            {!isClockedIn ? 'OFF-SHIFT (Absent)' : isOnBreak ? 'ON BREAK (Away)' : 'ON-SHIFT (Available)'}
                                        </div>
                                    </div>
                                </div>

                                {/* Controls */}
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {!isClockedIn ? (
                                        <button disabled={busyWorkerId === worker.id} onClick={() => handleClockIn(worker.id)} className="btn btn-primary" style={{ background: '#0F172A', color: 'white', opacity: busyWorkerId === worker.id ? 0.6 : 1, cursor: busyWorkerId === worker.id ? 'not-allowed' : 'pointer' }}>
                                            Clock In
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                disabled={busyWorkerId === worker.id}
                                                onClick={() => {
                                                    if (isOnBreak) {
                                                        toggleBreak(worker, 'Returned');
                                                    } else {
                                                        setBreakReasonText('');
                                                        setBreakModalWorker(worker);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600,
                                                    background: isOnBreak ? '#DCFCE7' : '#FEF3C7',
                                                    color: isOnBreak ? '#16A34A' : '#D97706',
                                                    border: 'none', cursor: busyWorkerId === worker.id ? 'not-allowed' : 'pointer',
                                                    opacity: busyWorkerId === worker.id ? 0.6 : 1
                                                }}
                                            >
                                                {isOnBreak ? 'End Break' : 'Start Break'}
                                            </button>
                                            <button
                                                disabled={busyWorkerId === worker.id}
                                                onClick={() => handleClockOutRequest(worker.id)}
                                                style={{
                                                    padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600,
                                                    background: '#F1F5F9', color: '#64748B',
                                                    border: 'none', cursor: busyWorkerId === worker.id ? 'not-allowed' : 'pointer',
                                                    opacity: busyWorkerId === worker.id ? 0.6 : 1
                                                }}
                                            >
                                                Clock Out
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Details (Expanded) */}
                            {isExpanded && (
                                <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid #F1F5F9', animation: 'fadeIn 0.3s' }}>
                                    {/* Stats Row */}
                                    <div className="summary-grid">
                                        <SummaryStat label="Shift Duration (Net Payable)" value={formatDuration(stats.shift_duration)} />
                                        <SummaryStat label="Unpaid Break" value={formatDuration(stats.unpaid_break_duration)} />
                                        <SummaryStat label="Paid Break" value={formatDuration(stats.paid_break_duration)} />
                                        <SummaryStat label="Task Activity" value={formatDuration(stats.task_duration)} />
                                        <SummaryStat label="Est. Earnings" value={`$${stats.earned.toFixed(2)}`} />
                                    </div>

                                    {/* Timeline Table */}
                                    <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#64748B', marginBottom: '1rem', fontWeight: 700 }}>Activity Log</h3>
                                    <div className="table-responsive-container" style={{ background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        {timeline.length > 0 ? (
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#F1F5F9', color: '#475569' }}>
                                                        <th className="sticky-column" style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600 }}>Time</th>
                                                        <th className="sticky-column" style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, left: '100px' }}>Event</th>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600 }}>Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ background: 'white' }}>
                                                    {timeline.slice((logPage - 1) * 10, logPage * 10).map(log => {
                                                        const time = formatTimePST(log.timestamp);
                                                        return (
                                                            <tr key={log.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', color: '#64748B', fontFamily: 'monospace' }}>{time}</td>
                                                                <td className="sticky-column" style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0F172A', left: '100px' }}>
                                                                    {log.event_type.replace(/_/g, ' ').toUpperCase()}
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                                                                    {log.description}
                                                                    {log.event_type === 'break_start' && (
                                                                        <span style={{ fontWeight: 600, marginLeft: '0.25rem', color: (log.description || '').toLowerCase().match(/coffee|short rest|restroom/) ? '#10B981' : '#F59E0B' }}>
                                                                            {(log.description || '').toLowerCase().match(/coffee|short rest|restroom/) ? '(Paid)' : '(Unpaid)'}
                                                                        </span>
                                                                    )}
                                                                    {log.details && (log.event_type === 'task_pause' || log.event_type === 'break_start' || log.details === 'Shift Ended') && (
                                                                        <span style={{ color: '#94A3B8', marginLeft: '0.25rem' }}>- {log.details}</span>
                                                                    )}
                                                                </td>

                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>No activity logs for this day.</div>
                                        )}

                                        {timeline.length > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.75rem 1rem', borderTop: '1px solid #E2E8F0', background: 'white' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>
                                                    Showing {Math.min(timeline.length, (logPage - 1) * 10 + 1)} to {Math.min(timeline.length, logPage * 10)} of {timeline.length} entries
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        disabled={logPage === 1}
                                                        onClick={() => setLogPage(prev => Math.max(1, prev - 1))}
                                                        style={{
                                                            padding: '0.4rem 0.8rem',
                                                            borderRadius: '8px',
                                                            border: '1px solid #CBD5E1',
                                                            background: logPage === 1 ? '#F1F5F9' : 'white',
                                                            color: logPage === 1 ? '#94A3B8' : '#334155',
                                                            cursor: logPage === 1 ? 'default' : 'pointer',
                                                            fontWeight: 700,
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        Previous
                                                    </button>
                                                    <button
                                                        disabled={logPage * 10 >= timeline.length}
                                                        onClick={() => setLogPage(prev => prev + 1)}
                                                        style={{
                                                            padding: '0.4rem 0.8rem',
                                                            borderRadius: '8px',
                                                            border: '1px solid #CBD5E1',
                                                            background: logPage * 10 >= timeline.length ? '#F1F5F9' : 'white',
                                                            color: logPage * 10 >= timeline.length ? '#94A3B8' : '#334155',
                                                            cursor: logPage * 10 >= timeline.length ? 'default' : 'pointer',
                                                            fontWeight: 700,
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Clock Out Modal */}
            {showClockOutModal && clockOutWorkerId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
                    <div style={{ background: 'white', borderRadius: '16px', width: '400px', padding: '2rem' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Clocking Out</h2>
                        <p style={{ marginBottom: '1.5rem', color: '#64748B' }}>
                            There are active tasks. How would you like to handle them?
                        </p>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            <button onClick={() => confirmClockOut('pause_all')} style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: 'white', textAlign: 'left', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Pause All Tasks</span>
                                <i className="fa-solid fa-pause" style={{ color: '#F59E0B' }}></i>
                            </button>
                            <button onClick={() => confirmClockOut('complete_all')} style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: 'white', textAlign: 'left', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Complete All Tasks</span>
                                <i className="fa-solid fa-check" style={{ color: '#10B981' }}></i>
                            </button>
                        </div>
                        <button onClick={() => setShowClockOutModal(false)} style={{ marginTop: '1rem', width: '100%', padding: '0.75rem', background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {breakModalWorker && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header" style={{ background: 'var(--bg-card)', padding: '1.25rem 2rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}><i className="fa-solid fa-mug-hot" style={{ marginRight: '8px', color: 'var(--accent)' }}></i> Start Break</h3>
                            <button className="close-modal" onClick={() => setBreakModalWorker(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Reason for Break <span style={{ color: '#ef4444' }}>*</span></label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                    {['Lunch Break', 'Restroom Break', 'Coffee Break', 'Short Rest', 'Personal Errand'].map(chip => (
                                        <button
                                            type="button"
                                            key={chip}
                                            onClick={() => setBreakReasonText(chip)}
                                            style={{
                                                padding: '0.4rem 0.8rem',
                                                borderRadius: '20px',
                                                border: '1px solid var(--border)',
                                                background: breakReasonText === chip ? 'var(--primary)' : 'var(--bg-main)',
                                                color: breakReasonText === chip ? 'white' : 'var(--text-main)',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={breakReasonText}
                                    onChange={e => setBreakReasonText(e.target.value)}
                                    placeholder="e.g. Lunch Break, Restroom Break, Coffee Break"
                                    style={{ width: '100%', minHeight: '80px', resize: 'vertical', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.7rem', fontFamily: 'inherit', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                                    required
                                />
                            </div>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                            <button 
                                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', color: 'var(--text-main)', cursor: 'pointer' }}
                                onClick={() => setBreakModalWorker(null)}
                            >
                                Cancel
                            </button>
                            <button 
                                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                                onClick={() => {
                                    if (!breakReasonText.trim()) {
                                        alert('Reason is required to start a break.');
                                        return;
                                    }
                                    toggleBreak(breakModalWorker, breakReasonText.trim());
                                    setBreakModalWorker(null);
                                }}
                            >
                                Start Break
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}} />
        </div>
    );
};

const SummaryStat: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: '0.25rem' }}>{value}</div>
    </div>
);
