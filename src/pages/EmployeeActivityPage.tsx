import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, ActivityLog } from '../types';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { pauseAllActiveTasks, resumeAllAutoPausedTasks, completeAllTasks, pauseAllTasksManual } from '../lib/taskService';

export const EmployeeActivityPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]); // Default Today

    // Clock Out Modal State
    const [showClockOutModal, setShowClockOutModal] = useState(false);
    const [clockOutWorkerId, setClockOutWorkerId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [filterDate]);

    const fetchData = async () => {
        try {
            // 1. Fetch Users
            const { data: userData } = await supabase.from('users').select('*').eq('role', 'employee').order('name');
            if (userData) setUsers(userData as User[]);

            // 2. Fetch Logs for Timeline
            // We filter by date locally or in query. Let's filter in query for efficiency if possible
            const startOfDay = new Date(filterDate).toISOString();
            const endOfDay = new Date(new Date(filterDate).getTime() + 86400000).toISOString();

            const { data: logData } = await supabase.from('activity_logs')
                .select('*')
                .gte('timestamp', startOfDay)
                .lt('timestamp', endOfDay)
                .order('timestamp', { ascending: false }); // Descending for timeline flow

            if (logData) setLogs(logData as ActivityLog[]);
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClockIn = async (workerId: string) => {
        await logActivity(workerId, 'clock_in', 'Clocked In');
        await updateUserStatus(workerId, 'present', 'available');
        fetchData();
    };

    const handleClockOutRequest = (workerId: string) => {
        setClockOutWorkerId(workerId);
        setShowClockOutModal(true);
    };

    const confirmClockOut = async (action: 'complete_all' | 'pause_all') => {
        if (!clockOutWorkerId) return;

        if (action === 'complete_all') {
            await completeAllTasks(clockOutWorkerId);
        } else {
            await pauseAllTasksManual(clockOutWorkerId);
        }

        await logActivity(clockOutWorkerId, 'clock_out', 'Clocked Out');
        await updateUserStatus(clockOutWorkerId, 'offline', 'available'); // Reset to available for next shift

        // Wait a moment for triggers/updates
        setTimeout(() => {
            fetchData();
        }, 500);

        setShowClockOutModal(false);
        setClockOutWorkerId(null);
    };

    const toggleBreak = async (worker: User, reason: string = 'Break') => {
        if (worker.availability === 'break') {
            // End Break -> Resume
            await logActivity(worker.id, 'break_end', 'Returned from Break');
            await updateUserStatus(worker.id, 'present', 'available');
            await resumeAllAutoPausedTasks(worker.id);
        } else {
            // Start Break -> Pause
            await logActivity(worker.id, 'break_start', reason);
            await updateUserStatus(worker.id, 'present', 'break');
            await pauseAllActiveTasks(worker.id, reason);
        }
        fetchData();
    };

    // Derived Timelines
    const getWorkerTimeline = (workerId: string) => {
        return logs.filter(l => l.worker_id === workerId);
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
        // Formula: (Time Now - Clock In Time) - (Total Break Duration)
        // Strictly based on activity logs.

        const userLogs = logs.filter(l => l.worker_id === workerId);
        let shiftStart: number | null = null;
        let totalShiftTime = 0;
        let totalBreakTime = 0;
        let breakStart: number | null = null;

        // Sort logs chronologically to replay the day
        const sortedLogs = [...userLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        sortedLogs.forEach(log => {
            const time = new Date(log.timestamp).getTime();

            if (log.event_type === 'clock_in') {
                shiftStart = time;
            } else if (log.event_type === 'clock_out') {
                if (shiftStart) {
                    totalShiftTime += (time - shiftStart);
                    shiftStart = null;
                }
            } else if (log.event_type === 'break_start') {
                breakStart = time;
            } else if (log.event_type === 'break_end') {
                if (breakStart) {
                    totalBreakTime += (time - breakStart);
                    breakStart = null;
                }
            }
        });

        const now = new Date().getTime();

        // If currently clocked in, add time since last clock in
        if (shiftStart) {
            totalShiftTime += (now - shiftStart);
        }

        // If currently on break, add time since break start
        // AND subtract that break time from the shift time we just added above (since break is unpaid/dead time)
        // Wait, simplicity: Total Shift = (Now - ClockIn) - Breaks.
        // If we added (Now - ClockIn), we included the break time. So we must accumulate the current break into totalBreakTime
        // and then subtract totalBreakTime from totalShiftTime.

        if (breakStart) {
            const currentBreakDuration = (now - breakStart);
            totalBreakTime += currentBreakDuration;
        }

        // Net Payable Time = Total Time 'On Clock' - Total Time 'On Break'
        // Ensure non-negative
        const netPayableTime = Math.max(0, totalShiftTime - totalBreakTime);


        // --- 2. Calculate Task Active Time (Productivity) ---
        // Sum of all active_seconds from tasks assigned to this user
        const userTasks = rawTasks.filter(t => t.assigned_to_id === workerId);
        const taskActiveSec = userTasks.reduce((acc, t) => acc + (t.active_seconds || 0), 0);

        const worker = users.find(u => u.id === workerId);

        return {
            shift_duration: netPayableTime / 1000,
            break_duration: totalBreakTime / 1000,
            task_duration: taskActiveSec, // Just for reference if needed
            earned: (netPayableTime / 1000 / 3600) * (worker?.hourly_rate || 0)
        };
    };

    if (isLoading) return <div className="loading-screen">Loading Activity...</div>;

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
                                <div onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)} style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', flex: 1, minWidth: '200px' }}>
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
                                        <button onClick={() => handleClockIn(worker.id)} className="btn btn-primary" style={{ background: '#0F172A', color: 'white' }}>
                                            Clock In
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => toggleBreak(worker, isOnBreak ? 'Returned' : 'Lunch Break')} // Simplified reason for now
                                                style={{
                                                    padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600,
                                                    background: isOnBreak ? '#DCFCE7' : '#FEF3C7',
                                                    color: isOnBreak ? '#16A34A' : '#D97706',
                                                    border: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                {isOnBreak ? 'End Break' : 'Start Break'}
                                            </button>
                                            <button
                                                onClick={() => handleClockOutRequest(worker.id)}
                                                style={{
                                                    padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600,
                                                    background: '#F1F5F9', color: '#64748B',
                                                    border: 'none', cursor: 'pointer'
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
                                        <SummaryStat label="Shift Duration" value={`${(stats.shift_duration / 3600).toFixed(2)} hrs`} />
                                        <SummaryStat label="Break Duration" value={`${(stats.break_duration / 3600).toFixed(2)} hrs`} />
                                        <SummaryStat label="Task Activity" value={`${(stats.task_duration / 3600).toFixed(2)} hrs`} />
                                        <SummaryStat label="Est. Earnings" value={`$${stats.earned.toFixed(2)}`} />
                                    </div>

                                    {/* Timeline Table */}
                                    <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#64748B', marginBottom: '1rem', fontWeight: 700 }}>Activity Log</h3>
                                    <div style={{ background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                                        {timeline.length > 0 ? (
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#F1F5F9', color: '#475569' }}>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600 }}>Time</th>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600 }}>Event</th>
                                                        <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600 }}>Description</th>

                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {timeline.map(log => {
                                                        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                        return (
                                                            <tr key={log.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                                <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontFamily: 'monospace' }}>{time}</td>
                                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0F172A' }}>
                                                                    {log.event_type.replace(/_/g, ' ').toUpperCase()}
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                                                                    {log.description}
                                                                    {log.details && (log.event_type === 'task_pause' || log.event_type === 'break_start' || log.details === 'Shift Ended') && (
                                                                        <span style={{ color: '#94A3B8' }}>- {log.details}</span>
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
